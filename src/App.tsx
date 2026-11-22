import React, { useState } from 'react';
import {
  Scale,
  FileSpreadsheet,
  Warehouse,
  Clock,
  Truck,
  BookOpen,
  RotateCcw,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { ErpProvider, NavSection, useErp } from './state/ErpStore';
import { FiscalPeriodChip } from './components/shared/FiscalPeriodChip';
import { WeighbridgeIntakeView } from './components/views/WeighbridgeIntakeView';
import { GrowerSettlementView } from './components/views/GrowerSettlementView';
import { SiloInventoryView } from './components/views/SiloInventoryView';
import { UnpricedExposureView } from './components/views/UnpricedExposureView';
import { AgronomicSalesDispatchView } from './components/views/AgronomicSalesDispatchView';
import { LedgerAndTransitionView } from './components/views/LedgerAndTransitionView';
import { GrainPricingType, ScaleTicketStatus } from './domain/types';

interface NavItemConfig {
  id: NavSection;
  label: string;
  breadcrumb: string;
  subtitle: string;
  group: 'Agricultural Operations' | 'Merchandising & General Ledger';
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'weighbridge',
    label: 'Weighbridge Intake',
    breadcrumb: 'Agricultural Operations / Weighbridge Scale Intake',
    subtitle: 'Two-stage gross & tare weighing, half-up dockage deduction, and provisional GL 1300 / 2110 posting.',
    group: 'Agricultural Operations',
    icon: Scale,
  },
  {
    id: 'settlements',
    label: 'Grower Settlements',
    breadcrumb: 'Agricultural Operations / Grower Settlements & Contra',
    subtitle: 'Liquidate scale accruals, compute drying revenue (4200), price variance (5110), and net spring input AR.',
    group: 'Agricultural Operations',
    icon: FileSpreadsheet,
  },
  {
    id: 'silos',
    label: 'Silo & Bin Storage',
    breadcrumb: 'Agricultural Operations / Commingled Silo Inventory',
    subtitle: 'Monitor bin capacities, execute moisture shrinkage clean-outs (5350), and trace food-safety provenance.',
    group: 'Agricultural Operations',
    icon: Warehouse,
  },
  {
    id: 'exposure',
    label: 'Unpriced DP Exposure',
    breadcrumb: 'Agricultural Operations / Delayed Price Risk & Aging',
    subtitle: 'Track unsettled Delayed Price tickets in Account 2110, 90-day expiries, and mark-to-market variance.',
    group: 'Agricultural Operations',
    icon: Clock,
  },
  {
    id: 'sales',
    label: 'Sales & Bulk Dispatch',
    breadcrumb: 'Merchandising & Ledger / Agronomic Sales & Grain Dispatch',
    subtitle: 'Contract-backed dual-tier credit guard for spring inputs (CUJ 3) and outbound silo lot depletion (CUJ 4).',
    group: 'Merchandising & General Ledger',
    icon: Truck,
  },
  {
    id: 'ledger',
    label: 'Ledger & Spec Map',
    breadcrumb: 'Merchandising & Ledger / General Ledger & MVP → Agri Diff',
    subtitle: 'Append-only double-entry journal history, live Trial Balance, and architectural transition checklist.',
    group: 'Merchandising & General Ledger',
    icon: BookOpen,
  },
];

