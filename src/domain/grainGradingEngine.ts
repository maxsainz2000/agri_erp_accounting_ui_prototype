import { GrainDryingRate } from './types';

/**
 * Half-up rounding matching .NET MidpointRounding.AwayFromZero
 * Ensures deterministic integer kilogram dockage calculations.
 */
export function roundAwayFromZero(value: number): number {
  if (value >= 0) {
    return Math.floor(value + 0.5 + 1e-12);
  }
  return Math.ceil(value - 0.5 - 1e-12);
}

/**
 * Round monetary figures to 4 decimal places matching SQL DECIMAL(18,4).
 */
export function round4(value: number): number {
  const factor = 10000;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Round monetary display figures to 2 decimal places.
 */
export function round2(value: number): number {
  const factor = 100;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export interface ScaleGradingResult {
  grossInboundKg: number;
  dockageKg: number;
  netCleanKg: number;
  provisionalTotalAmount: number;
  bushelEquivalent: number | null;
}

export function calculateGrossInboundKg(grossWeightKg: number, tareWeightKg: number): number {
  if (!Number.isInteger(grossWeightKg) || !Number.isInteger(tareWeightKg)) {
    throw new Error('Gross and tare weights must be integer kilograms.');
  }
  if (grossWeightKg < tareWeightKg) {
    throw new Error('Gross weight cannot be less than tare weight.');
  }
  return grossWeightKg - tareWeightKg;
}

export function calculateDockageKg(grossInboundKg: number, foreignMatterPct: number): number {
  if (grossInboundKg < 0) {
    throw new Error('Gross inbound weight cannot be negative.');
  }
  if (foreignMatterPct < 0 || foreignMatterPct > 100) {
    throw new Error('Foreign matter percentage must be between 0% and 100%.');
  }
  const rawDockage = grossInboundKg * (foreignMatterPct / 100);
  const dockage = roundAwayFromZero(rawDockage);
  return Math.min(dockage, grossInboundKg);
}

export function calculateNetCleanKg(grossInboundKg: number, dockageKg: number): number {
  const netClean = grossInboundKg - dockageKg;
  if (netClean < 0) {
    throw new Error('Net clean weight cannot be negative.');
  }
  return netClean;
}

export function convertKgToBushels(kg: number, bushelWeightKg: number | null): number | null {
  if (!bushelWeightKg || bushelWeightKg <= 0) {
    return null;
  }
  return round2(kg / bushelWeightKg);
}

export function evaluateScaleGrading(params: {
  grossWeightKg: number;
  tareWeightKg: number;
  foreignMatterPct: number;
  provisionalUnitPrice: number;
  bushelWeightKg: number | null;
}): ScaleGradingResult {
  const grossInboundKg = calculateGrossInboundKg(params.grossWeightKg, params.tareWeightKg);
  const dockageKg = calculateDockageKg(grossInboundKg, params.foreignMatterPct);
  const netCleanKg = calculateNetCleanKg(grossInboundKg, dockageKg);
  const provisionalTotalAmount = round4(netCleanKg * params.provisionalUnitPrice);
  const bushelEquivalent = convertKgToBushels(netCleanKg, params.bushelWeightKg);

  return {
    grossInboundKg,
    dockageKg,
    netCleanKg,
    provisionalTotalAmount,
    bushelEquivalent,
  };
}

export function lookupDryingRate(
  rates: GrainDryingRate[],
  commodityProductId: number,
  moisturePct: number
): number {
  const matching = rates.find(
    (r) =>
      r.commodityProductId === commodityProductId &&
      moisturePct >= r.minMoisturePct &&
      moisturePct <= r.maxMoisturePct
  );
  if (matching) {
    return matching.deductionRatePerKg;
  }
  // If moisture exceeds highest tier, return top tier rate for that commodity
  const commodityRates = rates
    .filter((r) => r.commodityProductId === commodityProductId)
    .sort((a, b) => b.maxMoisturePct - a.maxMoisturePct);
  if (commodityRates.length > 0 && moisturePct > commodityRates[0].maxMoisturePct) {
    return commodityRates[0].deductionRatePerKg;
  }
  return 0;
}

export function calculateDryingDeduction(netCleanKg: number, deductionRatePerKg: number): number {
  if (netCleanKg <= 0 || deductionRatePerKg <= 0) {
    return 0;
  }
  return round2(netCleanKg * deductionRatePerKg);
}

export function calculateMovingAverageCost(
  currentQtyKg: number,
  currentUnitCost: number,
  receivedQtyKg: number,
  inboundUnitPrice: number
): number {
  const totalQty = currentQtyKg + receivedQtyKg;
  if (totalQty <= 0) {
    return round4(inboundUnitPrice);
  }
  const totalValue = currentQtyKg * currentUnitCost + receivedQtyKg * inboundUnitPrice;
  return round4(totalValue / totalQty);
}
