import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  Gauge,
  Megaphone,
  Plus,
  QrCode,
  Wrench,
} from 'lucide-react';
import { getActivePendingWorkLogs } from '../lib/operationsAnalytics';
import { buildActivePpmSchedules, formatDueDeltaLabel } from '../lib/ppmSchedule';
import {
  Building,
  ENTRY_TYPE_LABELS,
  EntryType,
  FREQUENCY_LABELS,
  MaintenanceLog,
  MaintenanceNotification,
  OvertimeLog,
  Technician,
  TenantSchedule,
  UtilityMeter,
  UtilityReading,
  WorkLog,
} from '../types';
import type { LogPrefillTemplate } from './LogFormModal';
import { NotificationBanner } from './NotificationBanner';
import { QuickWorkEntrySection } from './QuickWorkEntrySection';

interface SupervisorDashboardViewProps {
  buildings: Building[];
  logs: MaintenanceLog[];
  technicians: Technician[];
  workLogs: WorkLog[];
  overtimeLogs: OvertimeLog[];
  utilityMeters: UtilityMeter[];
  utilityReadings: UtilityReading[];
  tenantSchedules: TenantSchedule[];
  notifications: MaintenanceNotification[];
  userEmail: string;
  userName: string;
  isAdmin?: boolean;
  assetsCount?: number;
  onSelectLog: (log: MaintenanceLog) => void;
  onNavigate: (
    tab:
      | 'overview'
      | 'notifications'
      | 'ops_analytics'
      | 'work_logs'
      | 'overtime'
      | 'utility_meters'
      | 'tenant_schedules'
      | 'approvals'
      | 'schedules'
      | 'logs'
      | 'assets_qr'
      | 'buildings'
      | 'team'
      | 'supervisors'
      | 'excel'
  ) => void;
  onCreateNew: (defaultType?: EntryType, prefill?: LogPrefillTemplate) => void;
  onBroadcastAlert: () => void;
  onToast: (msg: string) => void;
}

