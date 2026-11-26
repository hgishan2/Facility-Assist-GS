import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarCheck2,
  Clock,
  Download,
  Gauge,
  Repeat,
  ShieldAlert,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react';
import {
  exportOvertimeWorkbook,
  exportTenantSchedulesWorkbook,
  exportUtilityReportWorkbook,
  exportWorkLogsWorkbook,
} from '../lib/excelUtils';
import {
  addDaysIso,
  buildUtilityMeterSeries,
  computeBuildingComparison,
  computeCategoryBreakdown,
  computeDailyActivitySeries,
  computeFlaggedOver10hWorkLogs,
  computeMaintenanceBreakdown,
  computeOpenJobAgingBuckets,
  computeOvertimeWorkTypeDrivers,
  computePreviousPeriodRange,
  computeRepeatLocations,
  computeShiftAndPriorityStats,
  computeTechnicianPerformance,
  computeTenantScheduleSummary,
  computeUtilityAlerts,
  dedupeOvertimeLogs,
  getActivePendingWorkLogs,
  isoDayDiff,
  MAX_SINGLE_WORK_HOURS,
  round2,
  STANDARD_DAILY_DUTY_HOURS,
} from '../lib/operationsAnalytics';
import {
  Building,
  ENTRY_TYPE_LABELS,
  EntryType,
  MaintenanceLog,
  METER_TYPES,
  OUTCOME_LABELS,
  OvertimeCategoryType,
  OvertimeLog,
  Technician,
  TenantSchedule,
  UtilityMeter,
  UtilityReading,
  WorkLog,
  WorkOutcome,
} from '../types';

interface OperationsDashboardViewProps {
  buildings: Building[];
  workLogs: WorkLog[];
  maintenanceLogs: MaintenanceLog[];
  overtimeLogs: OvertimeLog[];
  utilityMeters: UtilityMeter[];
  utilityReadings: UtilityReading[];
  tenantSchedules: TenantSchedule[];
  technicians: Technician[];
  user: { name: string; email: string };
}

type AnalyticsSubTab =
  | 'overview'
  | 'hours'
  | 'workorders'
  | 'ppm'
  | 'utility'
  | 'overtime';

