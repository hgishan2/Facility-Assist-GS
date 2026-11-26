import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Gauge,
  RefreshCw,
  RotateCcw,
  WifiOff,
  XCircle,
} from 'lucide-react';
import {
  addDaysIso,
  dedupeOvertimeLogs,
  getActivePendingWorkLogs,
  getEffectiveWorkHours,
  round2,
  STANDARD_DAILY_DUTY_HOURS,
} from '../lib/operationsAnalytics';
import {
  APPROVAL_STATUS_LABELS,
  Building,
  ENTRY_TYPE_LABELS,
  EntryType,
  MaintenanceLog,
  MaintenanceNotification,
  OfflineQueueItem,
  OvertimeCategoryType,
  OvertimeLog,
  TenantSchedule,
  UtilityReading,
  WorkLog,
} from '../types';
import { NotificationBanner } from './NotificationBanner';
import { QuickWorkEntrySection } from './QuickWorkEntrySection';

type PerfRange = '7d' | '30d' | '90d' | 'all';

interface TechnicianPortalViewProps {
  buildings: Building[];
  myLogs: MaintenanceLog[];
  workLogs?: WorkLog[];
  overtimeLogs?: OvertimeLog[];
  utilityReadings?: UtilityReading[];
  tenantSchedules?: TenantSchedule[];
  notifications: MaintenanceNotification[];
  offlineQueue: OfflineQueueItem[];
  offlineOpsCount?: number;
  openWorkLogsCount?: number;
  todaySchedulesCount?: number;
  isEffectiveOnline: boolean;
  syncing: boolean;
  user: { name: string; email: string; badgeId?: string; trade?: string };
  onCreateNew: (defaultType: EntryType) => void;
  onSelectLog: (log: MaintenanceLog) => void;
  onSyncNow: () => void;
  onOpenModule?: (tab: 'work_logs' | 'overtime' | 'utility_meters' | 'tenant_schedules') => void;
  onOpenNotifications: () => void;
  onToast: (msg: string) => void;
}

