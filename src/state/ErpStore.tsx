import React, { createContext, useContext, useState } from 'react';
import {
  ACCOUNT_CODES,
  Account,
  AccountingPeriod,
  CommercialBuyer,
  GrainDryingRate,
  GrainPricingType,
  GrainPurchaseContract,
  GrowerCounterparty,
  GrowerSettlementRecord,
  GrowerSettlementStatus,
  JournalEntry,
  Product,
  SalesInvoice,
  ScaleTicketStatus,
  SiloBinLot,
  WeighbridgeScaleTicket,
} from '../domain/types';
import {
  INITIAL_ACCOUNTS,
  INITIAL_COMMERCIAL_BUYERS,
  INITIAL_CONTRACTS,
  INITIAL_DRYING_RATES,
  INITIAL_GROWERS,
  INITIAL_JOURNAL_ENTRIES,
  INITIAL_PERIODS,
  INITIAL_PRODUCTS,
  INITIAL_SALES_INVOICES,
  INITIAL_SCALE_TICKETS,
  INITIAL_SETTLEMENTS,
  INITIAL_SILO_LOTS,
  TODAY_ISO,
} from '../data/seedData';
import {
  calculateMovingAverageCost,
  evaluateScaleGrading,
  round2,
  round4,
} from '../domain/grainGradingEngine';
import {
  generateGrowerSettlementLines,
  generateSalesInvoiceLines,
  generateScaleTicketIntakeLines,
  generateSiloCleanOutLines,
  validateJournalLines,
} from '../domain/ledgerPostingEngine';
import {
  evaluateAgronomicCreditGuard,
  evaluateSiloDispatchGuard,
} from '../domain/creditGuardEngine';

export type NavSection =
  | 'weighbridge'
  | 'settlements'
  | 'silos'
  | 'exposure'
  | 'sales'
  | 'ledger';

export interface ErpNotification {
  id: number;
  kind: 'success' | 'error';
  title: string;
  detail: string;
}

export interface Stage1GrossInput {
  growerId: number;
  truckPlate: string;
  grossWeightKg: number;
  commodityProductId: number;
  targetSiloBinLotId: number;
  pricingType: GrainPricingType;
  associatedContractId: number | null;
}

export interface Stage2CommitInput {
  ticketId: number;
  tareWeightKg: number;
  moisturePct: number;
  foreignMatterPct: number;
  sampleJarRef: string;
  pricingType: GrainPricingType;
  associatedContractId: number | null;
}

export interface PostSettlementInput {
  growerId: number;
  ticketIds: number[];
  contractUnitPrice: number;
  dryingChargesTotal: number;
  storageFeesTotal: number;
  invoiceAllocations: Record<number, number>;
  issueCashVoucher: boolean;
}

export interface ExecuteCleanOutInput {
  lotId: number;
  actualSweepQtyKg: number;
  notes: string;
}

export interface PostInputSaleInput {
  growerId: number;
  lines: { productId: number; packQty: number; unitPricePerKg: number }[];
}

export interface PostGrainDispatchInput {
  buyerId: number;
  lotId: number;
  dispatchQtyKg: number;
  sellingPricePerKg: number;
}

interface ErpContextValue {
  accounts: Account[];
  periods: AccountingPeriod[];
  activePeriod: AccountingPeriod;
  products: Product[];
  siloLots: SiloBinLot[];
  dryingRates: GrainDryingRate[];
  growers: GrowerCounterparty[];
  commercialBuyers: CommercialBuyer[];
  contracts: GrainPurchaseContract[];
  scaleTickets: WeighbridgeScaleTicket[];
  salesInvoices: SalesInvoice[];
  settlements: GrowerSettlementRecord[];
  journalEntries: JournalEntry[];
  activeSection: NavSection;
  setActiveSection: (section: NavSection) => void;
  preselectedSettlementGrowerId: number | null;
  preselectedSettlementTicketId: number | null;
  jumpToLiquidateTicket: (growerId: number, ticketId: number) => void;
  clearPreselectedSettlement: () => void;
  notification: ErpNotification | null;
  dismissNotification: () => void;
  toggleActivePeriodLock: () => void;
  updateBenchmarkPrice: (productId: number, newPrice: number) => void;
  recordStage1GrossWeight: (input: Stage1GrossInput) => { ok: boolean; error?: string; ticketNumber?: string };
  commitStage2ScaleTicket: (input: Stage2CommitInput) => { ok: boolean; error?: string };
  postGrowerSettlement: (input: PostSettlementInput) => { ok: boolean; error?: string; settlementNumber?: string };
  executeSiloCleanOut: (input: ExecuteCleanOutInput) => { ok: boolean; error?: string };
  postAgronomicInputSale: (input: PostInputSaleInput) => { ok: boolean; error?: string; invoiceNumber?: string };
  postCommercialGrainDispatch: (input: PostGrainDispatchInput) => { ok: boolean; error?: string; invoiceNumber?: string };
  resetDemoState: () => void;
}

