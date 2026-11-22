import { useMemo } from 'react';
import { ArrowUpRight, AlertTriangle } from 'lucide-react';
import { useErp } from '../../state/ErpStore';
import { GrainPricingType, ScaleTicketStatus } from '../../domain/types';
import { daysBetween, formatCurrency, formatKg } from '../../domain/formatters';
import { TODAY_ISO } from '../../data/seedData';
import { round2 } from '../../domain/grainGradingEngine';

export function UnpricedExposureView() {
  const {
    scaleTickets,
    products,
    growers,
    siloLots,
    updateBenchmarkPrice,
    jumpToLiquidateTicket,
  } = useErp();

  const grainCommodities = useMemo(
    () => products.filter((p) => p.isGrainCommodity),
    [products]
  );

  const dpTickets = useMemo(() => {
    return scaleTickets
      .filter(
        (t) =>
          t.status === ScaleTicketStatus.PendingSettlement &&
          t.pricingType === GrainPricingType.DelayedPrice
      )
      .map((ticket) => {
        const prod = products.find((p) => p.productId === ticket.commodityProductId);
        const grower = growers.find((g) => g.vendorId === ticket.growerId);
        const lot = siloLots.find((s) => s.lotId === ticket.targetSiloBinLotId);
        const daysUnpriced = daysBetween(ticket.receiptDate, TODAY_ISO);
        const daysToExpiry = ticket.delayedPriceExpiryDate
          ? Math.max(0, daysBetween(TODAY_ISO, ticket.delayedPriceExpiryDate))
          : Math.max(0, 90 - daysUnpriced);
        const currentBid = prod?.currentCashBenchmarkPrice ?? ticket.provisionalUnitPrice;
        const markToMarketValue = round2((ticket.netCleanKg ?? 0) * currentBid);
        const unrealizedVariance = round2(markToMarketValue - ticket.provisionalTotalAmount);

        const riskLevel: 'Critical' | 'Warning' | 'Normal' =
          daysUnpriced >= 75 || daysToExpiry <= 15
            ? 'Critical'
            : daysUnpriced >= 45 || daysToExpiry <= 35
              ? 'Warning'
              : 'Normal';

        return {
          ticket,
          prod,
          grower,
          lot,
          daysUnpriced,
          daysToExpiry,
          currentBid,
          markToMarketValue,
          unrealizedVariance,
          riskLevel,
        };
      })
      .sort((a, b) => b.daysUnpriced - a.daysUnpriced);
  }, [scaleTickets, products, growers, siloLots]);

  const totals = useMemo(() => {
    const totalKg = dpTickets.reduce((s, r) => s + (r.ticket.netCleanKg ?? 0), 0);
    const totalProvisional = round2(
      dpTickets.reduce((s, r) => s + r.ticket.provisionalTotalAmount, 0)
    );
    const totalMtm = round2(dpTickets.reduce((s, r) => s + r.markToMarketValue, 0));
    const totalVariance = round2(totalMtm - totalProvisional);
    const criticalCount = dpTickets.filter((r) => r.riskLevel === 'Critical').length;
    return { totalKg, totalProvisional, totalMtm, totalVariance, criticalCount };
  }, [dpTickets]);

  return (
    <div className="space-y-6">
      {/* Exposure Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#DDE2DF] rounded-lg px-4 py-3.5">
          <div className="text-xs text-[#5C6962]">Open Delayed Price Volume</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#17201B] tabular-nums">
            {totals.totalKg.toLocaleString()} <span className="text-sm font-normal text-[#5C6962]">kg</span>
          </div>
          <div className="text-xs text-[#64716A] mt-0.5">{dpTickets.length} unsettled DP ticket(s)</div>
        </div>

        <div className="bg-white border border-[#DDE2DF] rounded-lg px-4 py-3.5">
          <div className="text-xs text-[#5C6962]">Accrued Liability (GL 2110)</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#17201B] tabular-nums">
            {formatCurrency(totals.totalProvisional)}
          </div>
          <div className="text-xs text-[#64716A] mt-0.5">Provisional delivery valuation</div>
        </div>

        <div className="bg-white border border-[#DDE2DF] rounded-lg px-4 py-3.5">
          <div className="text-xs text-[#5C6962]">Mark-to-Market Exposure</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#17201B] tabular-nums">
            {formatCurrency(totals.totalMtm)}
          </div>
          <div
            className={`text-xs font-mono font-medium mt-0.5 tabular-nums ${
              totals.totalVariance > 0
                ? 'text-[#B91C1C]'
                : totals.totalVariance < 0
                  ? 'text-[#166534]'
                  : 'text-[#5C6962]'
            }`}
          >
            Unrealized 5110 Var: {totals.totalVariance >= 0 ? '+' : ''}
            {formatCurrency(totals.totalVariance)}
          </div>
        </div>

        <div className="bg-white border border-[#DDE2DF] rounded-lg px-4 py-3.5">
          <div className="text-xs text-[#5C6962]">Near 90-Day Expiry Alert</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums flex items-baseline gap-2">
            <span className={totals.criticalCount > 0 ? 'text-[#B91C1C]' : 'text-[#166534]'}>
              {totals.criticalCount}
            </span>
            <span className="text-xs font-sans font-normal text-[#5C6962]">
              {totals.criticalCount === 1 ? 'ticket >= 75 days' : 'tickets >= 75 days'}
            </span>
          </div>
        </div>
      </div>

      {/* Live Daily Cash Benchmark Price Controls */}
      <section aria-label="Daily Posted Cash Benchmark Bids" className="bg-white border border-[#DDE2DF] rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#EAEEEC]">
          <div>
            <h2 className="text-sm font-semibold text-[#17201B]">
              Daily Posted Cash Benchmark Bids (Mark-to-Market Simulator)
            </h2>
            <p className="text-xs text-[#5C6962]">
              Adjust elevator posted bids ($/kg) to evaluate real-time GL 5110 margin exposure and set provisional pricing for new scale tickets.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {grainCommodities.map((prod) => (
            <div
              key={prod.productId}
              className="flex items-center justify-between gap-3 p-3 bg-[#FAFBFB] border border-[#EAEEEC] rounded-md"
            >
              <div>
                <div className="text-sm font-medium text-[#17201B]">{prod.name}</div>
                <div className="text-xs text-[#64716A] font-mono">
                  {prod.commodityGradeCode} · Avg Cost {formatCurrency(prod.currentUnitCost, 4)}/kg
                </div>
              </div>
              <div className="shrink-0">
                <label htmlFor={`bid-${prod.productId}`} className="sr-only">
                  Benchmark cash bid per kg for {prod.name}
                </label>
                <input
                  id={`bid-${prod.productId}`}
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={prod.currentCashBenchmarkPrice}
                  onChange={(e) => updateBenchmarkPrice(prod.productId, Number(e.target.value))}
                  className="w-24 px-2.5 py-1.5 text-right font-mono text-sm font-semibold tabular-nums bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Unpriced Delayed Price Aging Grid */}
      <section aria-label="Unpriced Delayed Price Tickets" className="bg-white border border-[#DDE2DF] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EAEEEC] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#17201B]">
              Unpriced Delayed Price (DP) Ticket Aging &amp; Clerk Liquidation Queue
            </h2>
            <p className="text-xs text-[#5C6962]">
              Tracks open tickets in Account 2110 Accrued Grower Intake awaiting producer pricing lock.
            </p>
          </div>
        </div>

        {dpTickets.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#5C6962]">
            All Delayed Price scale tickets have been liquidated and settled. Zero unpriced DP exposure remains.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EAEEEC] bg-[#FAFBFB] text-xs font-medium text-[#5C6962]">
                  <th className="py-2.5 px-4">Ticket &amp; Delivery</th>
                  <th className="py-2.5 px-3">Producer &amp; Commodity</th>
                  <th className="py-2.5 px-3 text-right">Net Clean Kg</th>
                  <th className="py-2.5 px-3 text-right">Aging / Expiry</th>
                  <th className="py-2.5 px-3 text-right">Provisional (2110)</th>
                  <th className="py-2.5 px-3 text-right">Current Bid Value</th>
                  <th className="py-2.5 px-3 text-right">MTM Variance</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F3F1] text-sm">
                {dpTickets.map((row) => (
                  <tr key={row.ticket.ticketId} className="hover:bg-[#FAFBFB]">
                    <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                      <div className="font-semibold text-[#17201B]">{row.ticket.ticketNumber}</div>
                      <div className="text-[#64716A]">{row.ticket.receiptDate}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-[#17201B]">{row.grower?.name}</div>
                      <div className="text-xs text-[#64716A]">
                        {row.prod?.name} · {row.lot?.siloIdentifier}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs font-medium tabular-nums whitespace-nowrap">
                      {formatKg(row.ticket.netCleanKg)}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div
                        className={`inline-flex items-center justify-end gap-1 font-mono text-xs font-semibold tabular-nums ${
                          row.riskLevel === 'Critical'
                            ? 'text-[#B91C1C]'
                            : row.riskLevel === 'Warning'
                              ? 'text-[#B45309]'
                              : 'text-[#166534]'
                        }`}
                      >
                        {row.riskLevel === 'Critical' && (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        )}
                        <span>{row.daysUnpriced}d open</span>
                      </div>
                      <div className="text-[11px] text-[#64716A] font-mono tabular-nums">
                        {row.riskLevel} · {row.daysToExpiry}d to expiry
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                      <div>{formatCurrency(row.ticket.provisionalTotalAmount)}</div>
                      <div className="text-[11px] text-[#64716A]">
                        @ {formatCurrency(row.ticket.provisionalUnitPrice, 4)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs font-medium tabular-nums whitespace-nowrap">
                      <div>{formatCurrency(row.markToMarketValue)}</div>
                      <div className="text-[11px] text-[#64716A]">
                        @ {formatCurrency(row.currentBid, 4)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap">
                      <span
                        className={
                          row.unrealizedVariance > 0
                            ? 'text-[#B91C1C]'
                            : row.unrealizedVariance < 0
                              ? 'text-[#166534]'
                              : 'text-[#5C6962]'
                        }
                      >
                        {row.unrealizedVariance >= 0 ? '+' : ''}
                        {formatCurrency(row.unrealizedVariance)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          jumpToLiquidateTicket(row.ticket.growerId, row.ticket.ticketId)
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#143A2B] bg-[#EEF4F1] hover:bg-[#DFECE5] rounded-md transition-colors cursor-pointer"
                      >
                        Liquidate
                        <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
