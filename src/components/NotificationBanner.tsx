import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  MapPin,
  Megaphone,
  Users,
  X,
} from 'lucide-react';
import {
  acknowledgeMaintenanceNotification,
  resolveMaintenanceNotification,
} from '../lib/dataService';
import {
  MaintenanceNotification,
  normalizeEmail,
  NOTIFICATION_SEVERITY_LABELS,
  NotificationSeverity,
} from '../types';

interface NotificationBannerProps {
  notifications: MaintenanceNotification[];
  userEmail: string;
  userName: string;
  isSupervisor: boolean;
  onOpenNotifications: () => void;
  onBroadcastAlert?: () => void;
  onToast?: (msg: string) => void;
  compactMode?: boolean;
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  critical: 0,
  urgent: 1,
  advisory: 2,
};

export function toTimestampMillis(ts: unknown): number {
  if (!ts) return Date.now();
  if (typeof ts === 'object' && ts !== null) {
    const maybeTs = ts as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTs.toMillis === 'function') return maybeTs.toMillis();
    if (typeof maybeTs.seconds === 'number') return maybeTs.seconds * 1000;
  }
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function formatAlertTimestamp(ts: unknown): string {
  const ms = toTimestampMillis(ts);
  if (!ms) return 'Just now';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return 'Active';
  }
}