export const TechnicianPortalView: React.FC<TechnicianPortalViewProps> = ({
  buildings,
  myLogs,
  workLogs = [],
  overtimeLogs = [],
  utilityReadings = [],
  tenantSchedules = [],
  notifications,
  offlineQueue,
  offlineOpsCount = 0,
  openWorkLogsCount = 0,
  todaySchedulesCount = 0,
  isEffectiveOnline,
  syncing,
  user,
  onCreateNew,
  onSelectLog,
  onSyncNow,
  onOpenModule,
  onOpenNotifications,
  onToast,
}) => {
  const [perfRange, setPerfRange] = useState<PerfRange>('all');
  const [showPerfDetails, setShowPerfDetails] = useState(false);

  const pendingCount = myLogs.filter((l) => l.approvalStatus === 'pending_approval').length;
  const revisionCount = myLogs.filter((l) => l.approvalStatus === 'revision_requested').length;
  const approvedCount = myLogs.filter((l) => l.approvalStatus === 'approved').length;
  const totalQueuedCount = offlineQueue.length + offlineOpsCount;

  const performance = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const cutoffIso =
      perfRange === '7d'
        ? addDaysIso(todayIso, -6)
        : perfRange === '30d'
          ? addDaysIso(todayIso, -29)
          : perfRange === '90d'
            ? addDaysIso(todayIso, -89)
            : '';

    const inRange = (dateStr?: string) => {
      if (!cutoffIso) return true;
      const d = (dateStr || '').slice(0, 10);
      return Boolean(d) && d >= cutoffIso && d <= todayIso;
    };

    const wLogs = workLogs.filter((w) => inRange(w.logDate));
    const pLogs = myLogs.filter((m) => inRange(m.completedDate));
    const otLogs = dedupeOvertimeLogs(overtimeLogs).filter((o) => inRange(o.otDate));
    const rLogs = utilityReadings.filter((r) => inRange(r.readingDate));
    const sLogs = tenantSchedules.filter((s) => inRange(s.scheduleDate));

    const activeDates = new Set<string>();
    const dailyMap = new Map<
      string,
      { date: string; workHours: number; ppmHours: number; otHours: number; jobs: number }
    >();
    const ensureDay = (d: string) => {
      const existing = dailyMap.get(d);
      if (existing) return existing;
      const created = { date: d, workHours: 0, ppmHours: 0, otHours: 0, jobs: 0 };
      dailyMap.set(d, created);
      return created;
    };

    let productiveWorkHours = 0;
    let completedJobs = 0;
    const categoryMap = new Map<string, { category: string; count: number; hours: number }>();

    for (const w of wLogs) {
      const { hours } = getEffectiveWorkHours(w);
      productiveWorkHours = round2(productiveWorkHours + hours);
      if (w.status === 'Completed') completedJobs += 1;

      if (w.logDate) {
        activeDates.add(w.logDate);
        const day = ensureDay(w.logDate);
        day.workHours = round2(day.workHours + hours);
        day.jobs += 1;
      }

      const catKey = w.category || 'General';
      const cat = categoryMap.get(catKey) || { category: catKey, count: 0, hours: 0 };
      cat.count += 1;
      cat.hours = round2(cat.hours + hours);
      categoryMap.set(catKey, cat);
    }

    let ppmLaborHours = 0;
    let approvedPpm = 0;
    let revisionPpm = 0;
    for (const m of pLogs) {
      const hrs = Math.max(0, Number(m.laborHours) || 0);
      ppmLaborHours = round2(ppmLaborHours + hrs);
      if (m.approvalStatus === 'approved') approvedPpm += 1;
      if (m.approvalStatus === 'revision_requested') revisionPpm += 1;
      if (m.completedDate) {
        activeDates.add(m.completedDate);
        const day = ensureDay(m.completedDate);
        day.ppmHours = round2(day.ppmHours + hrs);
      }
    }

    for (const r of rLogs) {
      if (r.readingDate) activeDates.add(r.readingDate);
    }
    for (const s of sLogs) {
      if (s.scheduleDate) activeDates.add(s.scheduleDate);
    }

    let totalOtHours = 0;
    let approvedOtHours = 0;
    const otByCat: Record<OvertimeCategoryType, number> = { N: 0, WO: 0, PH: 0, 'N. Shift': 0 };
    for (const ot of otLogs) {
      totalOtHours = round2(totalOtHours + ot.hours);
      if (ot.approvalStatus === 'approved') {
        approvedOtHours = round2(approvedOtHours + ot.hours);
      }
      const cat = ot.otCategoryType in otByCat ? ot.otCategoryType : 'N';
      otByCat[cat] = round2(otByCat[cat] + ot.hours);
      if (ot.otDate) {
        const day = ensureDay(ot.otDate);
        day.otHours = round2(day.otHours + ot.hours);
      }
    }

    const totalProductiveHours = round2(productiveWorkHours + ppmLaborHours);
    const activeDutyDays = activeDates.size;
    const expectedDutyHours = round2(activeDutyDays * STANDARD_DAILY_DUTY_HOURS);
    const dutyUtilizationPct =
      expectedDutyHours > 0 ? Math.round((totalProductiveHours / expectedDutyHours) * 100) : 0;
    const avgHoursPerDay = activeDutyDays > 0 ? round2(totalProductiveHours / activeDutyDays) : 0;
    const completionRate = wLogs.length > 0 ? Math.round((completedJobs / wLogs.length) * 100) : 0;
    const pendingInRange = getActivePendingWorkLogs(wLogs).length;
    const completedSchedules = sLogs.filter((s) => s.status === 'Completed').length;

    const recentDays = Array.from(dailyMap.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7);

    const topCategories = Array.from(categoryMap.values())
      .sort((a, b) => b.count - a.count || b.hours - a.hours)
      .slice(0, 5);

    const hasAnyActivity =
      wLogs.length + pLogs.length + otLogs.length + rLogs.length + sLogs.length > 0;

    return {
      hasAnyActivity,
      totalJobs: wLogs.length,
      completedJobs,
      pendingInRange,
      completionRate,
      productiveWorkHours,
      ppmLaborHours,
      totalProductiveHours,
      activeDutyDays,
      dutyUtilizationPct,
      avgHoursPerDay,
      otEntries: otLogs.length,
      totalOtHours,
      approvedOtHours,
      otByCat,
      ppmCount: pLogs.length,
      approvedPpm,
      revisionPpm,
      readingsCount: rLogs.length,
      schedulesCount: sLogs.length,
      completedSchedules,
      recentDays,
      topCategories,
    };
  }, [perfRange, workLogs, myLogs, overtimeLogs, utilityReadings, tenantSchedules]);

  const quickCardClass =
    'text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-brand-600 dark:hover:border-brand-500 transition-colors disabled:opacity-50';

  const maxCategoryCount = Math.max(
    1,
    ...performance.topCategories.map((c) => c.count)
  );

  return (
    <div className="space-y-6">
      {/* Technician Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono font-semibold text-brand-700 dark:text-brand-400">
              {user.badgeId || 'TECH'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{user.trade || 'Field Technician'}</span>
            <span aria-hidden="true">·</span>
            <span>{buildings.length} assigned building(s)</span>
          </div>
          <h1 className="mt-0.5 text-xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            Technician Field Portal — {user.name}
          </h1>
        </div>
      </div>

      {/* Building Team Urgent Maintenance Notification Banners */}
      <NotificationBanner
        notifications={notifications}
        userEmail={user.email}
        userName={user.name}
        isSupervisor={false}
        onOpenNotifications={onOpenNotifications}
        onToast={onToast}
      />

      {/* Still Pending Work Reminder Callout */}
      {openWorkLogsCount > 0 && onOpenModule && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">
                Still Pending Work Reminder ({openWorkLogsCount} Active Job{openWorkLogsCount === 1 ? '' : 's'})
              </p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Resume Pending / On Hold jobs with Continue / Complete to log fresh Start &amp; Finish times.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenModule('work_logs')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white text-xs font-medium whitespace-nowrap"
          >
            Open Pending Jobs
          </button>
        </div>
      )}

      {/* Compact Personal Performance Bar */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400 shrink-0" />
            <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              My Performance
            </h2>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">
              · {STANDARD_DAILY_DUTY_HOURS}h/day benchmark
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
              {(
                [
                  { id: '7d', label: '7d' },
                  { id: '30d', label: '30d' },
                  { id: '90d', label: '90d' },
                  { id: 'all', label: 'All' },
                ] as { id: PerfRange; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPerfRange(opt.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    perfRange === opt.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowPerfDetails((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showPerfDetails ? 'Hide' : 'Details'}
              {showPerfDetails ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        {/* Compact 4-Column KPI Strip */}
        <div
          className={`grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 ${
            showPerfDetails ? 'border-b border-slate-200 dark:border-slate-800' : ''
          }`}
        >
          <div className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Productive</span>
              <span className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {performance.totalProductiveHours.toFixed(1)}h
              </span>
            </div>
            <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
              {performance.activeDutyDays}d · {performance.avgHoursPerDay.toFixed(1)}h/d · {performance.dutyUtilizationPct}% duty
            </p>
          </div>

          <div className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Work Orders</span>
              <span className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {performance.completedJobs}/{performance.totalJobs}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
              {performance.completionRate}% done · {performance.pendingInRange} pending
            </p>
          </div>

          <div className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Overtime</span>
              <span className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {performance.totalOtHours.toFixed(1)}h
              </span>
            </div>
            <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
              {performance.otEntries} log(s) · {performance.approvedOtHours.toFixed(1)}h appr.
            </p>
          </div>

          <div className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">PPM &amp; Field</span>
              <span className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {performance.ppmCount + performance.readingsCount + performance.schedulesCount}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
              {performance.ppmCount} PPM · {performance.readingsCount} mtr · {performance.schedulesCount} vis
            </p>
          </div>
        </div>

        {/* Expandable Breakdown */}
        {showPerfDetails &&
          (!performance.hasAnyActivity ? (
            <div className="p-5 text-center">
              <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                No performance records in the selected timeframe
              </p>
              <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
                {perfRange !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setPerfRange('all')}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Show All Time
                  </button>
                )}
                {onOpenModule && (
                  <button
                    type="button"
                    onClick={() => onOpenModule('work_logs')}
                    className="px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-xs font-medium whitespace-nowrap"
                  >
                    Log Work Entry
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
              <div className="lg:col-span-7 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Recent Active Days (vs {STANDARD_DAILY_DUTY_HOURS}h Duty)
                  </h3>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Work + PPM · OT
                  </span>
                </div>

                {performance.recentDays.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                    No dated work or overtime entries in this range yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {performance.recentDays.map((d) => {
                      const productive = round2(d.workHours + d.ppmHours);
                      const pct = Math.min(
                        100,
                        Math.round((productive / STANDARD_DAILY_DUTY_HOURS) * 100)
                      );
                      return (
                        <div key={d.date} className="space-y-1">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              {d.date}
                            </span>
                            <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                              {productive.toFixed(1)}h ({d.jobs} job{d.jobs === 1 ? '' : 's'})
                              {d.otHours > 0 ? ` · +${d.otHours.toFixed(1)}h OT` : ''}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                productive >= STANDARD_DAILY_DUTY_HOURS
                                  ? 'bg-emerald-600 dark:bg-emerald-500'
                                  : 'bg-brand-600 dark:bg-brand-500'
                              }`}
                              style={{ width: `${Math.max(productive > 0 ? 4 : 0, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 p-4 space-y-3">
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Top Work Categories
                  </h3>
                  {performance.topCategories.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      No shift work orders recorded in this range.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {performance.topCategories.map((c) => {
                        const pct = Math.round((c.count / maxCategoryCount) * 100);
                        return (
                          <div key={c.category} className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                {c.category}
                              </span>
                              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                                {c.count} · {c.hours.toFixed(1)}h
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-brand-700 dark:bg-brand-400"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>OT Split</span>
                  <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    N {performance.otByCat.N.toFixed(1)}h · WO {performance.otByCat.WO.toFixed(1)}h · PH{' '}
                    {performance.otByCat.PH.toFixed(1)}h · NS {performance.otByCat['N. Shift'].toFixed(1)}h
                  </span>
                </div>
              </div>
            </div>
          ))}
      </section>

      {/* Grouped PPM & Repair/Upgradation Entry Cards */}
      <QuickWorkEntrySection
        heading="PPM, Repair & Upgradation Logging"
        disabled={buildings.length === 0}
        onCreateNew={onCreateNew}
      />

      {/* Daily Field Operations Modules */}
      {onOpenModule && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Daily Operations &amp; Utility Modules
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => onOpenModule('work_logs')}
              className={quickCardClass}
            >
              <div className="flex items-center justify-between">
                <FileText className="w-5 h-5 text-brand-700 dark:text-brand-400" />
                {openWorkLogsCount > 0 && (
                  <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {openWorkLogsCount} open
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Daily Work Log
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                All shift works, complaints &amp; pending jobs
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenModule('overtime')}
              className={quickCardClass}
            >
              <Clock className="w-5 h-5 text-brand-700 dark:text-brand-400" />
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Overtime Log
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Record N, WO, PH &amp; N. Shift hours
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenModule('utility_meters')}
              className={quickCardClass}
            >
              <Gauge className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Utility Meter Readings
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Log Electricity &amp; Water meter dials
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenModule('tenant_schedules')}
              className={quickCardClass}
            >
              <div className="flex items-center justify-between">
                <CalendarCheck2 className="w-5 h-5 text-brand-700 dark:text-brand-400" />
                {todaySchedulesCount > 0 && (
                  <span className="font-mono text-xs font-semibold text-brand-700 dark:text-brand-400">
                    {todaySchedulesCount} today
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Tenant Schedules
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                View &amp; complete unit appointments
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Offline Queue Banner if items queued */}
      {totalQueuedCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-amber-800 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                {totalQueuedCount} Field Submission(s) Queued Offline
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {isEffectiveOnline
                  ? 'Connectivity restored — syncing automatically to Supervisor Review.'
                  : 'Saved safely on this device. Will sync automatically when signal returns.'}
              </p>
            </div>
          </div>
          {isEffectiveOnline && (
            <button
              type="button"
              disabled={syncing}
              onClick={onSyncNow}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-800 text-white text-xs font-medium hover:bg-amber-900"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>
      )}

      {/* My Submissions & Automatic Status Updates */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                My Submissions &amp; Approval Status
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Statuses update automatically when your supervisor approves or requests revision.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
              <span>{pendingCount} pending</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-700 dark:text-amber-400">{revisionCount} revision</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 dark:text-emerald-400">{approvedCount} approved</span>
            </div>
          </div>

          {myLogs.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No submissions yet</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Select one of the work types above to submit your first field report.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {myLogs.map((log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => onSelectLog(log)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {log.buildingCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{ENTRY_TYPE_LABELS[log.entryType]}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{log.completedDate}</span>
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {log.title}
                    </p>
                    {log.approvalStatus === 'revision_requested' && log.reviewNotes && (
                      <p className="mt-1 text-xs text-amber-800 dark:text-amber-400 truncate">
                        Supervisor note: {log.reviewNotes}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    {log.approvalStatus === 'approved' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        {APPROVAL_STATUS_LABELS[log.approvalStatus]}
                      </span>
                    ) : log.approvalStatus === 'revision_requested' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-800 dark:text-amber-300">
                        <RotateCcw className="w-3.5 h-3.5" />
                        Revise &amp; Resubmit
                      </span>
                    ) : log.approvalStatus === 'rejected' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                        <XCircle className="w-4 h-4" />
                        {APPROVAL_STATUS_LABELS[log.approvalStatus]}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 dark:text-brand-400">
                        <Clock className="w-4 h-4" />
                        {APPROVAL_STATUS_LABELS[log.approvalStatus]}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Assigned Buildings Directory */}
        <section className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Assigned Buildings
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sites enabled for your field login
            </p>
          </div>
          {buildings.length === 0 ? (
            <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
              No buildings are currently assigned to your account. Ask your supervisor to assign building access.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {buildings.map((b) => (
                <div key={b.id} className="px-5 py-3.5 flex items-start gap-3">
                  <Building2 className="w-4 h-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      <span className="font-mono text-xs text-brand-700 dark:text-brand-400 mr-1.5">
                        {b.code}
                      </span>
                      {b.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {b.floorsCount} floors · {b.amcContractors.length} AMC vendor(s)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
