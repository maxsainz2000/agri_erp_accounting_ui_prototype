import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDockageKg,
  calculateDryingDeduction,
  calculateMovingAverageCost,
  convertKgToBushels,
  evaluateScaleGrading,
  lookupDryingRate,
  roundAwayFromZero,
} from './grainGradingEngine';
import {
  generateGrowerSettlementLines,
  generateSalesInvoiceLines,
  generateScaleTicketIntakeLines,
  generateSiloCleanOutLines,
  validateJournalLines,
} from './ledgerPostingEngine';
import {
  evaluateAgronomicCreditGuard,
  evaluateSiloDispatchGuard,
} from './creditGuardEngine';
import {
  INITIAL_ACCOUNTS,
  INITIAL_CONTRACTS,
  INITIAL_DRYING_RATES,
  INITIAL_GROWERS,
  INITIAL_SILO_LOTS,
} from '../data/seedData';
import { ACCOUNT_CODES } from './types';

test('GrainGradingEngine: half-up rounding (MidpointRounding.AwayFromZero)', () => {
  assert.equal(roundAwayFromZero(12.5), 13);
  assert.equal(roundAwayFromZero(13.5), 14);
  assert.equal(roundAwayFromZero(12.49), 12);
});

test('GrainGradingEngine: CUJ 1 scale intake math and zero mass loss invariant', () => {
  const result = evaluateScaleGrading({
    grossWeightKg: 38200,
    tareWeightKg: 14200,
    foreignMatterPct: 1.8,
    provisionalUnitPrice: 0.2,
    bushelWeightKg: 25.4012,
  });

  assert.equal(result.grossInboundKg, 24000);
  assert.equal(result.dockageKg, 432);
  assert.equal(result.netCleanKg, 23568);
  assert.equal(result.dockageKg + result.netCleanKg, result.grossInboundKg);
  assert.equal(result.provisionalTotalAmount, 4713.6);
  assert.equal(result.bushelEquivalent, 927.83);
});

test('GrainGradingEngine: drying rate lookup and deduction', () => {
  const rate = lookupDryingRate(INITIAL_DRYING_RATES, 1, 15.5);
  assert.equal(rate, 0.007);
  assert.equal(calculateDryingDeduction(50000, rate), 350.0);
  assert.equal(lookupDryingRate(INITIAL_DRYING_RATES, 1, 14.0), 0);
  assert.equal(convertKgToBushels(25401, 25.4012), 999.99);
});

test('GrainGradingEngine: moving weighted average cost recalculation', () => {
  const nextCost = calculateMovingAverageCost(100000, 0.2, 50000, 0.23);
  assert.equal(nextCost, 0.21);
});

test('LedgerPostingEngine: Rule 11 Inbound Scale Ticket Intake balances', () => {
  const lines = generateScaleTicketIntakeLines(
    INITIAL_ACCOUNTS,
    'WST-2026-1142',
    'Yellow Dent Corn',
    23568,
    0.2
  );
  const check = validateJournalLines(lines);
  assert.equal(check.isBalanced, true);
  assert.equal(check.totalDebits, 4713.6);
  assert.equal(check.totalCredits, 4713.6);
  assert.equal(lines[0].accountCode, ACCOUNT_CODES.MerchandiseInventory);
  assert.equal(lines[1].accountCode, ACCOUNT_CODES.AccruedGrowerIntake);
});

test('LedgerPostingEngine: Rule 12 CUJ 2 Grower Settlement with Drying & Contra-Clearing balances', () => {
  const lines = generateGrowerSettlementLines(INITIAL_ACCOUNTS, {
    settlementNumber: 'GSS-2026-001',
    growerName: 'John Doe',
    provisionalIntakeValuation: 10000.0,
    grossCommodityValue: 10500.0,
    dryingChargesTotal: 350.0,
    storageFeesTotal: 0.0,
    contraClearedAmount: 4200.0,
    cashDisbursedAmount: 5950.0,
  });

  const check = validateJournalLines(lines);
  assert.equal(check.isBalanced, true);
  assert.equal(check.variance, 0);

  const varianceLine = lines.find((l) => l.accountCode === ACCOUNT_CODES.GrainBasisVariance);
  assert.equal(varianceLine?.debitAmount, 500.0);

  const dryingLine = lines.find((l) => l.accountCode === ACCOUNT_CODES.AgriculturalServicesRevenue);
  assert.equal(dryingLine?.creditAmount, 350.0);

  const arContraLine = lines.find((l) => l.accountCode === ACCOUNT_CODES.AccountsReceivable);
  assert.equal(arContraLine?.creditAmount, 4200.0);

  const cashLine = lines.find((l) => l.accountCode === ACCOUNT_CODES.OperatingBankAccount);
  assert.equal(cashLine?.creditAmount, 5950.0);
});

