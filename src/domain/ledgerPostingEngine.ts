import { ACCOUNT_CODES, Account, JournalEntryLine } from './types';
import { round4 } from './grainGradingEngine';

export interface JournalValidationResult {
  isBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
  variance: number;
}

export function getAccountName(accounts: Account[], code: number): string {
  return accounts.find((a) => a.code === code)?.name ?? `Account ${code}`;
}

export function validateJournalLines(lines: JournalEntryLine[]): JournalValidationResult {
  const totalDebits = round4(lines.reduce((acc, l) => acc + l.debitAmount, 0));
  const totalCredits = round4(lines.reduce((acc, l) => acc + l.creditAmount, 0));
  const variance = round4(Math.abs(totalDebits - totalCredits));
  return {
    isBalanced: lines.length >= 2 && variance === 0,
    totalDebits,
    totalCredits,
    variance,
  };
}

/**
 * Rule 11: Inbound Scale Ticket Intake
 * Dr 1300 Merchandise Inventory / Cr 2110 Accrued Grower Intake
 */
export function generateScaleTicketIntakeLines(
  accounts: Account[],
  ticketNumber: string,
  commodityName: string,
  netCleanKg: number,
  provisionalUnitPrice: number
): JournalEntryLine[] {
  const amount = round4(netCleanKg * provisionalUnitPrice);
  if (amount <= 0) return [];
  return [
    {
      accountCode: ACCOUNT_CODES.MerchandiseInventory,
      accountName: getAccountName(accounts, ACCOUNT_CODES.MerchandiseInventory),
      debitAmount: amount,
      creditAmount: 0,
      lineMemo: `Scale intake ${ticketNumber}: ${netCleanKg.toLocaleString()} kg ${commodityName} @ $${provisionalUnitPrice.toFixed(4)}/kg`,
    },
    {
      accountCode: ACCOUNT_CODES.AccruedGrowerIntake,
      accountName: getAccountName(accounts, ACCOUNT_CODES.AccruedGrowerIntake),
      debitAmount: 0,
      creditAmount: amount,
      lineMemo: `Provisional grower accrual for ${ticketNumber}`,
    },
  ];
}

export interface SettlementJournalInput {
  settlementNumber: string;
  growerName: string;
  provisionalIntakeValuation: number;
  grossCommodityValue: number;
  dryingChargesTotal: number;
  storageFeesTotal: number;
  contraClearedAmount: number;
  cashDisbursedAmount: number;
}

/**
 * Rule 12: Grower Settlement Sheet Liquidation, Drying Revenue, Price Variance & Contra-Clearing
 */
export function generateGrowerSettlementLines(
  accounts: Account[],
  input: SettlementJournalInput
): JournalEntryLine[] {
  const lines: JournalEntryLine[] = [];
  const provisional = round4(input.provisionalIntakeValuation);
  const gross = round4(input.grossCommodityValue);
  const drying = round4(input.dryingChargesTotal);
  const storage = round4(input.storageFeesTotal);
  const contra = round4(input.contraClearedAmount);
  const cash = round4(input.cashDisbursedAmount);

  const priceVariance = round4(gross - provisional);
  const totalServiceFees = round4(drying + storage);
  const netPayable = round4(gross - totalServiceFees);

  // 1. Liquidate Provisional Intake Accrual (Dr 2110)
  if (provisional > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.AccruedGrowerIntake,
      accountName: getAccountName(accounts, ACCOUNT_CODES.AccruedGrowerIntake),
      debitAmount: provisional,
      creditAmount: 0,
      lineMemo: `Liquidate provisional intake accrual (${input.settlementNumber})`,
    });
  }

  // 2. Price Variance (Bidirectional 5110)
  if (priceVariance > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.GrainBasisVariance,
      accountName: getAccountName(accounts, ACCOUNT_CODES.GrainBasisVariance),
      debitAmount: priceVariance,
      creditAmount: 0,
      lineMemo: `Contract price above provisional benchmark (${input.settlementNumber})`,
    });
  } else if (priceVariance < 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.GrainBasisVariance,
      accountName: getAccountName(accounts, ACCOUNT_CODES.GrainBasisVariance),
      debitAmount: 0,
      creditAmount: Math.abs(priceVariance),
      lineMemo: `Contract price below provisional benchmark (${input.settlementNumber})`,
    });
  }

  // 3. Drying & Storage Revenue (Cr 4200)
  if (drying > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.AgriculturalServicesRevenue,
      accountName: getAccountName(accounts, ACCOUNT_CODES.AgriculturalServicesRevenue),
      debitAmount: 0,
      creditAmount: drying,
      lineMemo: `Moisture conditioning & drying charges (${input.growerName})`,
    });
  }
  if (storage > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.AgriculturalServicesRevenue,
      accountName: getAccountName(accounts, ACCOUNT_CODES.AgriculturalServicesRevenue),
      debitAmount: 0,
      creditAmount: storage,
      lineMemo: `Delayed price grain storage charges (${input.growerName})`,
    });
  }

  // 4. Net Grower Payable Liability (Cr 2010)
  if (netPayable > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.GrowerAccountsPayable,
      accountName: getAccountName(accounts, ACCOUNT_CODES.GrowerAccountsPayable),
      debitAmount: 0,
      creditAmount: netPayable,
      lineMemo: `Net grower settlement liability (${input.growerName})`,
    });
  }

  // 5. Bilateral AR/AP Contra-Clearing (Dr 2010 / Cr 1200)
  if (contra > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.GrowerAccountsPayable,
      accountName: getAccountName(accounts, ACCOUNT_CODES.GrowerAccountsPayable),
      debitAmount: contra,
      creditAmount: 0,
      lineMemo: `Bilateral seasonal contra offset against spring input AR`,
    });
    lines.push({
      accountCode: ACCOUNT_CODES.AccountsReceivable,
      accountName: getAccountName(accounts, ACCOUNT_CODES.AccountsReceivable),
      debitAmount: 0,
      creditAmount: contra,
      lineMemo: `Clear spring agronomic input receivables (${input.growerName})`,
    });
  }

  // 6. Residual Cash Payment Voucher (Dr 2010 / Cr 1020)
  if (cash > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.GrowerAccountsPayable,
      accountName: getAccountName(accounts, ACCOUNT_CODES.GrowerAccountsPayable),
      debitAmount: cash,
      creditAmount: 0,
      lineMemo: `Residual cash settlement disbursement (${input.settlementNumber})`,
    });
    lines.push({
      accountCode: ACCOUNT_CODES.OperatingBankAccount,
      accountName: getAccountName(accounts, ACCOUNT_CODES.OperatingBankAccount),
      debitAmount: 0,
      creditAmount: cash,
      lineMemo: `Bank payment voucher to ${input.growerName}`,
    });
  }

  return lines;
}

