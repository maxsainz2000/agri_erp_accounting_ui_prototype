import React, { useMemo, useState } from 'react';
import { SlidersHorizontal, History, X } from 'lucide-react';
import { useErp } from '../../state/ErpStore';
import { ScaleTicketStatus, SiloBinLot } from '../../domain/types';
import { convertKgToBushels } from '../../domain/grainGradingEngine';
import { generateSiloCleanOutLines } from '../../domain/ledgerPostingEngine';
import { formatBushels, formatCurrency, formatKg } from '../../domain/formatters';
import { DoubleEntryDistributionGrid } from '../shared/DoubleEntryDistributionGrid';

export function SiloInventoryView() {
  const {
    accounts,
    siloLots,
    products,
    scaleTickets,
    growers,
    executeSiloCleanOut,
  } = useErp();

  const [cleanOutLot, setCleanOutLot] = useState<SiloBinLot | null>(null);
  const [actualSweepInput, setActualSweepInput] = useState<string>('0');
  const [cleanOutNotes, setCleanOutNotes] = useState<string>('Post-aeration moisture evaporation clean-out');
  const [cleanOutError, setCleanOutError] = useState<string | null>(null);

  const [traceLot, setTraceLot] = useState<SiloBinLot | null>(null);

  const totalStoredKg = useMemo(
    () => siloLots.reduce((s, l) => s + l.currentQtyKg, 0),
    [siloLots]
  );
  const totalCapacityKg = useMemo(
    () => siloLots.reduce((s, l) => s + l.capacityKg, 0),
    [siloLots]
  );
  const totalBookValue = useMemo(
    () => siloLots.reduce((s, l) => s + l.currentQtyKg * l.currentMovingAvgCost, 0),
    [siloLots]
  );

  const openCleanOutDialog = (lot: SiloBinLot) => {
    setCleanOutLot(lot);
    // Default to realistic 1.5% aeration moisture shrinkage preview
    const realisticSweep = Math.max(0, Math.round(lot.currentQtyKg * 0.985));
    setActualSweepInput(String(realisticSweep));
    setCleanOutNotes('Aeration moisture evaporation reconciliation');
    setCleanOutError(null);
  };

  const cleanOutPreviewLines = useMemo(() => {
    if (!cleanOutLot) return [];
    const actual = Number(actualSweepInput);
    if (!Number.isInteger(actual) || actual < 0 || actual === cleanOutLot.currentQtyKg) {
      return [];
    }
    return generateSiloCleanOutLines(
      accounts,
      cleanOutLot.siloIdentifier,
      cleanOutLot.commodityName,
      cleanOutLot.currentQtyKg,
      actual,
      cleanOutLot.currentMovingAvgCost
    );
  }, [accounts, cleanOutLot, actualSweepInput]);

  const handleCleanOutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanOutLot) return;
    setCleanOutError(null);
    const res = executeSiloCleanOut({
      lotId: cleanOutLot.lotId,
      actualSweepQtyKg: Number(actualSweepInput),
      notes: cleanOutNotes,
    });
    if (!res.ok) {
      setCleanOutError(res.error ?? 'Could not execute clean-out adjustment.');
      return;
    }
    setCleanOutLot(null);
  };

  const tracedTickets = useMemo(() => {
    if (!traceLot) return [];
    return scaleTickets.filter(
      (t) =>
        t.targetSiloBinLotId === traceLot.lotId &&
        t.status !== ScaleTicketStatus.GrossWeighed
    );
  }, [traceLot, scaleTickets]);

  return (
    <div className="space-y-6">
      {/* Facility Capacity Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#DDE2DF] rounded-lg px-4 py-3.5">
          <div className="text-xs text-[#5C6962]">Total Commingled Grain On Hand</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#17201B] tabular-nums">
            {totalStoredKg.toLocaleString()} <span className="text-sm font-normal text-[#5C6962]">kg</span>
          </div>
          <div className="text-xs text-[#64716A] mt-0.5 font-mono tabular-nums">
            {((totalStoredKg / Math.max(1, totalCapacityKg)) * 100).toFixed(1)}% of {totalCapacityKg.toLocaleString()} kg capacity
          </div>
        </div>
        <div className="bg-white border border-[#DDE2DF] rounded-lg px-4 py-3.5">
          <div className="text-xs text-[#5C6962]">Silo Inventory Book Valuation (GL 1300)</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#17201B] tabular-nums">
            {formatCurrency(totalBookValue)}
          </div>
          <div className="text-xs text-[#64716A] mt-0.5">Perpetual moving weighted average</div>
        </div>
        <div className="bg-white border border-[#DDE2DF] rounded-lg px-4 py-3.5">
          <div className="text-xs text-[#5C6962]">Active Storage Bins</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#17201B] tabular-nums">
            {siloLots.length} <span className="text-sm font-normal text-[#5C6962]">lots</span>
          </div>
          <div className="text-xs text-[#64716A] mt-0.5">
            4 commingled grade lots · 1 identity-preserved
          </div>
        </div>
      </div>

      {/* Visual Silo Bin Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {siloLots.map((lot) => {
          const prod = products.find((p) => p.productId === lot.commodityProductId);
          const fillPct = Math.min(100, Math.round((lot.currentQtyKg / lot.capacityKg) * 100));
          const bushels = convertKgToBushels(lot.currentQtyKg, prod?.standardBushelWeightKg ?? null);
          const valuation = lot.currentQtyKg * lot.currentMovingAvgCost;
          const lotTicketCount = scaleTickets.filter(
            (t) => t.targetSiloBinLotId === lot.lotId && t.status !== ScaleTicketStatus.GrossWeighed
          ).length;

          return (
            <article
              key={lot.lotId}
              className="bg-white border border-[#DDE2DF] rounded-lg p-4 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#17201B] font-mono">
                      {lot.siloIdentifier}
                    </h2>
                    <div className="text-xs text-[#5C6962] mt-0.5">
                      {lot.commodityName}
                    </div>
                  </div>
                  <div className="text-right text-xs text-[#5C6962] font-mono">
                    <div>{lot.gradeCode}</div>
                    <div>Crop {lot.harvestYear}</div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-[#64716A]">
                  {lot.isIdentityPreserved ? 'Identity-Preserved Lot' : 'Commingled Grade Lot'} · Last clean-out {lot.lastCleanOutDate ?? 'None'}
                </div>

                {/* Capacity Bar */}
                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-xs mb-1.5">
                    <span className="font-mono font-semibold text-[#17201B] tabular-nums">
                      {formatKg(lot.currentQtyKg)}
                    </span>
                    <span className="font-mono text-[#5C6962] tabular-nums">
                      {fillPct}% · Cap {formatKg(lot.capacityKg)}
                    </span>
                  </div>
                  <div
                    className="h-2.5 w-full bg-[#ECEFED] rounded-sm overflow-hidden"
                    role="progressbar"
                    aria-valuenow={fillPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${lot.siloIdentifier} fill percentage`}
                  >
                    <div
                      className={`h-full transition-all duration-200 ${
                        fillPct >= 90 ? 'bg-[#B45309]' : 'bg-[#143A2B]'
                      }`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                </div>

                {/* Valuation Metrics */}
                <dl className="mt-4 pt-3 border-t border-[#EAEEEC] grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-[#64716A]">Virtual Bushels</dt>
                    <dd className="mt-0.5 font-mono font-medium text-[#17201B] tabular-nums">
                      {formatBushels(bushels)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#64716A]">Moving Avg Cost</dt>
                    <dd className="mt-0.5 font-mono font-medium text-[#17201B] tabular-nums">
                      {formatCurrency(lot.currentMovingAvgCost, 4)}/kg
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-[#64716A]">Book Value</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-[#17201B] tabular-nums">
                      {formatCurrency(valuation)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="pt-3 border-t border-[#EAEEEC] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setTraceLot(lot)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#37433D] hover:text-[#17201B] bg-[#F5F7F6] hover:bg-[#EAEEEC] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <History className="w-3.5 h-3.5" aria-hidden="true" />
                  Trace Origin ({lotTicketCount})
                </button>
                <button
                  type="button"
                  onClick={() => openCleanOutDialog(lot)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#143A2B] bg-[#EEF4F1] hover:bg-[#DFECE5] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                  Clean-Out Reconcile
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Silo Clean-Out Reconciliation Modal */}
      {cleanOutLot && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Silo Clean-Out Reconciliation for ${cleanOutLot.siloIdentifier}`}
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#DDE2DF] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="px-5 py-3.5 border-b border-[#EAEEEC] flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#17201B]">
                  Silo Clean-Out Reconciliation · {cleanOutLot.siloIdentifier}
                </h2>
                <p className="text-xs text-[#5C6962]">
                  Append-only InventoryAdjustment (ReasonCode = SiloCleanOut) · Rule 13
                </p>
              </div>
              <button
                type="button"
                aria-label="Close clean-out dialog"
                onClick={() => setCleanOutLot(null)}
                className="p-1.5 text-[#5C6962] hover:text-[#17201B] rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCleanOutSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-[#FAFBFB] border border-[#EAEEEC] rounded-md">
                  <div className="text-[#5C6962]">Current Book Quantity</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-[#17201B] tabular-nums">
                    {formatKg(cleanOutLot.currentQtyKg)}
                  </div>
                </div>
                <div className="p-3 bg-[#FAFBFB] border border-[#EAEEEC] rounded-md">
                  <div className="text-[#5C6962]">Moving Avg Unit Cost</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-[#17201B] tabular-nums">
                    {formatCurrency(cleanOutLot.currentMovingAvgCost, 4)}/kg
                  </div>
                </div>
                <div className="p-3 bg-[#FAFBFB] border border-[#EAEEEC] rounded-md">
                  <div className="text-[#5C6962]">Variance Classification</div>
                  <div className="mt-1 font-mono text-sm font-semibold tabular-nums">
                    {Number(actualSweepInput) < cleanOutLot.currentQtyKg ? (
                      <span className="text-[#B45309]">
                        -{(cleanOutLot.currentQtyKg - Number(actualSweepInput)).toLocaleString()} kg (5350 Shrinkage)
                      </span>
                    ) : Number(actualSweepInput) > cleanOutLot.currentQtyKg ? (
                      <span className="text-[#166534]">
                        +{(Number(actualSweepInput) - cleanOutLot.currentQtyKg).toLocaleString()} kg (5400 Surplus)
                      </span>
                    ) : (
                      <span className="text-[#5C6962]">0 kg variance</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sweep-qty" className="block text-xs font-medium text-[#37433D] mb-1">
                    Actual Physical Sweep Quantity (Integer kg)
                  </label>
                  <input
                    id="sweep-qty"
                    type="number"
                    step="1"
                    min="0"
                    max={cleanOutLot.capacityKg}
                    value={actualSweepInput}
                    onChange={(e) => setActualSweepInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  />
                  <div className="mt-1.5 flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setActualSweepInput('0')}
                      className="text-[#143A2B] hover:underline cursor-pointer"
                    >
                      Set 0 kg (Full Bin Empty)
                    </button>
                    <span aria-hidden="true" className="text-[#9AA59F]">·</span>
                    <button
                      type="button"
                      onClick={() => setActualSweepInput(String(cleanOutLot.currentQtyKg + 450))}
                      className="text-[#143A2B] hover:underline cursor-pointer"
                    >
                      Test +450 kg Surplus
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="sweep-notes" className="block text-xs font-medium text-[#37433D] mb-1">
                    Audit Notes / Aeration Log
                  </label>
                  <input
                    id="sweep-notes"
                    type="text"
                    value={cleanOutNotes}
                    onChange={(e) => setCleanOutNotes(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  />
                </div>
              </div>

              <DoubleEntryDistributionGrid
                title="Rule 13 · Silo Clean-Out Adjustment Journal Preview"
                lines={cleanOutPreviewLines}
                emptyMessage="Enter an actual physical sweep quantity different from book stock to preview GL 5350 / 5400 entries."
              />

              {cleanOutError && (
                <p role="alert" className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
                  {cleanOutError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#EAEEEC]">
                <button
                  type="button"
                  onClick={() => setCleanOutLot(null)}
                  className="px-4 py-2 text-sm font-medium text-[#37433D] hover:bg-[#F3F5F4] rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cleanOutPreviewLines.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#143A2B] hover:bg-[#1B4D39] disabled:opacity-45 rounded-md cursor-pointer"
                >
                  Post Clean-Out Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Two-Tier Provenance Recall Traceability Modal */}
      {traceLot && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Origin Recall Traceability for ${traceLot.siloIdentifier}`}
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#DDE2DF] rounded-lg max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-xl">
            <div className="px-5 py-3.5 border-b border-[#EAEEEC] flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#17201B]">
                  Food Safety Recall Traceability · {traceLot.siloIdentifier}
                </h2>
                <p className="text-xs text-[#5C6962]">
                  Two-tier provenance query tracing commingled {traceLot.commodityName} ({traceLot.gradeCode}) back to farm fields &amp; retained probe jars.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close traceability drawer"
                onClick={() => setTraceLot(null)}
                className="p-1.5 text-[#5C6962] hover:text-[#17201B] rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              {tracedTickets.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#5C6962]">
                  No intake scale tickets routed to {traceLot.siloIdentifier} since last clean-out ({traceLot.lastCleanOutDate ?? 'N/A'}).
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#EAEEEC] rounded-md">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#EAEEEC] bg-[#FAFBFB] text-xs font-medium text-[#5C6962]">
                        <th className="py-2.5 px-3">Ticket &amp; Date</th>
                        <th className="py-2.5 px-3">Producer &amp; Field ID</th>
                        <th className="py-2.5 px-3">Truck Plate</th>
                        <th className="py-2.5 px-3">Sample Jar Ref</th>
                        <th className="py-2.5 px-3 text-right">Moisture</th>
                        <th className="py-2.5 px-3 text-right">Net Clean Kg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F3F1] text-sm">
                      {tracedTickets.map((t) => {
                        const g = growers.find((gr) => gr.vendorId === t.growerId);
                        return (
                          <tr key={t.ticketId}>
                            <td className="py-2.5 px-3 font-mono text-xs">
                              <div className="font-semibold text-[#17201B]">{t.ticketNumber}</div>
                              <div className="text-[#64716A]">{t.receiptDate}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-medium text-[#17201B]">{g?.name}</div>
                              <div className="text-xs text-[#64716A]">
                                {g?.farmName} · Field #{t.farmFieldId}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-xs text-[#37433D]">
                              {t.truckPlate}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-xs font-semibold text-[#143A2B]">
                              {t.sampleJarRef ?? '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">
                              {t.moisturePct.toFixed(1)}%
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs font-medium tabular-nums">
                              {formatKg(t.netCleanKg)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setTraceLot(null)}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#143A2B] hover:bg-[#1B4D39] rounded-md cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