export const OperationsDashboardView: React.FC<OperationsDashboardViewProps> = ({
  buildings,
  workLogs,
  maintenanceLogs,
  overtimeLogs,
  utilityMeters,
  utilityReadings,
  tenantSchedules,
  technicians,
  user,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = addDaysIso(today, -29);
  const sixtyDaysAgo = addDaysIso(today, -59);
  const monthStart = `${today.slice(0, 8)}01`;

  const [subTab, setSubTab] = useState<AnalyticsSubTab>('overview');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [staleDays, setStaleDays] = useState(3);
  const [spikeMultiplier, setSpikeMultiplier] = useState(2.5);
  const [chartUtilityType, setChartUtilityType] = useState<string>('Electricity');

  // Interactive hover state for SVG charts
  const [hoveredHoursDate, setHoveredHoursDate] = useState<string | null>(null);
  const [hoveredJobsDate, setHoveredJobsDate] = useState<string | null>(null);
  const [hoveredUtilDate, setHoveredUtilDate] = useState<string | null>(null);
  const [hoveredOtDate, setHoveredOtDate] = useState<string | null>(null);

  // Scoped datasets by selected building inside Operations Analytics
  const scopedBuildings = useMemo(
    () =>
      selectedBuildingId === 'all'
        ? buildings
        : buildings.filter((b) => b.id === selectedBuildingId),
    [buildings, selectedBuildingId]
  );

  const scopedWorkLogs = useMemo(
    () =>
      selectedBuildingId === 'all'
        ? workLogs
        : workLogs.filter((w) => w.buildingId === selectedBuildingId),
    [workLogs, selectedBuildingId]
  );

  const scopedMaintLogs = useMemo(
    () =>
      selectedBuildingId === 'all'
        ? maintenanceLogs
        : maintenanceLogs.filter((m) => m.buildingId === selectedBuildingId),
    [maintenanceLogs, selectedBuildingId]
  );

  const scopedOtLogs = useMemo(
    () =>
      selectedBuildingId === 'all'
        ? overtimeLogs
        : overtimeLogs.filter((o) => o.buildingId === selectedBuildingId),
    [overtimeLogs, selectedBuildingId]
  );

  const scopedMeters = useMemo(
    () =>
      selectedBuildingId === 'all'
        ? utilityMeters
        : utilityMeters.filter((m) => m.buildingId === selectedBuildingId),
    [utilityMeters, selectedBuildingId]
  );

  const scopedReadings = useMemo(
    () =>
      selectedBuildingId === 'all'
        ? utilityReadings
        : utilityReadings.filter((r) => r.buildingId === selectedBuildingId),
    [utilityReadings, selectedBuildingId]
  );

  const scopedSchedules = useMemo(
    () =>
      selectedBuildingId === 'all'
        ? tenantSchedules
        : tenantSchedules.filter((s) => s.buildingId === selectedBuildingId),
    [tenantSchedules, selectedBuildingId]
  );

  const scopedTechnicians = useMemo(
    () =>
      selectedBuildingId === 'all'
        ? technicians
        : technicians.filter(
            (t) =>
              t.assignedBuildingIds.length === 0 ||
              t.assignedBuildingIds.includes(selectedBuildingId)
          ),
    [technicians, selectedBuildingId]
  );

  const buildingLabel =
    scopedBuildings.length === 1
      ? `${scopedBuildings[0].code} — ${scopedBuildings[0].name}`
      : `Selected Scope (${scopedBuildings.length} buildings)`;

  const effectiveFrom = dateFrom || '1970-01-01';
  const effectiveTo = dateTo || today;
  const prevRange = useMemo(
    () =>
      dateFrom
        ? computePreviousPeriodRange(dateFrom, effectiveTo)
        : computePreviousPeriodRange(thirtyDaysAgo, today),
    [dateFrom, effectiveTo, thirtyDaysAgo, today]
  );

  // Date-windowed slices
  const curWork = useMemo(
    () =>
      scopedWorkLogs.filter(
        (w) => (!dateFrom || w.logDate >= dateFrom) && (!dateTo || w.logDate <= dateTo)
      ),
    [scopedWorkLogs, dateFrom, dateTo]
  );

  const prevWork = useMemo(
    () =>
      scopedWorkLogs.filter(
        (w) => w.logDate >= prevRange.from && w.logDate <= prevRange.to
      ),
    [scopedWorkLogs, prevRange]
  );

  const curMaint = useMemo(
    () =>
      scopedMaintLogs.filter(
        (m) =>
          (!dateFrom || m.completedDate >= dateFrom) &&
          (!dateTo || m.completedDate <= dateTo)
      ),
    [scopedMaintLogs, dateFrom, dateTo]
  );

  const curOt = useMemo(
    () =>
      dedupeOvertimeLogs(scopedOtLogs).filter(
        (o) =>
          o.approvalStatus !== 'rejected' &&
          (!dateFrom || o.otDate >= dateFrom) &&
          (!dateTo || o.otDate <= dateTo)
      ),
    [scopedOtLogs, dateFrom, dateTo]
  );

  const prevOt = useMemo(
    () =>
      dedupeOvertimeLogs(scopedOtLogs).filter(
        (o) =>
          o.approvalStatus !== 'rejected' &&
          o.otDate >= prevRange.from &&
          o.otDate <= prevRange.to
      ),
    [scopedOtLogs, prevRange]
  );

  const curReadings = useMemo(
    () =>
      scopedReadings.filter(
        (r) =>
          (!dateFrom || r.readingDate >= dateFrom) &&
          (!dateTo || r.readingDate <= dateTo)
      ),
    [scopedReadings, dateFrom, dateTo]
  );

  const curSchedules = useMemo(
    () =>
      scopedSchedules.filter(
        (s) =>
          (!dateFrom || s.scheduleDate >= dateFrom) &&
          (!dateTo || s.scheduleDate <= dateTo)
      ),
    [scopedSchedules, dateFrom, dateTo]
  );

  // Today Live Overview
  const todayReadingsCount = scopedReadings.filter((r) => r.readingDate === today).length;
  const activeMetersCount = scopedMeters.filter((m) => m.status === 'active').length;
  const allOpenWorkLogs = useMemo(
    () => getActivePendingWorkLogs(scopedWorkLogs),
    [scopedWorkLogs]
  );
  const todaySchedules = scopedSchedules.filter((s) => s.scheduleDate === today);
  const pendingOtCount = scopedOtLogs.filter((o) => o.approvalStatus === 'pending_approval').length;

  // Insights metrics & period-over-period deltas
  const curCompleted = curWork.filter((w) => w.status === 'Completed');
  const prevCompleted = prevWork.filter((w) => w.status === 'Completed');
  const curCompRate =
    curWork.length > 0 ? Math.round((curCompleted.length / curWork.length) * 100) : 0;
  const prevCompRate =
    prevWork.length > 0 ? Math.round((prevCompleted.length / prevWork.length) * 100) : 0;

  const avgDuration = (list: WorkLog[]) => {
    const valid = list.map((w) => w.durationHours).filter((h) => h > 0 && h <= MAX_SINGLE_WORK_HOURS);
    return valid.length > 0 ? round2(valid.reduce((s, h) => s + h, 0) / valid.length) : 0;
  };
  const curAvgHrs = avgDuration(curCompleted);
  const prevAvgHrs = avgDuration(prevCompleted);

  const staleOpenJobs = useMemo(
    () => allOpenWorkLogs.filter((w) => isoDayDiff(w.logDate, today) >= staleDays),
    [allOpenWorkLogs, today, staleDays]
  );

  const curOtHours = round2(curOt.reduce((s, o) => s + o.hours, 0));
  const prevOtHours = round2(prevOt.reduce((s, o) => s + o.hours, 0));

  const utilityAlerts = useMemo(
    () =>
      computeUtilityAlerts(
        scopedReadings,
        scopedMeters,
        spikeMultiplier,
        dateFrom || undefined,
        dateTo || undefined
      ),
    [scopedReadings, scopedMeters, spikeMultiplier, dateFrom, dateTo]
  );

  const scorecard = useMemo(
    () =>
      computeTechnicianPerformance({
        workLogs: curWork,
        maintenanceLogs: curMaint,
        utilityReadings: curReadings,
        overtimeLogs: curOt,
        tenantSchedules: curSchedules,
        technicians: scopedTechnicians,
      }),
    [curWork, curMaint, curReadings, curOt, curSchedules, scopedTechnicians]
  );

  // Team productive-hours aggregates (prioritized!)
  const teamProductiveSummary = useMemo(() => {
    const totalWorkHrs = round2(scorecard.reduce((s, r) => s + r.productiveWorkHours, 0));
    const totalPpmHrs = round2(scorecard.reduce((s, r) => s + r.ppmLaborHours, 0));
    const totalProductiveHrs = round2(totalWorkHrs + totalPpmHrs);
    const totalExpectedDutyHrs = round2(scorecard.reduce((s, r) => s + r.expectedDutyHours, 0));
    const totalActiveTechDays = scorecard.reduce((s, r) => s + r.activeDutyDays, 0);
    const utilizationPct =
      totalExpectedDutyHrs > 0
        ? Math.round((totalProductiveHrs / totalExpectedDutyHrs) * 100)
        : 0;
    const avgDailyHoursPerTech =
      totalActiveTechDays > 0 ? round2(totalProductiveHrs / totalActiveTechDays) : 0;
    const flaggedOver10hCount = scorecard.reduce((s, r) => s + r.over10hFlaggedJobs, 0);
    const activeTechCount = scorecard.filter(
      (r) => r.totalJobs + r.ppmReports + r.utilityReadings + r.overtimeEntries > 0
    ).length;

    return {
      totalWorkHrs,
      totalPpmHrs,
      totalProductiveHrs,
      totalExpectedDutyHrs,
      totalActiveTechDays,
      utilizationPct,
      avgDailyHoursPerTech,
      flaggedOver10hCount,
      activeTechCount,
    };
  }, [scorecard]);

  const flaggedOver10hLogs = useMemo(() => computeFlaggedOver10hWorkLogs(curWork), [curWork]);

  const dailyActivitySeries = useMemo(
    () =>
      computeDailyActivitySeries({
        workLogs: curWork,
        maintenanceLogs: curMaint,
        overtimeLogs: curOt,
        maxPoints: 30,
      }),
    [curWork, curMaint, curOt]
  );

  const categoryBreakdown = useMemo(() => computeCategoryBreakdown(curWork), [curWork]);
  const shiftPriorityStats = useMemo(() => computeShiftAndPriorityStats(curWork), [curWork]);
  const maintBreakdown = useMemo(() => computeMaintenanceBreakdown(curMaint), [curMaint]);
  const scheduleSummary = useMemo(() => computeTenantScheduleSummary(curSchedules), [curSchedules]);
  const buildingComparison = useMemo(
    () =>
      computeBuildingComparison({
        buildings: scopedBuildings,
        workLogs: curWork,
        maintenanceLogs: curMaint,
        overtimeLogs: curOt,
        utilityReadings: curReadings,
        tenantSchedules: curSchedules,
      }),
    [scopedBuildings, curWork, curMaint, curOt, curReadings, curSchedules]
  );

  const repeatLocations = useMemo(() => computeRepeatLocations(curWork), [curWork]);
  const agingBuckets = useMemo(
    () => computeOpenJobAgingBuckets(scopedWorkLogs, today),
    [scopedWorkLogs, today]
  );

  const curUtilitySeries = useMemo(
    () =>
      buildUtilityMeterSeries(
        scopedReadings,
        scopedMeters,
        dateFrom || undefined,
        dateTo || undefined
      ),
    [scopedReadings, scopedMeters, dateFrom, dateTo]
  );

  const prevUtilitySeries = useMemo(
    () =>
      buildUtilityMeterSeries(
        scopedReadings,
        scopedMeters,
        prevRange.from,
        prevRange.to
      ),
    [scopedReadings, scopedMeters, prevRange]
  );

  const utilitySummaryByType = useMemo(() => {
    const map = new Map<string, { meterType: string; unit: string; meters: number; total: number }>();
    for (const m of curUtilitySeries) {
      const cur = map.get(m.meterType) || {
        meterType: m.meterType,
        unit: m.unit,
        meters: 0,
        total: 0,
      };
      cur.meters += 1;
      cur.total = round2(cur.total + m.totalConsumption);
      map.set(m.meterType, cur);
    }
    return Array.from(map.values());
  }, [curUtilitySeries]);

  const dailyUtilityChartPoints = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of curUtilitySeries) {
      if (s.meterType !== chartUtilityType) continue;
      for (const st of s.steps) {
        if (st.consumption != null && st.consumption > 0) {
          map.set(st.date, round2((map.get(st.date) || 0) + st.consumption));
        }
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-28)
      .map(([date, value]) => ({ date, value }));
  }, [curUtilitySeries, chartUtilityType]);

  const otCategoryTotals = useMemo(() => {
    const sums: Record<OvertimeCategoryType, number> = { N: 0, WO: 0, PH: 0, 'N. Shift': 0 };
    for (const o of curOt) {
      sums[o.otCategoryType] = round2(sums[o.otCategoryType] + o.hours);
    }
    return sums;
  }, [curOt]);

  const otDriversAndTrend = useMemo(() => computeOvertimeWorkTypeDrivers(curOt), [curOt]);

  const deltaBadge = (cur: number, prev: number, unit = '', inverseGood = false) => {
    if (!dateFrom) {
      return (
        <span className="text-[11px] text-slate-400 dark:text-slate-500">All-time view</span>
      );
    }
    const diff = round2(cur - prev);
    if (diff === 0) {
      return (
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          No change vs prior
        </span>
      );
    }
    const positive = diff > 0;
    const isGood = inverseGood ? !positive : positive;
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-medium tabular-nums ${
          isGood ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
        }`}
      >
        {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {positive ? '+' : ''}
        {diff}
        {unit} vs prior {prevRange.days}d
      </span>
    );
  };

  const hoveredHoursPoint = useMemo(
    () =>
      dailyActivitySeries.find((d) => d.date === hoveredHoursDate) ||
      dailyActivitySeries[dailyActivitySeries.length - 1] ||
      null,
    [dailyActivitySeries, hoveredHoursDate]
  );

  const hoveredJobsPoint = useMemo(
    () =>
      dailyActivitySeries.find((d) => d.date === hoveredJobsDate) ||
      dailyActivitySeries[dailyActivitySeries.length - 1] ||
      null,
    [dailyActivitySeries, hoveredJobsDate]
  );

  const hoveredUtilPoint = useMemo(
    () =>
      dailyUtilityChartPoints.find((d) => d.date === hoveredUtilDate) ||
      dailyUtilityChartPoints[dailyUtilityChartPoints.length - 1] ||
      null,
    [dailyUtilityChartPoints, hoveredUtilDate]
  );

  const hoveredOtPoint = useMemo(
    () =>
      otDriversAndTrend.dailySeries.find((d) => d.date === hoveredOtDate) ||
      otDriversAndTrend.dailySeries[otDriversAndTrend.dailySeries.length - 1] ||
      null,
    [otDriversAndTrend.dailySeries, hoveredOtDate]
  );

  return (
    <div className="space-y-6">
      {/* Top Bar: Title & Excel Exports */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            Operations Analytics &amp; Productivity Intelligence
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Technician productive job hours vs {STANDARD_DAILY_DUTY_HOURS}h/day duty capacity, work orders, PPM compliance, utilities, and overtime across buildings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={curWork.length === 0}
            onClick={() =>
              exportWorkLogsWorkbook(curWork, {
                buildingLabel,
                dateFrom: effectiveFrom,
                dateTo: effectiveTo,
                generatedBy: `${user.name} (${user.email})`,
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
            Work Log (.xlsx)
          </button>
          <button
            type="button"
            disabled={curOt.length === 0}
            onClick={() =>
              exportOvertimeWorkbook(curOt, scopedTechnicians, {
                buildingLabel,
                dateFrom: effectiveFrom,
                dateTo: effectiveTo,
                generatedBy: `${user.name} (${user.email})`,
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
            Overtime (.xlsx)
          </button>
          <button
            type="button"
            disabled={scopedReadings.length === 0}
            onClick={() =>
              exportUtilityReportWorkbook(scopedReadings, scopedMeters, {
                buildingLabel,
                dateFrom: effectiveFrom,
                dateTo: effectiveTo,
                generatedBy: `${user.name} (${user.email})`,
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
            Utility (.xlsx)
          </button>
          <button
            type="button"
            disabled={curSchedules.length === 0}
            onClick={() =>
              exportTenantSchedulesWorkbook(curSchedules, {
                buildingLabel,
                dateFrom: effectiveFrom,
                dateTo: effectiveTo,
                generatedBy: `${user.name} (${user.email})`,
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
            Schedules (.xlsx)
          </button>
        </div>
      </div>

      {/* Filter & Sub-Navigation Control Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {buildings.length > 1 && (
              <div className="flex items-center gap-1.5 mr-2">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedBuildingId}
                  onChange={(e) => setSelectedBuildingId(e.target.value)}
                  aria-label="Filter analytics by building"
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="all">All Buildings ({buildings.length})</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Window:
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
            <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
            />

            <div className="flex flex-wrap items-center gap-1.5 ml-1">
              {[
                { label: 'Today', from: today, to: today },
                { label: '7D', from: addDaysIso(today, -6), to: today },
                { label: 'This Month', from: monthStart, to: today },
                { label: '30D', from: thirtyDaysAgo, to: today },
                { label: '60D', from: sixtyDaysAgo, to: today },
                { label: 'All Time', from: '', to: '' },
              ].map((preset) => {
                const active = dateFrom === preset.from && dateTo === preset.to;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setDateFrom(preset.from);
                      setDateTo(preset.to);
                    }}
                    className={`px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
                      active
                        ? 'border-brand-600 bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 p-1 overflow-x-auto">
          {(
            [
              { id: 'overview', label: 'Overview & Pulse' },
              { id: 'hours', label: 'Technician Hours & Duty' },
              { id: 'workorders', label: 'Work Orders & Trades' },
              { id: 'ppm', label: 'PPM, Repairs & Schedules' },
              { id: 'utility', label: 'Utility Consumption' },
              { id: 'overtime', label: 'Overtime Analytics' },
            ] as { id: AnalyticsSubTab; label: string }[]
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
      </div>

      {/* Today Live Pulse Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Today&apos;s Meter Readings</span>
            <Gauge className="w-4 h-4 text-brand-700 dark:text-brand-400" />
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {todayReadingsCount}
            <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
              {' '}
              / {activeMetersCount}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Active meters logged today
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Open Work Orders</span>
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {allOpenWorkLogs.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Pending or On Hold across scope
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Today&apos;s Tenant Schedules</span>
            <CalendarCheck2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {todaySchedules.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {todaySchedules.filter((s) => s.status === 'Completed').length} completed today
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Pending OT Approvals</span>
            <Users className="w-4 h-4 text-brand-700 dark:text-brand-400" />
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {pendingOtCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Entries awaiting supervisor review
          </p>
        </div>
      </div>

      {/* Prioritized 6-Card Insights Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Productive Job Hours</p>
          <p className="mt-1 text-2xl font-semibold text-brand-700 dark:text-brand-400 font-mono tabular-nums">
            {teamProductiveSummary.totalProductiveHrs}h
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {teamProductiveSummary.totalWorkHrs}h WO + {teamProductiveSummary.totalPpmHrs}h PPM
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Duty Utilization ({STANDARD_DAILY_DUTY_HOURS}h/d)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {teamProductiveSummary.utilizationPct}%
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Avg {teamProductiveSummary.avgDailyHoursPerTech}h / active day
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Work Orders</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {curWork.length}
          </p>
          <div className="mt-1">{deltaBadge(curWork.length, prevWork.length)}</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Completion Rate</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {curCompRate}%
          </p>
          <div className="mt-1">
            {deltaBadge(curCompRate, prevCompRate, '%')}
            <span className="block text-[10px] text-slate-400 font-mono tabular-nums">
              Avg job: {curAvgHrs}h (prior {prevAvgHrs}h)
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Overtime Hours</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {curOtHours}h
          </p>
          <div className="mt-1">{deltaBadge(curOtHours, prevOtHours, 'h', true)}</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Alerts &amp; Stale ({staleDays}d+)</span>
            <select
              value={staleDays}
              onChange={(e) => setStaleDays(Number(e.target.value))}
              aria-label="Stale job day threshold"
              className="border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-[10px] font-mono bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value={2}>2d</option>
              <option value={3}>3d</option>
              <option value={5}>5d</option>
              <option value={7}>7d</option>
            </select>
          </div>
          <p
            className={`mt-1 text-2xl font-semibold font-mono tabular-nums ${
              utilityAlerts.length + staleOpenJobs.length > 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {utilityAlerts.length + staleOpenJobs.length}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {staleOpenJobs.length} stale · {utilityAlerts.length} utility
          </p>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SUB-TAB 1: OVERVIEW & EXECUTIVE PULSE                                 */}
      {/* ===================================================================== */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            {/* Daily Productive Job Hours vs Overtime Chart */}
            <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Daily Productive Job Hours vs Overtime
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Combined daily work-order hours, PPM labor hours, and overtime hours (last 30 active days)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-brand-600 dark:bg-brand-500 inline-block" />
                    Work-Log Hrs
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-500 inline-block" />
                    PPM Hrs
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                    OT Hrs
                  </span>
                </div>
              </div>

              {hoveredHoursPoint && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs">
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {hoveredHoursPoint.date}
                  </span>
                  <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                    <span className="text-brand-700 dark:text-brand-400">
                      WO: {hoveredHoursPoint.workHours}h ({hoveredHoursPoint.logged} jobs)
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      PPM: {hoveredHoursPoint.ppmHours}h
                    </span>
                    <span className="text-amber-700 dark:text-amber-400">
                      OT: {hoveredHoursPoint.overtimeHours}h
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      Productive Total: {hoveredHoursPoint.totalProductiveHours}h
                    </span>
                  </div>
                </div>
              )}

              {dailyActivitySeries.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                  No logged hours in this date window.
                </div>
              ) : (
                <div className="w-full overflow-x-auto">
                  {(() => {
                    const maxVal = Math.max(
                      1,
                      ...dailyActivitySeries.map((d) =>
                        Math.max(d.totalProductiveHours + d.overtimeHours, 1)
                      )
                    );
                    const stepW = Math.max(24, Math.floor(620 / Math.max(1, dailyActivitySeries.length)));
                    const w = Math.max(520, 48 + dailyActivitySeries.length * stepW);
                    const h = 215;
                    const chartTop = 16;
                    const chartBottom = 178;
                    const barMaxH = chartBottom - chartTop;
                    const barW = Math.max(10, Math.min(22, stepW - 8));

                    return (
                      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-56">
                        {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
                          const y = chartBottom - frac * barMaxH;
                          return (
                            <g key={idx}>
                              <line
                                x1={34}
                                y1={y}
                                x2={w - 8}
                                y2={y}
                                className="stroke-slate-200 dark:stroke-slate-800"
                                strokeDasharray="3 3"
                              />
                              <text
                                x={4}
                                y={y + 3}
                                fontSize="9"
                                className="fill-slate-500 dark:fill-slate-400"
                                fontFamily="monospace"
                              >
                                {Math.round(maxVal * frac)}h
                              </text>
                            </g>
                          );
                        })}
                        {dailyActivitySeries.map((pt, i) => {
                          const x = 40 + i * stepW;
                          const hWork = (pt.workHours / maxVal) * barMaxH;
                          const hPpm = (pt.ppmHours / maxVal) * barMaxH;
                          const hOt = (pt.overtimeHours / maxVal) * barMaxH;
                          const isHovered = hoveredHoursPoint?.date === pt.date;
                          const showLabel =
                            dailyActivitySeries.length <= 16 || i % 2 === 0 || i === dailyActivitySeries.length - 1;

                          return (
                            <g
                              key={pt.date}
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredHoursDate(pt.date)}
                            >
                              {isHovered && (
                                <rect
                                  x={x - 3}
                                  y={chartTop - 4}
                                  width={barW + 6}
                                  height={barMaxH + 8}
                                  rx={4}
                                  className="fill-slate-100 dark:fill-slate-800/70"
                                />
                              )}
                              {hWork > 0 && (
                                <rect
                                  x={x}
                                  y={chartBottom - hWork}
                                  width={barW}
                                  height={Math.max(2, hWork)}
                                  rx={2}
                                  className="fill-brand-600 dark:fill-brand-500"
                                />
                              )}
                              {hPpm > 0 && (
                                <rect
                                  x={x}
                                  y={chartBottom - hWork - hPpm}
                                  width={barW}
                                  height={Math.max(2, hPpm)}
                                  rx={2}
                                  className="fill-emerald-600 dark:fill-emerald-500"
                                />
                              )}
                              {hOt > 0 && (
                                <rect
                                  x={x}
                                  y={chartBottom - hWork - hPpm - hOt}
                                  width={barW}
                                  height={Math.max(2, hOt)}
                                  rx={2}
                                  className="fill-amber-500 dark:fill-amber-400"
                                />
                              )}
                              {showLabel && (
                                <text
                                  x={x + barW / 2}
                                  y={198}
                                  textAnchor="middle"
                                  fontSize="8.5"
                                  className="fill-slate-500 dark:fill-slate-400"
                                  fontFamily="monospace"
                                >
                                  {pt.date.slice(5)}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>
              )}
            </section>

            {/* Technician Productive Hours Leaderboard (vs 9h/day Duty) */}
            <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Technician Productive Hours
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Logged job hours vs {STANDARD_DAILY_DUTY_HOURS}h/day active duty benchmark
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubTab('hours')}
                  className="text-xs font-medium text-brand-700 dark:text-brand-400 hover:underline whitespace-nowrap"
                >
                  Full Duty View
                </button>
              </div>

              {scorecard.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                  No technician hours in this range.
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const topRows = scorecard.slice(0, 8);
                    const maxRef = Math.max(
                      1,
                      ...topRows.map((r) => Math.max(r.totalProductiveHours + r.overtimeHours, r.expectedDutyHours))
                    );
                    return topRows.map((r) => {
                      const woPct = (r.productiveWorkHours / maxRef) * 100;
                      const ppmPct = (r.ppmLaborHours / maxRef) * 100;
                      const otPct = (r.overtimeHours / maxRef) * 100;
                      const capPct = Math.min(100, (r.expectedDutyHours / maxRef) * 100);
                      return (
                        <div key={r.technicianName} className="space-y-1">
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {r.technicianName}
                            </span>
                            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
                              <strong className="text-brand-700 dark:text-brand-400">
                                {r.totalProductiveHours}h
                              </strong>{' '}
                              / {r.expectedDutyHours}h ({r.dutyUtilizationPct}%)
                            </span>
                          </div>
                          <div className="relative h-3 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                            {woPct > 0 && (
                              <div
                                style={{ width: `${woPct}%` }}
                                className="h-full bg-brand-600 dark:bg-brand-500"
                                title={`Work-Log Hours: ${r.productiveWorkHours}h`}
                              />
                            )}
                            {ppmPct > 0 && (
                              <div
                                style={{ width: `${ppmPct}%` }}
                                className="h-full bg-emerald-600 dark:bg-emerald-500"
                                title={`PPM Labor Hours: ${r.ppmLaborHours}h`}
                              />
                            )}
                            {otPct > 0 && (
                              <div
                                style={{ width: `${otPct}%` }}
                                className="h-full bg-amber-500 dark:bg-amber-400"
                                title={`Overtime Hours: ${r.overtimeHours}h`}
                              />
                            )}
                            {r.expectedDutyHours > 0 && (
                              <div
                                style={{ left: `${capPct}%` }}
                                title={`9h/day Expected Duty: ${r.expectedDutyHours}h (${r.activeDutyDays} active days)`}
                                className="absolute top-0 bottom-0 w-0.5 bg-slate-900/70 dark:bg-white/80"
                              />
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                    Vertical marker indicates expected {STANDARD_DAILY_DUTY_HOURS}h/day capacity across each technician&apos;s active logged days.
                  </p>
                </div>
              )}
            </section>
          </div>

          {/* Row 2: Trade Workload + Shift & Priority Mix */}
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Trade / Category Workload &amp; Hours
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Work orders and logged duration hours across maintenance disciplines
                </p>
              </div>
              {categoryBreakdown.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No work orders in this window.
                </div>
              ) : (
                <div className="space-y-3">
                  {categoryBreakdown.slice(0, 7).map((cat) => {
                    const maxCount = Math.max(1, categoryBreakdown[0]?.total || 1);
                    const pct = Math.round((cat.total / maxCount) * 100);
                    return (
                      <div key={cat.category} className="space-y-1">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {cat.category}
                          </span>
                          <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0">
                            <strong className="text-slate-900 dark:text-slate-100">
                              {cat.total}
                            </strong>{' '}
                            jobs ({cat.pctOfJobs}%) · {cat.totalHours}h
                          </span>
                        </div>
                        <div className="h-2.5 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-brand-600 dark:bg-brand-500 rounded"
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Shift Distribution, Priority SLA &amp; PPM Snapshot
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Day vs Night coverage, urgency resolution averages, and scheduled work status
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(['Day', 'Night'] as const).map((s) => {
                  const info = shiftPriorityStats.shifts[s];
                  const totalS = Math.max(
                    1,
                    shiftPriorityStats.shifts.Day.count + shiftPriorityStats.shifts.Night.count
                  );
                  const share = Math.round((info.count / totalS) * 100);
                  return (
                    <div
                      key={s}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>{s} Shift</span>
                        <span className="font-mono tabular-nums">{share}%</span>
                      </div>
                      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                        {info.count} jobs · {info.hours}h
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {(['Normal', 'Urgent', 'Emergency'] as const).map((p) => {
                  const info = shiftPriorityStats.priorities[p];
                  return (
                    <div
                      key={p}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                    >
                      <p
                        className={`text-xs font-medium ${
                          p === 'Emergency'
                            ? 'text-red-700 dark:text-red-400'
                            : p === 'Urgent'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {p}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                        {info.count}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        Avg {info.avgHours}h
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">PPM &amp; Repair Logs:</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {maintBreakdown.total} ({maintBreakdown.totalLaborHours}h)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Tenant Schedules:</span>
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {scheduleSummary.counts.Completed}/{scheduleSummary.total} ({scheduleSummary.completionRate}%)
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* Row 3: Repeat Problem Locations & Attention Required */}
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <Repeat className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Repeat Problem Locations
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Units or rooms with the highest recurring work orders &amp; hours
                  </p>
                </div>
              </div>

              {repeatLocations.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No work orders recorded in the selected date window.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                        <th className="py-2.5 px-4">Location</th>
                        <th className="py-2.5 px-4">Top Trade</th>
                        <th className="py-2.5 px-4 text-right">Jobs</th>
                        <th className="py-2.5 px-4 text-right">Hours</th>
                        <th className="py-2.5 px-4 text-right">Open</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {repeatLocations.slice(0, 10).map((loc) => (
                        <tr
                          key={`${loc.buildingCode}|${loc.location}`}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                            <span className="font-mono text-brand-700 dark:text-brand-400 mr-1.5">
                              {loc.buildingCode}
                            </span>
                            {loc.location}
                            {loc.recurring && (
                              <span className="ml-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                · Recurring
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                            {loc.topCategory}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                            {loc.total}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {loc.hours}h
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                            {loc.open}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Attention Required (Alerts, Stale &amp; &gt;10h Audits)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Utility anomalies, open jobs &ge; {staleDays}d, and jobs exceeding 10h
                    </p>
                  </div>
                </div>
                <select
                  value={spikeMultiplier}
                  onChange={(e) => setSpikeMultiplier(Number(e.target.value))}
                  aria-label="Utility spike threshold"
                  className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-[11px] font-mono bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value={2}>Spike 2x</option>
                  <option value={2.5}>Spike 2.5x</option>
                  <option value={3}>Spike 3x</option>
                </select>
              </div>

              {utilityAlerts.length === 0 &&
              staleOpenJobs.length === 0 &&
              flaggedOver10hLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No stale jobs, utility anomalies, or &gt;10h duration flags in this window.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-96 overflow-y-auto">
                  {flaggedOver10hLogs.slice(0, 4).map(({ log, rawHours }) => (
                    <div
                      key={`over10_${log.id}`}
                      className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          <span className="font-mono text-red-700 dark:text-red-400 mr-1.5">
                            [{rawHours}h &gt; 10h limit]
                          </span>
                          {log.buildingCode} · {log.location}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 truncate max-w-md">
                          {log.startTime || log.receivedTime || '--:--'} to {log.finishTime || '--:--'} · {log.complaint}
                        </p>
                      </div>
                      <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                        {log.technicianName}
                      </span>
                    </div>
                  ))}
                  {staleOpenJobs.slice(0, 5).map((w) => (
                    <div
                      key={w.id}
                      className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          <span className="font-mono text-amber-700 dark:text-amber-400 mr-1.5">
                            [{isoDayDiff(w.logDate, today)}d open]
                          </span>
                          {w.buildingCode} · {w.location}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 truncate max-w-md">
                          {w.complaint} {w.pendingReason ? `(${w.pendingReason})` : ''}
                        </p>
                      </div>
                      <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                        {w.technicianName}
                      </span>
                    </div>
                  ))}
                  {utilityAlerts.slice(0, 6).map((a, idx) => (
                    <div
                      key={`${a.meterId}-${a.date}-${idx}`}
                      className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          <span
                            className={`font-mono mr-1.5 ${
                              a.severity === 'danger'
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            [{a.meterType}]
                          </span>
                          {a.buildingCode} · {a.area}
                        </p>
                        <p className="text-slate-600 dark:text-slate-400">{a.message}</p>
                      </div>
                      <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                        {a.date}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Building Portfolio Comparison */}
          {buildingComparison.length > 0 && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Building Operations Comparison
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cross-building comparison of work orders, productive hours, PPM logs, overtime, and meter readings
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                      <th className="py-3 px-4">Building</th>
                      <th className="py-3 px-4 text-right">Work Orders</th>
                      <th className="py-3 px-4 text-right">Completion %</th>
                      <th className="py-3 px-4 text-right">Work Hrs</th>
                      <th className="py-3 px-4 text-right">PPM Logs (Hrs)</th>
                      <th className="py-3 px-4 text-right">Total Productive</th>
                      <th className="py-3 px-4 text-right">Overtime</th>
                      <th className="py-3 px-4 text-right">Meter Logs</th>
                      <th className="py-3 px-4 text-right">Schedules</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {buildingComparison.map((b) => (
                      <tr
                        key={b.buildingId}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                          <span className="font-mono font-semibold text-brand-700 dark:text-brand-400 mr-1.5">
                            {b.buildingCode}
                          </span>
                          {b.buildingName}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {b.completedJobs}/{b.totalJobs}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {b.completionRate}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {b.workHours}h
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {b.ppmCount} ({b.ppmHours}h)
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-brand-700 dark:text-brand-400">
                          {b.totalProductiveHours}h
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                          {b.overtimeHours}h
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {b.readingsCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {b.schedulesCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 2: TECHNICIAN JOB HOURS & PRODUCTIVITY (PRIORITIZED)          */}
      {/* ===================================================================== */}
      {subTab === 'hours' && (
        <div className="space-y-6">
          {/* Duty Policy Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Total Productive Hours</span>
                <Timer className="w-4 h-4 text-brand-700 dark:text-brand-400" />
              </div>
              <p className="mt-1.5 text-2xl font-semibold text-brand-700 dark:text-brand-400 font-mono tabular-nums">
                {teamProductiveSummary.totalProductiveHrs}h
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {teamProductiveSummary.totalWorkHrs}h Work Orders + {teamProductiveSummary.totalPpmHrs}h PPM
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Team Duty Utilization</span>
                <Users className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              </div>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                {teamProductiveSummary.utilizationPct}%
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                vs {teamProductiveSummary.totalExpectedDutyHrs}h ({teamProductiveSummary.totalActiveTechDays} tech-days × {STANDARD_DAILY_DUTY_HOURS}h)
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Avg Productive Hrs / Duty Day</span>
                <Clock className="w-4 h-4 text-brand-700 dark:text-brand-400" />
              </div>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                {teamProductiveSummary.avgDailyHoursPerTech}h
                <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
                  {' '}
                  / {STANDARD_DAILY_DUTY_HOURS}h
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Standard technician shift duty: {STANDARD_DAILY_DUTY_HOURS} hrs/day
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>&gt;{MAX_SINGLE_WORK_HOURS}h Single-Job Flags</span>
                <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <p
                className={`mt-1.5 text-2xl font-semibold font-mono tabular-nums ${
                  teamProductiveSummary.flaggedOver10hCount > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {teamProductiveSummary.flaggedOver10hCount}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                New portal entries strictly capped at {MAX_SINGLE_WORK_HOURS}h
              </p>
            </div>
          </div>

          {/* Stacked Bar Chart: Productive Hours + Overtime vs 9h/Day Duty Benchmark */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Technician Job Hours Breakdown vs {STANDARD_DAILY_DUTY_HOURS}h/Day Duty Capacity
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Compares regular Work-Log hours, PPM labor hours, and Overtime hours against active duty capacity ({STANDARD_DAILY_DUTY_HOURS} hrs × active logged days)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-brand-600 dark:bg-brand-500 inline-block" />
                  Work-Log Hrs
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-500 inline-block" />
                  PPM Labor Hrs
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                  Overtime Hrs
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-0.5 h-3.5 bg-slate-900 dark:bg-white inline-block" />
                  9h/Day Duty Target
                </span>
              </div>
            </div>

            {scorecard.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                No technician hours found for this period.
              </div>
            ) : (
              <div className="space-y-3.5">
                {(() => {
                  const maxScale = Math.max(
                    1,
                    ...scorecard.map((r) =>
                      Math.max(r.totalProductiveHours + r.overtimeHours, r.expectedDutyHours)
                    )
                  );
                  return scorecard.map((r) => {
                    const woW = (r.productiveWorkHours / maxScale) * 100;
                    const ppmW = (r.ppmLaborHours / maxScale) * 100;
                    const otW = (r.overtimeHours / maxScale) * 100;
                    const capLeft = Math.min(100, (r.expectedDutyHours / maxScale) * 100);
                    return (
                      <div key={r.technicianName} className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {r.technicianName}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {r.badgeId} · {r.trade} · {r.activeDutyDays}d active
                            </span>
                          </div>
                          <div className="flex items-center gap-3 font-mono tabular-nums text-[11px]">
                            <span className="text-brand-700 dark:text-brand-400">
                              WO: {r.productiveWorkHours}h
                            </span>
                            <span className="text-emerald-700 dark:text-emerald-400">
                              PPM: {r.ppmLaborHours}h
                            </span>
                            <span className="text-amber-700 dark:text-amber-400">
                              OT: {r.overtimeHours}h
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {r.avgJobHoursPerDay}h/day ({r.dutyUtilizationPct}% of 9h)
                            </span>
                          </div>
                        </div>
                        <div className="relative h-4 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                          {woW > 0 && (
                            <div
                              style={{ width: `${woW}%` }}
                              className="h-full bg-brand-600 dark:bg-brand-500"
                            />
                          )}
                          {ppmW > 0 && (
                            <div
                              style={{ width: `${ppmW}%` }}
                              className="h-full bg-emerald-600 dark:bg-emerald-500"
                            />
                          )}
                          {otW > 0 && (
                            <div
                              style={{ width: `${otW}%` }}
                              className="h-full bg-amber-500 dark:bg-amber-400"
                            />
                          )}
                          {r.expectedDutyHours > 0 && (
                            <div
                              style={{ left: `${capLeft}%` }}
                              className="absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-white"
                            />
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </section>

          {/* Full Technician Productive Hours & Performance Scorecard Table */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Technician Productive Hours &amp; Duty Scorecard
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consolidated by canonical roster technician (matching name variants across logs). Duty utilization compares productive hours to {STANDARD_DAILY_DUTY_HOURS}h/day × active logged days.
              </p>
            </div>
            {scorecard.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No technician activity found for the selected range.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                      <th className="py-3 px-4">Technician</th>
                      <th className="py-3 px-3 text-right">Active Days</th>
                      <th className="py-3 px-3 text-right">WO Hrs</th>
                      <th className="py-3 px-3 text-right">PPM Hrs</th>
                      <th className="py-3 px-3 text-right">Productive Hrs</th>
                      <th className="py-3 px-3 text-right">9h Duty Cap</th>
                      <th className="py-3 px-3 text-right">Duty Util %</th>
                      <th className="py-3 px-3 text-right">Avg Hrs/Day</th>
                      <th className="py-3 px-3 text-right">Jobs (Done/All)</th>
                      <th className="py-3 px-3 text-right">Avg Job</th>
                      <th className="py-3 px-3 text-right">OT Hrs</th>
                      <th className="py-3 px-3 text-right">&gt;10h Flag</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {scorecard.map((row) => (
                      <tr
                        key={row.technicianName}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {row.technicianName}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                            {row.badgeId} · {row.trade}
                          </p>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {row.activeDutyDays}d
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {row.productiveWorkHours}h
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {row.ppmLaborHours}h
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-brand-700 dark:text-brand-400">
                          {row.totalProductiveHours}h
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {row.expectedDutyHours}h
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono font-semibold tabular-nums ${
                            row.dutyUtilizationPct >= 65
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : row.dutyUtilizationPct >= 35
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {row.dutyUtilizationPct}%
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {row.avgJobHoursPerDay}h/d
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {row.completedJobs}/{row.totalJobs}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {row.avgFinishHours != null ? `${row.avgFinishHours}h` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                          {row.overtimeHours}h
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono tabular-nums ${
                            row.over10hFlaggedJobs > 0
                              ? 'text-red-700 dark:text-red-400 font-semibold'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {row.over10hFlaggedJobs}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Historical >10h Single-Job Audit Table (if any exist) */}
          {flaggedOver10hLogs.length > 0 && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Historical Single-Job &gt;{MAX_SINGLE_WORK_HOURS}h Audit ({flaggedOver10hLogs.length} records)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Existing/imported records where Start-to-Finish exceeded {MAX_SINGLE_WORK_HOURS} hours (often AM/PM swaps). Productive totals cap single-job contribution at {MAX_SINGLE_WORK_HOURS}h; new portal entries block &gt;{MAX_SINGLE_WORK_HOURS}h.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Technician</th>
                      <th className="py-2.5 px-4">Location</th>
                      <th className="py-2.5 px-4">Complaint</th>
                      <th className="py-2.5 px-4">Time Span</th>
                      <th className="py-2.5 px-4 text-right">Computed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {flaggedOver10hLogs.slice(0, 20).map(({ log, rawHours }) => (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {log.logDate}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                          {log.technicianName}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                          {log.location}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                          {log.complaint}
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {log.startTime || log.receivedTime || '--:--'} – {log.finishTime || '--:--'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-red-700 dark:text-red-400">
                          {rawHours}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 3: WORK ORDERS, TRADES & AGING                                */}
      {/* ===================================================================== */}
      {subTab === 'workorders' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            {/* Daily Jobs Logged vs Completed */}
            <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Daily Work Orders: Logged vs Completed
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Up to 30 active days in range (hover bars to inspect exact daily metrics)
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-brand-600 dark:bg-brand-500 inline-block" />
                    Logged
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-500 inline-block" />
                    Completed
                  </span>
                </div>
              </div>

              {hoveredJobsPoint && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-mono tabular-nums">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {hoveredJobsPoint.date}
                  </span>
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="text-brand-700 dark:text-brand-400">
                      Logged: {hoveredJobsPoint.logged}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Completed: {hoveredJobsPoint.completed}
                    </span>
                    <span className="text-amber-700 dark:text-amber-400">
                      Open: {hoveredJobsPoint.pending}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      Job Hrs: {hoveredJobsPoint.workHours}h
                    </span>
                  </div>
                </div>
              )}

              {dailyActivitySeries.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                  No work orders in this date range to chart.
                </div>
              ) : (
                <div className="w-full overflow-x-auto">
                  {(() => {
                    const maxVal = Math.max(
                      1,
                      ...dailyActivitySeries.map((d) => Math.max(d.logged, d.completed))
                    );
                    const stepW = Math.max(24, Math.floor(620 / Math.max(1, dailyActivitySeries.length)));
                    const w = Math.max(520, 48 + dailyActivitySeries.length * stepW);
                    const h = 210;
                    const chartTop = 16;
                    const chartBottom = 175;
                    const barMaxH = chartBottom - chartTop;
                    const singleBarW = Math.max(5, Math.min(11, Math.floor((stepW - 6) / 2)));

                    return (
                      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-56">
                        {[0, 0.5, 1].map((frac, idx) => {
                          const y = chartBottom - frac * barMaxH;
                          return (
                            <g key={idx}>
                              <line
                                x1={28}
                                y1={y}
                                x2={w - 8}
                                y2={y}
                                className="stroke-slate-200 dark:stroke-slate-800"
                                strokeDasharray="3 3"
                              />
                              <text
                                x={4}
                                y={y + 3}
                                fontSize="9.5"
                                className="fill-slate-500 dark:fill-slate-400"
                                fontFamily="monospace"
                              >
                                {Math.round(maxVal * frac)}
                              </text>
                            </g>
                          );
                        })}
                        {dailyActivitySeries.map((pt, i) => {
                          const xBase = 36 + i * stepW;
                          const hLog = (pt.logged / maxVal) * barMaxH;
                          const hComp = (pt.completed / maxVal) * barMaxH;
                          const isHovered = hoveredJobsPoint?.date === pt.date;
                          const showLabel =
                            dailyActivitySeries.length <= 16 || i % 2 === 0 || i === dailyActivitySeries.length - 1;
                          return (
                            <g
                              key={pt.date}
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredJobsDate(pt.date)}
                            >
                              {isHovered && (
                                <rect
                                  x={xBase - 3}
                                  y={chartTop - 4}
                                  width={singleBarW * 2 + 8}
                                  height={barMaxH + 8}
                                  rx={3}
                                  className="fill-slate-100 dark:fill-slate-800/70"
                                />
                              )}
                              <rect
                                x={xBase}
                                y={chartBottom - hLog}
                                width={singleBarW}
                                height={Math.max(2, hLog)}
                                rx={1.5}
                                className="fill-brand-600 dark:fill-brand-500"
                              />
                              <rect
                                x={xBase + singleBarW + 2}
                                y={chartBottom - hComp}
                                width={singleBarW}
                                height={Math.max(2, hComp)}
                                rx={1.5}
                                className="fill-emerald-600 dark:fill-emerald-500"
                              />
                              {showLabel && (
                                <text
                                  x={xBase + singleBarW}
                                  y={195}
                                  textAnchor="middle"
                                  fontSize="8.5"
                                  className="fill-slate-600 dark:fill-slate-400"
                                  fontFamily="monospace"
                                >
                                  {pt.date.slice(5)}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>
              )}
            </section>

            {/* Open Job Aging Buckets + Shift & Priority SLA */}
            <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Open Job Aging Buckets
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    All open Pending / On Hold jobs by age
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {(Object.entries(agingBuckets) as [string, number][]).map(([bucket, count]) => {
                  const maxBucket = Math.max(1, ...Object.values(agingBuckets));
                  const pct = Math.round((count / maxBucket) * 100);
                  const isOld = bucket === '4-7 days' || bucket === 'Over 7 days';
                  return (
                    <div key={bucket} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {bucket}
                        </span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {count}
                        </span>
                      </div>
                      <div className="h-3 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded ${
                            isOld
                              ? 'bg-amber-600 dark:bg-amber-500'
                              : 'bg-brand-600 dark:bg-brand-500'
                          }`}
                          style={{ width: `${count === 0 ? 0 : Math.max(6, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Priority Breakdown &amp; Average Duration
                </h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {(['Normal', 'Urgent', 'Emergency'] as const).map((p) => {
                    const pr = shiftPriorityStats.priorities[p];
                    return (
                      <div
                        key={p}
                        className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
                      >
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{p}</p>
                        <p className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {pr.count} ({pr.avgHours}h)
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          {/* Category / Trade Full Breakdown Table */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Work Orders &amp; Hours by Trade / Category
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <th className="py-3 px-4">Trade / Category</th>
                    <th className="py-3 px-4 text-right">Total Jobs</th>
                    <th className="py-3 px-4 text-right">Share %</th>
                    <th className="py-3 px-4 text-right">Completed</th>
                    <th className="py-3 px-4 text-right">Open</th>
                    <th className="py-3 px-4 text-right">Total Hours</th>
                    <th className="py-3 px-4 text-right">Avg Hours / Job</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {categoryBreakdown.map((c) => (
                    <tr key={c.category} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {c.category}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {c.total}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {c.pctOfJobs}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {c.completed}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                        {c.open}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-brand-700 dark:text-brand-400">
                        {c.totalHours}h
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {c.avgHours}h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 4: PPM, REPAIRS & TENANT SCHEDULES                            */}
      {/* ===================================================================== */}
      {subTab === 'ppm' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>PPM &amp; Repair Logs</span>
                <Wrench className="w-4 h-4 text-brand-700 dark:text-brand-400" />
              </div>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                {maintBreakdown.total}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {maintBreakdown.byApproval.approved} approved · {maintBreakdown.byApproval.pending_approval} pending
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>PPM / Repair Labor Hours</span>
                <Clock className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              </div>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                {maintBreakdown.totalLaborHours}h
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Logged across preventive &amp; repair works
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Faults / Observations</span>
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                {maintBreakdown.byOutcome.minor_observation + maintBreakdown.byOutcome.critical_fault}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {maintBreakdown.byOutcome.critical_fault} critical · {maintBreakdown.byOutcome.minor_observation} minor
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Tenant Schedules</span>
                <CalendarCheck2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              </div>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                {scheduleSummary.completionRate}%
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {scheduleSummary.counts.Completed} of {scheduleSummary.total} completed
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-6 items-start">
            {/* Work Type Breakdown */}
            <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Maintenance Breakdown by Entry Type
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  In-House PPM vs AMC Contractor PPM vs Repair &amp; Upgradation works
                </p>
              </div>
              <div className="space-y-3">
                {(['ppm_inhouse', 'ppm_amc', 'repair', 'upgradation'] as EntryType[]).map((et) => {
                  const info = maintBreakdown.byType[et];
                  const maxC = Math.max(
                    1,
                    ...Object.values(maintBreakdown.byType).map((v) => v.count)
                  );
                  const pct = Math.round((info.count / maxC) * 100);
                  return (
                    <div key={et} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {ENTRY_TYPE_LABELS[et]}
                        </span>
                        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          <strong>{info.count}</strong> logs · {info.hours}h
                        </span>
                      </div>
                      <div className="h-3 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded bg-brand-600 dark:bg-brand-500"
                          style={{ width: `${info.count === 0 ? 0 : Math.max(6, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Inspection Outcomes
                </h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {(['operational', 'minor_observation', 'critical_fault'] as WorkOutcome[]).map(
                    (o) => (
                      <div
                        key={o}
                        className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
                      >
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {OUTCOME_LABELS[o]}
                        </p>
                        <p className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                          {maintBreakdown.byOutcome[o]}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </section>

            {/* Tenant Schedules & Maintenance Disciplines */}
            <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Tenant Work Schedules Status &amp; Trade Mix
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Status breakdown of scheduled apartment / tenant maintenance appointments
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {(
                  [
                    { label: 'Completed', key: 'Completed', cls: 'text-emerald-700 dark:text-emerald-400' },
                    { label: 'In Progress', key: 'In Progress', cls: 'text-brand-700 dark:text-brand-400' },
                    { label: 'Pending', key: 'Pending', cls: 'text-amber-700 dark:text-amber-400' },
                    { label: 'Cancelled', key: 'Cancelled', cls: 'text-slate-500 dark:text-slate-400' },
                  ] as const
                ).map((item) => (
                  <div
                    key={item.key}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
                  >
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.label}</p>
                    <p className={`mt-1 text-xl font-semibold font-mono tabular-nums ${item.cls}`}>
                      {scheduleSummary.counts[item.key]}
                    </p>
                  </div>
                ))}
              </div>

              {scheduleSummary.byCategory.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tenant Schedules by Category
                  </h3>
                  {scheduleSummary.byCategory.map((cat) => {
                    const maxC = Math.max(1, scheduleSummary.byCategory[0]?.total || 1);
                    const pct = Math.round((cat.total / maxC) * 100);
                    return (
                      <div key={cat.category} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {cat.category}
                          </span>
                          <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                            {cat.completed}/{cat.total} completed
                          </span>
                        </div>
                        <div className="h-2.5 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded bg-emerald-600 dark:bg-emerald-500"
                            style={{ width: `${Math.max(6, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {maintBreakdown.byDiscipline.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Top PPM / Maintenance Disciplines
                  </h3>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {maintBreakdown.byDiscipline.slice(0, 6).map((d) => (
                      <span
                        key={d.discipline}
                        className="font-mono tabular-nums text-slate-700 dark:text-slate-300"
                      >
                        <strong className="text-slate-900 dark:text-slate-100">{d.discipline}:</strong>{' '}
                        {d.count} ({d.hours}h)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 5: UTILITY CONSUMPTION & ALERTS                               */}
      {/* ===================================================================== */}
      {subTab === 'utility' && (
        <div className="space-y-6">
          {/* Utility Type Totals */}
          {utilitySummaryByType.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {utilitySummaryByType.map((u) => (
                <div
                  key={u.meterType}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {u.meterType} ({u.meters} meters)
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                    {u.total.toLocaleString()}{' '}
                    <span className="text-sm font-normal text-slate-400">{u.unit}</span>
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Daily Utility Consumption Interactive SVG Chart */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Daily Utility Consumption ({chartUtilityType})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Summed daily metered consumption across active meters of the selected utility type (up to 28 days)
                </p>
              </div>
              <select
                value={chartUtilityType}
                onChange={(e) => setChartUtilityType(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {METER_TYPES.map((mt) => (
                  <option key={mt} value={mt}>
                    {mt}
                  </option>
                ))}
              </select>
            </div>

            {hoveredUtilPoint && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-mono tabular-nums">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {hoveredUtilPoint.date}
                </span>
                <span className="text-brand-700 dark:text-brand-400 font-semibold">
                  {hoveredUtilPoint.value.toLocaleString()}{' '}
                  {curUtilitySeries.find((s) => s.meterType === chartUtilityType)?.unit || 'Units'}
                </span>
              </div>
            )}

            {dailyUtilityChartPoints.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                No sequential {chartUtilityType} consumption readings in this date range.
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                {(() => {
                  const maxVal = Math.max(1, ...dailyUtilityChartPoints.map((d) => d.value));
                  const stepW = Math.max(24, Math.floor(660 / Math.max(1, dailyUtilityChartPoints.length)));
                  const w = Math.max(540, 48 + dailyUtilityChartPoints.length * stepW);
                  const h = 195;
                  const chartBottom = 160;
                  const barMaxH = 132;
                  const barW = Math.max(10, Math.min(24, stepW - 8));
                  return (
                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-52">
                      {[0, 0.5, 1].map((frac, idx) => {
                        const y = chartBottom - frac * barMaxH;
                        return (
                          <line
                            key={idx}
                            x1={32}
                            y1={y}
                            x2={w - 8}
                            y2={y}
                            className="stroke-slate-200 dark:stroke-slate-800"
                            strokeDasharray="3 3"
                          />
                        );
                      })}
                      {dailyUtilityChartPoints.map((pt, i) => {
                        const x = 36 + i * stepW;
                        const bh = (pt.value / maxVal) * barMaxH;
                        const showLabel =
                          dailyUtilityChartPoints.length <= 16 || i % 2 === 0 || i === dailyUtilityChartPoints.length - 1;
                        return (
                          <g
                            key={pt.date}
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredUtilDate(pt.date)}
                          >
                            <rect
                              x={x}
                              y={chartBottom - bh}
                              width={barW}
                              height={Math.max(3, bh)}
                              rx={2.5}
                              className={
                                chartUtilityType === 'Water'
                                  ? 'fill-sky-600 dark:fill-sky-500'
                                  : 'fill-emerald-600 dark:fill-emerald-500'
                              }
                            />
                            {dailyUtilityChartPoints.length <= 16 && (
                              <text
                                x={x + barW / 2}
                                y={chartBottom - bh - 4}
                                textAnchor="middle"
                                fontSize="8.5"
                                className="fill-slate-700 dark:fill-slate-300"
                                fontFamily="monospace"
                              >
                                {Math.round(pt.value)}
                              </text>
                            )}
                            {showLabel && (
                              <text
                                x={x + barW / 2}
                                y={180}
                                textAnchor="middle"
                                fontSize="8.5"
                                className="fill-slate-600 dark:fill-slate-400"
                                fontFamily="monospace"
                              >
                                {pt.date.slice(5)}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>
            )}
          </section>

          {/* Per-Meter Consumption Period Comparison Table */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Utility Consumption Comparison ({effectiveFrom}–{effectiveTo} vs {prevRange.from}–{prevRange.to})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Per-meter consumption delta compared to the immediately preceding {prevRange.days}-day period.
              </p>
            </div>
            {curUtilitySeries.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No utility meters registered yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                      <th className="py-3 px-4">Building &amp; Area</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Meter No</th>
                      <th className="py-3 px-4 text-right">Current Period</th>
                      <th className="py-3 px-4 text-right">Previous Period</th>
                      <th className="py-3 px-4 text-right">Delta</th>
                      <th className="py-3 px-4 text-right">Avg / Day</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {curUtilitySeries.map((cur) => {
                      const prev = prevUtilitySeries.find((p) => p.meterId === cur.meterId);
                      const prevVal = prev?.totalConsumption ?? 0;
                      const diff = round2(cur.totalConsumption - prevVal);
                      const pct = prevVal > 0 ? Math.round((diff / prevVal) * 100) : null;
                      return (
                        <tr
                          key={cur.meterId}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <td className="py-3 px-4">
                            <span className="font-mono font-semibold text-brand-700 dark:text-brand-400 mr-1.5">
                              {cur.buildingCode}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {cur.area}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                            {cur.meterType}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                            {cur.meterNo}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                            {cur.totalConsumption.toLocaleString()} {cur.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {prevVal.toLocaleString()} {cur.unit}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono font-medium tabular-nums ${
                              diff > 0
                                ? 'text-amber-700 dark:text-amber-400'
                                : diff < 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {diff > 0 ? '+' : ''}
                            {diff.toLocaleString()} {cur.unit}
                            {pct !== null ? ` (${diff > 0 ? '+' : ''}${pct}%)` : ''}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {cur.avgPerDay != null ? `${cur.avgPerDay} ${cur.unit}/d` : '-'}
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
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 6: OVERTIME ANALYTICS                                         */}
      {/* ===================================================================== */}
      {subTab === 'overtime' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(['N', 'WO', 'PH', 'N. Shift'] as OvertimeCategoryType[]).map((cat) => {
              const pct = curOtHours > 0 ? Math.round((otCategoryTotals[cat] / curOtHours) * 100) : 0;
              return (
                <div
                  key={cat}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Category {cat}</span>
                    <span className="font-mono tabular-nums">{pct}%</span>
                  </div>
                  <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                    {otCategoryTotals[cat]}h
                  </p>
                </div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-12 gap-6 items-start">
            {/* Daily Overtime Hours Trend */}
            <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Daily Overtime Hours Trend
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Total team overtime logged per date (up to 20 active overtime dates)
                </p>
              </div>

              {hoveredOtPoint && (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-mono tabular-nums">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {hoveredOtPoint.date}
                  </span>
                  <span className="text-amber-700 dark:text-amber-400 font-semibold">
                    {hoveredOtPoint.hours}h overtime
                  </span>
                </div>
              )}

              {otDriversAndTrend.dailySeries.length === 0 ? (
                <div className="h-44 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                  No overtime entries in this window.
                </div>
              ) : (
                <div className="w-full overflow-x-auto">
                  {(() => {
                    const maxVal = Math.max(
                      1,
                      ...otDriversAndTrend.dailySeries.map((d) => d.hours)
                    );
                    const stepW = Math.max(
                      26,
                      Math.floor(560 / Math.max(1, otDriversAndTrend.dailySeries.length))
                    );
                    const w = Math.max(460, 44 + otDriversAndTrend.dailySeries.length * stepW);
                    const h = 190;
                    const chartBottom = 155;
                    const barMaxH = 128;
                    const barW = Math.max(10, Math.min(24, stepW - 8));
                    return (
                      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48">
                        {otDriversAndTrend.dailySeries.map((pt, i) => {
                          const x = 32 + i * stepW;
                          const bh = (pt.hours / maxVal) * barMaxH;
                          return (
                            <g
                              key={pt.date}
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredOtDate(pt.date)}
                            >
                              <rect
                                x={x}
                                y={chartBottom - bh}
                                width={barW}
                                height={Math.max(3, bh)}
                                rx={2.5}
                                className="fill-amber-500 dark:fill-amber-400"
                              />
                              <text
                                x={x + barW / 2}
                                y={chartBottom - bh - 4}
                                textAnchor="middle"
                                fontSize="8.5"
                                className="fill-slate-700 dark:fill-slate-300"
                                fontFamily="monospace"
                              >
                                {pt.hours}h
                              </text>
                              <text
                                x={x + barW / 2}
                                y={174}
                                textAnchor="middle"
                                fontSize="8.5"
                                className="fill-slate-500 dark:fill-slate-400"
                                fontFamily="monospace"
                              >
                                {pt.date.slice(5)}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>
              )}
            </section>

            {/* Top Overtime Work Drivers */}
            <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Top Overtime Work Reasons
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Primary duties and tasks driving team overtime hours
                </p>
              </div>
              {otDriversAndTrend.topDrivers.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No overtime drivers recorded.
                </div>
              ) : (
                <div className="space-y-3">
                  {otDriversAndTrend.topDrivers.slice(0, 7).map((drv) => {
                    const maxH = Math.max(1, otDriversAndTrend.topDrivers[0]?.hours || 1);
                    const pct = Math.round((drv.hours / maxH) * 100);
                    return (
                      <div key={drv.workType} className="space-y-1">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {drv.workType}
                          </span>
                          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
                            <strong>{drv.hours}h</strong> ({drv.entries}x)
                          </span>
                        </div>
                        <div className="h-2.5 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded bg-amber-500 dark:bg-amber-400"
                            style={{ width: `${Math.max(5, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Overtime Hours by Technician ({effectiveFrom} to {effectiveTo})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <th className="py-3 px-4">Technician</th>
                    <th className="py-3 px-4 text-right">N (Normal)</th>
                    <th className="py-3 px-4 text-right">WO (Weekly Off)</th>
                    <th className="py-3 px-4 text-right">PH (Holiday)</th>
                    <th className="py-3 px-4 text-right">N. Shift</th>
                    <th className="py-3 px-4 text-right">Total OT</th>
                    <th className="py-3 px-4 text-right">Share %</th>
                    <th className="py-3 px-4 text-right">Entries</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {scorecard
                    .filter((r) => r.overtimeEntries > 0)
                    .map((r) => {
                      const share =
                        curOtHours > 0 ? Math.round((r.overtimeHours / curOtHours) * 100) : 0;
                      return (
                        <tr
                          key={r.technicianName}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                            {r.technicianName}{' '}
                            <span className="font-mono text-slate-500 dark:text-slate-400">
                              ({r.badgeId})
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                            {r.otByCategory.N}h
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                            {r.otByCategory.WO}h
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                            {r.otByCategory.PH}h
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                            {r.otByCategory['N. Shift']}h
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-brand-700 dark:text-brand-400 tabular-nums">
                            {r.overtimeHours}h
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                            {share}%
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                            {r.overtimeEntries}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