/**
 * Rule 13: Silo Clean-Out Reconciliation
 * Shrinkage Deficit: Dr 5350 Commodity Moisture Shrinkage / Cr 1300 Merchandise Inventory
 * Physical Surplus: Dr 1300 Merchandise Inventory / Cr 5400 Stocktake Revaluation Variance
 */
export function generateSiloCleanOutLines(
  accounts: Account[],
  siloIdentifier: string,
  commodityName: string,
  bookQtyKg: number,
  actualSweepQtyKg: number,
  movingAvgUnitCost: number
): JournalEntryLine[] {
  const qtyDiff = actualSweepQtyKg - bookQtyKg;
  if (qtyDiff === 0) return [];
  const amount = round4(Math.abs(qtyDiff) * movingAvgUnitCost);
  if (amount <= 0) return [];

  if (qtyDiff < 0) {
    // Evaporation / Shrinkage Deficit
    return [
      {
        accountCode: ACCOUNT_CODES.CommodityMoistureShrinkage,
        accountName: getAccountName(accounts, ACCOUNT_CODES.CommodityMoistureShrinkage),
        debitAmount: amount,
        creditAmount: 0,
        lineMemo: `Silo clean-out moisture shrinkage (${siloIdentifier}: ${Math.abs(qtyDiff).toLocaleString()} kg ${commodityName})`,
      },
      {
        accountCode: ACCOUNT_CODES.MerchandiseInventory,
        accountName: getAccountName(accounts, ACCOUNT_CODES.MerchandiseInventory),
        debitAmount: 0,
        creditAmount: amount,
        lineMemo: `Write-down commingled inventory balance on ${siloIdentifier}`,
      },
    ];
  }

  // Physical Count Surplus
  return [
    {
      accountCode: ACCOUNT_CODES.MerchandiseInventory,
      accountName: getAccountName(accounts, ACCOUNT_CODES.MerchandiseInventory),
      debitAmount: amount,
      creditAmount: 0,
      lineMemo: `Silo clean-out physical surplus (${siloIdentifier}: +${qtyDiff.toLocaleString()} kg ${commodityName})`,
    },
    {
      accountCode: ACCOUNT_CODES.StocktakeRevaluationVariance,
      accountName: getAccountName(accounts, ACCOUNT_CODES.StocktakeRevaluationVariance),
      debitAmount: 0,
      creditAmount: amount,
      lineMemo: `Physical grain count surplus gain on ${siloIdentifier}`,
    },
  ];
}

/**
 * Sales Invoice (Packaged Input Sale or Outbound Bulk Grain Dispatch)
 * Dr 1200 AR / Cr 4000 Sales Revenue
 * Dr 5000 COGS / Cr 1300 Merchandise Inventory
 */
export function generateSalesInvoiceLines(
  accounts: Account[],
  documentNumber: string,
  customerName: string,
  revenueAmount: number,
  cogsAmount: number,
  itemSummary: string
): JournalEntryLine[] {
  const rev = round4(revenueAmount);
  const cogs = round4(cogsAmount);
  if (rev <= 0) return [];

  const lines: JournalEntryLine[] = [
    {
      accountCode: ACCOUNT_CODES.AccountsReceivable,
      accountName: getAccountName(accounts, ACCOUNT_CODES.AccountsReceivable),
      debitAmount: rev,
      creditAmount: 0,
      lineMemo: `Invoice ${documentNumber} billed to ${customerName}`,
    },
    {
      accountCode: ACCOUNT_CODES.SalesRevenue,
      accountName: getAccountName(accounts, ACCOUNT_CODES.SalesRevenue),
      debitAmount: 0,
      creditAmount: rev,
      lineMemo: `Revenue recognition — ${itemSummary}`,
    },
  ];

  if (cogs > 0) {
    lines.push(
      {
        accountCode: ACCOUNT_CODES.CostOfGoodsSold,
        accountName: getAccountName(accounts, ACCOUNT_CODES.CostOfGoodsSold),
        debitAmount: cogs,
        creditAmount: 0,
        lineMemo: `COGS at moving weighted average (${documentNumber})`,
      },
      {
        accountCode: ACCOUNT_CODES.MerchandiseInventory,
        accountName: getAccountName(accounts, ACCOUNT_CODES.MerchandiseInventory),
        debitAmount: 0,
        creditAmount: cogs,
        lineMemo: `Inventory depletion — ${itemSummary}`,
      }
    );
  }

  return lines;
}
