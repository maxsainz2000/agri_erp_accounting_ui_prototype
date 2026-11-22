import { Lock, LockOpen } from 'lucide-react';
import { useErp } from '../../state/ErpStore';

/**
 * Reusable FiscalPeriodChipControl from mvp_erp_accounting.md Section 3.2.
 * Interactive button allowing the user to test Period Guard lock protection live.
 */
export function FiscalPeriodChip() {
  const { activePeriod, toggleActivePeriodLock } = useErp();

  return (
    <button
      type="button"
      onClick={toggleActivePeriodLock}
      title="Click to toggle fiscal period seal and test ClosedPeriodPostingException guard"
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
        activePeriod.isClosed
          ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B] hover:bg-[#FEE2E2]'
          : 'bg-white border-[#DDE2DF] text-[#17201B] hover:bg-[#F3F5F4]'
      }`}
    >
      {activePeriod.isClosed ? (
        <Lock className="w-3.5 h-3.5 text-[#DC2626] shrink-0" aria-hidden="true" />
      ) : (
        <LockOpen className="w-3.5 h-3.5 text-[#15803D] shrink-0" aria-hidden="true" />
      )}
      <span className="font-mono tabular-nums">Period {activePeriod.label}</span>
      <span aria-hidden="true" className="text-[#9AA59F]">·</span>
      <span>{activePeriod.isClosed ? 'Sealed (Closed)' : 'Open'}</span>
    </button>
  );
}