const ErpContext = createContext<ErpContextValue | null>(null);

export function ErpProvider({ children }: { children: React.ReactNode }) {
  const [accounts] = useState<Account[]>(INITIAL_ACCOUNTS);
  const [periods, setPeriods] = useState<AccountingPeriod[]>(INITIAL_PERIODS);
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [siloLots, setSiloLots] = useState<SiloBinLot[]>(INITIAL_SILO_LOTS);
  const [dryingRates] = useState<GrainDryingRate[]>(INITIAL_DRYING_RATES);
  const [growers, setGrowers] = useState<GrowerCounterparty[]>(INITIAL_GROWERS);
  const [commercialBuyers, setCommercialBuyers] = useState<CommercialBuyer[]>(INITIAL_COMMERCIAL_BUYERS);
  const [contracts, setContracts] = useState<GrainPurchaseContract[]>(INITIAL_CONTRACTS);
  const [scaleTickets, setScaleTickets] = useState<WeighbridgeScaleTicket[]>(INITIAL_SCALE_TICKETS);
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>(INITIAL_SALES_INVOICES);
  const [settlements, setSettlements] = useState<GrowerSettlementRecord[]>(INITIAL_SETTLEMENTS);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(INITIAL_JOURNAL_ENTRIES);
  const [activeSection, setActiveSection] = useState<NavSection>('weighbridge');
  const [preselectedSettlementGrowerId, setPreselectedSettlementGrowerId] = useState<number | null>(null);
  const [preselectedSettlementTicketId, setPreselectedSettlementTicketId] = useState<number | null>(null);
  const [notification, setNotification] = useState<ErpNotification | null>(null);

  const activePeriod = periods[periods.length - 1];

  const notify = (kind: 'success' | 'error', title: string, detail: string) => {
    setNotification({ id: Date.now(), kind, title, detail });
  };

  const dismissNotification = () => setNotification(null);

  const toggleActivePeriodLock = () => {
    setPeriods((prev) =>
      prev.map((p, idx) =>
        idx === prev.length - 1 ? { ...p, isClosed: !p.isClosed } : p
      )
    );
  };

  const updateBenchmarkPrice = (productId: number, newPrice: number) => {
    if (isNaN(newPrice) || newPrice <= 0) return;
    setProducts((prev) =>
      prev.map((p) =>
        p.productId === productId
          ? { ...p, currentCashBenchmarkPrice: round4(newPrice) }
          : p
      )
    );
  };

  const jumpToLiquidateTicket = (growerId: number, ticketId: number) => {
    setPreselectedSettlementGrowerId(growerId);
    setPreselectedSettlementTicketId(ticketId);
    setActiveSection('settlements');
  };

  const clearPreselectedSettlement = () => {
    setPreselectedSettlementGrowerId(null);
    setPreselectedSettlementTicketId(null);
  };

  const recordStage1GrossWeight = (input: Stage1GrossInput) => {
    const grower = growers.find((g) => g.vendorId === input.growerId);
    const product = products.find((p) => p.productId === input.commodityProductId);
    const lot = siloLots.find((l) => l.lotId === input.targetSiloBinLotId);

    if (!grower || !product || !lot) {
      return { ok: false, error: 'Select a valid grower, commodity, and target silo lot.' };
    }
    if (!input.truckPlate.trim()) {
      return { ok: false, error: 'Truck license plate is required for Stage 1 intake.' };
    }
    if (!Number.isInteger(input.grossWeightKg) || input.grossWeightKg <= 0) {
      return { ok: false, error: 'Gross weight must be a positive integer in kilograms.' };
    }

    const nextId = Math.max(1000, ...scaleTickets.map((t) => t.ticketId)) + 1;
    const seq = 1140 + (scaleTickets.length + 1);
    const ticketNumber = `WST-2026-${seq}`;

    const newTicket: WeighbridgeScaleTicket = {
      ticketId: nextId,
      ticketNumber,
      growerId: grower.vendorId,
      farmFieldId: grower.farmFieldId,
      truckPlate: input.truckPlate.trim().toUpperCase(),
      grossWeightKg: input.grossWeightKg,
      tareWeightKg: null,
      grossInboundKg: null,
      moisturePct: 0,
      foreignMatterPct: 0,
      dockageKg: null,
      netCleanKg: null,
      sampleJarRef: null,
      commodityProductId: product.productId,
      targetSiloBinLotId: lot.lotId,
      pricingType: input.pricingType,
      associatedContractId: input.associatedContractId,
      provisionalUnitPrice: product.currentCashBenchmarkPrice,
      provisionalTotalAmount: 0,
      status: ScaleTicketStatus.GrossWeighed,
      receiptDate: TODAY_ISO,
      postingDate: TODAY_ISO,
      delayedPriceExpiryDate:
        input.pricingType === GrainPricingType.DelayedPrice ? '2027-02-19' : null,
      createdBy: 'Scale Clerk',
    };

    setScaleTickets((prev) => [newTicket, ...prev]);
    notify(
      'success',
      `Stage 1 Gross Ticket ${ticketNumber} Saved`,
      `${newTicket.truckPlate} (${grower.name}) recorded at ${newTicket.grossWeightKg.toLocaleString()} kg. Routed to dump pit for ${lot.siloIdentifier}.`
    );
    return { ok: true, ticketNumber };
  };

  const commitStage2ScaleTicket = (input: Stage2CommitInput) => {
    if (activePeriod.isClosed) {
      const msg = `ClosedPeriodPostingException: Period ${activePeriod.label} is sealed. Open the fiscal period to post scale intake.`;
      notify('error', 'Posting Blocked — Closed Fiscal Period', msg);
      return { ok: false, error: msg };
    }

    const ticket = scaleTickets.find((t) => t.ticketId === input.ticketId);
    if (!ticket || ticket.status !== ScaleTicketStatus.GrossWeighed) {
      return { ok: false, error: 'Selected ticket is not awaiting Stage 2 tare completion.' };
    }
    const product = products.find((p) => p.productId === ticket.commodityProductId);
    const lot = siloLots.find((l) => l.lotId === ticket.targetSiloBinLotId);
    if (!product || !lot) {
      return { ok: false, error: 'Commodity or target silo lot could not be found.' };
    }
    if (!Number.isInteger(input.tareWeightKg) || input.tareWeightKg <= 0) {
      return { ok: false, error: 'Tare weight must be a positive integer in kilograms.' };
    }
    if (input.tareWeightKg >= ticket.grossWeightKg) {
      return { ok: false, error: 'Tare weight must be strictly less than gross weight.' };
    }
    if (!input.sampleJarRef.trim()) {
      return { ok: false, error: 'Probe Sample Jar Reference is required for recall traceability.' };
    }

    const grading = evaluateScaleGrading({
      grossWeightKg: ticket.grossWeightKg,
      tareWeightKg: input.tareWeightKg,
      foreignMatterPct: input.foreignMatterPct,
      provisionalUnitPrice: product.currentCashBenchmarkPrice,
      bushelWeightKg: product.standardBushelWeightKg,
    });

    if (lot.currentQtyKg + grading.netCleanKg > lot.capacityKg) {
      const msg = `Silo capacity exceeded on ${lot.siloIdentifier}. Remaining space: ${(lot.capacityKg - lot.currentQtyKg).toLocaleString()} kg.`;
      notify('error', 'Silo Capacity Constraint', msg);
      return { ok: false, error: msg };
    }

    const journalLines = generateScaleTicketIntakeLines(
      accounts,
      ticket.ticketNumber,
      product.name,
      grading.netCleanKg,
      product.currentCashBenchmarkPrice
    );
    const balanceCheck = validateJournalLines(journalLines);
    if (!balanceCheck.isBalanced) {
      return { ok: false, error: 'Generated journal entry failed double-entry balance validation.' };
    }

    setScaleTickets((prev) =>
      prev.map((t) =>
        t.ticketId === ticket.ticketId
          ? {
              ...t,
              tareWeightKg: input.tareWeightKg,
              grossInboundKg: grading.grossInboundKg,
              moisturePct: input.moisturePct,
              foreignMatterPct: input.foreignMatterPct,
              dockageKg: grading.dockageKg,
              netCleanKg: grading.netCleanKg,
              sampleJarRef: input.sampleJarRef.trim().toUpperCase(),
              pricingType: input.pricingType,
              associatedContractId: input.associatedContractId,
              provisionalUnitPrice: product.currentCashBenchmarkPrice,
              provisionalTotalAmount: grading.provisionalTotalAmount,
              delayedPriceExpiryDate:
                input.pricingType === GrainPricingType.DelayedPrice ? '2027-02-19' : null,
              status: ScaleTicketStatus.PendingSettlement,
            }
          : t
      )
    );

    setProducts((prev) =>
      prev.map((p) =>
        p.productId === product.productId
          ? {
              ...p,
              totalQtyOnHand: p.totalQtyOnHand + grading.netCleanKg,
              currentUnitCost: calculateMovingAverageCost(
                p.totalQtyOnHand,
                p.currentUnitCost,
                grading.netCleanKg,
                product.currentCashBenchmarkPrice
              ),
            }
          : p
      )
    );

    setSiloLots((prev) =>
      prev.map((l) =>
        l.lotId === lot.lotId
          ? {
              ...l,
              currentQtyKg: l.currentQtyKg + grading.netCleanKg,
              currentMovingAvgCost: calculateMovingAverageCost(
                l.currentQtyKg,
                l.currentMovingAvgCost,
                grading.netCleanKg,
                product.currentCashBenchmarkPrice
              ),
            }
          : l
      )
    );

    if (input.associatedContractId) {
      setContracts((prev) =>
        prev.map((c) =>
          c.contractId === input.associatedContractId
            ? { ...c, deliveredQtyKg: c.deliveredQtyKg + grading.netCleanKg }
            : c
        )
      );
    }

    const nextEntryId = journalEntries.length + 1;
    const newEntry: JournalEntry = {
      entryId: nextEntryId,
      documentNumber: ticket.ticketNumber,
      sourceDocType: 'ScaleTicketIntake',
      postingDate: TODAY_ISO,
      operationalEventDate: TODAY_ISO,
      periodLabel: activePeriod.label,
      description: `Two-stage scale intake (${lot.siloIdentifier}) — ${grading.netCleanKg.toLocaleString()} net clean kg`,
      createdBy: 'Scale Clerk',
      lines: journalLines,
    };
    setJournalEntries((prev) => [newEntry, ...prev]);

    notify(
      'success',
      `Scale Ticket ${ticket.ticketNumber} Committed`,
      `Added ${grading.netCleanKg.toLocaleString()} net clean kg to ${lot.siloIdentifier} (Dockage: ${grading.dockageKg.toLocaleString()} kg) and posted $${grading.provisionalTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} to GL 1300 / 2110.`
    );
    return { ok: true };
  };

  const postGrowerSettlement = (input: PostSettlementInput) => {
    if (activePeriod.isClosed) {
      const msg = `ClosedPeriodPostingException: Period ${activePeriod.label} is sealed.`;
      notify('error', 'Posting Blocked — Closed Fiscal Period', msg);
      return { ok: false, error: msg };
    }

    const grower = growers.find((g) => g.vendorId === input.growerId);
    const selectedTickets = scaleTickets.filter(
      (t) =>
        input.ticketIds.includes(t.ticketId) &&
        t.growerId === input.growerId &&
        t.status === ScaleTicketStatus.PendingSettlement
    );

    if (!grower || selectedTickets.length === 0) {
      return { ok: false, error: 'Select at least one unsettled scale ticket for this grower.' };
    }
    if (input.contractUnitPrice <= 0) {
      return { ok: false, error: 'Contract settlement unit price must be greater than $0.00.' };
    }

    const totalNetCleanKg = selectedTickets.reduce((s, t) => s + (t.netCleanKg ?? 0), 0);
    const provisionalIntakeValuation = round2(
      selectedTickets.reduce((s, t) => s + t.provisionalTotalAmount, 0)
    );
    const grossCommodityValue = round2(totalNetCleanKg * input.contractUnitPrice);
    const priceVarianceAmount = round2(grossCommodityValue - provisionalIntakeValuation);
    const dryingChargesTotal = round2(Math.max(0, input.dryingChargesTotal));
    const storageFeesTotal = round2(Math.max(0, input.storageFeesTotal));
    const netPayableAmount = round2(grossCommodityValue - dryingChargesTotal - storageFeesTotal);

    if (netPayableAmount < 0) {
      return { ok: false, error: 'Service deductions cannot exceed gross commodity value.' };
    }

    const contraClearedAmount = round2(
      Object.values(input.invoiceAllocations).reduce((sum, amt) => sum + Math.max(0, amt), 0)
    );
    if (contraClearedAmount > netPayableAmount) {
      return { ok: false, error: 'Contra invoice allocations cannot exceed net grower payable proceeds.' };
    }

    const residualAfterContra = round2(netPayableAmount - contraClearedAmount);
    const cashDisbursedAmount = input.issueCashVoucher ? residualAfterContra : 0;
    const settlementNumber = `GSS-2026-${String(settlements.length + 101).padStart(3, '0')}`;

    const journalLines = generateGrowerSettlementLines(accounts, {
      settlementNumber,
      growerName: grower.name,
      provisionalIntakeValuation,
      grossCommodityValue,
      dryingChargesTotal,
      storageFeesTotal,
      contraClearedAmount,
      cashDisbursedAmount,
    });

    const validation = validateJournalLines(journalLines);
    if (!validation.isBalanced) {
      return { ok: false, error: 'Settlement journal entry failed double-entry balancing check.' };
    }

    // 1. Mark scale tickets settled
    setScaleTickets((prev) =>
      prev.map((t) =>
        input.ticketIds.includes(t.ticketId)
          ? { ...t, status: ScaleTicketStatus.Settled }
          : t
      )
    );

    // 2. Apply bilateral contra invoice allocations
    const allocatedInvoiceNumbers: string[] = [];
    setSalesInvoices((prev) =>
      prev.map((inv) => {
        const alloc = round2(input.invoiceAllocations[inv.invoiceId] ?? 0);
        if (alloc <= 0) return inv;
        allocatedInvoiceNumbers.push(inv.documentNumber);
        const newPaid = round2(Math.min(inv.totalAmount, inv.paidAmount + alloc));
        const newStatus =
          newPaid >= inv.totalAmount - 0.001
            ? 'Paid'
            : newPaid > 0
              ? 'PartiallyPaid'
              : 'Open';
        return { ...inv, paidAmount: newPaid, status: newStatus };
      })
    );

    // 3. Update grower AR & AP balances
    const remainingAP = round2(residualAfterContra - cashDisbursedAmount);
    setGrowers((prev) =>
      prev.map((g) =>
        g.vendorId === grower.vendorId
          ? {
              ...g,
              currentARBalance: round2(Math.max(0, g.currentARBalance - contraClearedAmount)),
              currentAPBalance: round2(g.currentAPBalance + remainingAP),
            }
          : g
      )
    );

    // 4. Record Settlement Sheet
    const newSettlement: GrowerSettlementRecord = {
      settlementId: settlements.length + 1,
      settlementNumber,
      growerId: grower.vendorId,
      settlementDate: TODAY_ISO,
      totalNetCleanKg,
      grossCommodityValue,
      provisionalIntakeValuation,
      priceVarianceAmount,
      dryingChargesTotal,
      storageFeesTotal,
      netPayableAmount,
      contraClearedAmount,
      cashDisbursedAmount,
      ticketNumbers: selectedTickets.map((t) => t.ticketNumber),
      allocatedInvoiceNumbers,
      status: cashDisbursedAmount > 0 || residualAfterContra === 0
        ? GrowerSettlementStatus.Settled
        : GrowerSettlementStatus.Posted,
    };
    setSettlements((prev) => [newSettlement, ...prev]);

    // 5. Post balanced Journal Entry
    const newEntry: JournalEntry = {
      entryId: journalEntries.length + 1,
      documentNumber: settlementNumber,
      sourceDocType: 'GrowerSettlement',
      postingDate: TODAY_ISO,
      operationalEventDate: TODAY_ISO,
      periodLabel: activePeriod.label,
      description: `Grower settlement (${grower.name}): ${selectedTickets.length} ticket(s), contra $${contraClearedAmount.toFixed(2)}, cash $${cashDisbursedAmount.toFixed(2)}`,
      createdBy: 'Grain Accountant',
      lines: journalLines,
    };
    setJournalEntries((prev) => [newEntry, ...prev]);

    notify(
      'success',
      `Settlement ${settlementNumber} Posted`,
      `Liquidated ${totalNetCleanKg.toLocaleString()} kg for ${grower.name}. Contra-cleared $${contraClearedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} AR and disbursed $${cashDisbursedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} cash voucher.`
    );
    return { ok: true, settlementNumber };
  };

  const executeSiloCleanOut = (input: ExecuteCleanOutInput) => {
    if (activePeriod.isClosed) {
      const msg = `ClosedPeriodPostingException: Period ${activePeriod.label} is sealed.`;
      notify('error', 'Posting Blocked — Closed Fiscal Period', msg);
      return { ok: false, error: msg };
    }

    const lot = siloLots.find((l) => l.lotId === input.lotId);
    if (!lot) {
      return { ok: false, error: 'Target silo bin lot not found.' };
    }
    if (!Number.isInteger(input.actualSweepQtyKg) || input.actualSweepQtyKg < 0) {
      return { ok: false, error: 'Actual physical sweep quantity must be a non-negative integer kg.' };
    }
    if (input.actualSweepQtyKg > lot.capacityKg) {
      return { ok: false, error: 'Actual physical quantity cannot exceed silo capacity.' };
    }

    const qtyDelta = input.actualSweepQtyKg - lot.currentQtyKg;
    if (qtyDelta === 0) {
      return { ok: false, error: 'Physical sweep weight matches current book balance; no adjustment required.' };
    }

    const journalLines = generateSiloCleanOutLines(
      accounts,
      lot.siloIdentifier,
      lot.commodityName,
      lot.currentQtyKg,
      input.actualSweepQtyKg,
      lot.currentMovingAvgCost
    );
    const check = validateJournalLines(journalLines);
    if (!check.isBalanced) {
      return { ok: false, error: 'Silo clean-out journal entry failed double-entry validation.' };
    }

    setSiloLots((prev) =>
      prev.map((l) =>
        l.lotId === lot.lotId
          ? {
              ...l,
              currentQtyKg: input.actualSweepQtyKg,
              lastCleanOutDate: TODAY_ISO,
            }
          : l
      )
    );

    setProducts((prev) =>
      prev.map((p) =>
        p.productId === lot.commodityProductId
          ? { ...p, totalQtyOnHand: Math.max(0, p.totalQtyOnHand + qtyDelta) }
          : p
      )
    );

    const docNumber = `ADJ-CLN-${String(journalEntries.length + 1).padStart(3, '0')}`;
    const isShrinkage = qtyDelta < 0;
    const newEntry: JournalEntry = {
      entryId: journalEntries.length + 1,
      documentNumber: docNumber,
      sourceDocType: 'SiloCleanOut',
      postingDate: TODAY_ISO,
      operationalEventDate: TODAY_ISO,
      periodLabel: activePeriod.label,
      description: `Silo Clean-Out (${lot.siloIdentifier}): ${isShrinkage ? 'Moisture shrinkage deficit' : 'Physical count surplus'} of ${Math.abs(qtyDelta).toLocaleString()} kg${input.notes ? ` — ${input.notes}` : ''}`,
      createdBy: 'Elevator Superintendent',
      lines: journalLines,
    };
    setJournalEntries((prev) => [newEntry, ...prev]);

    notify(
      'success',
      `Silo Clean-Out ${docNumber} Posted`,
      `${lot.siloIdentifier} reconciled from ${lot.currentQtyKg.toLocaleString()} kg to ${input.actualSweepQtyKg.toLocaleString()} kg (${isShrinkage ? `Dr 5350 Moisture Shrinkage` : `Cr 5400 Stocktake Variance`}).`
    );
    return { ok: true };
  };

  const postAgronomicInputSale = (input: PostInputSaleInput) => {
    if (activePeriod.isClosed) {
      const msg = `ClosedPeriodPostingException: Period ${activePeriod.label} is sealed.`;
      notify('error', 'Posting Blocked — Closed Fiscal Period', msg);
      return { ok: false, error: msg };
    }

    const grower = growers.find((g) => g.vendorId === input.growerId);
    if (!grower) return { ok: false, error: 'Select a valid grower customer.' };
    if (input.lines.length === 0) return { ok: false, error: 'Add at least one input line item.' };

    let totalRevenue = 0;
    let totalCogs = 0;
    const summaryParts: string[] = [];

    for (const line of input.lines) {
      const product = products.find((p) => p.productId === line.productId);
      if (!product) return { ok: false, error: 'Invalid agronomic input product selected.' };
      if (!Number.isInteger(line.packQty) || line.packQty <= 0) {
        return { ok: false, error: 'Package quantity must be a positive integer.' };
      }
      const totalKg = line.packQty * product.packMultiplier;
      if (totalKg > product.totalQtyOnHand) {
        return {
          ok: false,
          error: `Insufficient stock for ${product.name}. Need ${totalKg.toLocaleString()} kg, available ${product.totalQtyOnHand.toLocaleString()} kg.`,
        };
      }
      totalRevenue = round2(totalRevenue + totalKg * line.unitPricePerKg);
      totalCogs = round2(totalCogs + totalKg * product.currentUnitCost);
      summaryParts.push(`${line.packQty} × ${product.packUnitName ?? product.baseUnitName} ${product.sku}`);
    }

    const creditCheck = evaluateAgronomicCreditGuard(grower, contracts, totalRevenue);
    if (!creditCheck.allowed) {
      notify('error', 'Credit Limit Guard Triggered', creditCheck.blockingReason ?? 'Credit check failed.');
      return { ok: false, error: creditCheck.blockingReason ?? 'Credit check failed.' };
    }

    const nextInvId = Math.max(10505, ...salesInvoices.map((i) => i.invoiceId)) + 1;
    const invoiceNumber = `INV-${nextInvId}`;

    const journalLines = generateSalesInvoiceLines(
      accounts,
      invoiceNumber,
      `${grower.name} (${grower.farmName})`,
      totalRevenue,
      totalCogs,
      summaryParts.join(', ')
    );

    // Decrement stock
    setProducts((prev) =>
      prev.map((p) => {
        const matched = input.lines.find((l) => l.productId === p.productId);
        if (!matched) return p;
        return {
          ...p,
          totalQtyOnHand: p.totalQtyOnHand - matched.packQty * p.packMultiplier,
        };
      })
    );

    // Increment grower AR
    setGrowers((prev) =>
      prev.map((g) =>
        g.vendorId === grower.vendorId
          ? { ...g, currentARBalance: round2(g.currentARBalance + totalRevenue) }
          : g
      )
    );

    // Append Sales Invoice
    const newInvoice: SalesInvoice = {
      invoiceId: nextInvId,
      documentNumber: invoiceNumber,
      customerId: grower.customerId,
      customerName: `${grower.name} (${grower.farmName})`,
      isGrowerInputSale: true,
      invoiceDate: TODAY_ISO,
      dueDate: '2027-04-30',
      totalAmount: totalRevenue,
      paidAmount: 0,
      status: 'Open',
      summary: summaryParts.join(' + '),
      siloBinLotId: null,
    };
    setSalesInvoices((prev) => [newInvoice, ...prev]);

    // Post balanced Journal Entry
    const newEntry: JournalEntry = {
      entryId: journalEntries.length + 1,
      documentNumber: invoiceNumber,
      sourceDocType: 'AgronomicInputSale',
      postingDate: TODAY_ISO,
      operationalEventDate: TODAY_ISO,
      periodLabel: activePeriod.label,
      description: `Spring agronomic input invoice to ${grower.name} (${creditCheck.requiresContractSecurity ? 'Contract-Secured Credit' : 'Unsecured Tier'})`,
      createdBy: 'Agronomy Sales',
      lines: journalLines,
    };
    setJournalEntries((prev) => [newEntry, ...prev]);

    notify(
      'success',
      `Input Invoice ${invoiceNumber} Posted`,
      `Billed $${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })} to ${grower.name}. AR balance updated and balanced COGS/Revenue posted.`
    );
    return { ok: true, invoiceNumber };
  };

  const postCommercialGrainDispatch = (input: PostGrainDispatchInput) => {
    if (activePeriod.isClosed) {
      const msg = `ClosedPeriodPostingException: Period ${activePeriod.label} is sealed.`;
      notify('error', 'Posting Blocked — Closed Fiscal Period', msg);
      return { ok: false, error: msg };
    }

    const buyer = commercialBuyers.find((b) => b.customerId === input.buyerId);
    const lot = siloLots.find((l) => l.lotId === input.lotId);
    if (!buyer || !lot) {
      return { ok: false, error: 'Select a valid commercial buyer and source silo lot.' };
    }

    const guard = evaluateSiloDispatchGuard(lot, input.dispatchQtyKg);
    if (!guard.allowed) {
      notify('error', 'Non-Negative Silo Stock Guard', guard.blockingReason ?? 'Insufficient silo stock.');
      return { ok: false, error: guard.blockingReason ?? 'Insufficient silo stock.' };
    }

    const revenueAmount = round2(input.dispatchQtyKg * input.sellingPricePerKg);
    const cogsAmount = round2(input.dispatchQtyKg * lot.currentMovingAvgCost);
    const nextInvId = Math.max(10505, ...salesInvoices.map((i) => i.invoiceId)) + 1;
    const invoiceNumber = `INV-${nextInvId}`;

    const journalLines = generateSalesInvoiceLines(
      accounts,
      invoiceNumber,
      buyer.name,
      revenueAmount,
      cogsAmount,
      `${input.dispatchQtyKg.toLocaleString()} kg ${lot.commodityName} (${lot.siloIdentifier})`
    );

    // Atomically decrement SiloBinLot and Product
    setSiloLots((prev) =>
      prev.map((l) =>
        l.lotId === lot.lotId
          ? { ...l, currentQtyKg: l.currentQtyKg - input.dispatchQtyKg }
          : l
      )
    );
    setProducts((prev) =>
      prev.map((p) =>
        p.productId === lot.commodityProductId
          ? { ...p, totalQtyOnHand: Math.max(0, p.totalQtyOnHand - input.dispatchQtyKg) }
          : p
      )
    );
    setCommercialBuyers((prev) =>
      prev.map((b) =>
        b.customerId === buyer.customerId
          ? { ...b, currentARBalance: round2(b.currentARBalance + revenueAmount) }
          : b
      )
    );

    const newInvoice: SalesInvoice = {
      invoiceId: nextInvId,
      documentNumber: invoiceNumber,
      customerId: buyer.customerId,
      customerName: buyer.name,
      isGrowerInputSale: false,
      invoiceDate: TODAY_ISO,
      dueDate: '2026-12-21',
      totalAmount: revenueAmount,
      paidAmount: 0,
      status: 'Open',
      summary: `Bulk Dispatch: ${input.dispatchQtyKg.toLocaleString()} kg ${lot.commodityName} from ${lot.siloIdentifier}`,
      siloBinLotId: lot.lotId,
    };
    setSalesInvoices((prev) => [newInvoice, ...prev]);

    const newEntry: JournalEntry = {
      entryId: journalEntries.length + 1,
      documentNumber: invoiceNumber,
      sourceDocType: 'CommercialGrainDispatch',
      postingDate: TODAY_ISO,
      operationalEventDate: TODAY_ISO,
      periodLabel: activePeriod.label,
      description: `Commercial bulk dispatch (${lot.siloIdentifier}): ${input.dispatchQtyKg.toLocaleString()} kg to ${buyer.name}`,
      createdBy: 'Grain Dispatcher',
      lines: journalLines,
    };
    setJournalEntries((prev) => [newEntry, ...prev]);

    notify(
      'success',
      `Bulk Dispatch ${invoiceNumber} Posted`,
      `Dispatched ${input.dispatchQtyKg.toLocaleString()} kg from ${lot.siloIdentifier} to ${buyer.name}. Remaining silo stock: ${guard.remainingQtyAfterDispatch.toLocaleString()} kg.`
    );
    return { ok: true, invoiceNumber };
  };

  const resetDemoState = () => {
    setPeriods(INITIAL_PERIODS);
    setProducts(INITIAL_PRODUCTS);
    setSiloLots(INITIAL_SILO_LOTS);
    setGrowers(INITIAL_GROWERS);
    setCommercialBuyers(INITIAL_COMMERCIAL_BUYERS);
    setContracts(INITIAL_CONTRACTS);
    setScaleTickets(INITIAL_SCALE_TICKETS);
    setSalesInvoices(INITIAL_SALES_INVOICES);
    setSettlements(INITIAL_SETTLEMENTS);
    setJournalEntries(INITIAL_JOURNAL_ENTRIES);
    notify('success', 'Prototype State Reset', 'All scale tickets, silos, grower accounts, and ledger entries restored to initial CUJ fixtures.');
  };

  return (
    <ErpContext.Provider
      value={{
        accounts,
        periods,
        activePeriod,
        products,
        siloLots,
        dryingRates,
        growers,
        commercialBuyers,
        contracts,
        scaleTickets,
        salesInvoices,
        settlements,
        journalEntries,
        activeSection,
        setActiveSection,
        preselectedSettlementGrowerId,
        preselectedSettlementTicketId,
        jumpToLiquidateTicket,
        clearPreselectedSettlement,
        notification,
        dismissNotification,
        toggleActivePeriodLock,
        updateBenchmarkPrice,
        recordStage1GrossWeight,
        commitStage2ScaleTicket,
        postGrowerSettlement,
        executeSiloCleanOut,
        postAgronomicInputSale,
        postCommercialGrainDispatch,
        resetDemoState,
      }}
    >
      {children}
    </ErpContext.Provider>
  );
}

export function useErp() {
  const ctx = useContext(ErpContext);
  if (!ctx) throw new Error('useErp must be used inside ErpProvider');
  return ctx;
}
