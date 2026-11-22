import React, { useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, Check } from 'lucide-react';
import { useErp } from '../../state/ErpStore';
import { GrainContractStatus } from '../../domain/types';
import {
  evaluateAgronomicCreditGuard,
  evaluateSiloDispatchGuard,
} from '../../domain/creditGuardEngine';
import { generateSalesInvoiceLines } from '../../domain/ledgerPostingEngine';
import { round2 } from '../../domain/grainGradingEngine';
import { formatCurrency, formatKg } from '../../domain/formatters';
import { DoubleEntryDistributionGrid } from '../shared/DoubleEntryDistributionGrid';

export function AgronomicSalesDispatchView() {
  const {
    accounts,
    growers,
    commercialBuyers,
    products,
    siloLots,
    contracts,
    salesInvoices,
    postAgronomicInputSale,
    postCommercialGrainDispatch,
  } = useErp();

  const [mode, setMode] = useState<'inputs' | 'dispatch'>('inputs');

  // --- CUJ 3: Spring Agronomic Input Sale State ---
  // Default to Jane Smith (vendorId 102) ordering $28,000 of MAP Fertilizer & Corn Seed
  const [selectedGrowerId, setSelectedGrowerId] = useState<number>(102);
  const inputProducts = useMemo(
    () => products.filter((p) => !p.isGrainCommodity),
    [products]
  );

  const [fertTotes, setFertTotes] = useState<string>('20'); // 20 totes x 1000kg x $0.85 = $17,000
  const [seedSacks, setSeedSacks] = useState<string>('30'); // 30 sacks x 25kg x $14.00 = $10,500
  const [herbJugs, setHerbJugs] = useState<string>('1'); // 1 jug x 20kg x $25 = $500 -> Total ~$28,000
  const [inputError, setInputError] = useState<string | null>(null);

  const selectedGrower = useMemo(
    () => growers.find((g) => g.vendorId === selectedGrowerId) ?? growers[0],
    [growers, selectedGrowerId]
  );

  const fertProd = inputProducts.find((p) => p.productId === 4)!;
  const seedProd = inputProducts.find((p) => p.productId === 5)!;
  const herbProd = inputProducts.find((p) => p.productId === 6)!;

  const inputOrderLines = useMemo(() => {
    const lines: { productId: number; name: string; packQty: number; multiplier: number; totalKg: number; unitPricePerKg: number; unitCostPerKg: number; lineRevenue: number; lineCogs: number }[] = [];
    const items = [
      { prod: fertProd, qty: Math.max(0, Math.floor(Number(fertTotes) || 0)), price: fertProd.currentCashBenchmarkPrice },
      { prod: seedProd, qty: Math.max(0, Math.floor(Number(seedSacks) || 0)), price: seedProd.currentCashBenchmarkPrice },
      { prod: herbProd, qty: Math.max(0, Math.floor(Number(herbJugs) || 0)), price: 25.0 },
    ];
    for (const item of items) {
      if (item.qty > 0) {
        const totalKg = item.qty * item.prod.packMultiplier;
        lines.push({
          productId: item.prod.productId,
          name: item.prod.name,
          packQty: item.qty,
          multiplier: item.prod.packMultiplier,
          totalKg,
          unitPricePerKg: item.price,
          unitCostPerKg: item.prod.currentUnitCost,
          lineRevenue: round2(totalKg * item.price),
          lineCogs: round2(totalKg * item.prod.currentUnitCost),
        });
      }
    }
    return lines;
  }, [fertProd, seedProd, herbProd, fertTotes, seedSacks, herbJugs]);

  const inputOrderTotal = useMemo(
    () => round2(inputOrderLines.reduce((s, l) => s + l.lineRevenue, 0)),
    [inputOrderLines]
  );
  const inputOrderCogs = useMemo(
    () => round2(inputOrderLines.reduce((s, l) => s + l.lineCogs, 0)),
    [inputOrderLines]
  );

  const creditGuard = useMemo(
    () => evaluateAgronomicCreditGuard(selectedGrower, contracts, inputOrderTotal),
    [selectedGrower, contracts, inputOrderTotal]
  );

  const growerActiveContracts = useMemo(
    () =>
      contracts.filter(
        (c) => c.growerId === selectedGrower.vendorId && c.status === GrainContractStatus.Active
      ),
    [contracts, selectedGrower]
  );

  const inputPreviewJournal = useMemo(() => {
    if (inputOrderTotal <= 0) return [];
    return generateSalesInvoiceLines(
      accounts,
      `INV-${Math.max(10505, ...salesInvoices.map((i) => i.invoiceId)) + 1}`,
      `${selectedGrower.name} (${selectedGrower.farmName})`,
      inputOrderTotal,
      inputOrderCogs,
      `${inputOrderLines.length} packaged agronomic input line(s)`
    );
  }, [accounts, salesInvoices, selectedGrower, inputOrderTotal, inputOrderCogs, inputOrderLines.length]);

  const handlePostInputSale = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError(null);
    const res = postAgronomicInputSale({
      growerId: selectedGrower.vendorId,
      lines: inputOrderLines.map((l) => ({
        productId: l.productId,
        packQty: l.packQty,
        unitPricePerKg: l.unitPricePerKg,
      })),
    });
    if (!res.ok) {
      setInputError(res.error ?? 'Unable to post agronomic input invoice.');
    }
  };

  // --- CUJ 4: Outbound Commercial Bulk Grain Dispatch State ---
  const [selectedBuyerId, setSelectedBuyerId] = useState<number>(commercialBuyers[0]?.customerId ?? 301);
  const [selectedSiloId, setSelectedSiloId] = useState<number>(4); // Silo 04: 100,000 kg Corn @ $0.20/kg
  const [dispatchKgInput, setDispatchKgInput] = useState<string>('50000');
  const [dispatchPriceInput, setDispatchPriceInput] = useState<string>('0.2400');
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const selectedBuyer = useMemo(
    () => commercialBuyers.find((b) => b.customerId === selectedBuyerId) ?? commercialBuyers[0],
    [commercialBuyers, selectedBuyerId]
  );
  const selectedSilo = useMemo(
    () => siloLots.find((s) => s.lotId === selectedSiloId) ?? siloLots[0],
    [siloLots, selectedSiloId]
  );

  const dispatchQty = Number(dispatchKgInput);
  const dispatchPrice = Number(dispatchPriceInput) || 0;
  const dispatchGuard = useMemo(
    () => evaluateSiloDispatchGuard(selectedSilo, dispatchQty),
    [selectedSilo, dispatchQty]
  );
  const dispatchRevenue = useMemo(
    () => (dispatchQty > 0 ? round2(dispatchQty * dispatchPrice) : 0),
    [dispatchQty, dispatchPrice]
  );
  const dispatchCogs = useMemo(
    () => (dispatchQty > 0 ? round2(dispatchQty * selectedSilo.currentMovingAvgCost) : 0),
    [dispatchQty, selectedSilo.currentMovingAvgCost]
  );

  const dispatchPreviewJournal = useMemo(() => {
    if (!dispatchGuard.allowed || dispatchRevenue <= 0) return [];
    return generateSalesInvoiceLines(
      accounts,
      `INV-${Math.max(10505, ...salesInvoices.map((i) => i.invoiceId)) + 1}`,
      selectedBuyer.name,
      dispatchRevenue,
      dispatchCogs,
      `${dispatchQty.toLocaleString()} kg ${selectedSilo.commodityName} (${selectedSilo.siloIdentifier})`
    );
  }, [
    accounts,
    dispatchGuard.allowed,
    dispatchRevenue,
    dispatchCogs,
    salesInvoices,
    selectedBuyer.name,
    dispatchQty,
    selectedSilo,
  ]);

  const handlePostDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    setDispatchError(null);
    const res = postCommercialGrainDispatch({
      buyerId: selectedBuyer.customerId,
      lotId: selectedSilo.lotId,
      dispatchQtyKg: dispatchQty,
      sellingPricePerKg: dispatchPrice,
    });
    if (!res.ok) {
      setDispatchError(res.error ?? 'Failed to post bulk grain dispatch.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="tablist" aria-label="Sales Workflow Mode" className="inline-flex items-center gap-1 p-1 bg-[#EAEFED] rounded-lg">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'inputs'}
            onClick={() => setMode('inputs')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'inputs'
                ? 'bg-white text-[#143A2B] shadow-xs'
                : 'text-[#5C6962] hover:text-[#17201B]'
            }`}
          >
            Spring Agronomic Input Sale (CUJ 3 Credit Guard)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'dispatch'}
            onClick={() => setMode('dispatch')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'dispatch'
                ? 'bg-white text-[#143A2B] shadow-xs'
                : 'text-[#5C6962] hover:text-[#17201B]'
            }`}
          >
            Outbound Bulk Grain Dispatch (CUJ 4 Silo Depletion)
          </button>
        </div>
      </div>

      {mode === 'inputs' ? (
        <form onSubmit={handlePostInputSale} className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left 7 Cols: Grower Selection & Packaged Inputs */}
          <div className="xl:col-span-7 space-y-6">
            <section className="bg-white border border-[#DDE2DF] rounded-lg p-4 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#17201B]">
                  Agronomic Input Order (Seed, Fertilizer &amp; Crop Protection)
                </h2>
                <p className="text-xs text-[#5C6962]">
                  Packaged quantities convert via integer kg multipliers while enforcing dual-tier contract-backed credit protection.
                </p>
              </div>

              <div>
                <label htmlFor="input-grower" className="block text-xs font-medium text-[#37433D] mb-1">
                  Grower Customer Account
                </label>
                <select
                  id="input-grower"
                  value={selectedGrowerId}
                  onChange={(e) => {
                    setSelectedGrowerId(Number(e.target.value));
                    setInputError(null);
                  }}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                >
                  {growers.map((g) => (
                    <option key={g.vendorId} value={g.vendorId}>
                      {g.name} ({g.farmName}) — AR {formatCurrency(g.currentARBalance)} ·{' '}
                      {g.hasCropLienFiling ? `Crop Lien ${g.lienFilingReference}` : 'No Crop Lien'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Packaged Line Items Table */}
              <div className="border border-[#EAEEEC] rounded-md overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#EAEEEC] bg-[#FAFBFB] text-xs font-medium text-[#5C6962]">
                      <th className="py-2.5 px-3">Agronomic Product</th>
                      <th className="py-2.5 px-3 text-right">Stock (kg)</th>
                      <th className="py-2.5 px-3 text-right w-28">Packs</th>
                      <th className="py-2.5 px-3 text-right">Total Kg</th>
                      <th className="py-2.5 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F3F1] text-sm">
                    <tr>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#17201B]">{fertProd.name}</div>
                        <div className="text-xs text-[#64716A] font-mono">
                          Multiplier: {fertProd.packMultiplier} kg/tote · {formatCurrency(fertProd.currentCashBenchmarkPrice)}/kg
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {formatKg(fertProd.totalQtyOnHand)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          aria-label="Fertilizer tote count"
                          min="0"
                          step="1"
                          value={fertTotes}
                          onChange={(e) => setFertTotes(e.target.value)}
                          className="w-20 px-2 py-1 text-right font-mono text-xs tabular-nums border border-[#D2D8D5] rounded"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {formatKg((Number(fertTotes) || 0) * fertProd.packMultiplier)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-medium tabular-nums whitespace-nowrap">
                        {formatCurrency((Number(fertTotes) || 0) * fertProd.packMultiplier * fertProd.currentCashBenchmarkPrice)}
                      </td>
                    </tr>

                    <tr>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#17201B]">{seedProd.name}</div>
                        <div className="text-xs text-[#64716A] font-mono">
                          Multiplier: {seedProd.packMultiplier} kg/sack · {formatCurrency(seedProd.currentCashBenchmarkPrice)}/kg
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {formatKg(seedProd.totalQtyOnHand)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          aria-label="Corn seed sack count"
                          min="0"
                          step="1"
                          value={seedSacks}
                          onChange={(e) => setSeedSacks(e.target.value)}
                          className="w-20 px-2 py-1 text-right font-mono text-xs tabular-nums border border-[#D2D8D5] rounded"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {formatKg((Number(seedSacks) || 0) * seedProd.packMultiplier)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-medium tabular-nums whitespace-nowrap">
                        {formatCurrency((Number(seedSacks) || 0) * seedProd.packMultiplier * seedProd.currentCashBenchmarkPrice)}
                      </td>
                    </tr>

                    <tr>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#17201B]">{herbProd.name}</div>
                        <div className="text-xs text-[#64716A] font-mono">
                          Multiplier: {herbProd.packMultiplier} kg/jug · $25.00/kg
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {formatKg(herbProd.totalQtyOnHand)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          aria-label="Herbicide jug count"
                          min="0"
                          step="1"
                          value={herbJugs}
                          onChange={(e) => setHerbJugs(e.target.value)}
                          className="w-20 px-2 py-1 text-right font-mono text-xs tabular-nums border border-[#D2D8D5] rounded"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {formatKg((Number(herbJugs) || 0) * herbProd.packMultiplier)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-medium tabular-nums whitespace-nowrap">
                        {formatCurrency((Number(herbJugs) || 0) * herbProd.packMultiplier * 25.0)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#DDE2DF] bg-[#FAFBFB] text-sm font-semibold text-[#17201B]">
                      <td className="py-2.5 px-3" colSpan={4}>
                        Pending Agronomic Invoice Total
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatCurrency(inputOrderTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Grower Active Forward Contracts Backing Credit */}
              <div className="pt-2">
                <h3 className="text-xs font-semibold text-[#37433D] mb-2">
                  Active Forward Grain Contracts Backing Credit Equity
                </h3>
                {growerActiveContracts.length === 0 ? (
                  <p className="text-xs text-[#64716A]">No active forward grain contracts on file.</p>
                ) : (
                  <div className="space-y-1.5">
                    {growerActiveContracts.map((c) => {
                      const remKg = Math.max(0, c.contractedQtyKg - c.deliveredQtyKg);
                      const equity = remKg * c.basePricePerKg;
                      return (
                        <div
                          key={c.contractId}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#FAFBFB] border border-[#EAEEEC] rounded-md text-xs"
                        >
                          <div className="font-mono text-[#17201B]">
                            {c.contractNumber} · {c.contractType} · {remKg.toLocaleString()} kg undelivered @ {formatCurrency(c.basePricePerKg, 4)}/kg
                          </div>
                          <div className="font-mono font-semibold text-[#143A2B] tabular-nums">
                            Equity: {formatCurrency(equity)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <DoubleEntryDistributionGrid
              title="Agronomic Input Sale Journal Preview (Revenue & COGS)"
              lines={inputPreviewJournal}
            />
          </div>

          {/* Right 5 Cols: Live Dual-Tier Credit Guard Verification */}
          <div className="xl:col-span-5 space-y-6">
            <section
              aria-label="Dual-Tier Contract-Linked Credit Guard"
              className="bg-white border border-[#DDE2DF] rounded-lg p-4 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#17201B]">
                    Dual-Tier Credit Guard Verification
                  </h2>
                  <p className="text-xs text-[#5C6962]">
                    OrderToCashService statutory credit &amp; crop lien rule check.
                  </p>
                </div>
                <div
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
                    creditGuard.allowed ? 'text-[#166534]' : 'text-[#B91C1C]'
                  }`}
                >
                  {creditGuard.allowed ? (
                    <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>{creditGuard.allowed ? 'Credit Approved' : 'Blocked by Guard'}</span>
                </div>
              </div>

              <dl className="space-y-2 text-sm border-t border-[#EAEEEC] pt-3">
                <div className="flex justify-between">
                  <dt className="text-[#5C6962]">Existing AR Balance</dt>
                  <dd className="font-mono tabular-nums">{formatCurrency(creditGuard.currentAR)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5C6962]">Pending Invoice Total</dt>
                  <dd className="font-mono tabular-nums">+{formatCurrency(creditGuard.pendingInvoiceTotal)}</dd>
                </div>
                <div className="flex justify-between font-semibold border-t border-[#EAEEEC] pt-2">
                  <dt className="text-[#17201B]">Proposed Effective AR</dt>
                  <dd className="font-mono tabular-nums text-[#17201B]">{formatCurrency(creditGuard.effectiveAR)}</dd>
                </div>
                <div className="flex justify-between text-xs text-[#5C6962] pt-1">
                  <dt>Tier 1 · Unsecured Credit Limit</dt>
                  <dd className="font-mono tabular-nums">{formatCurrency(creditGuard.unsecuredCreditLimit)}</dd>
                </div>
                <div className="flex justify-between text-xs text-[#5C6962]">
                  <dt>Tier 2 · Crop-Secured Max Limit</dt>
                  <dd className="font-mono tabular-nums">{formatCurrency(creditGuard.cropSecuredCreditLimit)}</dd>
                </div>
                <div className="flex justify-between text-xs border-t border-[#EAEEEC] pt-2">
                  <dt className="text-[#37433D]">Excess Over Unsecured Limit</dt>
                  <dd className="font-mono font-semibold tabular-nums text-[#B45309]">
                    {formatCurrency(creditGuard.excessOverUnsecured)}
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-[#37433D]">Undelivered Contract Equity</dt>
                  <dd className="font-mono font-semibold tabular-nums text-[#143A2B]">
                    {formatCurrency(creditGuard.undeliveredContractEquity)}
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-[#37433D]">Statutory Crop Lien Filing</dt>
                  <dd
                    className={`font-mono font-medium ${
                      creditGuard.hasCropLienFiling ? 'text-[#166534]' : 'text-[#B91C1C]'
                    }`}
                  >
                    {creditGuard.hasCropLienFiling
                      ? `Verified (${creditGuard.lienFilingReference})`
                      : 'Missing'}
                  </dd>
                </div>
              </dl>

              {!creditGuard.allowed && creditGuard.blockingReason && (
                <div
                  role="alert"
                  className="text-xs text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-md p-3"
                >
                  <strong>CreditLimitExceededException:</strong> {creditGuard.blockingReason}
                </div>
              )}

              {inputError && (
                <p role="alert" className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
                  {inputError}
                </p>
              )}

              <button
                type="submit"
                disabled={!creditGuard.allowed}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#143A2B] hover:bg-[#1B4D39] disabled:opacity-45 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                Post Spring Input Invoice
              </button>
            </section>
          </div>
        </form>
      ) : (
        /* CUJ 4: Outbound Commercial Bulk Grain Dispatch */
        <form onSubmit={handlePostDispatch} className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-6 space-y-6">
            <section className="bg-white border border-[#DDE2DF] rounded-lg p-4 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#17201B]">
                  Commercial Outbound Bulk Grain Dispatch
                </h2>
                <p className="text-xs text-[#5C6962]">
                  Atomically decrements Products.TotalQtyOnHand and SiloBinLots.CurrentQtyKg under CHECK (CurrentQtyKg &gt;= 0).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="dispatch-buyer" className="block text-xs font-medium text-[#37433D] mb-1">
                    Commercial Grain Buyer
                  </label>
                  <select
                    id="dispatch-buyer"
                    value={selectedBuyerId}
                    onChange={(e) => setSelectedBuyerId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  >
                    {commercialBuyers.map((b) => (
                      <option key={b.customerId} value={b.customerId}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="dispatch-silo" className="block text-xs font-medium text-[#37433D] mb-1">
                    Source Silo Bin Lot
                  </label>
                  <select
                    id="dispatch-silo"
                    value={selectedSiloId}
                    onChange={(e) => setSelectedSiloId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  >
                    {siloLots.map((lot) => (
                      <option key={lot.lotId} value={lot.lotId}>
                        {lot.siloIdentifier} · {lot.commodityName} ({lot.currentQtyKg.toLocaleString()} kg)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="dispatch-qty" className="block text-xs font-medium text-[#37433D] mb-1">
                    Dispatch Weight (Integer kg)
                  </label>
                  <input
                    id="dispatch-qty"
                    type="number"
                    step="1"
                    min="1"
                    value={dispatchKgInput}
                    onChange={(e) => setDispatchKgInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  />
                </div>

                <div>
                  <label htmlFor="dispatch-price" className="block text-xs font-medium text-[#37433D] mb-1">
                    Contract Selling Price ($/kg)
                  </label>
                  <input
                    id="dispatch-price"
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={dispatchPriceInput}
                    onChange={(e) => setDispatchPriceInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  />
                </div>
              </div>

              {/* Stock Parity & Margin Preview */}
              <div className="grid grid-cols-3 gap-3 text-xs pt-1">
                <div className="p-3 bg-[#FAFBFB] border border-[#EAEEEC] rounded-md">
                  <div className="text-[#5C6962]">Silo On Hand</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[#17201B]">
                    {formatKg(selectedSilo.currentQtyKg)}
                  </div>
                </div>
                <div className="p-3 bg-[#FAFBFB] border border-[#EAEEEC] rounded-md">
                  <div className="text-[#5C6962]">Post-Dispatch Silo</div>
                  <div
                    className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
                      dispatchGuard.allowed ? 'text-[#143A2B]' : 'text-[#B91C1C]'
                    }`}
                  >
                    {formatKg(dispatchGuard.remainingQtyAfterDispatch)}
                  </div>
                </div>
                <div className="p-3 bg-[#FAFBFB] border border-[#EAEEEC] rounded-md">
                  <div className="text-[#5C6962]">Gross Margin</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[#166534]">
                    {formatCurrency(dispatchRevenue - dispatchCogs)}
                  </div>
                </div>
              </div>

              {!dispatchGuard.allowed && dispatchGuard.blockingReason && (
                <div role="alert" className="text-xs text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-md p-3">
                  <strong>InsufficientStockException:</strong> {dispatchGuard.blockingReason}
                </div>
              )}

              {dispatchError && (
                <p role="alert" className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
                  {dispatchError}
                </p>
              )}

              <button
                type="submit"
                disabled={!dispatchGuard.allowed}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#143A2B] hover:bg-[#1B4D39] disabled:opacity-45 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                Post Commercial Dispatch &amp; Deplete {selectedSilo.siloIdentifier}
              </button>
            </section>
          </div>

          <div className="xl:col-span-6">
            <DoubleEntryDistributionGrid
              title="Commercial Grain Dispatch Journal Preview (AR, Revenue, COGS, Inventory)"
              lines={dispatchPreviewJournal}
              emptyMessage="Enter a valid dispatch quantity within silo stock limits to preview GL entries."
            />
          </div>
        </form>
      )}

      {/* Sales Invoices Register */}
      <section aria-label="Sales Invoices Register" className="bg-white border border-[#DDE2DF] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EAEEEC] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#17201B]">Recent Sales Invoices (Agronomic Inputs &amp; Bulk Grain)</h2>
          <span className="text-xs font-mono text-[#5C6962] tabular-nums">{salesInvoices.length} invoices</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#EAEEEC] bg-[#FAFBFB] text-xs font-medium text-[#5C6962]">
                <th className="py-2.5 px-4">Invoice #</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Type &amp; Summary</th>
                <th className="py-2.5 px-3 text-right">Total</th>
                <th className="py-2.5 px-3 text-right">Paid / Contra</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F3F1] text-sm">
              {salesInvoices.map((inv) => (
                <tr key={inv.invoiceId} className="hover:bg-[#FAFBFB]">
                  <td className="py-2.5 px-4 font-mono text-xs font-semibold text-[#17201B] whitespace-nowrap">
                    <div>{inv.documentNumber}</div>
                    <div className="text-[#64716A] font-normal">{inv.invoiceDate}</div>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-[#17201B]">{inv.customerName}</td>
                  <td className="py-2.5 px-3 text-xs text-[#37433D]">
                    <span className="font-medium text-[#17201B]">
                      {inv.isGrowerInputSale ? 'Spring Input' : 'Bulk Grain'}
                    </span>{' '}
                    · {inv.summary}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs font-medium tabular-nums">
                    {formatCurrency(inv.totalAmount)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-[#5C6962]">
                    {formatCurrency(inv.paidAmount)}
                  </td>
                  <td className="py-2.5 px-4 text-xs font-medium whitespace-nowrap">
                    <span
                      className={
                        inv.status === 'Paid'
                          ? 'text-[#166534]'
                          : inv.status === 'PartiallyPaid'
                            ? 'text-[#B45309]'
                            : 'text-[#37433D]'
                      }
                    >
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
