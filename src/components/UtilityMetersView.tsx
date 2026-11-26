import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Gauge,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteUtilityMeter,
  deleteUtilityReading,
  saveUtilityMeter,
  seedDefaultMetersForBuilding,
  submitUtilityReading,
  updateUtilityReading,
} from '../lib/dataService';
import { SpellCheckInput } from './SpellCheckField';
import { exportUtilityReportWorkbook } from '../lib/excelUtils';
import {
  buildUtilityMeterSeries,
  computeUtilityAlerts,
  round2,
} from '../lib/operationsAnalytics';
import {
  Building,
  DEFAULT_METER_UNITS,
  METER_TYPES,
  Technician,
  UserRole,
  UtilityMeter,
  UtilityMeterType,
  UtilityReading,
} from '../types';

interface UtilityMetersViewProps {
  buildings: Building[];
  utilityMeters: UtilityMeter[];
  utilityReadings: UtilityReading[];
  technicians?: Technician[];
  user: { uid: string; name: string; email: string; role: UserRole };
  isEffectiveOnline: boolean;
  onToast: (msg: string) => void;
}

type UtilitySubTab = 'readings' | 'summary' | 'alerts' | 'registry';

export const UtilityMetersView: React.FC<UtilityMetersViewProps> = ({
  buildings,
  utilityMeters,
  utilityReadings,
  technicians = [],
  user,
  isEffectiveOnline,
  onToast,
}) => {
  const today = new Date().toISOString().slice(0, 10);

  const [subTab, setSubTab] = useState<UtilitySubTab>('readings');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | UtilityMeterType>('all');
  const [search, setSearch] = useState('');
  const [spikeMultiplier, setSpikeMultiplier] = useState(2.5);

  // Reading Entry / Edit Modal
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingReading, setEditingReading] = useState<UtilityReading | null>(null);
  const [entryBuildingId, setEntryBuildingId] = useState(buildings[0]?.id || '');
  const [entryMeterId, setEntryMeterId] = useState('');
  const [readingDate, setReadingDate] = useState(today);
  const [readingValue, setReadingValue] = useState('');
  const [readingNotes, setReadingNotes] = useState('');
  const [readingTechId, setReadingTechId] = useState('self');
  const [savingReading, setSavingReading] = useState(false);
  const [readingError, setReadingError] = useState<string | null>(null);

  // Meter Registry Modal (Supervisor)
  const [meterModalOpen, setMeterModalOpen] = useState(false);
  const [editingMeter, setEditingMeter] = useState<UtilityMeter | null>(null);
  const [meterBuildingId, setMeterBuildingId] = useState(buildings[0]?.id || '');
  const [meterType, setMeterType] = useState<UtilityMeterType>('Electricity');
  const [meterArea, setMeterArea] = useState('');
  const [meterNo, setMeterNo] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [meterUnit, setMeterUnit] = useState('kWh');
  const [meterStatus, setMeterStatus] = useState<'active' | 'inactive'>('active');
  const [savingMeter, setSavingMeter] = useState(false);
  const [meterError, setMeterError] = useState<string | null>(null);
  const [seedingBuildingId, setSeedingBuildingId] = useState<string | null>(null);

  const [confirmDeleteReadingId, setConfirmDeleteReadingId] = useState<string | null>(null);
  const [confirmDeleteMeterId, setConfirmDeleteMeterId] = useState<string | null>(null);

  const isSupervisor = user.role === 'supervisor' || user.role === 'admin';

  const metersInSelectedEntryBuilding = useMemo(
    () =>
      utilityMeters.filter(
        (m) =>
          m.buildingId === entryBuildingId &&
          (m.status === 'active' || m.id === editingReading?.meterId)
      ),
    [utilityMeters, entryBuildingId, editingReading]
  );

  const selectedEntryMeter = useMemo(
    () => metersInSelectedEntryBuilding.find((m) => m.id === entryMeterId) || null,
    [metersInSelectedEntryBuilding, entryMeterId]
  );

  const previousReadingForSelectedMeter = useMemo(() => {
    if (!selectedEntryMeter) return null;
    const prior = utilityReadings
      .filter(
        (r) =>
          r.meterId === selectedEntryMeter.id &&
          r.readingDate <= readingDate &&
          r.id !== editingReading?.id
      )
      .sort((a, b) => b.readingDate.localeCompare(a.readingDate) || b.id.localeCompare(a.id));
    return prior[0] || null;
  }, [utilityReadings, selectedEntryMeter, readingDate, editingReading]);

  const parsedNewVal = readingValue.trim() === '' ? null : Number(readingValue);
  const estimatedDelta =
    parsedNewVal !== null &&
    Number.isFinite(parsedNewVal) &&
    previousReadingForSelectedMeter
      ? round2(parsedNewVal - previousReadingForSelectedMeter.readingValue)
      : null;

  const filteredMeters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return utilityMeters.filter((m) => {
      if (typeFilter !== 'all' && m.meterType !== typeFilter) return false;
      if (q) {
        const hay = `${m.buildingCode} ${m.meterType} ${m.area} ${m.meterNo} ${m.accountNo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [utilityMeters, typeFilter, search]);

  const meterSeries = useMemo(() => {
    const all = buildUtilityMeterSeries(
      utilityReadings,
      filteredMeters,
      dateFrom || undefined,
      dateTo || undefined
    );
    return typeFilter === 'all' ? all : all.filter((s) => s.meterType === typeFilter);
  }, [utilityReadings, filteredMeters, dateFrom, dateTo, typeFilter]);

  const alerts = useMemo(
    () =>
      computeUtilityAlerts(
        utilityReadings,
        filteredMeters,
        spikeMultiplier,
        dateFrom || undefined,
        dateTo || undefined
      ),
    [utilityReadings, filteredMeters, spikeMultiplier, dateFrom, dateTo]
  );

  const flattenedReadings = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows: {
      readingId: string;
      date: string;
      buildingCode: string;
      meterType: string;
      area: string;
      meterNo: string;
      unit: string;
      readingValue: number;
      previousValue: number | null;
      previousDate: string | null;
      daysGap: number;
      consumption: number | null;
      enteredBy: string;
      notes: string;
    }[] = [];

    for (const s of meterSeries) {
      for (const st of s.steps) {
        if (q) {
          const hay = `${s.buildingCode} ${s.meterType} ${s.area} ${s.meterNo} ${st.enteredBy} ${st.notes}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        rows.push({
          readingId: st.readingId,
          date: st.date,
          buildingCode: s.buildingCode,
          meterType: s.meterType,
          area: s.area,
          meterNo: s.meterNo,
          unit: s.unit,
          readingValue: st.readingValue,
          previousValue: st.previousValue,
          previousDate: st.previousDate,
          daysGap: st.daysGap,
          consumption: st.consumption,
          enteredBy: st.enteredBy,
          notes: st.notes,
        });
      }
    }

    return rows.sort((a, b) => b.date.localeCompare(a.date) || a.buildingCode.localeCompare(b.buildingCode));
  }, [meterSeries, search]);

  const openReadingModal = (existing?: UtilityReading) => {
    if (existing) {
      setEditingReading(existing);
      setEntryBuildingId(existing.buildingId);
      setEntryMeterId(existing.meterId);
      setReadingDate(existing.readingDate);
      setReadingValue(String(existing.readingValue));
      setReadingNotes(existing.notes || '');
    } else {
      setEditingReading(null);
      const defaultBId = buildings[0]?.id || '';
      const firstActiveMeter = utilityMeters.find(
        (m) => m.buildingId === defaultBId && m.status === 'active'
      );
      setEntryBuildingId(defaultBId);
      setEntryMeterId(firstActiveMeter?.id || '');
      setReadingDate(today);
      setReadingValue('');
      setReadingNotes('');
      setReadingTechId('self');
    }
    setReadingError(null);
    setEntryModalOpen(true);
  };

  const openMeterModal = (meter?: UtilityMeter) => {
    if (meter) {
      setEditingMeter(meter);
      setMeterBuildingId(meter.buildingId);
      setMeterType(meter.meterType);
      setMeterArea(meter.area);
      setMeterNo(meter.meterNo);
      setAccountNo(meter.accountNo);
      setMeterUnit(meter.unit);
      setMeterStatus(meter.status);
    } else {
      setEditingMeter(null);
      setMeterBuildingId(buildings[0]?.id || '');
      setMeterType('Electricity');
      setMeterArea('');
      setMeterNo('');
      setAccountNo('');
      setMeterUnit(DEFAULT_METER_UNITS.Electricity);
      setMeterStatus('active');
    }
    setMeterError(null);
    setMeterModalOpen(true);
  };

  const handleSaveReading = async (e: React.FormEvent) => {
    e.preventDefault();
    const b = buildings.find((item) => item.id === entryBuildingId);
    if (!b || !selectedEntryMeter) {
      setReadingError('Select a building and an active utility meter.');
      return;
    }
    const numVal = Number(readingValue);
    if (readingValue.trim() === '' || !Number.isFinite(numVal) || numVal < 0) {
      setReadingError('Enter a valid non-negative meter reading.');
      return;
    }

    setSavingReading(true);
    setReadingError(null);
    try {
      if (editingReading) {
        await updateUtilityReading(editingReading.id, {
          readingDate,
          readingValue: numVal,
          notes: readingNotes,
        });
        setEntryModalOpen(false);
        setEditingReading(null);
        onToast('Utility meter reading updated.');
      } else {
        const selectedTech =
          isSupervisor && readingTechId !== 'self'
            ? technicians.find((t) => t.id === readingTechId) || null
            : null;
        const res = await submitUtilityReading(
          {
            building: b,
            meter: selectedEntryMeter,
            readingDate,
            readingValue: numVal,
            notes: readingNotes,
            forTechnician: selectedTech,
          },
          {
            uid: user.uid,
            name: user.name,
            email: user.email,
            isEffectiveOnline,
          }
        );
        setEntryModalOpen(false);
        onToast(
          res.offlineQueued
            ? 'Meter reading saved offline and queued for automatic sync.'
            : 'Utility meter reading logged.'
        );
      }
    } catch (err) {
      setReadingError(err instanceof Error ? err.message : 'Unable to save reading.');
    } finally {
      setSavingReading(false);
    }
  };

  const handleSaveMeter = async (e: React.FormEvent) => {
    e.preventDefault();
    const b = buildings.find((item) => item.id === meterBuildingId);
    if (!b) {
      setMeterError('Select a building.');
      return;
    }
    if (!meterArea.trim() || !meterNo.trim()) {
      setMeterError('Unit / Area and Meter Number are required.');
      return;
    }

    setSavingMeter(true);
    setMeterError(null);
    try {
      await saveUtilityMeter(
        {
          id: editingMeter?.id,
          building: b,
          meterType,
          area: meterArea,
          meterNo,
          accountNo,
          unit: meterUnit || DEFAULT_METER_UNITS[meterType],
          status: meterStatus,
        },
        { uid: user.uid, existing: editingMeter }
      );
      setMeterModalOpen(false);
      onToast(editingMeter ? 'Utility meter updated.' : 'Utility meter added.');
    } catch (err) {
      setMeterError(err instanceof Error ? err.message : 'Unable to save utility meter.');
    } finally {
      setSavingMeter(false);
    }
  };

  const handleSeedDefaultMeters = async (b: Building) => {
    setSeedingBuildingId(b.id);
    try {
      const count = await seedDefaultMetersForBuilding(b, user.uid);
      onToast(`Loaded ${count} standard Electricity & Water meters for ${b.code}.`);
    } finally {
      setSeedingBuildingId(null);
    }
  };

  const todayReadingsCount = utilityReadings.filter((r) => r.readingDate === today).length;
  const activeMetersCount = utilityMeters.filter((m) => m.status === 'active').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Utility Meter Readings &amp; Consumption
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Record daily Electricity, Water, Chilled Water &amp; Gas meter readings with live previous-reading comparison and anomaly detection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isSupervisor && (
            <button
              type="button"
              disabled={utilityReadings.length === 0}
              onClick={() =>
                exportUtilityReportWorkbook(utilityReadings, utilityMeters, {
                  buildingLabel:
                    buildings.length === 1
                      ? `${buildings[0].code} — ${buildings[0].name}`
                      : 'Filtered Buildings',
                  dateFrom,
                  dateTo,
                  generatedBy: `${user.name} (${user.email})`,
                })
              }
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
              Export Utility Report (.xlsx)
            </button>
          )}

          {isSupervisor && (
            <button
              type="button"
              disabled={buildings.length === 0}
              onClick={() => openMeterModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
              Add Meter
            </button>
          )}

          <button
            type="button"
            disabled={activeMetersCount === 0}
            onClick={() => openReadingModal()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-50 whitespace-nowrap transition-colors"
          >
            <Gauge className="w-4 h-4" />
            Log Meter Reading
          </button>
        </div>
      </div>

      {/* Prompt if no meters configured yet */}
      {utilityMeters.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              No utility meters configured yet
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {isSupervisor
                ? 'Add meters manually or load a standard Electricity & Water meter set for each active building.'
                : 'Ask your supervisor to register building utility meters before logging readings.'}
            </p>
          </div>
          {isSupervisor && buildings.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {buildings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled={seedingBuildingId === b.id}
                  onClick={() => handleSeedDefaultMeters(b)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60 whitespace-nowrap transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {seedingBuildingId === b.id
                    ? `Loading ${b.code}...`
                    : `Load Standard Meters (${b.code})`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Active Meters</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {activeMetersCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {todayReadingsCount} reading(s) today
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Readings in Period</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {flattenedReadings.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {dateFrom || 'Start'} to {dateTo || 'Latest'}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Electricity Total</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {round2(
              meterSeries
                .filter((s) => s.meterType === 'Electricity')
                .reduce((sum, s) => sum + s.totalConsumption, 0)
            ).toLocaleString()}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">kWh</span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Net metered consumption
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Water Total &amp; Alerts</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {round2(
              meterSeries
                .filter((s) => s.meterType === 'Water')
                .reduce((sum, s) => sum + s.totalConsumption, 0)
            ).toLocaleString()}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">m³</span>
          </p>
          <p
            className={`mt-0.5 text-[11px] font-medium ${
              alerts.length > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {alerts.length > 0 ? `${alerts.length} anomaly alert(s)` : 'No anomalies detected'}
          </p>
        </div>
      </div>

      {/* Sub-tabs & Filter Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 p-1">
            {(
              [
                { id: 'readings', label: `Daily Readings (${flattenedReadings.length})` },
                { id: 'summary', label: `Consumption Summary (${meterSeries.length})` },
                { id: 'alerts', label: `Anomalies (${alerts.length})` },
                ...(isSupervisor
                  ? [{ id: 'registry' as const, label: `Meter Registry (${utilityMeters.length})` }]
                  : []),
              ] as { id: UtilitySubTab; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  subTab === t.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From Date"
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
            <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To Date"
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | UtilityMeterType)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="all">All Utility Types</option>
              {METER_TYPES.map((mt) => (
                <option key={mt} value={mt}>
                  {mt}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search meter, area..."
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tab 1: Daily Readings */}
      {subTab === 'readings' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {flattenedReadings.length === 0 ? (
            <div className="p-10 text-center">
              <Gauge className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
              <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
                No meter readings in this date range
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Select Log Meter Reading to capture today&apos;s meter values.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Building &amp; Area</th>
                    <th className="py-3 px-4">Meter No</th>
                    <th className="py-3 px-4 text-right">Reading</th>
                    <th className="py-3 px-4 text-right">Previous</th>
                    <th className="py-3 px-4 text-right">Consumption</th>
                    <th className="py-3 px-4">Entered By</th>
                    <th className="py-3 px-4">Notes / Flag</th>
                    {isSupervisor && <th className="py-3 px-4 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {flattenedReadings.map((r) => (
                    <tr key={r.readingId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {r.date}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          <span className="font-mono text-brand-700 dark:text-brand-400 mr-1.5">
                            {r.buildingCode}
                          </span>
                          {r.area}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">{r.meterType}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {r.meterNo}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                        {r.readingValue.toLocaleString()} {r.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {r.previousValue != null ? r.previousValue.toLocaleString() : '-'}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                          r.consumption == null
                            ? 'text-slate-400 dark:text-slate-500'
                            : r.consumption < 0
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {r.consumption != null
                          ? `${r.consumption > 0 ? '+' : ''}${r.consumption.toLocaleString()} ${r.unit}`
                          : 'Baseline'}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {r.enteredBy}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 max-w-xs">
                        {r.consumption != null && r.consumption < 0 ? (
                          <span className="text-red-700 dark:text-red-400 font-medium">
                            Lower than previous reading
                          </span>
                        ) : r.daysGap > 1 ? (
                          <span className="text-amber-700 dark:text-amber-400">
                            {r.daysGap - 1}d gap · {r.notes || 'OK'}
                          </span>
                        ) : (
                          r.notes || '-'
                        )}
                      </td>
                      {isSupervisor && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {confirmDeleteReadingId === r.readingId ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteUtilityReading(r.readingId);
                                  setConfirmDeleteReadingId(null);
                                  onToast('Reading removed.');
                                }}
                                className="px-2 py-1 rounded bg-red-600 text-white text-[11px]"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteReadingId(null)}
                                className="px-1.5 text-[11px] text-slate-500 dark:text-slate-400"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const target = utilityReadings.find(
                                    (item) => item.id === r.readingId
                                  );
                                  if (target) openReadingModal(target);
                                }}
                                className="p-1 text-slate-400 dark:text-slate-500 hover:text-brand-700 dark:hover:text-brand-400"
                                title="Edit reading"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteReadingId(r.readingId)}
                                className="p-1 text-slate-400 dark:text-slate-500 hover:text-red-700 dark:hover:text-red-400"
                                title="Delete reading"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Consumption Summary */}
      {subTab === 'summary' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Building &amp; Area</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Meter / Account</th>
                  <th className="py-3 px-4 text-right">Opening</th>
                  <th className="py-3 px-4 text-right">Closing</th>
                  <th className="py-3 px-4 text-right">Consumption</th>
                  <th className="py-3 px-4 text-right">Readings</th>
                  <th className="py-3 px-4 text-right">Avg / Day</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {meterSeries.map((s) => (
                  <tr key={s.meterId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <span className="font-mono font-semibold text-brand-700 dark:text-brand-400 mr-1.5">
                        {s.buildingCode}
                      </span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{s.area}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{s.meterType}</td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                      {s.meterNo} {s.accountNo ? `· ${s.accountNo}` : ''}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {s.openingReading != null ? s.openingReading.toLocaleString() : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {s.closingReading != null ? s.closingReading.toLocaleString() : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {s.totalConsumption.toLocaleString()} {s.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {s.readingsCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {s.avgPerDay != null ? `${s.avgPerDay.toLocaleString()} ${s.unit}/d` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Anomaly Alerts */}
      {subTab === 'alerts' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Flags meter drops, skipped days, missing readings, and consumption spikes above median.
            </p>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              Spike threshold:
              <select
                value={spikeMultiplier}
                onChange={(e) => setSpikeMultiplier(Number(e.target.value))}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value={1.5}>1.5x median</option>
                <option value={2}>2.0x median</option>
                <option value={2.5}>2.5x median</option>
                <option value={3}>3.0x median</option>
                <option value={4}>4.0x median</option>
              </select>
            </label>
          </div>

          {alerts.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                No utility reading anomalies found
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                All active meters have consistent readings within expected ranges.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {alerts.map((a, idx) => (
                <div
                  key={`${a.meterId}-${a.date}-${idx}`}
                  className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        a.severity === 'danger'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        <span className="font-mono text-brand-700 dark:text-brand-400 mr-1.5">
                          {a.buildingCode}
                        </span>
                        {a.meterType} · {a.area}{' '}
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          ({a.meterNo})
                        </span>
                      </p>
                      <p
                        className={`mt-0.5 text-xs ${
                          a.severity === 'danger'
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-amber-800 dark:text-amber-400'
                        }`}
                      >
                        {a.message}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {a.date}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Meter Registry (Supervisor) */}
      {subTab === 'registry' && isSupervisor && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Configured utility meters across your buildings. Technicians select from active meters below when logging daily values.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {buildings
                .filter((b) => !utilityMeters.some((m) => m.buildingId === b.id))
                .map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    disabled={seedingBuildingId === b.id}
                    onClick={() => handleSeedDefaultMeters(b)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/60 text-[11px] font-medium text-brand-800 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/60"
                  >
                    <Sparkles className="w-3 h-3" />
                    Load Defaults ({b.code})
                  </button>
                ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Building</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Unit / Area</th>
                  <th className="py-3 px-4">Meter No</th>
                  <th className="py-3 px-4">Account No</th>
                  <th className="py-3 px-4">Unit</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filteredMeters.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-semibold text-brand-700 dark:text-brand-400">
                      {m.buildingCode}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                      {m.meterType}
                    </td>
                    <td className="py-3 px-4 text-slate-800 dark:text-slate-200">{m.area}</td>
                    <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                      {m.meterNo}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                      {m.accountNo || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                      {m.unit}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          m.status === 'active'
                            ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                            : 'text-slate-400 dark:text-slate-500'
                        }
                      >
                        {m.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openMeterModal(m)}
                          className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/60"
                          title="Edit meter"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteMeterId === m.id ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteUtilityMeter(m.id);
                              setConfirmDeleteMeterId(null);
                              onToast('Meter deleted.');
                            }}
                            className="px-2 py-1 rounded bg-red-600 text-white text-[11px]"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMeterId(m.id)}
                            className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60"
                            title="Delete meter"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Log Meter Reading */}
      {entryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingReading ? 'Edit Utility Meter Reading' : 'Log Utility Meter Reading'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEntryModalOpen(false);
                  setEditingReading(null);
                }}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveReading} className="p-6 space-y-4">
              {readingError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                  {readingError}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Building *
                  </label>
                  <select
                    disabled={Boolean(editingReading)}
                    value={entryBuildingId}
                    onChange={(e) => {
                      const bId = e.target.value;
                      setEntryBuildingId(bId);
                      const first = utilityMeters.find(
                        (m) => m.buildingId === bId && m.status === 'active'
                      );
                      setEntryMeterId(first?.id || '');
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Reading Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={readingDate}
                    onChange={(e) => setReadingDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              {!editingReading &&
                isSupervisor &&
                technicians.some((t) => t.role === 'technician' && t.status === 'active') && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Logged By Technician
                    </label>
                    <select
                      value={readingTechId}
                      onChange={(e) => setReadingTechId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    >
                      <option value="self">Myself ({user.name})</option>
                      {technicians
                        .filter((t) => t.role === 'technician' && t.status === 'active')
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.badgeId})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Select Utility Meter *
                </label>
                <select
                  disabled={Boolean(editingReading)}
                  value={entryMeterId}
                  onChange={(e) => setEntryMeterId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  {metersInSelectedEntryBuilding.length === 0 && (
                    <option value="">No active meters in this building</option>
                  )}
                  {metersInSelectedEntryBuilding.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.meterType} · {m.area} ({m.meterNo}) [{m.unit}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Previous Reading Live Reference */}
              {selectedEntryMeter && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">Previous Recorded Reading</p>
                    <p className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {previousReadingForSelectedMeter
                        ? `${previousReadingForSelectedMeter.readingValue.toLocaleString()} ${selectedEntryMeter.unit}`
                        : 'No prior reading (baseline)'}
                    </p>
                  </div>
                  {previousReadingForSelectedMeter && (
                    <div className="text-right">
                      <p className="text-slate-500 dark:text-slate-400">Date</p>
                      <p className="font-mono text-slate-700 dark:text-slate-300 mt-0.5">
                        {previousReadingForSelectedMeter.readingDate}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  New Meter Reading ({selectedEntryMeter?.unit || 'Units'}) *
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  required
                  value={readingValue}
                  onChange={(e) => setReadingValue(e.target.value)}
                  placeholder="Enter meter digits shown on dial/display"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
                {estimatedDelta !== null && (
                  <p
                    className={`mt-1.5 text-xs font-medium ${
                      estimatedDelta < 0
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {estimatedDelta < 0
                      ? `Warning: Reading is ${Math.abs(estimatedDelta).toLocaleString()} ${selectedEntryMeter?.unit} lower than previous (${previousReadingForSelectedMeter?.readingValue}). Verify before saving.`
                      : `Estimated Consumption: +${estimatedDelta.toLocaleString()} ${selectedEntryMeter?.unit} since ${previousReadingForSelectedMeter?.readingDate}`}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notes (Optional)
                </label>
                <SpellCheckInput
                  showToggle
                  maxLength={400}
                  value={readingNotes}
                  onValueChange={setReadingNotes}
                  placeholder="Meter reset, chiller maintenance, or observation..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setEntryModalOpen(false);
                    setEditingReading(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReading || !selectedEntryMeter}
                  className="px-5 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60 transition-colors"
                >
                  {savingReading
                    ? 'Saving...'
                    : editingReading
                      ? 'Save Changes'
                      : 'Save Reading'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Supervisor Add / Edit Meter */}
      {meterModalOpen && isSupervisor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingMeter ? 'Edit Utility Meter' : 'Add Utility Meter'}
              </h3>
              <button
                type="button"
                onClick={() => setMeterModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveMeter} className="p-6 space-y-4">
              {meterError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                  {meterError}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Building *
                  </label>
                  <select
                    disabled={!!editingMeter}
                    value={meterBuildingId}
                    onChange={(e) => setMeterBuildingId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Utility Type *
                  </label>
                  <select
                    value={meterType}
                    onChange={(e) => {
                      const nextType = e.target.value as UtilityMeterType;
                      setMeterType(nextType);
                      setMeterUnit(DEFAULT_METER_UNITS[nextType]);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    {METER_TYPES.map((mt) => (
                      <option key={mt} value={mt}>
                        {mt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Unit / Area Served *
                </label>
                <SpellCheckInput
                  required
                  maxLength={120}
                  value={meterArea}
                  onValueChange={setMeterArea}
                  placeholder="e.g. Common Area, Roof Chiller Plant, Retail Unit G1"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Meter Number *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={64}
                    value={meterNo}
                    onChange={(e) => setMeterNo(e.target.value)}
                    placeholder="EL-00142"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Account No
                  </label>
                  <input
                    type="text"
                    maxLength={64}
                    value={accountNo}
                    onChange={(e) => setAccountNo(e.target.value)}
                    placeholder="DEWA / Utility ID"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Unit *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={24}
                    value={meterUnit}
                    onChange={(e) => setMeterUnit(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Status
                </label>
                <select
                  value={meterStatus}
                  onChange={(e) => setMeterStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="active">Active (Visible in Field Portal)</option>
                  <option value="inactive">Inactive / Decommissioned</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setMeterModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMeter}
                  className="px-5 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60 transition-colors"
                >
                  {savingMeter ? 'Saving...' : editingMeter ? 'Save Changes' : 'Add Meter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