function WorkspaceShell() {
  const {
    activeSection,
    setActiveSection,
    scaleTickets,
    journalEntries,
    notification,
    dismissNotification,
    resetDemoState,
  } = useErp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentNav = NAV_ITEMS.find((item) => item.id === activeSection) ?? NAV_ITEMS[0];

  const yardCount = scaleTickets.filter(
    (t) => t.status === ScaleTicketStatus.GrossWeighed
  ).length;
  const pendingSettlementCount = scaleTickets.filter(
    (t) => t.status === ScaleTicketStatus.PendingSettlement
  ).length;
  const dpCount = scaleTickets.filter(
    (t) =>
      t.status === ScaleTicketStatus.PendingSettlement &&
      t.pricingType === GrainPricingType.DelayedPrice
  ).length;

  const getNavCount = (id: NavSection): number | null => {
    if (id === 'weighbridge') return yardCount;
    if (id === 'settlements') return pendingSettlementCount;
    if (id === 'exposure') return dpCount;
    if (id === 'ledger') return journalEntries.length;
    return null;
  };

  const renderNavigation = (onNavigate?: () => void) => (
    <nav aria-label="Primary Workspace Navigation" className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
      {(['Agricultural Operations', 'Merchandising & General Ledger'] as const).map((groupName) => (
        <div key={groupName}>
          <div className="px-3 mb-2 text-[11px] font-semibold tracking-wide text-[#64716A]">
            {groupName}
          </div>
          <ul className="space-y-0.5">
            {NAV_ITEMS.filter((i) => i.group === groupName).map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              const count = getNavCount(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection(item.id);
                      onNavigate?.();
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#143A2B] text-white'
                        : 'text-[#37433D] hover:bg-[#ECEFED] hover:text-[#17201B]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {count !== null && (
                      <span
                        className={`font-mono text-xs tabular-nums shrink-0 ${
                          isActive ? 'text-[#C6DDD1]' : 'text-[#64716A]'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-[#F6F7F6] text-[#17201B]">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-[#DDE2DF]">
        <div className="h-14 px-5 flex items-center border-b border-[#EAEEEC]">
          <span className="font-display text-base font-bold tracking-tight text-[#143A2B] whitespace-nowrap">
            GrainLedger ERP
          </span>
        </div>

        {renderNavigation()}

        <div className="p-4 border-t border-[#EAEEEC] text-xs text-[#64716A] space-y-1">
          <div className="font-medium text-[#37433D]">Country Elevator Facility</div>
          <div>Base Unit: Integer kg · WAL Mode</div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[80vw] bg-white h-full flex flex-col border-r border-[#DDE2DF] z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#EAEEEC]">
              <span className="font-display text-base font-bold tracking-tight text-[#143A2B]">
                GrainLedger ERP
              </span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-[#5C6962] hover:text-[#17201B]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderNavigation(() => setMobileMenuOpen(false))}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Contextual Top Bar */}
        <header className="sticky top-0 z-30 h-14 bg-white border-b border-[#DDE2DF] px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-[#37433D] hover:bg-[#F1F3F2] rounded-md"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs sm:text-sm font-medium text-[#5C6962] truncate">
              {currentNav.breadcrumb}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <FiscalPeriodChip />
            <button
              type="button"
              onClick={resetDemoState}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#37433D] bg-white hover:bg-[#F3F5F4] border border-[#DDE2DF] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Reset Data
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto space-y-5">
          {/* Notification Banner */}
          {notification && (
            <div
              role="status"
              className={`flex items-start justify-between gap-3 px-4 py-3 rounded-lg border text-sm ${
                notification.kind === 'success'
                  ? 'bg-[#F2F8F4] border-[#BBD9C6] text-[#143A2B]'
                  : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {notification.kind === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#15803D]" aria-hidden="true" />
                ) : (
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#DC2626]" aria-hidden="true" />
                )}
                <div>
                  <div className="font-semibold">{notification.title}</div>
                  <div className="text-xs mt-0.5 opacity-90">{notification.detail}</div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={dismissNotification}
                className="p-1 hover:opacity-70 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Page Header */}
          <div className="pb-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#17201B]">
              {currentNav.label}
            </h1>
            <p className="text-sm text-[#5C6962] mt-1">{currentNav.subtitle}</p>
          </div>

          {/* Active Workspace Module */}
          {activeSection === 'weighbridge' && <WeighbridgeIntakeView />}
          {activeSection === 'settlements' && <GrowerSettlementView />}
          {activeSection === 'silos' && <SiloInventoryView />}
          {activeSection === 'exposure' && <UnpricedExposureView />}
          {activeSection === 'sales' && <AgronomicSalesDispatchView />}
          {activeSection === 'ledger' && <LedgerAndTransitionView />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErpProvider>
      <WorkspaceShell />
    </ErpProvider>
  );
}
