import React, { useEffect, useMemo, useState } from 'react';
import { Check, FileSpreadsheet } from 'lucide-react';
import { useErp } from '../../state/ErpStore';
import { ScaleTicketStatus } from '../../domain/types';
import {
  calculateDryingDeduction,
  lookupDryingRate,
  round2,
} from '../../domain/grainGradingEngine';
import { generateGrowerSettlementLines } from '../../domain/ledgerPostingEngine';
import { formatCurrency, formatKg } from '../../domain/formatters';
import { DoubleEntryDistributionGrid } from '../shared/DoubleEntryDistributionGrid';

export function GrowerSettlementView() {
  const {
    accounts,
    growers,
    products,
    dryingRates,
    scaleTickets,
    salesInvoices,
    settlements,
    contracts,
    preselectedSettlementGrowerId,
    preselectedSettlementTicketId,
    clearPreselectedSettlement,
    postGrowerSettlement,
  } = useErp();

  const [selectedGrowerId, setSelectedGrowerId] = useState<number>(
    preselectedSettlementGrowerId ?? growers[0]?.vendorId ?? 101
  );
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([]);
  const [contractUnitPriceInput, setContractUnitPriceInput] = useState<string>('0.2100');
  const [storageFeeInput, setStorageFeeInput] = useState<string>('0.00');
  const [invoiceAllocations, setInvoiceAllocations] = useState<Record<number, number>>({});
  const [issueCashVoucher, setIssueCashVoucher] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedGrower = useMemo(
    () => growers.find((g) => g.vendorId === selectedGrowerId) ?? growers[0],
    [growers, selectedGrowerId]
  );

  const unsettledTickets = useMemo(
    () =>
      scaleTickets.filter(
        (t) =>
          t.growerId === selectedGrower.vendorId &&
          t.status === ScaleTicketStatus.PendingSettlement
      ),
    [scaleTickets, selectedGrower]
  );

  const openGrowerInvoices = useMemo(
    () =>
      salesInvoices.filter(
        (inv) => inv.customerId === selectedGrower.customerId && inv.status !== 'Paid'
      ),
    [salesInvoices, selectedGrower]
  );

  // Sync defaults when grower changes or when jumping from Unpriced Exposure
  useEffect(() => {
    if (preselectedSettlementGrowerId) {
      setSelectedGrowerId(preselectedSettlementGrowerId);
    }
  }, [preselectedSettlementGrowerId]);

  useEffect(() => {
    const ticketsForGrower = scaleTickets.filter(
      (t) =>
        t.growerId === selectedGrowerId &&
        t.status === ScaleTicketStatus.PendingSettlement
    );

    if (
      preselectedSettlementTicketId &&
      ticketsForGrower.some((t) => t.ticketId === preselectedSettlementTicketId)
    ) {
      const targetTicket = ticketsForGrower.find(
        (t) => t.ticketId === preselectedSettlementTicketId
      )!;
      setSelectedTicketIds([targetTicket.ticketId]);
      const prod = products.find((p) => p.productId === targetTicket.commodityProductId);
      setContractUnitPriceInput(
        (prod?.currentCashBenchmarkPrice ?? targetTicket.provisionalUnitPrice).toFixed(4)
      );
      clearPreselectedSettlement();
    } else {
      setSelectedTicketIds(ticketsForGrower.map((t) => t.ticketId));
      const first = ticketsForGrower[0];
      if (first) {
        const linkedContract = contracts.find(
          (c) => c.contractId === first.associatedContractId
        );
        const prod = products.find((p) => p.productId === first.commodityProductId);
        const suggestedPrice =
          linkedContract?.basePricePerKg ??
          prod?.currentCashBenchmarkPrice ??
          first.provisionalUnitPrice;
        setContractUnitPriceInput(suggestedPrice.toFixed(4));
      }
    }

    // Pre-allocate open spring AR invoices automatically for convenience (user can adjust/uncheck)
    const grower = growers.find((g) => g.vendorId === selectedGrowerId);
    const invs = salesInvoices.filter(
      (i) => i.customerId === grower?.customerId && i.status !== 'Paid'
    );
    const nextAlloc: Record<number, number> = {};
    invs.forEach((inv) => {
      nextAlloc[inv.invoiceId] = round2(inv.totalAmount - inv.paidAmount);
    });
    setInvoiceAllocations(nextAlloc);
    setStorageFeeInput('0.00');
    setFormError(null);
  }, [selectedGrowerId, scaleTickets.length]);

  const activeSelectedTickets = useMemo(
    () => unsettledTickets.filter((t) => selectedTicketIds.includes(t.ticketId)),
    [unsettledTickets, selectedTicketIds]
  );

  const toggleTicketSelection = (ticketId: number) => {
    setSelectedTicketIds((prev) =>
      prev.includes(ticketId) ? prev.filter((id) => id !== ticketId) : [...prev, ticketId]
    );
  };

  // Calculations
  const totalNetCleanKg = useMemo(
    () => activeSelectedTickets.reduce((s, t) => s + (t.netCleanKg ?? 0), 0),
    [activeSelectedTickets]
  );

  const provisionalIntakeTotal = useMemo(
    () => round2(activeSelectedTickets.reduce((s, t) => s + t.provisionalTotalAmount, 0)),
    [activeSelectedTickets]
  );

  const contractUnitPrice = Number(contractUnitPriceInput) || 0;
  const grossCommodityValue = round2(totalNetCleanKg * contractUnitPrice);
  const priceVariance = round2(grossCommodityValue - provisionalIntakeTotal);

  const dryingChargesTotal = useMemo(() => {
    return round2(
      activeSelectedTickets.reduce((sum, t) => {
        const rate = lookupDryingRate(dryingRates, t.commodityProductId, t.moisturePct);
        return sum + calculateDryingDeduction(t.netCleanKg ?? 0, rate);
      }, 0)
    );
  }, [activeSelectedTickets, dryingRates]);

  const storageFeesTotal = round2(Math.max(0, Number(storageFeeInput) || 0));
  const netPayableAmount = round2(
    Math.max(0, grossCommodityValue - dryingChargesTotal - storageFeesTotal)
  );

  const contraClearedTotal = useMemo(() => {
    const raw = openGrowerInvoices.reduce(
      (sum, inv) => sum + Math.max(0, invoiceAllocations[inv.invoiceId] ?? 0),
      0
    );
    return round2(Math.min(raw, netPayableAmount));
  }, [openGrowerInvoices, invoiceAllocations, netPayableAmount]);

  const residualCashBalance = round2(Math.max(0, netPayableAmount - contraClearedTotal));
  const cashDisbursedAmount = issueCashVoucher ? residualCashBalance : 0;

  const previewJournalLines = useMemo(() => {
    if (activeSelectedTickets.length === 0 || grossCommodityValue <= 0) return [];
    return generateGrowerSettlementLines(accounts, {
      settlementNumber: `GSS-2026-${String(settlements.length + 101).padStart(3, '0')}`,
      growerName: selectedGrower.name,
      provisionalIntakeValuation: provisionalIntakeTotal,
      grossCommodityValue,
      dryingChargesTotal,
      storageFeesTotal,
      contraClearedAmount: contraClearedTotal,
      cashDisbursedAmount,
    });
  }, [
    accounts,
    activeSelectedTickets.length,
    settlements.length,
    selectedGrower.name,
    provisionalIntakeTotal,
    grossCommodityValue,
    dryingChargesTotal,
    storageFeesTotal,
    contraClearedTotal,
    cashDisbursedAmount,
  ]);

  const handleAllocationToggle = (invoiceId: number, remainingAmount: number, checked: boolean) => {
    setInvoiceAllocations((prev) => ({
      ...prev,
      [invoiceId]: checked ? round2(remainingAmount) : 0,
    }));
  };

  const handleAllocationAmountChange = (invoiceId: number, maxAmount: number, value: string) => {
    const num = Math.max(0, Math.min(maxAmount, Number(value) || 0));
    setInvoiceAllocations((prev) => ({
      ...prev,
      [invoiceId]: round2(num),
    }));
  };

  const handlePostSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const sanitizedAllocations: Record<number, number> = {};
    let remainingPool = netPayableAmount;
    for (const inv of openGrowerInvoices) {
      const requested = Math.max(0, invoiceAllocations[inv.invoiceId] ?? 0);
      const allowed = round2(Math.min(requested, inv.totalAmount - inv.paidAmount, remainingPool));
      if (allowed > 0) {
        sanitizedAllocations[inv.invoiceId] = allowed;
        remainingPool = round2(remainingPool - allowed);
      }
    }

    const res = postGrowerSettlement({
      growerId: selectedGrower.vendorId,
      ticketIds: selectedTicketIds,
      contractUnitPrice,
      dryingChargesTotal,
      storageFeesTotal,
      invoiceAllocations: sanitizedAllocations,
      issueCashVoucher,
    });

    if (!res.ok) {
      setFormError(res.error ?? 'Failed to post grower settlement.');
      return;
    }

    setSelectedTicketIds([]);
  };

  return (
    <div className="space-y-6">
      {/* Grower Selector & Counterparty Summary */}
      <section className="bg-white border border-[#DDE2DF] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label htmlFor="settlement-grower" className="block text-xs font-medium text-[#5C6962] mb-1">
              Select Producer / Grower Counterparty
            </label>
            <select
              id="settlement-grower"
              value={selectedGrowerId}
              onChange={(e) => setSelectedGrowerId(Number(e.target.value))}
              className="px-3 py-2 text-sm font-medium bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B] min-w-[280px]"
            >
              {growers.map((g) => {
                const pendingCount = scaleTickets.filter(
                  (t) => t.growerId === g.vendorId && t.status === ScaleTicketStatus.PendingSettlement
                ).length;
                return (
                  <option key={g.vendorId} value={g.vendorId}>
                    {g.name} ({g.farmName}) — {pendingCount} unsettled
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div>
            <div className="text-xs text-[#5C6962]">Open Spring Input AR (1200)</div>
            <div className="font-mono font-semibold text-[#B45309] tabular-nums">
              {formatCurrency(selectedGrower.currentARBalance)}
            </div>
          </div>
          <div className="h-8 w-px bg-[#EAEEEC]" aria-hidden="true" />
          <div>
            <div className="text-xs text-[#5C6962]">Grower AP Balance (2010)</div>
            <div className="font-mono font-semibold text-[#17201B] tabular-nums">
              {formatCurrency(selectedGrower.currentAPBalance)}
            </div>
          </div>
          <div className="h-8 w-px bg-[#EAEEEC]" aria-hidden="true" />
          <div>
            <div className="text-xs text-[#5C6962]">Crop Lien Status</div>
            <div className="text-xs font-medium text-[#17201B] mt-0.5">
              {selectedGrower.hasCropLienFiling
                ? `Active · ${selectedGrower.lienFilingReference}`
                : 'No filing on record'}
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={handlePostSettlement} className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Ticket Selection + Bilateral Contra-Clearing */}
        <div className="xl:col-span-7 space-y-6">
          {/* Unsettled Scale Tickets */}
          <section aria-label="Unsettled Scale Tickets" className="bg-white border border-[#DDE2DF] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EAEEEC] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#17201B]">
                  1. Unsettled Scale Tickets (GL 2110 Liquidation)
                </h2>
                <p className="text-xs text-[#5C6962]">
                  Select deliveries to liquidate and apply agreed contract pricing.
                </p>
              </div>
              <span className="text-xs font-mono text-[#5C6962] tabular-nums">
                {activeSelectedTickets.length} of {unsettledTickets.length} selected
              </span>
            </div>

            {unsettledTickets.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#5C6962]">
                All weighed scale tickets for {selectedGrower.name} have been settled.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#EAEEEC] bg-[#FAFBFB] text-xs font-medium text-[#5C6962]">
                      <th className="py-2.5 px-4 w-10">
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="py-2.5 px-3">Ticket &amp; Date</th>
                      <th className="py-2.5 px-3">Commodity</th>
                      <th className="py-2.5 px-3 text-right">Moisture</th>
                      <th className="py-2.5 px-3 text-right">Net Clean Kg</th>
                      <th className="py-2.5 px-3 text-right">Provisional (2110)</th>
                      <th className="py-2.5 px-4 text-right">Drying Fee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F3F1] text-sm">
                    {unsettledTickets.map((ticket) => {
                      const prod = products.find((p) => p.productId === ticket.commodityProductId);
                      const rate = lookupDryingRate(
                        dryingRates,
                        ticket.commodityProductId,
                        ticket.moisturePct
                      );
                      const dryingFee = calculateDryingDeduction(ticket.netCleanKg ?? 0, rate);
                      const isChecked = selectedTicketIds.includes(ticket.ticketId);

                      return (
                        <tr key={ticket.ticketId} className={isChecked ? 'bg-[#F5F9F7]' : 'hover:bg-[#FAFBFB]'}>
                          <td className="py-2.5 px-4">
                            <input
                              type="checkbox"
                              aria-label={`Select scale ticket ${ticket.ticketNumber}`}
                              checked={isChecked}
                              onChange={() => toggleTicketSelection(ticket.ticketId)}
                              className="w-4 h-4 accent-[#143A2B] cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-mono text-xs font-medium text-[#17201B]">
                              {ticket.ticketNumber}
                            </div>
                            <div className="text-xs text-[#64716A]">
                              {ticket.receiptDate} · {ticket.pricingType}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-[#17201B]">
                            {prod?.name}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-[#37433D] whitespace-nowrap">
                            {ticket.moisturePct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs font-medium tabular-nums text-[#17201B] whitespace-nowrap">
                            {formatKg(ticket.netCleanKg)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-[#37433D] whitespace-nowrap">
                            {formatCurrency(ticket.provisionalTotalAmount)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-[#143A2B] whitespace-nowrap">
                            {formatCurrency(dryingFee)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pricing & Service Fee Controls */}
            {unsettledTickets.length > 0 && (
              <div className="p-4 border-t border-[#EAEEEC] bg-[#FAFBFB] grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="contract-unit-price" className="block text-xs font-medium text-[#37433D] mb-1">
                    Agreed Settlement Price ($/kg)
                  </label>
                  <input
                    id="contract-unit-price"
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={contractUnitPriceInput}
                    onChange={(e) => setContractUnitPriceInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  />
                </div>
                <div>
                  <label htmlFor="storage-fees" className="block text-xs font-medium text-[#37433D] mb-1">
                    DP / Carrying Storage Fee ($)
                  </label>
                  <input
                    id="storage-fees"
                    type="number"
                    step="0.01"
                    min="0"
                    value={storageFeeInput}
                    onChange={(e) => setStorageFeeInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  />
                </div>
                <div>
                  <div className="text-xs font-medium text-[#37433D] mb-1">
                    Computed Drying Charge (4200)
                  </div>
                  <div className="px-3 py-2 text-sm font-mono font-semibold tabular-nums bg-[#EEF4F1] border border-[#D2DFD8] rounded-md text-[#143A2B]">
                    {formatCurrency(dryingChargesTotal)}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Bilateral Seasonal AR/AP Contra-Clearing */}
          <section aria-label="Bilateral AR AP Contra Clearing" className="bg-white border border-[#DDE2DF] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EAEEEC] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#17201B]">
                  2. Bilateral Seasonal AR/AP Contra-Clearing
                </h2>
                <p className="text-xs text-[#5C6962]">
                  Offset unpaid spring agronomic input invoices (1200 AR) directly against harvest proceeds (2010 AP).
                </p>
              </div>
              <span className="text-xs font-mono font-medium text-[#143A2B] tabular-nums">
                Offset: {formatCurrency(contraClearedTotal)}
              </span>
            </div>

            {openGrowerInvoices.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#5C6962]">
                No open spring agronomic input invoices for {selectedGrower.name}. Full net proceeds payable in cash.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#EAEEEC] bg-[#FAFBFB] text-xs font-medium text-[#5C6962]">
                      <th className="py-2.5 px-4 w-10">
                        <span className="sr-only">Apply Contra</span>
                      </th>
                      <th className="py-2.5 px-3">Spring Invoice</th>
                      <th className="py-2.5 px-3">Items Billed</th>
                      <th className="py-2.5 px-3 text-right">Open Balance</th>
                      <th className="py-2.5 px-4 text-right w-36">Contra Allocation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F3F1] text-sm">
                    {openGrowerInvoices.map((inv) => {
                      const remaining = round2(inv.totalAmount - inv.paidAmount);
                      const allocated = invoiceAllocations[inv.invoiceId] ?? 0;
                      const isAllocated = allocated > 0;

                      return (
                        <tr key={inv.invoiceId} className={isAllocated ? 'bg-[#FBF9F2]' : 'hover:bg-[#FAFBFB]'}>
                          <td className="py-2.5 px-4">
                            <input
                              type="checkbox"
                              aria-label={`Apply contra offset for ${inv.documentNumber}`}
                              checked={isAllocated}
                              onChange={(e) =>
                                handleAllocationToggle(inv.invoiceId, remaining, e.target.checked)
                              }
                              className="w-4 h-4 accent-[#143A2B] cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-mono text-xs font-semibold text-[#17201B]">
                              {inv.documentNumber}
                            </div>
                            <div className="text-xs text-[#64716A]">Issued {inv.invoiceDate}</div>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-[#37433D]">{inv.summary}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-[#17201B]">
                            {formatCurrency(remaining)}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <input
                              type="number"
                              aria-label={`Contra allocation amount for ${inv.documentNumber}`}
                              step="0.01"
                              min="0"
                              max={remaining}
                              value={allocated}
                              onChange={(e) =>
                                handleAllocationAmountChange(inv.invoiceId, remaining, e.target.value)
                              }
                              className="w-28 px-2 py-1 text-right font-mono text-xs tabular-nums bg-white border border-[#D2D8D5] rounded focus:outline-none focus:border-[#143A2B]"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right 5 Cols: Settlement Summary + Rule 12 Double Entry Preview */}
        <div className="xl:col-span-5 space-y-6">
          <section aria-label="Settlement Waterfall" className="bg-white border border-[#DDE2DF] rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-semibold text-[#17201B]">
              Settlement Waterfall &amp; Payment Voucher
            </h2>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#5C6962]">Total Liquidated Weight</dt>
                <dd className="font-mono font-medium tabular-nums text-[#17201B]">
                  {formatKg(totalNetCleanKg)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#5C6962]">Provisional Intake Accrual (2110)</dt>
                <dd className="font-mono tabular-nums text-[#37433D]">
                  {formatCurrency(provisionalIntakeTotal)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#5C6962]">Price Variance (5110)</dt>
                <dd
                  className={`font-mono font-medium tabular-nums ${
                    priceVariance > 0
                      ? 'text-[#B45309]'
                      : priceVariance < 0
                        ? 'text-[#166534]'
                        : 'text-[#37433D]'
                  }`}
                >
                  {priceVariance >= 0 ? '+' : ''}
                  {formatCurrency(priceVariance)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-[#EAEEEC] pt-2">
                <dt className="font-medium text-[#17201B]">Gross Commodity Value</dt>
                <dd className="font-mono font-semibold tabular-nums text-[#17201B]">
                  {formatCurrency(grossCommodityValue)}
                </dd>
              </div>
              <div className="flex justify-between text-[#5C6962]">
                <dt>Less: Drying &amp; Storage Fees (4200)</dt>
                <dd className="font-mono tabular-nums">
                  -{formatCurrency(dryingChargesTotal + storageFeesTotal)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-[#EAEEEC] pt-2">
                <dt className="font-medium text-[#17201B]">Net Grower Liability (2010 AP)</dt>
                <dd className="font-mono font-semibold tabular-nums text-[#17201B]">
                  {formatCurrency(netPayableAmount)}
                </dd>
              </div>
              <div className="flex justify-between text-[#B45309]">
                <dt>Less: Bilateral AR Contra Offset (1200)</dt>
                <dd className="font-mono font-medium tabular-nums">
                  -{formatCurrency(contraClearedTotal)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-[#DDE2DF] pt-2.5 text-base">
                <dt className="font-semibold text-[#143A2B]">Residual Cash Disbursement</dt>
                <dd className="font-mono font-bold tabular-nums text-[#143A2B]">
                  {formatCurrency(cashDisbursedAmount)}
                </dd>
              </div>
            </dl>

            <label className="flex items-start gap-2.5 pt-2 border-t border-[#EAEEEC] cursor-pointer">
              <input
                type="checkbox"
                checked={issueCashVoucher}
                onChange={(e) => setIssueCashVoucher(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#143A2B]"
              />
              <span className="text-xs text-[#37433D]">
                Issue immediate bank Payment Voucher (Debit 2010 / Credit 1020 Operating Bank) for the residual balance of{' '}
                <strong className="font-mono">{formatCurrency(residualCashBalance)}</strong>.
              </span>
            </label>

            {formError && (
              <p role="alert" className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={activeSelectedTickets.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#143A2B] hover:bg-[#1B4D39] disabled:opacity-45 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              Post Settlement Sheet &amp; Issue Voucher
            </button>
          </section>

          <DoubleEntryDistributionGrid
            title="Rule 12 · Settlement & Contra Journal Preview"
            lines={previewJournalLines}
            emptyMessage="Select at least one unsettled scale ticket to preview the compound settlement journal."
          />
        </div>
      </form>

      {/* Posted Settlements History */}
      <section aria-label="Posted Grower Settlements" className="bg-white border border-[#DDE2DF] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EAEEEC] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#17201B]">Posted Grower Settlement Sheets</h2>
          <span className="text-xs font-mono text-[#5C6962] tabular-nums">{settlements.length} posted</span>
        </div>

        {settlements.length === 0 ? (
          <div className="p-6 text-center text-sm text-[#5C6962] flex flex-col items-center gap-1.5">
            <FileSpreadsheet className="w-5 h-5 text-[#9AA59F]" aria-hidden="true" />
            <span>No grower settlements posted yet in this session. Select John Doe above and post CUJ 2 to see the settled sheet here.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EAEEEC] bg-[#FAFBFB] text-xs font-medium text-[#5C6962]">
                  <th className="py-2.5 px-4">Settlement #</th>
                  <th className="py-2.5 px-4">Grower &amp; Tickets</th>
                  <th className="py-2.5 px-4 text-right">Clean Kg</th>
                  <th className="py-2.5 px-4 text-right">Gross Value</th>
                  <th className="py-2.5 px-4 text-right">Drying / Fees</th>
                  <th className="py-2.5 px-4 text-right">Contra Cleared</th>
                  <th className="py-2.5 px-4 text-right">Cash Disbursed</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F3F1] text-sm">
                {settlements.map((s) => {
                  const g = growers.find((gr) => gr.vendorId === s.growerId);
                  return (
                    <tr key={s.settlementId} className="hover:bg-[#FAFBFB]">
                      <td className="py-2.5 px-4 font-mono text-xs font-semibold text-[#17201B]">
                        {s.settlementNumber}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-[#17201B]">{g?.name}</div>
                        <div className="text-xs font-mono text-[#64716A]">
                          {s.ticketNumbers.join(', ')}
                          {s.allocatedInvoiceNumbers.length > 0 &&
                            ` · Contra: ${s.allocatedInvoiceNumbers.join(', ')}`}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                        {formatKg(s.totalNetCleanKg)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                        {formatCurrency(s.grossCommodityValue)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                        {formatCurrency(s.dryingChargesTotal + s.storageFeesTotal)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs font-medium text-[#B45309] tabular-nums">
                        {formatCurrency(s.contraClearedAmount)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold text-[#143A2B] tabular-nums">
                        {formatCurrency(s.cashDisbursedAmount)}
                      </td>
                      <td className="py-2.5 px-4 text-xs font-medium text-[#166534]">
                        {s.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
