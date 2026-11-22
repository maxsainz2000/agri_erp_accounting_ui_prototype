import { useMemo, useState } from 'react';
import { useErp } from '../../state/ErpStore';
import { round2 } from '../../domain/grainGradingEngine';
import { formatCurrency } from '../../domain/formatters';

const TRANSITION_DELTAS = [
  {
    layer: 'Chart of Accounts',
    mvpBaseline: '16 core accounts (1010–5500) including 2100 GRNI & 5100 PPV.',
    agriExtension: 'Adds 5 domain accounts: 2010 Grower AP, 2110 Accrued Grower Intake, 4200 Agricultural Services & Drying Revenue, 5110 Grain Basis & DP Variance, 5350 Commodity Moisture Shrinkage.',
  },
  {
    layer: 'Database Schema (SQLite)',
    mvpBaseline: '25 normalized tables with CHECK (TotalQtyOnHand >= 0) integer base unit invariant.',
    agriExtension: 'Adds 7 grain tables (WeighbridgeScaleTickets, SiloBinLots, GrainDryingRates, GrainPurchaseContracts, GrowerSettlementSheets/Lines/Allocations) + alters Customers, Products, SalesInvoiceLines, InventoryAdjustmentLines.',
  },
  {
    layer: 'Domain Engines',
    mvpBaseline: 'InventoryCostingEngine + LedgerPostingEngine (Rules 1–10).',
    agriExtension: 'Adds GrainGradingEngine (half-up MidpointRounding.AwayFromZero dockage, drying schedules, virtual bushel display) + LedgerPostingEngine Rules 11–13.',
  },
  {
    layer: 'Counterparty & Credit',
    mvpBaseline: 'Isolated Vendors and Customers with single CreditLimit check.',
    agriExtension: 'LinkedVendorId bridge enabling bilateral seasonal AR/AP contra-clearing + Dual-Tier Credit Guard (UnsecuredCreditLimit, CropSecuredCreditLimit, Crop Lien & Undelivered Forward Contract Equity).',
  },
  {
    layer: 'UI Controls & Views',
    mvpBaseline: 'MainShellForm + Purchasing, Sales, Warehouse, Ledger, Reporting + DoubleEntryDistributionGrid, FiscalPeriodChip, BalancedStatusBadge.',
    agriExtension: 'Reuses atomic ledger controls inside 4 new agricultural workspaces: WeighbridgeIntakeControl, GrowerSettlementControl, SiloInventoryControl, UnpricedGrainExposureControl.',
  },
];

