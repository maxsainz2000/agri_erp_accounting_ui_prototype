export enum AccountType {
  Asset = 'Asset',
  Liability = 'Liability',
  Equity = 'Equity',
  Revenue = 'Revenue',
  Expense = 'Expense',
}

export enum GrainPricingType {
  SpotCash = 'SpotCash',
  ContractFixed = 'ContractFixed',
  DelayedPrice = 'DelayedPrice',
}

export enum ScaleTicketStatus {
  GrossWeighed = 'GrossWeighed',
  PendingSettlement = 'PendingSettlement',
  Settled = 'Settled',
  Voided = 'Voided',
}

export enum GrainContractType {
  CashForward = 'CashForward',
  BasisFixed = 'BasisFixed',
  DelayedPrice = 'DelayedPrice',
}

export enum GrainContractStatus {
  Active = 'Active',
  Fulfilled = 'Fulfilled',
  Cancelled = 'Cancelled',
}

export enum GrowerSettlementStatus {
  Draft = 'Draft',
  Posted = 'Posted',
  Settled = 'Settled',
}

export interface Account {
  code: number;
  name: string;
  type: AccountType;
  normalBalance: 'Debit' | 'Credit';
  isNewAgriAccount: boolean;
  description: string;
}

export interface AccountingPeriod {
  periodId: number;
  label: string;
  fiscalYear: number;
  periodNumber: number;
  startDate: string;
  endDate: string;
  isClosed: boolean;
}

export interface JournalEntryLine {
  accountCode: number;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  lineMemo: string;
}

export interface JournalEntry {
  entryId: number;
  documentNumber: string;
  sourceDocType:
    | 'OpeningBalance'
    | 'ScaleTicketIntake'
    | 'GrowerSettlement'
    | 'SiloCleanOut'
    | 'AgronomicInputSale'
    | 'CommercialGrainDispatch';
  postingDate: string;
  operationalEventDate: string;
  periodLabel: string;
  description: string;
  createdBy: string;
  lines: JournalEntryLine[];
}

export interface Product {
  productId: number;
  sku: string;
  name: string;
  baseUnitName: string;
  packUnitName: string | null;
  packMultiplier: number;
  currentUnitCost: number;
  totalQtyOnHand: number;
  isGrainCommodity: boolean;
  commodityGradeCode: string | null;
  standardBushelWeightKg: number | null;
  currentCashBenchmarkPrice: number;
}

export interface SiloBinLot {
  lotId: number;
  siloIdentifier: string;
  commodityProductId: number;
  commodityName: string;
  gradeCode: string;
  harvestYear: number;
  capacityKg: number;
  currentQtyKg: number;
  currentMovingAvgCost: number;
  isIdentityPreserved: boolean;
  originGrowerId: number | null;
  isActive: boolean;
  lastCleanOutDate: string | null;
}

export interface GrainDryingRate {
  rateId: number;
  commodityProductId: number;
  minMoisturePct: number;
  maxMoisturePct: number;
  deductionRatePerKg: number;
}

export interface GrowerCounterparty {
  vendorId: number;
  customerId: number;
  code: string;
  name: string;
  farmName: string;
  farmFieldId: number;
  unsecuredCreditLimit: number;
  cropSecuredCreditLimit: number;
  hasCropLienFiling: boolean;
  lienFilingReference: string | null;
  lienExpiryDate: string | null;
  currentARBalance: number;
  currentAPBalance: number;
}

export interface CommercialBuyer {
  customerId: number;
  code: string;
  name: string;
  creditLimit: number;
  currentARBalance: number;
}

export interface GrainPurchaseContract {
  contractId: number;
  contractNumber: string;
  growerId: number;
  commodityProductId: number;
  gradeCode: string;
  harvestYear: number;
  contractType: GrainContractType;
  contractedQtyKg: number;
  deliveredQtyKg: number;
  basePricePerKg: number;
  deliveryStartDate: string;
  deliveryEndDate: string;
  status: GrainContractStatus;
}

export interface WeighbridgeScaleTicket {
  ticketId: number;
  ticketNumber: string;
  growerId: number;
  farmFieldId: number;
  truckPlate: string;
  grossWeightKg: number;
  tareWeightKg: number | null;
  grossInboundKg: number | null;
  moisturePct: number;
  foreignMatterPct: number;
  dockageKg: number | null;
  netCleanKg: number | null;
  sampleJarRef: string | null;
  commodityProductId: number;
  targetSiloBinLotId: number;
  pricingType: GrainPricingType;
  associatedContractId: number | null;
  provisionalUnitPrice: number;
  provisionalTotalAmount: number;
  status: ScaleTicketStatus;
  receiptDate: string;
  postingDate: string;
  delayedPriceExpiryDate: string | null;
  createdBy: string;
}

export interface SalesInvoice {
  invoiceId: number;
  documentNumber: string;
  customerId: number;
  customerName: string;
  isGrowerInputSale: boolean;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  status: 'Open' | 'PartiallyPaid' | 'Paid';
  summary: string;
  siloBinLotId: number | null;
}

export interface GrowerSettlementRecord {
  settlementId: number;
  settlementNumber: string;
  growerId: number;
  settlementDate: string;
  totalNetCleanKg: number;
  grossCommodityValue: number;
  provisionalIntakeValuation: number;
  priceVarianceAmount: number;
  dryingChargesTotal: number;
  storageFeesTotal: number;
  netPayableAmount: number;
  contraClearedAmount: number;
  cashDisbursedAmount: number;
  ticketNumbers: string[];
  allocatedInvoiceNumbers: string[];
  status: GrowerSettlementStatus;
}

export const ACCOUNT_CODES = {
  CashOnHand: 1010,
  OperatingBankAccount: 1020,
  AccountsReceivable: 1200,
  MerchandiseInventory: 1300,
  AccountsPayable: 2000,
  GrowerAccountsPayable: 2010,
  GRNIClearing: 2100,
  AccruedGrowerIntake: 2110,
  RetainedEarnings: 3000,
  OwnersCapital: 3010,
  SalesRevenue: 4000,
  SalesReturnsAllowances: 4100,
  AgriculturalServicesRevenue: 4200,
  CostOfGoodsSold: 5000,
  PurchasePriceVariance: 5100,
  GrainBasisVariance: 5110,
  InboundFreightVariance: 5200,
  InventoryShrinkage: 5300,
  CommodityMoistureShrinkage: 5350,
  StocktakeRevaluationVariance: 5400,
  CashRoundingVariance: 5500,
} as const;
