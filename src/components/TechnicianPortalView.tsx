import React from 'react';
import {
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  FileText,
  Gauge,
  QrCode,
  RefreshCw,
  RotateCcw,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { NotificationBanner } from './NotificationBanner';
import { QuickWorkEntrySection } from './QuickWorkEntrySection';
import {
  APPROVAL_STATUS_LABELS,
  Building,
  ENTRY_TYPE_LABELS,
  EntryType,
  MaintenanceLog,
  MaintenanceNotification,
  OfflineQueueItem,
} from '../types';

interface TechnicianPortalViewProps {
  buildings: Building[];
  myLogs: MaintenanceLog[];
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
  onOpenQrScanner?: () => void;
  onToast: (msg: string) => void;
}

export const TechnicianPortalView: React.FC<TechnicianPortalViewProps> = ({
  buildings,
  myLogs,
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
  onOpenQrScanner,
  onToast,
}) => {
  const pendingCount = myLogs.filter((l) => l.approvalStatus === 'pending_approval').length;
  const revisionCount = myLogs.filter((l) => l.approvalStatus === 'revision_requested').length;
  const approvedCount = myLogs.filter((l) => l.approvalStatus === 'approved').length;
  const totalQueuedCount = offlineQueue.length + offlineOpsCount;

  const quickCardClass =
    'text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-brand-600 dark:hover:border-brand-500 transition-colors disabled:opacity-50';

  return (
    <div className="space-y-8">
      {/* Technician Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
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
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            Technician Field Portal — {user.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Log PPM reports, repairs, upgradations, daily shift work orders, overtime hours, utility meter readings, and tenant schedules.
          </p>
        </div>

        {onOpenQrScanner && (
          <button
            type="button"
            onClick={onOpenQrScanner}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <QrCode className="w-4 h-4" />
            Scan Asset QR Code
          </button>
        )}
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
