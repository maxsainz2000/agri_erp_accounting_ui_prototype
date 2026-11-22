import React, { useMemo, useState } from 'react';
import { Scale, ArrowRight, Check, Search } from 'lucide-react';
import { useErp } from '../../state/ErpStore';
import {
  GrainContractStatus,
  GrainPricingType,
  ScaleTicketStatus,
} from '../../domain/types';
import { evaluateScaleGrading } from '../../domain/grainGradingEngine';
import { generateScaleTicketIntakeLines } from '../../domain/ledgerPostingEngine';
import { formatBushels, formatCurrency, formatKg } from '../../domain/formatters';
import { DoubleEntryDistributionGrid } from '../shared/DoubleEntryDistributionGrid';

export function WeighbridgeIntakeView() {
  const {
    accounts,
    products,
    siloLots,
    growers,
    contracts,
    scaleTickets,
    recordStage1GrossWeight,
    commitStage2ScaleTicket,
  } = useErp();

  const grainProducts = useMemo(
    () => products.filter((p) => p.isGrainCommodity),
    [products]
  );

  const yardQueue = useMemo(
    () => scaleTickets.filter((t) => t.status === ScaleTicketStatus.GrossWeighed),
    [scaleTickets]
  );

  // Stage 1 Form State
  const [stage1GrowerId, setStage1GrowerId] = useState<number>(growers[0]?.vendorId ?? 101);
  const [stage1TruckPlate, setStage1TruckPlate] = useState<string>('IA-519-CRN');
  const [stage1CommodityId, setStage1CommodityId] = useState<number>(1);
  const [stage1SiloLotId, setStage1SiloLotId] = useState<number>(4);
  const [stage1GrossKg, setStage1GrossKg] = useState<string>('38200');
  const [stage1PricingType, setStage1PricingType] = useState<GrainPricingType>(
    GrainPricingType.ContractFixed
  );
  const [stage1Error, setStage1Error] = useState<string | null>(null);

  // Stage 2 Selected Ticket & Form State
  const [selectedTicketId, setSelectedTicketId] = useState<number>(
    yardQueue[0]?.ticketId ?? 0
  );
  const activeStage2Ticket = useMemo(
    () => yardQueue.find((t) => t.ticketId === selectedTicketId) ?? yardQueue[0] ?? null,
    [yardQueue, selectedTicketId]
  );

  const [tareKgInput, setTareKgInput] = useState<string>('14200');
  const [moistureInput, setMoistureInput] = useState<string>('15.5');
  const [foreignMatterInput, setForeignMatterInput] = useState<string>('1.8');
  const [sampleJarRef, setSampleJarRef] = useState<string>('JAR-2026-104');
  const [stage2PricingType, setStage2PricingType] = useState<GrainPricingType>(
    GrainPricingType.ContractFixed
  );
  const [stage2ContractId, setStage2ContractId] = useState<string>('1');
  const [stage2Error, setStage2Error] = useState<string | null>(null);

  // Recent tickets filter
  const [ticketQuery, setTicketQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'All' | ScaleTicketStatus>('All');

  // Matching silos for Stage 1 commodity
  const matchingStage1Silos = useMemo(
    () => siloLots.filter((s) => s.commodityProductId === stage1CommodityId && s.isActive),
    [siloLots, stage1CommodityId]
  );

  const handleStage1CommodityChange = (commodityId: number) => {
    setStage1CommodityId(commodityId);
    const firstLot = siloLots.find((l) => l.commodityProductId === commodityId && l.isActive);
    if (firstLot) setStage1SiloLotId(firstLot.lotId);
  };

  const handleSimulateScaleDeckGross = () => {
    // Realistic 5 kg / 10 kg scale indicator readout
    const simulated = 35400 + Math.floor(Math.random() * 480) * 10;
    setStage1GrossKg(String(simulated));
  };

  const handleSimulateScaleDeckTare = () => {
    const simulated = 13800 + Math.floor(Math.random() * 90) * 10;
    setTareKgInput(String(simulated));
  };

  const handleStage1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setStage1Error(null);
    const parsedGross = Number(stage1GrossKg);
    const growerContracts = contracts.filter(
      (c) =>
        c.growerId === stage1GrowerId &&
        c.commodityProductId === stage1CommodityId &&
        c.status === GrainContractStatus.Active
    );

    const res = recordStage1GrossWeight({
      growerId: stage1GrowerId,
      truckPlate: stage1TruckPlate,
      grossWeightKg: parsedGross,
      commodityProductId: stage1CommodityId,
      targetSiloBinLotId: stage1SiloLotId,
      pricingType: stage1PricingType,
      associatedContractId: growerContracts[0]?.contractId ?? null,
    });

    if (!res.ok) {
      setStage1Error(res.error ?? 'Failed to record gross weight.');
      return;
    }

    setStage1TruckPlate('');
  };

  const stage2Product = useMemo(
    () =>
      activeStage2Ticket
        ? products.find((p) => p.productId === activeStage2Ticket.commodityProductId) ?? null
        : null,
    [activeStage2Ticket, products]
  );

  const stage2Silo = useMemo(
    () =>
      activeStage2Ticket
        ? siloLots.find((s) => s.lotId === activeStage2Ticket.targetSiloBinLotId) ?? null
        : null,
    [activeStage2Ticket, siloLots]
  );

  const stage2Grower = useMemo(
    () =>
      activeStage2Ticket
        ? growers.find((g) => g.vendorId === activeStage2Ticket.growerId) ?? null
        : null,
    [activeStage2Ticket, growers]
  );

  const stage2GrowerContracts = useMemo(() => {
    if (!activeStage2Ticket) return [];
    return contracts.filter(
      (c) =>
        c.growerId === activeStage2Ticket.growerId &&
        c.commodityProductId === activeStage2Ticket.commodityProductId &&
        c.status === GrainContractStatus.Active
    );
  }, [activeStage2Ticket, contracts]);

  // Live Grading Calculation Preview
  const gradingPreview = useMemo(() => {
    if (!activeStage2Ticket || !stage2Product) return null;
    const tare = Number(tareKgInput);
    const fm = Number(foreignMatterInput);
    if (!Number.isInteger(tare) || tare <= 0 || tare >= activeStage2Ticket.grossWeightKg) {
      return null;
    }
    if (isNaN(fm) || fm < 0 || fm > 100) return null;
    try {
      return evaluateScaleGrading({
        grossWeightKg: activeStage2Ticket.grossWeightKg,
        tareWeightKg: tare,
        foreignMatterPct: fm,
        provisionalUnitPrice: stage2Product.currentCashBenchmarkPrice,
        bushelWeightKg: stage2Product.standardBushelWeightKg,
      });
    } catch {
      return null;
    }
  }, [activeStage2Ticket, stage2Product, tareKgInput, foreignMatterInput]);

  const previewJournalLines = useMemo(() => {
    if (!activeStage2Ticket || !stage2Product || !gradingPreview) return [];
    return generateScaleTicketIntakeLines(
      accounts,
      activeStage2Ticket.ticketNumber,
      stage2Product.name,
      gradingPreview.netCleanKg,
      stage2Product.currentCashBenchmarkPrice
    );
  }, [accounts, activeStage2Ticket, stage2Product, gradingPreview]);

  const handleStage2Commit = (e: React.FormEvent) => {
    e.preventDefault();
    setStage2Error(null);
    if (!activeStage2Ticket) return;

    const parsedTare = Number(tareKgInput);
    const parsedMoisture = Number(moistureInput);
    const parsedFm = Number(foreignMatterInput);

    const res = commitStage2ScaleTicket({
      ticketId: activeStage2Ticket.ticketId,
      tareWeightKg: parsedTare,
      moisturePct: parsedMoisture,
      foreignMatterPct: parsedFm,
      sampleJarRef,
      pricingType: stage2PricingType,
      associatedContractId: stage2ContractId ? Number(stage2ContractId) : null,
    });

    if (!res.ok) {
      setStage2Error(res.error ?? 'Could not commit scale ticket.');
    }
  };

  const filteredTickets = useMemo(() => {
    return scaleTickets.filter((t) => {
      if (statusFilter !== 'All' && t.status !== statusFilter) return false;
      if (!ticketQuery.trim()) return true;
      const q = ticketQuery.toLowerCase();
      const grower = growers.find((g) => g.vendorId === t.growerId);
      const prod = products.find((p) => p.productId === t.commodityProductId);
      return (
        t.ticketNumber.toLowerCase().includes(q) ||
        t.truckPlate.toLowerCase().includes(q) ||
        (t.sampleJarRef ?? '').toLowerCase().includes(q) ||
        (grower?.name.toLowerCase().includes(q) ?? false) ||
        (prod?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [scaleTickets, statusFilter, ticketQuery, growers, products]);

  const todayReceivedKg = useMemo(
    () =>
      scaleTickets
        .filter((t) => t.status !== ScaleTicketStatus.GrossWeighed && t.status !== ScaleTicketStatus.Voided)
        .reduce((sum, t) => sum + (t.netCleanKg ?? 0), 0),
    [scaleTickets]
  );

  const pendingAccrualTotal = useMemo(
    () =>
      scaleTickets
        .filter((t) => t.status === ScaleTicketStatus.PendingSettlement)
        .reduce((sum, t) => sum + t.provisionalTotalAmount, 0),
    [scaleTickets]
  );

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#DDE2DF] rounded-lg px-4 py-3.5">
          <div className="text-xs text-[#5C6962]">Trucks in Yard / Dump Pit</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#17201B]">
              {yardQueue.length}
            </span>
            <span className="text-xs text-[#64716A]">awaiting tare &amp; grade</span>
          </div>
        </div>
        <div className="bg-white border border-[#DDE2DF] rounded-lg px-4 py-3.5">
          <div className="text-xs text-[#5C6962]">Posted Clean Grain Intake</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#17201B]">
              {todayReceivedKg.toLocaleString()}
            </span>
            <span className="text-xs text-[#64716A]">integer kg</span>
          </div>
        </div>
        <div className="bg-white border border-[#DDE2DF] rounded-lg px-4 py-3.5">
          <div className="text-xs text-[#5C6962]">Accrued Intake (GL 2110)</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#17201B]">
              {formatCurrency(pendingAccrualTotal)}
            </span>
          </div>
        </div>
        <div className="bg-white border border-[#DDE2DF] rounded-lg px-4 py-3.5">
          <div className="text-xs text-[#5C6962]">Corn Benchmark Cash Bid</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#143A2B]">
              {formatCurrency(grainProducts[0]?.currentCashBenchmarkPrice ?? 0.2, 4)}
            </span>
            <span className="text-xs text-[#64716A]">/ kg · $5.08/bu</span>
          </div>
        </div>
      </div>

      {/* Main Two-Stage Scale Desk Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Stage 1 Gross Weight + Yard Queue */}
        <div className="xl:col-span-5 space-y-6">
          <section aria-label="Stage 1 Gross Weighing" className="bg-white border border-[#DDE2DF] rounded-lg">
            <div className="px-4 py-3 border-b border-[#EAEEEC] flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#17201B]">
                  Stage 1 · Inbound Gross Weighing
                </h2>
                <p className="text-xs text-[#5C6962] mt-0.5">
                  Persists truck entry immediately before pit dump.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSimulateScaleDeckGross}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#143A2B] bg-[#F1F5F3] hover:bg-[#E4ECE7] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5" aria-hidden="true" />
                Read Scale Deck
              </button>
            </div>

            <form onSubmit={handleStage1Submit} className="p-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="s1-grower" className="block text-xs font-medium text-[#37433D] mb-1">
                    Producer / Grower
                  </label>
                  <select
                    id="s1-grower"
                    value={stage1GrowerId}
                    onChange={(e) => setStage1GrowerId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  >
                    {growers.map((g) => (
                      <option key={g.vendorId} value={g.vendorId}>
                        {g.name} ({g.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="s1-plate" className="block text-xs font-medium text-[#37433D] mb-1">
                    Truck License Plate
                  </label>
                  <input
                    id="s1-plate"
                    type="text"
                    value={stage1TruckPlate}
                    onChange={(e) => setStage1TruckPlate(e.target.value)}
                    placeholder="e.g. IA-884-KRN"
                    className="w-full px-3 py-2 text-sm font-mono uppercase bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="s1-commodity" className="block text-xs font-medium text-[#37433D] mb-1">
                    Bulk Grain Commodity
                  </label>
                  <select
                    id="s1-commodity"
                    value={stage1CommodityId}
                    onChange={(e) => handleStage1CommodityChange(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  >
                    {grainProducts.map((p) => (
                      <option key={p.productId} value={p.productId}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="s1-silo" className="block text-xs font-medium text-[#37433D] mb-1">
                    Destination Silo Bin
                  </label>
                  <select
                    id="s1-silo"
                    value={stage1SiloLotId}
                    onChange={(e) => setStage1SiloLotId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  >
                    {matchingStage1Silos.map((lot) => (
                      <option key={lot.lotId} value={lot.lotId}>
                        {lot.siloIdentifier} · {(lot.capacityKg - lot.currentQtyKg).toLocaleString()} kg free
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="s1-gross" className="block text-xs font-medium text-[#37433D] mb-1">
                    Gross Weight (Integer kg)
                  </label>
                  <input
                    id="s1-gross"
                    type="number"
                    step="1"
                    min="1000"
                    value={stage1GrossKg}
                    onChange={(e) => setStage1GrossKg(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  />
                </div>

                <div>
                  <label htmlFor="s1-pricing" className="block text-xs font-medium text-[#37433D] mb-1">
                    Initial Pricing Intent
                  </label>
                  <select
                    id="s1-pricing"
                    value={stage1PricingType}
                    onChange={(e) => setStage1PricingType(e.target.value as GrainPricingType)}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                  >
                    <option value={GrainPricingType.ContractFixed}>Contract Fixed</option>
                    <option value={GrainPricingType.SpotCash}>Spot Cash</option>
                    <option value={GrainPricingType.DelayedPrice}>Delayed Price (DP)</option>
                  </select>
                </div>
              </div>

              {stage1Error && (
                <p role="alert" className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
                  {stage1Error}
                </p>
              )}

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#143A2B] hover:bg-[#1B4D39] rounded-md transition-colors cursor-pointer"
              >
                Save Stage 1 Gross Ticket
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </form>
          </section>

          {/* Active Yard Queue */}
          <section aria-label="Yard Queue Awaiting Tare" className="bg-white border border-[#DDE2DF] rounded-lg">
            <div className="px-4 py-3 border-b border-[#EAEEEC] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#17201B]">
                Active Yard &amp; Dump Pit Queue
              </h2>
              <span className="text-xs font-mono text-[#5C6962] tabular-nums">
                {yardQueue.length} open
              </span>
            </div>

            {yardQueue.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#5C6962]">
                No trucks currently in the dump pit. Record a Stage 1 Gross Weight above.
              </div>
            ) : (
              <ul className="divide-y divide-[#EAEEEC]">
                {yardQueue.map((ticket) => {
                  const grower = growers.find((g) => g.vendorId === ticket.growerId);
                  const prod = products.find((p) => p.productId === ticket.commodityProductId);
                  const lot = siloLots.find((s) => s.lotId === ticket.targetSiloBinLotId);
                  const isSelected = activeStage2Ticket?.ticketId === ticket.ticketId;

                  return (
                    <li key={ticket.ticketId}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTicketId(ticket.ticketId);
                          setStage2PricingType(ticket.pricingType);
                          setStage2ContractId(ticket.associatedContractId ? String(ticket.associatedContractId) : '');
                          setStage2Error(null);
                        }}
                        className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#EEF4F1]'
                            : 'bg-white hover:bg-[#FAFBFB]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-[#143A2B]">
                            {ticket.ticketNumber}
                          </span>
                          <span className="font-mono text-xs font-semibold text-[#17201B] tabular-nums">
                            Gross {formatKg(ticket.grossWeightKg)}
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-medium text-[#17201B]">
                          {grower?.name} · {ticket.truckPlate}
                        </div>
                        <div className="mt-0.5 text-xs text-[#5C6962]">
                          {prod?.name} · {lot?.siloIdentifier} · {ticket.pricingType}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Right Column: Stage 2 Tare, Probe Grading, Live Math & GL Preview */}
        <div className="xl:col-span-7 space-y-6">
          <section aria-label="Stage 2 Tare and Probe Grading" className="bg-white border border-[#DDE2DF] rounded-lg">
            <div className="px-4 py-3 border-b border-[#EAEEEC] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[#17201B]">
                  Stage 2 · Tare Weighing, Probe Grading &amp; Provisional Commit
                </h2>
                <p className="text-xs text-[#5C6962] mt-0.5">
                  Half-up integer dockage with atomic GL 1300 / 2110 posting.
                </p>
              </div>
              {activeStage2Ticket && (
                <button
                  type="button"
                  onClick={handleSimulateScaleDeckTare}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#143A2B] bg-[#F1F5F3] hover:bg-[#E4ECE7] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Scale className="w-3.5 h-3.5" aria-hidden="true" />
                  Read Tare Deck
                </button>
              )}
            </div>

            {!activeStage2Ticket ? (
              <div className="p-8 text-center text-sm text-[#5C6962]">
                Select a GrossWeighed ticket from the Yard Queue or weigh a new inbound truck in Stage 1.
              </div>
            ) : (
              <form onSubmit={handleStage2Commit} className="p-4 space-y-4">
                {/* Active Ticket Context Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-[#FAFBFB] border border-[#EAEEEC] rounded-md text-xs">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[#37433D]">
                    <span className="font-mono font-semibold text-[#17201B]">
                      {activeStage2Ticket.ticketNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{stage2Grower?.name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{activeStage2Ticket.truckPlate}</span>
                    <span aria-hidden="true">·</span>
                    <span>{stage2Product?.name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{stage2Silo?.siloIdentifier}</span>
                  </div>
                  <div className="font-mono font-semibold text-[#17201B] tabular-nums">
                    Gross: {formatKg(activeStage2Ticket.grossWeightKg)}
                  </div>
                </div>

                {/* Grading & Tare Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label htmlFor="s2-tare" className="block text-xs font-medium text-[#37433D] mb-1">
                      Tare Weight (kg)
                    </label>
                    <input
                      id="s2-tare"
                      type="number"
                      step="1"
                      min="1000"
                      value={tareKgInput}
                      onChange={(e) => setTareKgInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                    />
                  </div>

                  <div>
                    <label htmlFor="s2-moisture" className="block text-xs font-medium text-[#37433D] mb-1">
                      Moisture %
                    </label>
                    <input
                      id="s2-moisture"
                      type="number"
                      step="0.01"
                      min="0"
                      max="40"
                      value={moistureInput}
                      onChange={(e) => setMoistureInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                    />
                  </div>

                  <div>
                    <label htmlFor="s2-fm" className="block text-xs font-medium text-[#37433D] mb-1">
                      Foreign Matter %
                    </label>
                    <input
                      id="s2-fm"
                      type="number"
                      step="0.01"
                      min="0"
                      max="25"
                      value={foreignMatterInput}
                      onChange={(e) => setForeignMatterInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                    />
                  </div>

                  <div>
                    <label htmlFor="s2-jar" className="block text-xs font-medium text-[#37433D] mb-1">
                      Probe Sample Jar Ref
                    </label>
                    <input
                      id="s2-jar"
                      type="text"
                      value={sampleJarRef}
                      onChange={(e) => setSampleJarRef(e.target.value)}
                      placeholder="JAR-2026-104"
                      className="w-full px-3 py-2 text-sm font-mono uppercase bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="s2-pricing" className="block text-xs font-medium text-[#37433D] mb-1">
                      Settlement Pricing Type
                    </label>
                    <select
                      id="s2-pricing"
                      value={stage2PricingType}
                      onChange={(e) => setStage2PricingType(e.target.value as GrainPricingType)}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                    >
                      <option value={GrainPricingType.ContractFixed}>Contract Fixed</option>
                      <option value={GrainPricingType.SpotCash}>Spot Cash</option>
                      <option value={GrainPricingType.DelayedPrice}>Delayed Price (DP · 90-Day Window)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="s2-contract" className="block text-xs font-medium text-[#37433D] mb-1">
                      Linked Forward Contract (Optional)
                    </label>
                    <select
                      id="s2-contract"
                      value={stage2ContractId}
                      onChange={(e) => setStage2ContractId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B]"
                    >
                      <option value="">No linked contract</option>
                      {stage2GrowerContracts.map((c) => (
                        <option key={c.contractId} value={c.contractId}>
                          {c.contractNumber} ({c.contractType} · {(c.contractedQtyKg - c.deliveredQtyKg).toLocaleString()} kg rem @ {formatCurrency(c.basePricePerKg, 4)})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Live Computed Scale Readout (Integer kg + Virtual Bushel Equivalent) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div className="px-3 py-2.5 rounded-md bg-[#F6F8F7] border border-[#E2E6E3]">
                    <div className="text-xs text-[#5C6962]">Gross Inbound</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-[#17201B] tabular-nums">
                      {gradingPreview ? formatKg(gradingPreview.grossInboundKg) : '—'}
                    </div>
                  </div>
                  <div className="px-3 py-2.5 rounded-md bg-[#F6F8F7] border border-[#E2E6E3]">
                    <div className="text-xs text-[#5C6962]">Dockage (Half-Up)</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-[#B45309] tabular-nums">
                      {gradingPreview ? `-${formatKg(gradingPreview.dockageKg)}` : '—'}
                    </div>
                  </div>
                  <div className="px-3 py-2.5 rounded-md bg-[#EEF4F1] border border-[#C6D8CE]">
                    <div className="text-xs text-[#143A2B] font-medium">Net Clean Weight</div>
                    <div className="mt-0.5 font-mono text-base font-semibold text-[#143A2B] tabular-nums">
                      {gradingPreview ? formatKg(gradingPreview.netCleanKg) : '—'}
                    </div>
                    <div className="text-[11px] font-mono text-[#3E5C4E] tabular-nums">
                      {gradingPreview ? formatBushels(gradingPreview.bushelEquivalent) : '—'}
                    </div>
                  </div>
                  <div className="px-3 py-2.5 rounded-md bg-[#F6F8F7] border border-[#E2E6E3]">
                    <div className="text-xs text-[#5C6962]">Provisional Value</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-[#17201B] tabular-nums">
                      {gradingPreview ? formatCurrency(gradingPreview.provisionalTotalAmount) : '—'}
                    </div>
                    <div className="text-[11px] font-mono text-[#64716A] tabular-nums">
                      @ {formatCurrency(stage2Product?.currentCashBenchmarkPrice ?? 0, 4)}/kg
                    </div>
                  </div>
                </div>

                {stage2Error && (
                  <p role="alert" className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
                    {stage2Error}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="text-xs text-[#5C6962] font-mono tabular-nums">
                    {gradingPreview
                      ? `Mass Invariant: ${gradingPreview.dockageKg.toLocaleString()} + ${gradingPreview.netCleanKg.toLocaleString()} = ${gradingPreview.grossInboundKg.toLocaleString()} kg`
                      : 'Enter valid tare weight to verify mass invariant'}
                  </div>
                  <button
                    type="submit"
                    disabled={!gradingPreview}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#143A2B] hover:bg-[#1B4D39] disabled:opacity-45 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Check className="w-4 h-4" aria-hidden="true" />
                    Commit Scale Ticket &amp; Post GL
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* Rule 11 Live Double-Entry Preview */}
          <DoubleEntryDistributionGrid
            title="Rule 11 · Provisional Grain Intake Journal Preview"
            lines={previewJournalLines}
            emptyMessage="Enter Stage 2 tare weight and grading metrics to preview the GL 1300 / 2110 journal entry."
          />
        </div>
      </div>

      {/* Recent Scale Tickets Register */}
      <section aria-label="Scale Ticket Register" className="bg-white border border-[#DDE2DF] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EAEEEC] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#17201B]">Weighbridge Scale Ticket Register</h2>
            <p className="text-xs text-[#5C6962]">
              Granular origin records preserving grower, field, plate, and sample jar reference.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#64716A] absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search scale tickets"
                value={ticketQuery}
                onChange={(e) => setTicketQuery(e.target.value)}
                placeholder="Search ticket, plate, jar..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-[#D2D8D5] rounded-md focus:outline-none focus:border-[#143A2B] w-52"
              />
            </div>

            <div className="flex items-center gap-1 p-0.5 bg-[#F1F3F2] rounded-md">
              {(['All', ScaleTicketStatus.GrossWeighed, ScaleTicketStatus.PendingSettlement, ScaleTicketStatus.Settled] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      statusFilter === st
                        ? 'bg-white text-[#17201B] shadow-xs'
                        : 'text-[#5C6962] hover:text-[#17201B]'
                    }`}
                  >
                    {st === 'PendingSettlement'
                      ? 'Pending Settlement'
                      : st === 'GrossWeighed'
                        ? 'Yard Queue'
                        : st}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#EAEEEC] bg-[#FAFBFB] text-xs font-medium text-[#5C6962]">
                <th className="py-2.5 px-4">Ticket</th>
                <th className="py-2.5 px-4">Producer &amp; Plate</th>
                <th className="py-2.5 px-4">Commodity &amp; Silo</th>
                <th className="py-2.5 px-4">Pricing &amp; Jar</th>
                <th className="py-2.5 px-4 text-right">Moisture / FM</th>
                <th className="py-2.5 px-4 text-right">Net Clean Kg</th>
                <th className="py-2.5 px-4 text-right">Provisional Value</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F3F1] text-sm">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 px-4 text-center text-sm text-[#5C6962]">
                    No scale tickets match the current filter.
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => {
                  const grower = growers.find((g) => g.vendorId === ticket.growerId);
                  const prod = products.find((p) => p.productId === ticket.commodityProductId);
                  const lot = siloLots.find((s) => s.lotId === ticket.targetSiloBinLotId);

                  return (
                    <tr key={ticket.ticketId} className="hover:bg-[#FAFBFB]">
                      <td className="py-2.5 px-4 font-mono text-xs font-medium text-[#17201B] whitespace-nowrap">
                        <div>{ticket.ticketNumber}</div>
                        <div className="text-[11px] text-[#64716A] font-normal">{ticket.receiptDate}</div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-[#17201B]">{grower?.name}</div>
                        <div className="text-xs text-[#64716A] font-mono">
                          {ticket.truckPlate} · Field #{ticket.farmFieldId}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="text-[#17201B]">{prod?.name}</div>
                        <div className="text-xs text-[#64716A] font-mono">{lot?.siloIdentifier}</div>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-[#37433D]">
                        <div>{ticket.pricingType}</div>
                        <div className="font-mono text-[#64716A]">{ticket.sampleJarRef ?? 'Pending probe'}</div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs text-[#37433D] tabular-nums whitespace-nowrap">
                        {ticket.status === ScaleTicketStatus.GrossWeighed
                          ? '—'
                          : `${ticket.moisturePct.toFixed(1)}% / ${ticket.foreignMatterPct.toFixed(1)}%`}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold text-[#17201B] tabular-nums whitespace-nowrap">
                        {formatKg(ticket.netCleanKg)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs text-[#17201B] tabular-nums whitespace-nowrap">
                        {ticket.provisionalTotalAmount > 0
                          ? formatCurrency(ticket.provisionalTotalAmount)
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-xs font-medium whitespace-nowrap">
                        <span
                          className={
                            ticket.status === ScaleTicketStatus.Settled
                              ? 'text-[#166534]'
                              : ticket.status === ScaleTicketStatus.PendingSettlement
                                ? 'text-[#B45309]'
                                : 'text-[#1D4ED8]'
                          }
                        >
                          {ticket.status === ScaleTicketStatus.PendingSettlement
                            ? 'Pending Settlement'
                            : ticket.status === ScaleTicketStatus.GrossWeighed
                              ? 'Gross Weighed'
                              : ticket.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
