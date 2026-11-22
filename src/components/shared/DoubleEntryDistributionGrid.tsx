import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { JournalEntryLine } from '../../domain/types';
import { validateJournalLines } from '../../domain/ledgerPostingEngine';
import { formatCurrency } from '../../domain/formatters';

interface DoubleEntryDistributionGridProps {
  title?: string;
  lines: JournalEntryLine[];
  emptyMessage?: string;
}

/**
 * Reusable DoubleEntryDistributionGrid + BalancedStatusBadge control
 * Carried forward from mvp_erp_accounting.md Section 3.2 into agri_erp_accounting.md.
 */
export function DoubleEntryDistributionGrid({
  title = 'Double-Entry Ledger Preview',
  lines,
  emptyMessage = 'Complete required transaction inputs to preview balanced journal lines.',
}: DoubleEntryDistributionGridProps) {
  const validation = validateJournalLines(lines);

  return (
    <section aria-label={title} className="bg-white border border-[#DDE2DF] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-[#EAEEEC] bg-[#FAFBFB]">
        <h3 className="text-sm font-semibold text-[#17201B]">{title}</h3>
        {lines.length > 0 && (
          <div
            className={`flex items-center gap-1.5 text-xs font-medium tabular-nums whitespace-nowrap shrink-0 ${
              validation.isBalanced ? 'text-[#166534]' : 'text-[#B91C1C]'
            }`}
          >
            {validation.isBalanced ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>
              {validation.isBalanced
                ? `Balanced · Variance ${formatCurrency(0)}`
                : `Unbalanced · Variance ${formatCurrency(validation.variance)}`}
            </span>
          </div>
        )}
      </div>

      {lines.length === 0 ? (
        <div className="px-4 py-6 text-sm text-[#5C6962] text-center">{emptyMessage}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#EAEEEC] text-xs font-medium text-[#5C6962]">
                <th className="py-2.5 px-4 w-20">Code</th>
                <th className="py-2.5 px-4">Account &amp; Distribution Memo</th>
                <th className="py-2.5 px-4 text-right w-32">Debit</th>
                <th className="py-2.5 px-4 text-right w-32">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F3F1] text-sm">
              {lines.map((line, idx) => (
                <tr key={`${line.accountCode}-${idx}`} className="hover:bg-[#FAFBFB]">
                  <td className="py-2.5 px-4 font-mono text-xs font-medium text-[#37433D] tabular-nums">
                    {line.accountCode}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-[#17201B]">{line.accountName}</div>
                    <div className="text-xs text-[#64716A] mt-0.5">{line.lineMemo}</div>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs font-medium text-[#17201B] tabular-nums">
                    {line.debitAmount > 0 ? formatCurrency(line.debitAmount) : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs font-medium text-[#17201B] tabular-nums">
                    {line.creditAmount > 0 ? formatCurrency(line.creditAmount) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#DDE2DF] bg-[#FAFBFB] text-xs font-semibold text-[#17201B]">
                <td className="py-2.5 px-4" colSpan={2}>
                  Total Distribution ({lines.length} lines)
                </td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                  {formatCurrency(validation.totalDebits)}
                </td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                  {formatCurrency(validation.totalCredits)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