export function isActiveNotification(
  n: MaintenanceNotification,
  todayIso: string
): boolean {
  if (n.status !== 'active') return false;
  if (n.expiresAtDate && n.expiresAtDate < todayIso) return false;
  return true;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  notifications,
  userEmail,
  userName,
  isSupervisor,
  onOpenNotifications,
  onBroadcastAlert,
  onToast,
  compactMode = false,
}) => {
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cleanEmail = normalizeEmail(userEmail);
  const todayIso = new Date().toISOString().slice(0, 10);

  const activeAlerts = useMemo(() => {
    return notifications
      .filter((n) => isActiveNotification(n, todayIso))
      .sort((a, b) => {
        const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (sevDiff !== 0) return sevDiff;
        return toTimestampMillis(b.createdAt) - toTimestampMillis(a.createdAt);
      });
  }, [notifications, todayIso]);

  if (activeAlerts.length === 0) {
    return null;
  }

  const visibleAlerts = activeAlerts.filter((n) => {
    const isAck = n.acknowledgedByEmails.includes(cleanEmail);
    // Unacknowledged critical/urgent alerts cannot be locally hidden until acknowledged
    if (!isAck && (n.severity === 'critical' || n.severity === 'urgent')) {
      return true;
    }
    return !hiddenIds.includes(n.id);
  });

  const hiddenCount = activeAlerts.length - visibleAlerts.length;

  const handleAcknowledge = async (n: MaintenanceNotification) => {
    if (!cleanEmail || busyId) return;
    setBusyId(n.id);
    try {
      await acknowledgeMaintenanceNotification(n.id, cleanEmail);
      onToast?.(`Alert acknowledged for ${n.buildingCode}.`);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Unable to acknowledge alert.');
    } finally {
      setBusyId(null);
    }
  };

  const handleResolve = async (n: MaintenanceNotification) => {
    if (!isSupervisor || busyId) return;
    setBusyId(n.id);
    try {
      await resolveMaintenanceNotification(n.id, userName || cleanEmail, true);
      onToast?.(`Marked "${n.title}" as resolved.`);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Unable to resolve alert.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleHide = (id: string) => {
    setHiddenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (compactMode) {
    const urgentUnacked = activeAlerts.filter(
      (n) =>
        (n.severity === 'critical' || n.severity === 'urgent') &&
        !n.acknowledgedByEmails.includes(cleanEmail)
    );
    if (urgentUnacked.length === 0) return null;
    const top = urgentUnacked[0];
    const isCritical = top.severity === 'critical';

    return (
      <div
        role="alert"
        className={`mb-5 rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
          isCritical
            ? 'bg-red-50 dark:bg-red-950/70 border-red-300 dark:border-red-800 text-red-950 dark:text-red-100'
            : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isCritical ? (
            <AlertOctagon className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide text-[10px] ${
                  isCritical
                    ? 'bg-red-600 text-white'
                    : 'bg-amber-600 text-white'
                }`}
              >
                {NOTIFICATION_SEVERITY_LABELS[top.severity]}
              </span>
              <span className="font-mono font-semibold">{top.buildingCode}</span>
              <span className="truncate font-semibold">{top.title}</span>
              {urgentUnacked.length > 1 && (
                <span className="text-[11px] opacity-80">
                  (+{urgentUnacked.length - 1} more urgent)
                </span>
              )}
            </div>
            <p className="text-xs opacity-90 truncate mt-0.5">{top.message}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={busyId === top.id}
            onClick={() => handleAcknowledge(top)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isCritical
                ? 'bg-red-700 hover:bg-red-800 text-white'
                : 'bg-amber-700 hover:bg-amber-800 text-white'
            } disabled:opacity-50`}
          >
            <Check className="w-3.5 h-3.5" />
            Acknowledge
          </button>
          <button
            type="button"
            onClick={onOpenNotifications}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-current/25 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            View Alerts
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Maintenance Notifications" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-red-600 dark:text-red-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Active Maintenance Notifications ({activeAlerts.length})
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setHiddenIds([])}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            >
              <Eye className="w-3.5 h-3.5" />
              Show {hiddenCount} hidden alert(s)
            </button>
          )}
          {isSupervisor && onBroadcastAlert && (
            <button
              type="button"
              onClick={onBroadcastAlert}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-400 hover:underline"
            >
              <Megaphone className="w-3.5 h-3.5" />
              Broadcast New Alert
            </button>
          )}
          <button
            type="button"
            onClick={onOpenNotifications}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-400 hover:underline"
          >
            All Notifications
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {visibleAlerts.map((n) => {
        const isAck = n.acknowledgedByEmails.includes(cleanEmail);
        const canHide = isAck || n.severity === 'advisory';

        const containerStyle =
          n.severity === 'critical'
            ? 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800 border-l-4 border-l-red-600 dark:border-l-red-500'
            : n.severity === 'urgent'
              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 border-l-4 border-l-amber-600 dark:border-l-amber-500'
              : 'bg-brand-50 dark:bg-brand-950/50 border-brand-200 dark:border-brand-800 border-l-4 border-l-brand-600 dark:border-l-brand-400';

        const badgeStyle =
          n.severity === 'critical'
            ? 'bg-red-600 text-white'
            : n.severity === 'urgent'
              ? 'bg-amber-600 text-white'
              : 'bg-brand-700 text-white';

        const textAccent =
          n.severity === 'critical'
            ? 'text-red-950 dark:text-red-50'
            : n.severity === 'urgent'
              ? 'text-amber-950 dark:text-amber-50'
              : 'text-slate-900 dark:text-slate-100';

        const subAccent =
          n.severity === 'critical'
            ? 'text-red-900/90 dark:text-red-200/90'
            : n.severity === 'urgent'
              ? 'text-amber-900/90 dark:text-amber-200/90'
              : 'text-slate-700 dark:text-slate-300';

        return (
          <div
            key={n.id}
            role="alert"
            className={`rounded-xl border p-4 sm:p-5 transition-colors ${containerStyle}`}
          >
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 shrink-0">
                  {n.severity === 'critical' ? (
                    <AlertOctagon className="w-5 h-5 text-red-600 dark:text-red-400" />
                  ) : n.severity === 'urgent' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <BellRing className="w-5 h-5 text-brand-700 dark:text-brand-400" />
                  )}
                </div>

                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${badgeStyle}`}
                    >
                      {NOTIFICATION_SEVERITY_LABELS[n.severity]}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {n.buildingCode} — {n.buildingName}
                    </span>
                    <span className={`font-medium ${subAccent}`}>{n.category}</span>
                    {n.locationZone && (
                      <span className={`inline-flex items-center gap-1 ${subAccent}`}>
                        <MapPin className="w-3 h-3" />
                        {n.locationZone}
                      </span>
                    )}
                  </div>

                  <h3 className={`text-base font-semibold ${textAccent}`}>{n.title}</h3>
                  <p className={`text-sm whitespace-pre-line leading-relaxed ${subAccent}`}>
                    {n.message}
                  </p>

                  <div className={`pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] ${subAccent}`}>
                    <span>Broadcast by {n.createdByName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatAlertTimestamp(n.createdAt)}</span>
                    {n.expiresAtDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">Active through {n.expiresAtDate}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Users className="w-3 h-3" />
                      {n.acknowledgedByEmails.length} acknowledged
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 lg:justify-end">
                {isAck ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Acknowledged
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === n.id}
                    onClick={() => handleAcknowledge(n)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
                      n.severity === 'critical'
                        ? 'bg-red-700 hover:bg-red-800'
                        : n.severity === 'urgent'
                          ? 'bg-amber-700 hover:bg-amber-800'
                          : 'bg-brand-700 hover:bg-brand-800'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {busyId === n.id ? 'Confirming...' : 'Acknowledge Alert'}
                  </button>
                )}

                {isSupervisor && (
                  <button
                    type="button"
                    disabled={busyId === n.id}
                    onClick={() => handleResolve(n)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Mark Resolved
                  </button>
                )}

                {canHide && (
                  <button
                    type="button"
                    onClick={() => toggleHide(n.id)}
                    className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10"
                    title="Hide alert from banner for this session"
                    aria-label="Hide alert banner"
                  >
                    {visibleAlerts.length === 1 && hiddenCount === 0 ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
};
