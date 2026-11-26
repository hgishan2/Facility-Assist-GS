import React, { useMemo, useState } from 'react';
import {
  CalendarCheck2,
  CheckCircle2,
  Clock,
  Download,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  deleteTenantSchedule,
  saveTenantSchedule,
  updateTenantScheduleStatus,
} from '../lib/dataService';
import { exportTenantSchedulesWorkbook } from '../lib/excelUtils';
import { SpellCheckInput, SpellCheckTextarea } from './SpellCheckField';
import {
  Building,
  Technician,
  TenantSchedule,
  TenantScheduleStatus,
  UserRole,
  WORK_CATEGORIES,
} from '../types';

interface TenantSchedulesViewProps {
  buildings: Building[];
  schedules: TenantSchedule[];
  technicians: Technician[];
  user: { uid: string; name: string; email: string; role: UserRole };
  isEffectiveOnline: boolean;
  onToast: (msg: string) => void;
}

const SCHEDULE_STATUSES: TenantScheduleStatus[] = [
  'Pending',
  'In Progress',
  'Completed',
  'Cancelled',
];

export const TenantSchedulesView: React.FC<TenantSchedulesViewProps> = ({
  buildings,
  schedules,
  technicians,
  user,
  isEffectiveOnline,
  onToast,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(nextMonth);
  const [statusFilter, setStatusFilter] = useState<'all' | TenantScheduleStatus>('all');
  const [techFilter, setTechFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Create / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TenantSchedule | null>(null);
  const [buildingId, setBuildingId] = useState(buildings[0]?.id || '');
  const [scheduleDate, setScheduleDate] = useState(today);
  const [timeSlot, setTimeSlot] = useState('09:00 - 11:00');
  const [unitOrLocation, setUnitOrLocation] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [category, setCategory] = useState<string>(WORK_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [assignedTechKey, setAssignedTechKey] = useState('self');
  const [status, setStatus] = useState<TenantScheduleStatus>('Pending');
  const [completionNotes, setCompletionNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Quick Completion Modal
  const [completingItem, setCompletingItem] = useState<TenantSchedule | null>(null);
  const [quickCompletionNotes, setQuickCompletionNotes] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isSupervisor = user.role === 'supervisor' || user.role === 'admin';

  const activeTechs = useMemo(
    () => technicians.filter((t) => t.status === 'active'),
    [technicians]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schedules
      .filter((s) => {
        if (dateFrom && s.scheduleDate < dateFrom) return false;
        if (dateTo && s.scheduleDate > dateTo) return false;
        if (statusFilter !== 'all' && s.status !== statusFilter) return false;
        if (techFilter !== 'all' && s.assignedTechName !== techFilter) return false;
        if (q) {
          const hay =
            `${s.buildingCode} ${s.unitOrLocation} ${s.tenantName} ${s.category} ${s.assignedTechName} ${s.description}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate) || a.timeSlot.localeCompare(b.timeSlot));
  }, [schedules, dateFrom, dateTo, statusFilter, techFilter, search]);

  const techNames = useMemo(() => {
    const s = new Set<string>();
    activeTechs.forEach((t) => s.add(t.name));
    schedules.forEach((sc) => s.add(sc.assignedTechName));
    return Array.from(s).sort();
  }, [activeTechs, schedules]);

  const todayCount = schedules.filter((s) => s.scheduleDate === today).length;
  const openCount = filtered.filter((s) => s.status === 'Pending' || s.status === 'In Progress').length;
  const completedCount = filtered.filter((s) => s.status === 'Completed').length;

  const openModal = (item?: TenantSchedule) => {
    if (item) {
      setEditing(item);
      setBuildingId(item.buildingId);
      setScheduleDate(item.scheduleDate);
      setTimeSlot(item.timeSlot);
      setUnitOrLocation(item.unitOrLocation);
      setTenantName(item.tenantName);
      setCategory(item.category);
      setDescription(item.description);
      const matched = activeTechs.find(
        (t) =>
          (t.authEmail && t.authEmail.toLowerCase() === item.assignedTechEmail.toLowerCase()) ||
          t.name === item.assignedTechName
      );
      setAssignedTechKey(matched ? matched.id : 'self');
      setStatus(item.status);
      setCompletionNotes(item.completionNotes);
    } else {
      setEditing(null);
      setBuildingId(buildings[0]?.id || '');
      setScheduleDate(today);
      setTimeSlot('09:00 - 11:00');
      setUnitOrLocation('');
      setTenantName('');
      setCategory(WORK_CATEGORIES[0]);
      setDescription('');
      setAssignedTechKey('self');
      setStatus('Pending');
      setCompletionNotes('');
    }
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const b = buildings.find((item) => item.id === buildingId);
    if (!b) {
      setFormError('Select a building.');
      return;
    }
    if (!unitOrLocation.trim() || !description.trim()) {
      setFormError('Unit / Location and Task Description are required.');
      return;
    }

    let techUid = user.uid;
    let techName = user.name;
    let techEmail = user.email;
    if (isSupervisor && assignedTechKey !== 'self') {
      const picked = activeTechs.find((t) => t.id === assignedTechKey);
      if (picked) {
        techUid = picked.authUid || picked.id;
        techName = picked.name;
        techEmail = picked.authEmail || picked.email;
      }
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await saveTenantSchedule(
        {
          id: editing?.id,
          building: b,
          scheduleDate,
          timeSlot,
          unitOrLocation,
          tenantName,
          category,
          description,
          assignedTechUid: techUid,
          assignedTechName: techName,
          assignedTechEmail: techEmail,
          status,
          completionNotes,
        },
        {
          uid: user.uid,
          name: user.name,
          email: user.email,
          role: user.role,
          isEffectiveOnline,
          existing: editing,
        }
      );
      setModalOpen(false);
      onToast(
        res.offlineQueued
          ? 'Tenant schedule saved offline and queued for sync.'
          : editing
            ? 'Tenant schedule updated.'
            : 'Tenant schedule created.'
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (
    s: TenantSchedule,
    nextStatus: TenantScheduleStatus,
    notes = s.completionNotes
  ) => {
    await updateTenantScheduleStatus(s.id, nextStatus, notes);
    onToast(`Schedule marked as ${nextStatus}.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Tenant &amp; Unit Maintenance Schedules
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Coordinate scheduled apartment/tenant appointments, track technician arrival, and record completion notes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isSupervisor && (
            <button
              type="button"
              disabled={filtered.length === 0}
              onClick={() =>
                exportTenantSchedulesWorkbook(filtered, {
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
              Export Schedules (.xlsx)
            </button>
          )}

          <button
            type="button"
            disabled={buildings.length === 0}
            onClick={() => openModal()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-50 whitespace-nowrap transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Tenant Schedule
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Scheduled Today</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {todayCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{today}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Open Visits in Window</p>
          <p className="mt-1.5 text-2xl font-semibold text-amber-700 dark:text-amber-400 font-mono tabular-nums">
            {openCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Pending or In Progress
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Completed Visits</p>
          <p className="mt-1.5 text-2xl font-semibold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
            {completedCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            In selected date range
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            From Date
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            To Date
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | TenantScheduleStatus)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="all">All Statuses</option>
            {SCHEDULE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            Technician
          </label>
          <select
            value={techFilter}
            onChange={(e) => setTechFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="all">All Technicians</option>
            {techNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            Search
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Unit, tenant, task..."
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
        </div>
      </div>

      {/* Schedules Table */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <CalendarCheck2 className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
            No tenant schedules in this range
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Create an appointment to track unit visits and technician assignments.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Date &amp; Time Slot</th>
                  <th className="py-3 px-4">Unit &amp; Tenant</th>
                  <th className="py-3 px-4">Task Description</th>
                  <th className="py-3 px-4">Assigned Technician</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filtered.map((s) => {
                  const isAssignedToMe =
                    s.assignedTechUid === user.uid ||
                    s.assignedTechEmail.toLowerCase() === user.email.toLowerCase();
                  const canTechUpdate =
                    !isSupervisor &&
                    isAssignedToMe &&
                    (s.status === 'Pending' || s.status === 'In Progress');

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 align-top">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {s.scheduleDate}
                        </p>
                        <p className="font-mono text-slate-500 dark:text-slate-400">
                          {s.timeSlot || 'Anytime'}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          <span className="font-mono text-brand-700 dark:text-brand-400 mr-1.5">
                            {s.buildingCode}
                          </span>
                          {s.unitOrLocation}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {s.tenantName || 'Tenant'} · {s.category}
                        </p>
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        <p className="text-slate-900 dark:text-slate-100">{s.description}</p>
                        {s.completionNotes && (
                          <p className="mt-1 text-emerald-700 dark:text-emerald-400">
                            Note: {s.completionNotes}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-800 dark:text-slate-200 font-medium">
                        {s.assignedTechName}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {s.status === 'Completed' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Completed
                          </span>
                        ) : s.status === 'Cancelled' ? (
                          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
                            <XCircle className="w-3.5 h-3.5" />
                            Cancelled
                          </span>
                        ) : s.status === 'In Progress' ? (
                          <span className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-400 font-medium">
                            <Play className="w-3.5 h-3.5" />
                            In Progress
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {(isSupervisor || canTechUpdate) && s.status === 'Pending' && (
                            <button
                              type="button"
                              onClick={() => handleQuickStatus(s, 'In Progress')}
                              className="px-2 py-1 rounded bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 text-[11px] font-medium text-brand-800 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/60"
                            >
                              Start
                            </button>
                          )}
                          {(isSupervisor || canTechUpdate) &&
                            (s.status === 'Pending' || s.status === 'In Progress') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCompletingItem(s);
                                  setQuickCompletionNotes(s.completionNotes || '');
                                }}
                                className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                              >
                                Complete
                              </button>
                            )}
                          {isSupervisor && (
                            <>
                              <button
                                type="button"
                                onClick={() => openModal(s)}
                                className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/60"
                                title="Edit schedule"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {confirmDeleteId === s.id ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await deleteTenantSchedule(s.id);
                                    setConfirmDeleteId(null);
                                    onToast('Schedule deleted.');
                                  }}
                                  className="px-2 py-1 rounded bg-red-600 text-white text-[11px]"
                                >
                                  Confirm
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(s.id)}
                                  className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60"
                                  title="Delete schedule"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Schedule */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editing ? 'Edit Tenant Schedule' : 'New Tenant Maintenance Schedule'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Building *
                  </label>
                  <select
                    disabled={!!editing}
                    value={buildingId}
                    onChange={(e) => setBuildingId(e.target.value)}
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
                    Scheduled Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Time Slot
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={timeSlot}
                    onChange={(e) => setTimeSlot(e.target.value)}
                    placeholder="09:00 - 11:00"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Unit / Location *
                  </label>
                  <SpellCheckInput
                    required
                    maxLength={120}
                    value={unitOrLocation}
                    onValueChange={setUnitOrLocation}
                    placeholder="Apt 1104 / Retail R2"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tenant Name
                  </label>
                  <SpellCheckInput
                    maxLength={120}
                    value={tenantName}
                    onValueChange={setTenantName}
                    placeholder="Resident / Office contact"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    {WORK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isSupervisor && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Assign Technician
                    </label>
                    <select
                      value={assignedTechKey}
                      onChange={(e) => setAssignedTechKey(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    >
                      <option value="self">Myself ({user.name})</option>
                      {activeTechs.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.badgeId || t.trade})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as TenantScheduleStatus)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    >
                      {SCHEDULE_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Task Description *
                </label>
                <SpellCheckTextarea
                  rows={2}
                  required
                  maxLength={1500}
                  value={description}
                  onValueChange={setDescription}
                  placeholder="Scope of inspection or repair scheduled with tenant..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              {(editing || status === 'Completed') && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Completion Notes
                  </label>
                  <SpellCheckInput
                    showToggle
                    maxLength={1000}
                    value={completionNotes}
                    onValueChange={setCompletionNotes}
                    placeholder="Summary of resolution or follow-up"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60 transition-colors"
                >
                  {saving ? 'Saving...' : editing ? 'Save Schedule' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Quick Complete Visit */}
      {completingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Complete Tenant Visit — {completingItem.unitOrLocation}
              </h3>
              <button
                type="button"
                onClick={() => setCompletingItem(null)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setQuickSaving(true);
                try {
                  await handleQuickStatus(completingItem, 'Completed', quickCompletionNotes);
                  setCompletingItem(null);
                } finally {
                  setQuickSaving(false);
                }
              }}
              className="p-5 space-y-4"
            >
              <p className="text-xs text-slate-600 dark:text-slate-400">{completingItem.description}</p>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Completion / Sign-off Notes
                </label>
                <SpellCheckTextarea
                  rows={3}
                  maxLength={1000}
                  value={quickCompletionNotes}
                  onValueChange={setQuickCompletionNotes}
                  placeholder="Work completed and verified with tenant..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCompletingItem(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickSaving}
                  className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800"
                >
                  {quickSaving ? 'Saving...' : 'Mark Completed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
