import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { deleteWorkLog, submitWorkLog, updateWorkLog } from '../lib/dataService';
import { exportWorkLogsWorkbook } from '../lib/excelUtils';
import {
  MAX_SINGLE_WORK_HOURS,
  STANDARD_DAILY_DUTY_HOURS,
  validateSingleWorkDuration,
} from '../lib/operationsAnalytics';
import {
  Building,
  Technician,
  UserRole,
  WORK_CATEGORIES,
  WORK_PRIORITIES,
  WORK_STATUSES,
  WorkLog,
  WorkPriority,
  WorkShift,
  WorkStatus,
} from '../types';
import { SpellCheckInput, SpellCheckTextarea } from './SpellCheckField';

interface WorkLogsViewProps {
  buildings: Building[];
  workLogs: WorkLog[];
  technicians: Technician[];
  user: { uid: string; name: string; email: string; role: UserRole };
  isEffectiveOnline: boolean;
  onToast: (msg: string) => void;
}

export const WorkLogsView: React.FC<WorkLogsViewProps> = ({
  buildings,
  workLogs,
  technicians,
  user,
  isEffectiveOnline,
  onToast,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WorkStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | WorkPriority>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [techFilter, setTechFilter] = useState<string>('all');
  const [openOnly, setOpenOnly] = useState(false);

  // Create form modal
  const [formOpen, setFormOpen] = useState(false);
  const [buildingId, setBuildingId] = useState(buildings[0]?.id || '');
  const [logDate, setLogDate] = useState(today);
  const [shift, setShift] = useState<WorkShift>('Day');
  const [woNumber, setWoNumber] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<string>(WORK_CATEGORIES[0]);
  const [priority, setPriority] = useState<WorkPriority>('Normal');
  const [complaint, setComplaint] = useState('');
  const [action, setAction] = useState('');
  const [materials, setMaterials] = useState('');
  const [receivedTime, setReceivedTime] = useState('');
  const [startTime, setStartTime] = useState('');
  const [finishTime, setFinishTime] = useState('');
  const [status, setStatus] = useState<WorkStatus>('Completed');
  const [pendingReason, setPendingReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit / update status modal
  const [editingLog, setEditingLog] = useState<WorkLog | null>(null);
  const [editLogDate, setEditLogDate] = useState(today);
  const [editShift, setEditShift] = useState<WorkShift>('Day');
  const [editWoNumber, setEditWoNumber] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editCategory, setEditCategory] = useState<string>(WORK_CATEGORIES[0]);
  const [editPriority, setEditPriority] = useState<WorkPriority>('Normal');
  const [editComplaint, setEditComplaint] = useState('');
  const [editReceivedTime, setEditReceivedTime] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editStatus, setEditStatus] = useState<WorkStatus>('Completed');
  const [editAction, setEditAction] = useState('');
  const [editFinishTime, setEditFinishTime] = useState('');
  const [editMaterials, setEditMaterials] = useState('');
  const [editPendingReason, setEditPendingReason] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isSupervisor = user.role === 'supervisor' || user.role === 'admin';

  const openCreateModal = () => {
    setBuildingId(buildings[0]?.id || '');
    setLogDate(today);
    setShift('Day');
    setWoNumber('');
    setLocation('');
    setCategory(WORK_CATEGORIES[0]);
    setPriority('Normal');
    setComplaint('');
    setAction('');
    setMaterials('');
    setReceivedTime('');
    setStartTime('');
    setFinishTime('');
    setStatus('Completed');
    setPendingReason('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (w: WorkLog) => {
    setEditingLog(w);
    setEditLogDate(w.logDate);
    setEditShift(w.shift);
    setEditWoNumber(w.woNumber);
    setEditLocation(w.location);
    setEditCategory(w.category);
    setEditPriority(w.priority);
    setEditComplaint(w.complaint);
    setEditReceivedTime(w.receivedTime);
    setEditStartTime(w.startTime);
    setEditStatus(w.status);
    setEditAction(w.action);
    setEditFinishTime(w.finishTime);
    setEditMaterials(w.materials);
    setEditPendingReason(w.pendingReason);
    setEditRemarks(w.remarks || '');
    setEditError(null);
  };

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workLogs.filter((w) => {
      if (dateFrom && w.logDate < dateFrom) return false;
      if (dateTo && w.logDate > dateTo) return false;
      if (openOnly && w.status === 'Completed') return false;
      if (statusFilter !== 'all' && w.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && w.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && w.category !== categoryFilter) return false;
      if (techFilter !== 'all' && w.technicianName !== techFilter) return false;
      if (q) {
        const hay =
          `${w.woNumber} ${w.location} ${w.complaint} ${w.action} ${w.technicianName} ${w.buildingCode}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    workLogs,
    dateFrom,
    dateTo,
    openOnly,
    statusFilter,
    priorityFilter,
    categoryFilter,
    techFilter,
    search,
  ]);

  const techNames = useMemo(() => {
    const s = new Set<string>();
    technicians.forEach((t) => s.add(t.name));
    workLogs.forEach((w) => s.add(w.technicianName));
    return Array.from(s).sort();
  }, [technicians, workLogs]);

  const completedCount = filteredLogs.filter((w) => w.status === 'Completed').length;
  const openCount = filteredLogs.filter((w) => w.status !== 'Completed').length;

  const createTimeValidation = validateSingleWorkDuration(receivedTime, startTime, finishTime);
  const liveHours = createTimeValidation.hours;

  const editStartRef = editingLog ? (isSupervisor ? editStartTime : editingLog.startTime) : '';
  const editRecvRef = editingLog ? (isSupervisor ? editReceivedTime : editingLog.receivedTime) : '';
  const editTimeValidation = validateSingleWorkDuration(editRecvRef, editStartRef, editFinishTime);
  const liveEditHours = editTimeValidation.hours;
  const editTimesModified = Boolean(
    editingLog &&
      (editFinishTime !== editingLog.finishTime ||
        editStartRef !== editingLog.startTime ||
        editRecvRef !== editingLog.receivedTime)
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const b = buildings.find((item) => item.id === buildingId);
    if (!b) {
      setFormError('Select a building.');
      return;
    }
    if (!location.trim() || !complaint.trim()) {
      setFormError('Location and Complaint / Work Details are required.');
      return;
    }
    if (!createTimeValidation.valid) {
      setFormError(
        createTimeValidation.error ||
          `Single work time cannot exceed ${MAX_SINGLE_WORK_HOURS} hours.`
      );
      return;
    }
    if (status !== 'Completed' && !pendingReason.trim()) {
      setFormError('Please specify a reason why this job is Pending or On Hold.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await submitWorkLog(
        {
          building: b,
          logDate,
          shift,
          woNumber,
          location,
          category,
          priority,
          complaint,
          action,
          materials,
          receivedTime,
          startTime,
          finishTime,
          status,
          pendingReason,
        },
        {
          uid: user.uid,
          name: user.name,
          email: user.email,
          isEffectiveOnline,
        }
      );
      setFormOpen(false);
      onToast(
        res.offlineQueued
          ? 'Work log saved offline and queued for automatic sync.'
          : 'Work log recorded.'
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save work log.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog) return;
    if (editTimesModified && !editTimeValidation.valid) {
      setEditError(
        editTimeValidation.error ||
          `Single work time cannot exceed ${MAX_SINGLE_WORK_HOURS} hours.`
      );
      return;
    }
    if (editStatus !== 'Completed' && !editPendingReason.trim()) {
      setEditError('Please specify a Pending / On Hold reason.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateWorkLog(
        editingLog,
        isSupervisor
          ? {
              logDate: editLogDate,
              shift: editShift,
              woNumber: editWoNumber,
              location: editLocation,
              category: editCategory,
              priority: editPriority,
              complaint: editComplaint,
              receivedTime: editReceivedTime,
              startTime: editStartTime,
              status: editStatus,
              action: editAction,
              finishTime: editFinishTime,
              materials: editMaterials,
              pendingReason: editPendingReason,
              remarks: editRemarks,
            }
          : {
              status: editStatus,
              action: editAction,
              finishTime: editFinishTime,
              materials: editMaterials,
              pendingReason: editPendingReason,
            },
        { name: user.name, role: user.role }
      );
      setEditingLog(null);
      onToast(isSupervisor ? 'Work log record updated.' : 'Work log status updated.');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to update work log.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteWorkLog(id);
    setConfirmDeleteId(null);
    onToast('Work log removed.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Daily Work Log (All Works &amp; Complaints)
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Log shift work orders, tenant complaints, materials used, and update Pending or On Hold jobs to Completed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={filteredLogs.length === 0}
            onClick={() =>
              exportWorkLogsWorkbook(filteredLogs, {
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
            Export Work Log (.xlsx)
          </button>

          <button
            type="button"
            disabled={buildings.length === 0}
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-50 whitespace-nowrap transition-colors"
          >
            <Plus className="w-4 h-4" />
            Log Work Order
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
              onChange={(e) => setStatusFilter(e.target.value as 'all' | WorkStatus)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="all">All Statuses</option>
              {WORK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Priority
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'all' | WorkPriority)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="all">All Priorities</option>
              {WORK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="all">All Categories</option>
              {WORK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search WO#, location, complaint, action..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <div className="flex items-center gap-4 text-xs">
            <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={openOnly}
                onChange={(e) => setOpenOnly(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 accent-brand-700"
              />
              Open Jobs Only (Pending / On Hold)
            </label>
            <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
              {filteredLogs.length} total ·{' '}
              <span className="text-emerald-700 dark:text-emerald-400">{completedCount} done</span> ·{' '}
              <span className="text-amber-700 dark:text-amber-400">{openCount} open</span>
            </span>
          </div>
        </div>
      </div>

      {/* Work Logs Table */}
      {filteredLogs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <Wrench className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
            No work logs match this filter
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Adjust the date range or log a new work order.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Date / Shift</th>
                  <th className="py-3 px-4">Building &amp; Location</th>
                  <th className="py-3 px-4">Category / Priority</th>
                  <th className="py-3 px-4">Complaint &amp; Action Taken</th>
                  <th className="py-3 px-4">Technician &amp; Time</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filteredLogs.map((w) => {
                  const canEdit =
                    isSupervisor || (w.technicianUid === user.uid && w.status !== 'Completed');
                  return (
                    <tr key={w.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 align-top">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {w.logDate}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {w.shift} Shift {w.woNumber ? `· WO ${w.woNumber}` : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          <span className="font-mono text-brand-700 dark:text-brand-400 mr-1.5">
                            {w.buildingCode}
                          </span>
                          {w.location}
                        </p>
                        {w.materials && (
                          <p className="text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[200px]">
                            Parts: {w.materials}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{w.category}</p>
                        <p
                          className={
                            w.priority === 'Emergency'
                              ? 'text-red-700 dark:text-red-400 font-semibold'
                              : w.priority === 'Urgent'
                                ? 'text-amber-700 dark:text-amber-400 font-medium'
                                : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          {w.priority}
                        </p>
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        <p className="text-slate-900 dark:text-slate-100 font-medium">{w.complaint}</p>
                        {w.action && (
                          <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                            Action: {w.action}
                          </p>
                        )}
                        {w.pendingReason && w.status !== 'Completed' && (
                          <p className="text-amber-800 dark:text-amber-400 mt-0.5">
                            Pending: {w.pendingReason}
                          </p>
                        )}
                        {w.remarks && (
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                            {w.remarks}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {w.technicianName}
                        </p>
                        <p className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          {w.startTime || w.receivedTime || '--:--'} – {w.finishTime || '--:--'}
                          {w.durationHours > 0 ? ` (${w.durationHours}h)` : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {w.status === 'Completed' ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                            <Clock className="w-3.5 h-3.5" />
                            {w.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEditModal(w)}
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/60"
                              title={isSupervisor ? 'Edit work log record' : 'Update job status'}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isSupervisor &&
                            (confirmDeleteId === w.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(w.id)}
                                  className="px-2 py-1 rounded bg-red-600 text-white text-[11px] font-medium"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-1.5 text-[11px] text-slate-500 dark:text-slate-400"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(w.id)}
                                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60"
                                title="Delete work log"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ))}
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

      {/* Create Work Log Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Log Daily Work Order
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Building *
                  </label>
                  <select
                    value={buildingId}
                    onChange={(e) => setBuildingId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
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
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Shift *
                  </label>
                  <select
                    value={shift}
                    onChange={(e) => setShift(e.target.value as WorkShift)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    <option value="Day">Day</option>
                    <option value="Night">Night</option>
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    WO Number
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={woNumber}
                    onChange={(e) => setWoNumber(e.target.value)}
                    placeholder="WO-1042"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Location / Unit *
                  </label>
                  <SpellCheckInput
                    required
                    maxLength={120}
                    value={location}
                    onValueChange={setLocation}
                    placeholder="Apt 102 / Common"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category *
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
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Priority *
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as WorkPriority)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    {WORK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Complaint / Work Request Details *
                </label>
                <SpellCheckTextarea
                  rows={2}
                  required
                  maxLength={1500}
                  value={complaint}
                  onValueChange={setComplaint}
                  placeholder="Describe the reported issue or assigned work..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Action Taken
                </label>
                <SpellCheckTextarea
                  rows={2}
                  maxLength={1500}
                  value={action}
                  onValueChange={setAction}
                  placeholder="Work performed and checks completed..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div className="grid sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Received Time
                  </label>
                  <input
                    type="time"
                    value={receivedTime}
                    onChange={(e) => setReceivedTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Finish Time{' '}
                    {createTimeValidation.hasBothTimes && (
                      <span
                        className={`font-mono ${
                          createTimeValidation.valid
                            ? 'text-brand-700 dark:text-brand-400'
                            : 'text-red-700 dark:text-red-400 font-semibold'
                        }`}
                      >
                        ({liveHours}h / {MAX_SINGLE_WORK_HOURS}h max)
                      </span>
                    )}
                  </label>
                  <input
                    type="time"
                    value={finishTime}
                    onChange={(e) => setFinishTime(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 ${
                      createTimeValidation.valid
                        ? 'border-slate-300 dark:border-slate-700 focus:ring-brand-600'
                        : 'border-red-500 dark:border-red-500 focus:ring-red-600'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Status *
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as WorkStatus)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    {WORK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {!createTimeValidation.valid && (
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                  Total work time ({liveHours}h) exceeds the {MAX_SINGLE_WORK_HOURS}-hour limit per job (standard duty is {STANDARD_DAILY_DUTY_HOURS} hrs/day). Adjust Start/Received or Finish time before saving.
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Materials / Spare Parts Used
                  </label>
                  <SpellCheckInput
                    maxLength={500}
                    value={materials}
                    onValueChange={setMaterials}
                    placeholder="e.g. 1x Capacitor 35uF, PVC elbow"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                {status !== 'Completed' && (
                  <div>
                    <label className="block text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
                      Pending / On Hold Reason *
                    </label>
                    <SpellCheckInput
                      required
                      maxLength={500}
                      value={pendingReason}
                      onValueChange={setPendingReason}
                      placeholder="Waiting for spare part / tenant access..."
                      className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60 transition-colors"
                >
                  {submitting ? 'Saving...' : 'Save Work Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Update Status Modal */}
      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className={`w-full ${isSupervisor ? 'max-w-2xl' : 'max-w-lg'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {isSupervisor ? 'Edit Work Log Record' : 'Update Job Status'} — {editingLog.buildingCode} · {editingLog.location}
                </h3>
                {isSupervisor && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Logged by {editingLog.technicianName} ({editingLog.technicianEmail})
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditingLog(null)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
              {editError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                  {editError}
                </div>
              )}
              {isSupervisor ? (
                <>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Log Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={editLogDate}
                        onChange={(e) => setEditLogDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Shift *
                      </label>
                      <select
                        value={editShift}
                        onChange={(e) => setEditShift(e.target.value as WorkShift)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      >
                        <option value="Day">Day</option>
                        <option value="Night">Night</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        WO Number
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        value={editWoNumber}
                        onChange={(e) => setEditWoNumber(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Location / Unit *
                      </label>
                      <SpellCheckInput
                        required
                        maxLength={120}
                        value={editLocation}
                        onValueChange={setEditLocation}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Category *
                      </label>
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      >
                        {WORK_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Priority *
                      </label>
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as WorkPriority)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      >
                        {WORK_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Complaint / Work Request Details *
                    </label>
                    <SpellCheckTextarea
                      rows={2}
                      required
                      maxLength={1500}
                      value={editComplaint}
                      onValueChange={setEditComplaint}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                  </div>

                  <div className="grid sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Received Time
                      </label>
                      <input
                        type="time"
                        value={editReceivedTime}
                        onChange={(e) => setEditReceivedTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Start Time
                      </label>
                      <input
                        type="time"
                        value={editStartTime}
                        onChange={(e) => setEditStartTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Finish Time{' '}
                        {editTimeValidation.hasBothTimes && (
                          <span
                            className={`font-mono ${
                              editTimeValidation.valid
                                ? 'text-brand-700 dark:text-brand-400'
                                : 'text-red-700 dark:text-red-400 font-semibold'
                            }`}
                          >
                            ({liveEditHours}h / {MAX_SINGLE_WORK_HOURS}h max)
                          </span>
                        )}
                      </label>
                      <input
                        type="time"
                        value={editFinishTime}
                        onChange={(e) => setEditFinishTime(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 ${
                          editTimeValidation.valid
                            ? 'border-slate-300 dark:border-slate-700 focus:ring-brand-600'
                            : 'border-red-500 dark:border-red-500 focus:ring-red-600'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Status
                      </label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as WorkStatus)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      >
                        {WORK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {!editTimeValidation.valid && (
                    <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                      Duration ({liveEditHours}h) exceeds the {MAX_SINGLE_WORK_HOURS}-hour single-work limit (9h/day duty policy).
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{editingLog.complaint}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Status
                      </label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as WorkStatus)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      >
                        {WORK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Finish Time{' '}
                        {editTimeValidation.hasBothTimes && (
                          <span
                            className={`font-mono ${
                              editTimeValidation.valid
                                ? 'text-brand-700 dark:text-brand-400'
                                : 'text-red-700 dark:text-red-400 font-semibold'
                            }`}
                          >
                            ({liveEditHours}h / {MAX_SINGLE_WORK_HOURS}h max)
                          </span>
                        )}
                      </label>
                      <input
                        type="time"
                        value={editFinishTime}
                        onChange={(e) => setEditFinishTime(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 ${
                          editTimeValidation.valid
                            ? 'border-slate-300 dark:border-slate-700 focus:ring-brand-600'
                            : 'border-red-500 dark:border-red-500 focus:ring-red-600'
                        }`}
                      />
                    </div>
                  </div>
                  {!editTimeValidation.valid && (
                    <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                      Total work time ({liveEditHours}h) exceeds {MAX_SINGLE_WORK_HOURS} hours max per job (9h/day duty policy). Start/Received was {editStartRef || editRecvRef}.
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Action Taken
                </label>
                <SpellCheckTextarea
                  rows={2}
                  maxLength={1500}
                  value={editAction}
                  onValueChange={setEditAction}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Materials Used
                </label>
                <SpellCheckInput
                  maxLength={500}
                  value={editMaterials}
                  onValueChange={setEditMaterials}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              {editStatus !== 'Completed' && (
                <div>
                  <label className="block text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
                    Pending / On Hold Reason
                  </label>
                  <SpellCheckInput
                    required
                    maxLength={500}
                    value={editPendingReason}
                    onValueChange={setEditPendingReason}
                    className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              )}
              {isSupervisor && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Supervisor Remarks
                  </label>
                  <SpellCheckInput
                    maxLength={1500}
                    value={editRemarks}
                    onValueChange={setEditRemarks}
                    placeholder="Optional supervisor remarks..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingLog(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 transition-colors"
                >
                  {editSaving ? 'Updating...' : isSupervisor ? 'Save Record Changes' : 'Save Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
