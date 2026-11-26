import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  Edit3,
  MapPin,
  Megaphone,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  acknowledgeMaintenanceNotification,
  broadcastMaintenanceNotifications,
  deleteMaintenanceNotification,
  resolveMaintenanceNotification,
  updateMaintenanceNotification,
} from '../lib/dataService';
import {
  Building,
  MaintenanceNotification,
  MAX_LENGTHS,
  normalizeEmail,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_SEVERITY_LABELS,
  NotificationSeverity,
  Technician,
  UserRole,
} from '../types';
import {
  formatAlertTimestamp,
  isActiveNotification,
  toTimestampMillis,
} from './NotificationBanner';
import { SpellCheckInput, SpellCheckTextarea } from './SpellCheckField';

interface NotificationBroadcastModalProps {
  buildings: Building[];
  defaultBuildingId?: string;
  editingNotification?: MaintenanceNotification | null;
  user: { uid: string; name: string; email: string };
  onClose: () => void;
  onSaved: (message: string) => void;
}

export const NotificationBroadcastModal: React.FC<NotificationBroadcastModalProps> = ({
  buildings,
  defaultBuildingId = 'all',
  editingNotification = null,
  user,
  onClose,
  onSaved,
}) => {
  const activeBuildings = useMemo(
    () => buildings.filter((b) => b.status === 'active'),
    [buildings]
  );

  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>(() => {
    if (editingNotification) return [editingNotification.buildingId];
    if (defaultBuildingId !== 'all' && activeBuildings.some((b) => b.id === defaultBuildingId)) {
      return [defaultBuildingId];
    }
    if (activeBuildings.length === 1) {
      return [activeBuildings[0].id];
    }
    return [];
  });

  const [severity, setSeverity] = useState<NotificationSeverity>(
    editingNotification?.severity || 'urgent'
  );
  const [category, setCategory] = useState<string>(
    editingNotification?.category || NOTIFICATION_CATEGORIES[0]
  );
  const [locationZone, setLocationZone] = useState<string>(
    editingNotification?.locationZone || ''
  );
  const [title, setTitle] = useState<string>(editingNotification?.title || '');
  const [message, setMessage] = useState<string>(editingNotification?.message || '');
  const [expiresAtDate, setExpiresAtDate] = useState<string>(
    editingNotification?.expiresAtDate || ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleBuilding = (id: string) => {
    setSelectedBuildingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!editingNotification && selectedBuildingIds.length === 0) {
      setError('Select at least one target building team.');
      return;
    }
    if (!title.trim()) {
      setError('Enter an urgent alert headline.');
      return;
    }
    if (!message.trim()) {
      setError('Enter detailed instructions or alert message for the building team.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingNotification) {
        await updateMaintenanceNotification(editingNotification.id, {
          severity,
          category,
          title,
          message,
          locationZone,
          expiresAtDate,
        });
        onSaved(`Alert updated for ${editingNotification.buildingCode}.`);
      } else {
        const targetBuildings = buildings.filter((b) => selectedBuildingIds.includes(b.id));
        await broadcastMaintenanceNotifications(
          {
            buildings: targetBuildings,
            severity,
            category,
            title,
            message,
            locationZone,
            expiresAtDate,
          },
          user
        );
        onSaved(
          `Urgent alert broadcast to ${targetBuildings.length} building team(s).`
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send notification.');
    } finally {
      setSubmitting(false);
    }
  };

  const severityOptions: {
    value: NotificationSeverity;
    label: string;
    desc: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: 'critical',
      label: 'Critical Emergency',
      desc: 'Power/water outage, safety hazard, immediate dispatch',
      icon: <AlertOctagon className="w-4 h-4 text-red-600 dark:text-red-400" />,
    },
    {
      value: 'urgent',
      label: 'Urgent Action',
      desc: 'Priority shutdown, chiller trip, tenant escalation',
      icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
    },
    {
      value: 'advisory',
      label: 'Team Advisory',
      desc: 'Planned isolation, vendor access, shift handover notice',
      icon: <BellRing className="w-4 h-4 text-brand-700 dark:text-brand-400" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 flex items-center justify-center">
              <Megaphone className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingNotification ? 'Edit Maintenance Alert' : 'Broadcast Maintenance Notification'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Appears immediately as a high-visibility banner on targeted building teams&apos; dashboards.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {/* Target Building Teams */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Target Building Team(s) *
              </label>
              {!editingNotification && activeBuildings.length > 1 && (
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedBuildingIds(activeBuildings.map((b) => b.id))}
                    className="font-medium text-brand-700 dark:text-brand-400 hover:underline"
                  >
                    Select All ({activeBuildings.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBuildingIds([])}
                    className="text-slate-500 dark:text-slate-400 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {editingNotification ? (
              <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-slate-200">
                <Building2 className="w-4 h-4 text-brand-700 dark:text-brand-400" />
                <span className="font-mono font-semibold">{editingNotification.buildingCode}</span>
                <span>— {editingNotification.buildingName}</span>
              </div>
            ) : activeBuildings.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No active buildings configured yet. Add a building first.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5 max-h-44 overflow-y-auto pr-1">
                {activeBuildings.map((b) => {
                  const checked = selectedBuildingIds.includes(b.id);
                  return (
                    <label
                      key={b.id}
                      className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checked
                          ? 'bg-brand-50 dark:bg-brand-950/50 border-brand-600 dark:border-brand-500'
                          : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBuilding(b.id)}
                        className="mt-0.5 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          <span className="font-mono text-brand-700 dark:text-brand-400 mr-1.5">
                            {b.code}
                          </span>
                          {b.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {b.memberEmails.length} assigned member(s)
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Severity */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Alert Severity *
            </label>
            <div className="grid sm:grid-cols-3 gap-2.5">
              {severityOptions.map((opt) => {
                const active = severity === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSeverity(opt.value)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      active
                        ? opt.value === 'critical'
                          ? 'bg-red-50 dark:bg-red-950/60 border-red-500 dark:border-red-600'
                          : opt.value === 'urgent'
                            ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 dark:border-amber-600'
                            : 'bg-brand-50 dark:bg-brand-950/60 border-brand-600 dark:border-brand-500'
                        : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {opt.icon}
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {opt.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category + Location Zone */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                System / Discipline Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
              >
                {NOTIFICATION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Affected Area / Zone (Optional)
              </label>
              <SpellCheckInput
                value={locationZone}
                onValueChange={setLocationZone}
                maxLength={MAX_LENGTHS.locationZone}
                placeholder="e.g., Main Chiller Plant / Basement 1"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Alert Headline *
            </label>
            <SpellCheckInput
              value={title}
              onValueChange={setTitle}
              maxLength={MAX_LENGTHS.title}
              required
              placeholder="e.g., Chiller #2 High Pressure Trip — Immediate Inspection Required"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Urgent Instructions &amp; Team Guidance *
            </label>
            <SpellCheckTextarea
              value={message}
              onValueChange={setMessage}
              showToggle={true}
              rows={4}
              maxLength={MAX_LENGTHS.notificationMessage}
              required
              placeholder="Describe the issue, affected equipment, safety precautions, and immediate actions required from the building team..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Expiry Date */}
          <div className="sm:max-w-xs">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Auto-Expire Date (Optional)
            </label>
            <input
              type="date"
              value={expiresAtDate}
              onChange={(e) => setExpiresAtDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Leave blank to keep the banner active until a supervisor marks it resolved.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
                severity === 'critical'
                  ? 'bg-red-700 hover:bg-red-800'
                  : severity === 'urgent'
                    ? 'bg-amber-700 hover:bg-amber-800'
                    : 'bg-brand-700 hover:bg-brand-800'
              }`}
            >
              <Megaphone className="w-4 h-4" />
              {submitting
                ? 'Broadcasting...'
                : editingNotification
                  ? 'Save Alert Changes'
                  : `Broadcast to ${selectedBuildingIds.length || 0} Building Team(s)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface NotificationsViewProps {
  buildings: Building[];
  notifications: MaintenanceNotification[];
  technicians: Technician[];
  selectedBuildingId: string;
  user: {
    uid: string;
    name: string;
    email: string;
    role: UserRole;
  };
  onToast: (msg: string) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  buildings,
  notifications,
  technicians,
  selectedBuildingId,
  user,
  onToast,
}) => {
  const [statusFilter, setStatusFilter] = useState<'active' | 'resolved' | 'all'>('active');
  const [severityFilter, setSeverityFilter] = useState<'all' | NotificationSeverity>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingNotification, setEditingNotification] =
    useState<MaintenanceNotification | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedAckId, setExpandedAckId] = useState<string | null>(null);

  const isSupervisor = user.role === 'supervisor' || user.role === 'admin';
  const cleanEmail = normalizeEmail(user.email);
  const todayIso = new Date().toISOString().slice(0, 10);

  const techLookupByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of technicians) {
      map.set(normalizeEmail(t.authEmail), `${t.name} (${t.badgeId})`);
      if (t.email) {
        map.set(normalizeEmail(t.email), `${t.name} (${t.badgeId})`);
      }
    }
    return map;
  }, [technicians]);

  const counts = useMemo(() => {
    const active = notifications.filter((n) => isActiveNotification(n, todayIso));
    const urgentCritical = active.filter(
      (n) => n.severity === 'critical' || n.severity === 'urgent'
    );
    const unackedByMe = active.filter(
      (n) => !n.acknowledgedByEmails.includes(cleanEmail)
    );
    const resolved = notifications.filter((n) => !isActiveNotification(n, todayIso));
    return {
      active: active.length,
      urgentCritical: urgentCritical.length,
      unackedByMe: unackedByMe.length,
      resolved: resolved.length,
    };
  }, [notifications, todayIso, cleanEmail]);

  const filteredNotifications = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications
      .filter((n) => {
        const activeNow = isActiveNotification(n, todayIso);
        if (statusFilter === 'active' && !activeNow) return false;
        if (statusFilter === 'resolved' && activeNow) return false;
        if (severityFilter !== 'all' && n.severity !== severityFilter) return false;
        if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
        if (q) {
          const hay = `${n.buildingCode} ${n.buildingName} ${n.title} ${n.message} ${n.locationZone} ${n.category} ${n.createdByName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => toTimestampMillis(b.createdAt) - toTimestampMillis(a.createdAt));
  }, [notifications, statusFilter, severityFilter, categoryFilter, search, todayIso]);

  const handleAcknowledge = async (n: MaintenanceNotification) => {
    if (busyId) return;
    setBusyId(n.id);
    try {
      await acknowledgeMaintenanceNotification(n.id, cleanEmail);
      onToast(`Acknowledged alert for ${n.buildingCode}.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to acknowledge alert.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleResolve = async (n: MaintenanceNotification, resolve: boolean) => {
    if (!isSupervisor || busyId) return;
    setBusyId(n.id);
    try {
      await resolveMaintenanceNotification(n.id, user.name || cleanEmail, resolve);
      onToast(
        resolve
          ? `Marked "${n.title}" as resolved.`
          : `Reopened alert "${n.title}" for ${n.buildingCode}.`
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update alert status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (n: MaintenanceNotification) => {
    if (!isSupervisor || busyId) return;
    setBusyId(n.id);
    try {
      await deleteMaintenanceNotification(n.id);
      setConfirmDeleteId(null);
      onToast('Maintenance notification deleted.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to delete alert.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            Maintenance Notifications &amp; Urgent Alerts
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {isSupervisor
              ? 'Broadcast real-time urgent alerts to specific building teams and track acknowledgments.'
              : 'Live operational alerts and emergency instructions broadcast to your assigned building teams.'}
          </p>
        </div>

        {isSupervisor && (
          <button
            type="button"
            disabled={buildings.length === 0}
            onClick={() => {
              setEditingNotification(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Megaphone className="w-4 h-4" />
            Broadcast Urgent Alert
          </button>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Critical / Urgent Active</p>
          <p className="mt-1.5 text-2xl font-semibold text-red-700 dark:text-red-400 font-mono tabular-nums">
            {counts.urgentCritical}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Active Alerts</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {counts.active}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Awaiting Your Ack</p>
          <p className="mt-1.5 text-2xl font-semibold text-amber-700 dark:text-amber-400 font-mono tabular-nums">
            {counts.unackedByMe}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Resolved / Expired</p>
          <p className="mt-1.5 text-2xl font-semibold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
            {counts.resolved}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {(['active', 'resolved', 'all'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                statusFilter === tab
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 flex-1 justify-end">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as 'all' | NotificationSeverity)}
            aria-label="Filter by severity"
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical Emergency</option>
            <option value="urgent">Urgent Action</option>
            <option value="advisory">Team Advisory</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100"
          >
            <option value="all">All Categories</option>
            {NOTIFICATION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search alerts, zones, buildings..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <BellRing className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
            No maintenance notifications match this filter
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isSupervisor
              ? 'Use "Broadcast Urgent Alert" to notify a building team immediately.'
              : 'All urgent building alerts for this filter are clear.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotifications.map((n) => {
            const activeNow = isActiveNotification(n, todayIso);
            const isAck = n.acknowledgedByEmails.includes(cleanEmail);
            const isExpanded = expandedAckId === n.id;

            const borderAccent = !activeNow
              ? 'border-l-4 border-l-emerald-500'
              : n.severity === 'critical'
                ? 'border-l-4 border-l-red-600'
                : n.severity === 'urgent'
                  ? 'border-l-4 border-l-amber-600'
                  : 'border-l-4 border-l-brand-600';

            return (
              <article
                key={n.id}
                className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 ${borderAccent}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${
                          n.severity === 'critical'
                            ? 'bg-red-600 text-white'
                            : n.severity === 'urgent'
                              ? 'bg-amber-600 text-white'
                              : 'bg-brand-700 text-white'
                        }`}
                      >
                        {NOTIFICATION_SEVERITY_LABELS[n.severity]}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          activeNow
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {n.status === 'resolved'
                          ? 'Resolved'
                          : activeNow
                            ? 'Active Banner'
                            : 'Expired'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {n.buildingCode} — {n.buildingName}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400 font-medium">
                        {n.category}
                      </span>
                      {n.locationZone && (
                        <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <MapPin className="w-3 h-3" />
                          {n.locationZone}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {n.title}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {activeNow &&
                      (isAck ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Acknowledged
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === n.id}
                          onClick={() => handleAcknowledge(n)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Acknowledge
                        </button>
                      ))}

                    {isSupervisor && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNotification(n);
                            setModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>

                        <button
                          type="button"
                          disabled={busyId === n.id}
                          onClick={() => handleToggleResolve(n, n.status === 'active')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                        >
                          {n.status === 'active' ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              Resolve
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              Reopen
                            </>
                          )}
                        </button>

                        {confirmDeleteId === n.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busyId === n.id}
                              onClick={() => handleDelete(n)}
                              className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(n.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                            aria-label="Delete notification"
                            title="Delete notification"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                  {n.message}
                </p>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>Broadcast by {n.createdByName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatAlertTimestamp(n.createdAt)}</span>
                    {n.expiresAtDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">Expires {n.expiresAtDate}</span>
                      </>
                    )}
                    {n.status === 'resolved' && n.resolvedByName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          Resolved by {n.resolvedByName}
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setExpandedAckId(isExpanded ? null : n.id)}
                    className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 hover:text-brand-700 dark:hover:text-brand-400"
                  >
                    <Users className="w-3.5 h-3.5" />
                    {n.acknowledgedByEmails.length} / {n.buildingMemberEmails.length} team acknowledged
                  </button>
                </div>

                {isExpanded && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                    <p className="font-semibold text-slate-700 dark:text-slate-200">
                      Team Acknowledgments ({n.acknowledgedByEmails.length})
                    </p>
                    {n.acknowledgedByEmails.length === 0 ? (
                      <p className="text-slate-500 dark:text-slate-400">
                        No building team members have acknowledged this alert yet.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {n.acknowledgedByEmails.map((em) => (
                          <span
                            key={em}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {techLookupByEmail.get(normalizeEmail(em)) || em}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <NotificationBroadcastModal
          buildings={buildings}
          defaultBuildingId={selectedBuildingId}
          editingNotification={editingNotification}
          user={user}
          onClose={() => {
            setModalOpen(false);
            setEditingNotification(null);
          }}
          onSaved={onToast}
        />
      )}
    </div>
  );
};