test('LedgerPostingEngine: Rule 12 handles negative price variance (contract < provisional)', () => {
  const lines = generateGrowerSettlementLines(INITIAL_ACCOUNTS, {
    settlementNumber: 'GSS-2026-002',
    growerName: 'Robert Alvarez',
    provisionalIntakeValuation: 9225.0,
    grossCommodityValue: 8775.0,
    dryingChargesTotal: 125.0,
    storageFeesTotal: 75.0,
    contraClearedAmount: 0,
    cashDisbursedAmount: 8575.0,
  });
  const check = validateJournalLines(lines);
  assert.equal(check.isBalanced, true);
  const varianceLine = lines.find((l) => l.accountCode === ACCOUNT_CODES.GrainBasisVariance);
  assert.equal(varianceLine?.creditAmount, 450.0);
});

test('LedgerPostingEngine: Rule 13 Silo Clean-Out moisture shrinkage & physical surplus balance', () => {
  const shrinkageLines = generateSiloCleanOutLines(
    INITIAL_ACCOUNTS,
    'SILO-04',
    'Yellow Dent Corn',
    100000,
    98200,
    0.2
  );
  const shrinkCheck = validateJournalLines(shrinkageLines);
  assert.equal(shrinkCheck.isBalanced, true);
  assert.equal(shrinkageLines[0].accountCode, ACCOUNT_CODES.CommodityMoistureShrinkage);
  assert.equal(shrinkageLines[0].debitAmount, 360.0);

  const surplusLines = generateSiloCleanOutLines(
    INITIAL_ACCOUNTS,
    'SILO-04',
    'Yellow Dent Corn',
    100000,
    100500,
    0.2
  );
  const surplusCheck = validateJournalLines(surplusLines);
  assert.equal(surplusCheck.isBalanced, true);
  assert.equal(surplusLines[0].accountCode, ACCOUNT_CODES.MerchandiseInventory);
  assert.equal(surplusLines[1].accountCode, ACCOUNT_CODES.StocktakeRevaluationVariance);
  assert.equal(surplusLines[0].debitAmount, 100.0);
});

test('CreditGuardEngine: CUJ 3 approves Jane Smith $28,000 spring sale backed by forward contract & lien', () => {
  const jane = INITIAL_GROWERS.find((g) => g.vendorId === 102)!;
  const result = evaluateAgronomicCreditGuard(jane, INITIAL_CONTRACTS, 28000.0);

  assert.equal(result.allowed, true);
  assert.equal(result.effectiveAR, 29200.0);
  assert.equal(result.excessOverUnsecured, 24200.0);
  assert.equal(result.undeliveredContractEquity, 38000.0);
  assert.equal(result.hasCropLienFiling, true);
});

test('CreditGuardEngine: blocks sale when grower lacks crop lien filing above unsecured limit', () => {
  const robert = INITIAL_GROWERS.find((g) => g.vendorId === 103)!;
  const result = evaluateAgronomicCreditGuard(robert, INITIAL_CONTRACTS, 3000.0);

  assert.equal(result.allowed, false);
  assert.match(result.blockingReason ?? '', /Crop Lien Filing/i);
});

test('CreditGuardEngine: CUJ 4 enforces CHECK (CurrentQtyKg >= 0) on outbound silo dispatch', () => {
  const silo4 = INITIAL_SILO_LOTS.find((s) => s.lotId === 4)!;
  const ok = evaluateSiloDispatchGuard(silo4, 50000);
  assert.equal(ok.allowed, true);
  assert.equal(ok.remainingQtyAfterDispatch, 50000);

  const blocked = evaluateSiloDispatchGuard(silo4, 110000);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.blockingReason ?? '', /Insufficient stock/i);
});

test('LedgerPostingEngine: Sales invoice revenue + COGS journal balances', () => {
  const lines = generateSalesInvoiceLines(
    INITIAL_ACCOUNTS,
    'INV-10550',
    'Midwest Rail Grain Terminal',
    12000.0,
    10000.0,
    '50,000 kg Corn (SILO-04)'
  );
  const check = validateJournalLines(lines);
  assert.equal(check.isBalanced, true);
  assert.equal(check.totalDebits, 22000.0);
});

test('GrainGradingEngine: calculateDockageKg clamps and checks bounds', () => {
  assert.equal(calculateDockageKg(24000, 1.8), 432);
  assert.equal(calculateDockageKg(1000, 0), 0);
});