export const SupervisorDashboardView: React.FC<SupervisorDashboardViewProps> = ({
  buildings,
  logs,
  technicians,
  workLogs,
  overtimeLogs,
  utilityMeters,
  utilityReadings,
  tenantSchedules,
  notifications,
  userEmail,
  userName,
  isAdmin = false,
  assetsCount = 0,
  onSelectLog,
  onNavigate,
  onCreateNew,
  onBroadcastAlert,
  onToast,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const pendingLogs = logs.filter((l) => l.approvalStatus === 'pending_approval');
  const approvedLogs = logs.filter((l) => l.approvalStatus === 'approved');
  const ppmLogs = approvedLogs.filter(
    (l) => l.entryType === 'ppm_inhouse' || l.entryType === 'ppm_amc'
  );
  const repairUpgradeLogs = approvedLogs.filter(
    (l) => l.entryType === 'repair' || l.entryType === 'upgradation'
  );

  const openWorkOrders = useMemo(
    () => getActivePendingWorkLogs(workLogs).length,
    [workLogs]
  );
  const pendingOtCount = overtimeLogs.filter((o) => o.approvalStatus === 'pending_approval').length;
  const todayReadingsCount = utilityReadings.filter((r) => r.readingDate === today).length;
  const activeMetersCount = utilityMeters.filter((m) => m.status === 'active').length;
  const todaySchedulesCount = tenantSchedules.filter((s) => s.scheduleDate === today).length;

  const upcomingTwoWeekReminders = useMemo(() => {
    return buildActivePpmSchedules(logs).filter(
      (s) => s.urgency === 'overdue' || s.urgency === 'due_soon'
    );
  }, [logs]);

  const overdueReminders = upcomingTwoWeekReminders.filter((s) => s.urgency === 'overdue');

  const cardClass =
    'text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-brand-600 dark:hover:border-brand-500 transition-colors';

  return (
    <div className="space-y-8">
      {/* Header & Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            {isAdmin ? 'Admin Portfolio Operations Overview' : 'Facility Operations Overview'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {isAdmin ? 'All supervisors & portfolio sites · ' : ''}
            {buildings.length} active building(s) ·{' '}
            {technicians.filter((t) => t.role === 'technician' && t.status === 'active').length} active technicians
            {assetsCount > 0 ? ` · ${assetsCount} registered assets` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('assets_qr')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <QrCode className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            Asset QR Labels
          </button>
          <button
            type="button"
            disabled={buildings.length === 0}
            onClick={onBroadcastAlert}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <Megaphone className="w-4 h-4" />
            Broadcast Alert
          </button>
          <button
            type="button"
            onClick={() => onNavigate('ops_analytics')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <BarChart3 className="w-4 h-4 text-brand-700 dark:text-brand-400" />
            Operations Analytics
          </button>
          <button
            type="button"
            onClick={() => onNavigate('excel')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-brand-700 dark:text-brand-400" />
            Excel Reports &amp; Import
          </button>
        </div>
      </div>

      {/* Urgent Maintenance Notifications Banner */}
      <NotificationBanner
        notifications={notifications}
        userEmail={userEmail}
        userName={userName}
        isSupervisor={true}
        onOpenNotifications={() => onNavigate('notifications')}
        onBroadcastAlert={onBroadcastAlert}
        onToast={onToast}
      />

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('schedules')}
          className={`${cardClass} p-5`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>PPM Due (Next 14 Days)</span>
            <CalendarClock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums font-mono">
            {upcomingTwoWeekReminders.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {overdueReminders.length > 0
              ? `${overdueReminders.length} overdue · ${upcomingTwoWeekReminders.length - overdueReminders.length} upcoming`
              : 'Scheduled within 2 weeks'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('approvals')}
          className={`${cardClass} p-5`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Awaiting Approval</span>
            <Clock className="w-4 h-4 text-brand-700 dark:text-brand-400" />
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums font-mono">
            {pendingLogs.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Technician submissions to review
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('logs')}
          className={`${cardClass} p-5`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Approved PPM Reports</span>
            <ClipboardCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums font-mono">
            {ppmLogs.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {approvedLogs.filter((l) => l.entryType === 'ppm_inhouse').length} in-house ·{' '}
            {approvedLogs.filter((l) => l.entryType === 'ppm_amc').length} AMC
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('logs')}
          className={`${cardClass} p-5`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Repairs &amp; Upgrades</span>
            <Wrench className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums font-mono">
            {repairUpgradeLogs.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Corrective &amp; upgrade records
          </p>
        </button>
      </div>

      {/* Today's Field Operations Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('work_logs')}
          className={`${cardClass} p-4`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Open Work Orders</span>
            <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {openWorkOrders}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5">
              / {workLogs.length} total
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Pending &amp; On Hold daily logs
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('overtime')}
          className={`${cardClass} p-4`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Overtime Queue</span>
            <Clock className="w-4 h-4 text-brand-700 dark:text-brand-400" />
          </div>
          <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {pendingOtCount}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5">
              pending
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {overtimeLogs.length} total overtime records
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('utility_meters')}
          className={`${cardClass} p-4`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Meter Readings Today</span>
            <Gauge className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          </div>
          <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {todayReadingsCount}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5">
              / {activeMetersCount} meters
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Utility &amp; consumption tracking
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('tenant_schedules')}
          className={`${cardClass} p-4`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Tenant Visits Today</span>
            <CalendarCheck2 className="w-4 h-4 text-brand-700 dark:text-brand-400" />
          </div>
          <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {todaySchedulesCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {tenantSchedules.filter((s) => s.status === 'Pending' || s.status === 'In Progress').length} open unit schedules
          </p>
        </button>
      </div>

      {/* Grouped Quick Entry for PPM & Repair/Upgradation */}
      <QuickWorkEntrySection
        heading="PPM, Repair & Upgradation Quick Entry"
        disabled={buildings.length === 0}
        onCreateNew={(type) => onCreateNew(type)}
      />

      {/* Upcoming 2-Week PPM Reminders Banner / Section */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Upcoming PPM Reminders (Next 2 Weeks)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatic schedule alerts based on logged In-House &amp; AMC PPM frequencies.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('schedules')}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 whitespace-nowrap"
          >
            Full PPM Schedule
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {upcomingTwoWeekReminders.length === 0 ? (
          <div className="p-6 flex items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                No PPM schedules are overdue or due within the next 14 days.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('schedules')}
              className="text-brand-700 dark:text-brand-400 font-medium hover:underline whitespace-nowrap"
            >
              View Future Schedules
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {upcomingTwoWeekReminders.slice(0, 6).map((item) => {
              const l = item.latestLog;
              return (
                <div
                  key={item.scheduleKey}
                  className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {l.buildingCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{ENTRY_TYPE_LABELS[l.entryType]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{FREQUENCY_LABELS[l.ppmFrequency]}</span>
                      {l.amcContractor && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{l.amcContractor}</span>
                        </>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {l.assetName} {l.assetTag ? `(${l.assetTag})` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Due {item.nextDueDate}
                      </p>
                      <p
                        className={`text-xs font-medium flex items-center justify-end gap-1 ${
                          item.urgency === 'overdue'
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {item.urgency === 'overdue' ? (
                          <AlertTriangle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {formatDueDeltaLabel(item.daysUntilDue)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onCreateNew(l.entryType, {
                          buildingId: l.buildingId,
                          entryType: l.entryType,
                          discipline: l.discipline,
                          assetName: l.assetName,
                          assetTag: l.assetTag,
                          locationZone: l.locationZone,
                          ppmFrequency: l.ppmFrequency,
                          amcContractor: l.amcContractor,
                          scheduledDate: item.nextDueDate,
                          title: `${FREQUENCY_LABELS[l.ppmFrequency]} PPM — ${l.assetName}`,
                        })
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Log PPM
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Main Split: Approval Queue + Building Summary */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Supervisor Review Queue
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verify before/after evidence and approve technician logs into the master database.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('approvals')}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 whitespace-nowrap"
            >
              View Queue
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {pendingLogs.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">All caught up</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                No technician submissions are currently waiting for supervisor approval.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {pendingLogs.slice(0, 6).map((log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => onSelectLog(log)}
                  className="w-full text-left px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {log.buildingCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{ENTRY_TYPE_LABELS[log.entryType]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{log.submittedByName}</span>
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {log.title}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 text-xs font-medium text-brand-800 dark:text-brand-300 whitespace-nowrap shrink-0">
                    Review
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Portfolio Breakdown
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Approved logs across active buildings
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('buildings')}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 whitespace-nowrap"
            >
              <Building2 className="w-3.5 h-3.5" />
              Manage
            </button>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {buildings.map((b) => {
              const bLogs = logs.filter((l) => l.buildingId === b.id);
              const bApproved = bLogs.filter((l) => l.approvalStatus === 'approved').length;
              const bPending = bLogs.filter((l) => l.approvalStatus === 'pending_approval').length;
              return (
                <div key={b.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      <span className="font-mono text-xs text-brand-700 dark:text-brand-400 mr-2">
                        {b.code}
                      </span>
                      {b.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {b.amcContractors.length} AMC vendor(s) · {b.floorsCount} floors
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums text-xs shrink-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{bApproved} approved</p>
                    {bPending > 0 && (
                      <p className="text-amber-700 dark:text-amber-400">{bPending} pending</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
