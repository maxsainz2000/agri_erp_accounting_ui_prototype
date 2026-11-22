import {
  GrainContractStatus,
  GrainPurchaseContract,
  GrowerCounterparty,
  SiloBinLot,
} from './types';
import { round2 } from './grainGradingEngine';

export interface CreditGuardEvaluation {
  allowed: boolean;
  requiresContractSecurity: boolean;
  currentAR: number;
  pendingInvoiceTotal: number;
  effectiveAR: number;
  unsecuredCreditLimit: number;
  cropSecuredCreditLimit: number;
  excessOverUnsecured: number;
  undeliveredContractEquity: number;
  hasCropLienFiling: boolean;
  lienFilingReference: string | null;
  blockingReason: string | null;
}

/**
 * Evaluates CUJ 3 Dual-Tier Contract-Linked Credit Guard:
 * 1. Effective AR <= CropSecuredCreditLimit
 * 2. If Effective AR > UnsecuredCreditLimit:
 *    - Require HasCropLienFiling === true
 *    - Require Undelivered Contract Equity >= (Effective AR - UnsecuredCreditLimit)
 */
export function evaluateAgronomicCreditGuard(
  grower: GrowerCounterparty,
  contracts: GrainPurchaseContract[],
  pendingInvoiceTotal: number
): CreditGuardEvaluation {
  const currentAR = round2(grower.currentARBalance);
  const pending = round2(pendingInvoiceTotal);
  const effectiveAR = round2(currentAR + pending);
  const excessOverUnsecured = round2(Math.max(0, effectiveAR - grower.unsecuredCreditLimit));
  const requiresContractSecurity = effectiveAR > grower.unsecuredCreditLimit;

  const activeContracts = contracts.filter(
    (c) => c.growerId === grower.vendorId && c.status === GrainContractStatus.Active
  );

  const undeliveredContractEquity = round2(
    activeContracts.reduce((sum, c) => {
      const remainingKg = Math.max(0, c.contractedQtyKg - c.deliveredQtyKg);
      return sum + remainingKg * c.basePricePerKg;
    }, 0)
  );

  let allowed = true;
  let blockingReason: string | null = null;

  if (pending <= 0) {
    allowed = false;
    blockingReason = 'Invoice total must be greater than $0.00.';
  } else if (effectiveAR > grower.cropSecuredCreditLimit) {
    allowed = false;
    blockingReason = `Effective AR ($${effectiveAR.toLocaleString('en-US', { minimumFractionDigits: 2 })}) exceeds maximum Crop-Secured Credit Limit ($${grower.cropSecuredCreditLimit.toLocaleString('en-US', { minimumFractionDigits: 2 })}).`;
  } else if (requiresContractSecurity) {
    if (!grower.hasCropLienFiling) {
      allowed = false;
      blockingReason = `Exceeds unsecured credit limit ($${grower.unsecuredCreditLimit.toLocaleString('en-US', { minimumFractionDigits: 2 })}) and no active statutory Crop Lien Filing is on file.`;
    } else if (undeliveredContractEquity < excessOverUnsecured) {
      const shortfall = round2(excessOverUnsecured - undeliveredContractEquity);
      allowed = false;
      blockingReason = `Undelivered forward contract equity ($${undeliveredContractEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}) is short by $${shortfall.toLocaleString('en-US', { minimumFractionDigits: 2 })} to cover excess credit ($${excessOverUnsecured.toLocaleString('en-US', { minimumFractionDigits: 2 })}).`;
    }
  }

  return {
    allowed,
    requiresContractSecurity,
    currentAR,
    pendingInvoiceTotal: pending,
    effectiveAR,
    unsecuredCreditLimit: grower.unsecuredCreditLimit,
    cropSecuredCreditLimit: grower.cropSecuredCreditLimit,
    excessOverUnsecured,
    undeliveredContractEquity,
    hasCropLienFiling: grower.hasCropLienFiling,
    lienFilingReference: grower.lienFilingReference,
    blockingReason,
  };
}

export interface SiloDispatchGuardResult {
  allowed: boolean;
  remainingQtyAfterDispatch: number;
  blockingReason: string | null;
}

/**
 * Evaluates CUJ 4 Outbound Bulk Grain Dispatch non-negative silo constraint:
 * CHECK (CurrentQtyKg >= 0)
 */
export function evaluateSiloDispatchGuard(
  lot: SiloBinLot,
  dispatchQtyKg: number
): SiloDispatchGuardResult {
  if (!Number.isInteger(dispatchQtyKg) || dispatchQtyKg <= 0) {
    return {
      allowed: false,
      remainingQtyAfterDispatch: lot.currentQtyKg,
      blockingReason: 'Dispatch quantity must be a positive integer kilogram value.',
    };
  }
  const remaining = lot.currentQtyKg - dispatchQtyKg;
  if (remaining < 0) {
    return {
      allowed: false,
      remainingQtyAfterDispatch: remaining,
      blockingReason: `Insufficient stock in ${lot.siloIdentifier}. Shortfall of ${Math.abs(remaining).toLocaleString()} kg violates CHECK (CurrentQtyKg >= 0).`,
    };
  }
  return {
    allowed: true,
    remainingQtyAfterDispatch: remaining,
    blockingReason: null,
  };
}