export function LedgerAndTransitionView() {
  const { accounts, journalEntries } = useErp();
  const [activeTab, setActiveTab] = useState<'journal' | 'trial-balance' | 'transition'>('journal');
  const [sourceFilter, setSourceFilter] = useState<string>('All');

  const filteredEntries = useMemo(() => {
    if (sourceFilter === 'All') return journalEntries;
    return journalEntries.filter((e) => e.sourceDocType === sourceFilter);
  }, [journalEntries, sourceFilter]);

  const trialBalance = useMemo(() => {
    const totals = new Map<number, { debit: number; credit: number }>();
    for (const acc of accounts) {
      totals.set(acc.code, { debit: 0, credit: 0 });
    }
    for (const entry of journalEntries) {
      for (const line of entry.lines) {
        const cur = totals.get(line.accountCode) ?? { debit: 0, credit: 0 };
        cur.debit = round2(cur.debit + line.debitAmount);
        cur.credit = round2(cur.credit + line.creditAmount);
        totals.set(line.accountCode, cur);
      }
    }

    const rows = accounts
      .map((acc) => {
        const t = totals.get(acc.code) ?? { debit: 0, credit: 0 };
        const net = round2(t.debit - t.credit);
        return {
          account: acc,
          debitBalance: net > 0 ? net : 0,
          creditBalance: net < 0 ? Math.abs(net) : 0,
          hasActivity: t.debit > 0 || t.credit > 0,
        };
      })
      .filter((r) => r.hasActivity || r.account.isNewAgriAccount);

    const totalDebits = round2(rows.reduce((s, r) => s + r.debitBalance, 0));
    const totalCredits = round2(rows.reduce((s, r) => s + r.creditBalance, 0));

    return { rows, totalDebits, totalCredits, isBalanced: totalDebits === totalCredits };
  }, [accounts, journalEntries]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="tablist" aria-label="Ledger and Specification Views" className="inline-flex items-center gap-1 p-1 bg-[#EAEFED] rounded-lg">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'journal'}
            onClick={() => setActiveTab('journal')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'journal'
                ? 'bg-white text-[#143A2B] shadow-xs'
                : 'text-[#5C6962] hover:text-[#17201B]'
            }`}
          >
            General Journal ({journalEntries.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'trial-balance'}
            onClick={() => setActiveTab('trial-balance')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'trial-balance'
                ? 'bg-white text-[#143A2B] shadow-xs'
                : 'text-[#5C6962] hover:text-[#17201B]'
            }`}
          >
            Trial Balance &amp; Extended COA
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'transition'}
            onClick={() => setActiveTab('transition')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'transition'
                ? 'bg-white text-[#143A2B] shadow-xs'
                : 'text-[#5C6962] hover:text-[#17201B]'
            }`}
          >
            MVP → Agri Spec Transition Map
          </button>
        </div>
      </div>

      {activeTab === 'journal' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[#5C6962]">
              Append-only double-entry journal ledger. Every agricultural intake, settlement, clean-out, and sales dispatch posts atomically here.
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="journal-filter" className="text-xs text-[#5C6962]">
                Source Document:
              </label>
              <select
                id="journal-filter"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
              >
                <option value="All">All Journal Entries</option>
                <option value="ScaleTicketIntake">Scale Ticket Intake (Rule 11)</option>
                <option value="GrowerSettlement">Grower Settlement (Rule 12)</option>
                <option value="SiloCleanOut">Silo Clean-Out (Rule 13)</option>
                <option value="AgronomicInputSale">Agronomic Input Sale</option>
                <option value="CommercialGrainDispatch">Commercial Grain Dispatch</option>
                <option value="OpeningBalance">Opening Balance</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {filteredEntries.map((entry) => {
              const debits = round2(entry.lines.reduce((s, l) => s + l.debitAmount, 0));
              const credits = round2(entry.lines.reduce((s, l) => s + l.creditAmount, 0));

              return (
                <article
                  key={entry.entryId}
                  className="bg-white border border-[#DDE2DF] rounded-lg overflow-hidden"
                >
                  <div className="px-4 py-3 bg-[#FAFBFB] border-b border-[#EAEEEC] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-[#143A2B]">
                        JE-{String(entry.entryId).padStart(4, '0')}
                      </span>
                      <span aria-hidden="true" className="text-[#9AA59F]">·</span>
                      <span className="font-mono font-medium text-[#17201B]">
                        {entry.documentNumber}
                      </span>
                      <span aria-hidden="true" className="text-[#9AA59F]">·</span>
                      <span className="text-[#37433D]">{entry.sourceDocType}</span>
                      <span aria-hidden="true" className="text-[#9AA59F]">·</span>
                      <span className="text-[#5C6962]">
                        Posted {entry.postingDate} (Period {entry.periodLabel})
                      </span>
                    </div>
                    <div className="font-mono text-xs font-medium text-[#166534] tabular-nums">
                      Balanced · {formatCurrency(debits)}
                    </div>
                  </div>
                  <div className="px-4 py-2 text-xs text-[#37433D] border-b border-[#F0F3F1]">
                    {entry.description}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#F0F3F1] text-[11px] font-medium text-[#64716A]">
                          <th className="py-2 px-4 w-20">Account</th>
                          <th className="py-2 px-4">Name &amp; Line Memo</th>
                          <th className="py-2 px-4 text-right w-32">Debit</th>
                          <th className="py-2 px-4 text-right w-32">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F5F7F6] text-xs">
                        {entry.lines.map((line, idx) => (
                          <tr key={`${entry.entryId}-${idx}`}>
                            <td className="py-2 px-4 font-mono font-medium text-[#37433D] tabular-nums">
                              {line.accountCode}
                            </td>
                            <td className="py-2 px-4">
                              <span className="font-medium text-[#17201B]">{line.accountName}</span>
                              <span className="text-[#64716A] ml-2">— {line.lineMemo}</span>
                            </td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums text-[#17201B]">
                              {line.debitAmount > 0 ? formatCurrency(line.debitAmount) : '—'}
                            </td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums text-[#17201B]">
                              {line.creditAmount > 0 ? formatCurrency(line.creditAmount) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#EAEEEC] bg-[#FAFBFB] text-xs font-semibold">
                          <td colSpan={2} className="py-2 px-4 text-[#5C6962]">
                            Entry Totals
                          </td>
                          <td className="py-2 px-4 text-right font-mono tabular-nums">
                            {formatCurrency(debits)}
                          </td>
                          <td className="py-2 px-4 text-right font-mono tabular-nums">
                            {formatCurrency(credits)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === 'trial-balance' && (
        <section className="bg-white border border-[#DDE2DF] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EAEEEC] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#17201B]">
                Live Trial Balance &amp; Agricultural COA Extensions
              </h2>
              <p className="text-xs text-[#5C6962]">
                Highlights the 5 newly added agricultural accounts alongside the core mvp_erp_accounting Chart of Accounts.
              </p>
            </div>
            <div className="font-mono text-xs font-semibold text-[#166534] tabular-nums">
              {trialBalance.isBalanced ? 'Trial Balance In Sync · Variance $0.00' : 'Variance Detected'}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EAEEEC] bg-[#FAFBFB] text-xs font-medium text-[#5C6962]">
                  <th className="py-2.5 px-4 w-24">Code</th>
                  <th className="py-2.5 px-4">Account Name &amp; Scope</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4 text-right w-36">Debit Balance</th>
                  <th className="py-2.5 px-4 text-right w-36">Credit Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F3F1] text-sm">
                {trialBalance.rows.map((row) => (
                  <tr
                    key={row.account.code}
                    className={row.account.isNewAgriAccount ? 'bg-[#F5F9F7]' : 'hover:bg-[#FAFBFB]'}
                  >
                    <td className="py-2.5 px-4 font-mono text-xs font-semibold text-[#17201B] tabular-nums">
                      {row.account.code}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#17201B]">{row.account.name}</span>
                        {row.account.isNewAgriAccount && (
                          <span className="text-[11px] font-medium text-[#143A2B]">
                            · Added in Agri ERP
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#64716A]">{row.account.description}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-[#5C6962]">{row.account.type}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs font-medium tabular-nums">
                      {row.debitBalance > 0 ? formatCurrency(row.debitBalance) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs font-medium tabular-nums">
                      {row.creditBalance > 0 ? formatCurrency(row.creditBalance) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#DDE2DF] bg-[#FAFBFB] text-sm font-semibold text-[#17201B]">
                  <td colSpan={3} className="py-3 px-4">
                    Total Trial Balance
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatCurrency(trialBalance.totalDebits)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatCurrency(trialBalance.totalCredits)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'transition' && (
        <section className="bg-white border border-[#DDE2DF] rounded-lg overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#EAEEEC]">
            <h2 className="text-sm font-semibold text-[#17201B]">
              Specification Transition Matrix · mvp_erp_accounting.md → agri_erp_accounting.md
            </h2>
            <p className="text-xs text-[#5C6962] mt-0.5">
              Non-breaking architectural expansion preserving the integer base-unit stock invariant and append-only double-entry ledger.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EAEEEC] bg-[#FAFBFB] text-xs font-medium text-[#5C6962]">
                  <th className="py-2.5 px-4 w-44">Architecture Layer</th>
                  <th className="py-2.5 px-4">Current Baseline (mvp_erp_accounting.md)</th>
                  <th className="py-2.5 px-4">Agricultural Transition (agri_erp_accounting.md)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F3F1] text-sm align-top">
                {TRANSITION_DELTAS.map((item) => (
                  <tr key={item.layer} className="hover:bg-[#FAFBFB]">
                    <td className="py-3 px-4 font-semibold text-[#17201B]">{item.layer}</td>
                    <td className="py-3 px-4 text-[#5C6962] text-xs leading-relaxed">
                      {item.mvpBaseline}
                    </td>
                    <td className="py-3 px-4 text-[#17201B] text-xs leading-relaxed font-medium">
                      {item.agriExtension}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
