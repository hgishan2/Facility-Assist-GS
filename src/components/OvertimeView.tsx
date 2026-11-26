import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Pencil,
  Plus,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  deleteOvertimeLog,
  reviewOvertimeLog,
  submitOvertimeLog,
  updateOvertimeLog,
} from '../lib/dataService';
import { exportOvertimeWorkbook } from '../lib/excelUtils';
import {
  calculateTimeHours,
  dedupeOvertimeLogs,
  round2,
} from '../lib/operationsAnalytics';
import {
  Building,
  matchTechnicianByName,
  normalizeEmail,
  OT_CATEGORY_LABELS,
  OvertimeCategoryType,
  OvertimeLog,
  Technician,
  UserRole,
} from '../types';
import { SpellCheckInput, SpellCheckTextarea } from './SpellCheckField';

interface OvertimeViewProps {
  buildings: Building[];
  overtimeLogs: OvertimeLog[];
  technicians: Technician[];
  user: { uid: string; name: string; badgeId?: string; email: string; role: UserRole };
  isEffectiveOnline: boolean;
  onToast: (msg: string) => void;
}

const OT_CATS: OvertimeCategoryType[] = ['N', 'WO', 'PH', 'N. Shift'];

export const OvertimeView: React.FC<OvertimeViewProps> = ({
  buildings,
  overtimeLogs,
  technicians,
  user,
  isEffectiveOnline,
  onToast,
}) => {
  const today = new Date().toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [techFilter, setTechFilter] = useState('all');
  const [catFilter, setCatFilter] = useState<'all' | OvertimeCategoryType>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingOt, setEditingOt] = useState<OvertimeLog | null>(null);
  const [buildingId, setBuildingId] = useState(buildings[0]?.id || '');
  const [otDate, setOtDate] = useState(today);
  const [fromTime, setFromTime] = useState('17:00');
  const [toTime, setToTime] = useState('20:00');
  const [otCategoryType, setOtCategoryType] = useState<OvertimeCategoryType>('N');
  const [workType, setWorkType] = useState('');
  const [location, setLocation] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [targetTechId, setTargetTechId] = useState('self');
  const [approvalStatus, setApprovalStatus] = useState<'pending_approval' | 'approved' | 'rejected'>('approved');
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isSupervisor = user.role === 'supervisor' || user.role === 'admin';

  const openCreateModal = () => {
    setEditingOt(null);
    setBuildingId(buildings[0]?.id || '');
    setOtDate(today);
    setFromTime('17:00');
    setToTime('20:00');
    setOtCategoryType('N');
    setWorkType('');
    setLocation('');
    setWorkDescription('');
    setTargetTechId('self');
    setApprovalStatus('approved');
    setReviewNotes('');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (ot: OvertimeLog) => {
    setEditingOt(ot);
    setBuildingId(ot.buildingId);
    setOtDate(ot.otDate);
    setFromTime(ot.fromTime);
    setToTime(ot.toTime);
    setOtCategoryType(ot.otCategoryType);
    setWorkType(ot.workType);
    setLocation(ot.location);
    setWorkDescription(ot.workDescription);
    setApprovalStatus(ot.approvalStatus);
    setReviewNotes(ot.reviewNotes || '');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const techRoster = useMemo(
    () => technicians.filter((t) => t.role === 'technician'),
    [technicians]
  );

  const canonicalTechLabel = (rawName: string, rawEmail?: string): string => {
    const byEmail =
      rawEmail && techRoster.find((t) => normalizeEmail(t.authEmail || t.email) === normalizeEmail(rawEmail));
    if (byEmail) return byEmail.name;
    return matchTechnicianByName(rawName, techRoster)?.name || rawName;
  };

  const scopedLogs = useMemo(() => {
    const deduped = dedupeOvertimeLogs(overtimeLogs);
    return deduped.filter((ot) => {
      if (dateFrom && ot.otDate < dateFrom) return false;
      if (dateTo && ot.otDate > dateTo) return false;
      if (
        techFilter !== 'all' &&
        canonicalTechLabel(ot.technicianName, ot.technicianEmail) !== techFilter
      ) {
        return false;
      }
      if (catFilter !== 'all' && ot.otCategoryType !== catFilter) return false;
      return true;
    });
  }, [overtimeLogs, dateFrom, dateTo, techFilter, catFilter, techRoster]);

  const categoryTotals = useMemo(() => {
    const sums: Record<OvertimeCategoryType, number> = {
      N: 0,
      WO: 0,
      PH: 0,
      'N. Shift': 0,
    };
    for (const r of scopedLogs) {
      if (r.approvalStatus === 'rejected') continue;
      sums[r.otCategoryType] = round2(sums[r.otCategoryType] + r.hours);
    }
    const grand = round2(sums.N + sums.WO + sums.PH + sums['N. Shift']);
    return { ...sums, grand };
  }, [scopedLogs]);

  const selectedTargetTech = useMemo(
    () =>
      isSupervisor && targetTechId !== 'self'
        ? technicians.find((t) => t.id === targetTechId) || null
        : null,
    [isSupervisor, targetTechId, technicians]
  );

  const duplicateSlotWarning = useMemo(() => {
    if (editingOt) return false;
    const matchEmail = normalizeEmail(
      selectedTargetTech ? selectedTargetTech.authEmail || selectedTargetTech.email : user.email
    );
    const matchUid = selectedTargetTech ? selectedTargetTech.authUid : user.uid;
    return overtimeLogs.some(
      (r) =>
        ((matchUid && r.technicianUid === matchUid) ||
          normalizeEmail(r.technicianEmail) === matchEmail) &&
        r.otDate === otDate &&
        r.fromTime === fromTime &&
        r.toTime === toTime
    );
  }, [overtimeLogs, selectedTargetTech, user.uid, user.email, otDate, fromTime, toTime, editingOt]);

  const computedHours = calculateTimeHours(fromTime, toTime);

  const techNames = useMemo(() => {
    const s = new Set<string>();
    techRoster.forEach((t) => s.add(t.name));
    overtimeLogs.forEach((o) => s.add(canonicalTechLabel(o.technicianName, o.technicianEmail)));
    return Array.from(s).filter(Boolean).sort();
  }, [techRoster, overtimeLogs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const b = buildings.find((item) => item.id === buildingId);
    if (!b && !editingOt) {
      setErrorMsg('Select a building.');
      return;
    }
    if (computedHours <= 0) {
      setErrorMsg('End time must differ from start time to log positive overtime hours.');
      return;
    }
    if (!workType.trim() || !location.trim() || !workDescription.trim()) {
      setErrorMsg('Work Type, Location, and Description are required.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (editingOt && isSupervisor) {
        await updateOvertimeLog(editingOt.id, {
          otDate,
          fromTime,
          toTime,
          otCategoryType,
          workType,
          location,
          workDescription,
          approvalStatus,
          reviewNotes,
        });
        setModalOpen(false);
        setEditingOt(null);
        onToast('Overtime entry updated.');
        return;
      }

      const res = await submitOvertimeLog(
        {
          building: b!,
          otDate,
          fromTime,
          toTime,
          otCategoryType,
          workType,
          location,
          workDescription,
          forTechnician: selectedTargetTech,
        },
        {
          uid: user.uid,
          name: user.name,
          badgeId: user.badgeId,
          email: user.email,
          role: user.role,
          isEffectiveOnline,
        }
      );
      setModalOpen(false);
      setWorkType('');
      setLocation('');
      setWorkDescription('');
      onToast(
        res.offlineQueued
          ? 'Overtime saved offline and queued for sync.'
          : 'Overtime entry submitted.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save overtime log.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Overtime Timesheet Log
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Track Normal OT (N), Weekly Off (WO), Public Holiday (PH), and Night Shift (N. Shift) hours with individual Excel timesheet exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isSupervisor && (
            <button
              type="button"
              disabled={scopedLogs.length === 0}
              onClick={() =>
                exportOvertimeWorkbook(scopedLogs, technicians, {
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
              Export Overtime (.xlsx)
            </button>
          )}
          <button
            type="button"
            disabled={buildings.length === 0}
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-50 whitespace-nowrap transition-colors"
          >
            <Plus className="w-4 h-4" />
            Log Overtime
          </button>
        </div>
      </div>

      {/* Category Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total OT Hours</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {categoryTotals.grand}h
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {scopedLogs.length} entries
          </p>
        </div>
        {OT_CATS.map((cat) => (
          <div
            key={cat}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">{cat}</p>
            <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {categoryTotals[cat]}h
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {OT_CATEGORY_LABELS[cat].split('—')[1]?.trim()}
            </p>
          </div>
        ))}
      </div>

      {/* Date & Category Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
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
            OT Category
          </label>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value as 'all' | OvertimeCategoryType)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="all">All Categories</option>
            {OT_CATS.map((c) => (
              <option key={c} value={c}>
                {OT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        {isSupervisor && (
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
        )}
      </div>

      {/* Overtime Table */}
      {scopedLogs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <Clock className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
            No overtime entries in this range
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Click Log Overtime to record extra shift, weekly-off, or public-holiday work.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Date &amp; Window</th>
                  <th className="py-3 px-4">Technician</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Work Details</th>
                  <th className="py-3 px-4 text-right">Hours</th>
                  <th className="py-3 px-4">Status</th>
                  {isSupervisor && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {scopedLogs.map((ot) => (
                  <tr key={ot.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 align-top">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {ot.otDate}
                      </p>
                      <p className="font-mono text-slate-500 dark:text-slate-400">
                        {ot.fromTime} – {ot.toTime}
                      </p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {ot.technicianName}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 font-mono">
                        {ot.buildingCode} {ot.technicianBadgeId ? `· ${ot.technicianBadgeId}` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono font-semibold text-brand-700 dark:text-brand-400">
                      {ot.otCategoryType}
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {ot.workType} · {ot.location}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                        {ot.workDescription}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {ot.hours.toFixed(2)}h
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {ot.approvalStatus === 'approved' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approved
                        </span>
                      ) : ot.approvalStatus === 'rejected' ? (
                        <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 font-medium">
                          <XCircle className="w-3.5 h-3.5" />
                          Rejected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          Pending
                        </span>
                      )}
                    </td>
                    {isSupervisor && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(ot)}
                            className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/60"
                            title="Edit overtime record"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {ot.approvalStatus !== 'approved' && (
                            <button
                              type="button"
                              onClick={() => reviewOvertimeLog(ot.id, 'approved', 'Approved by supervisor')}
                              className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                            >
                              Approve
                            </button>
                          )}
                          {ot.approvalStatus !== 'rejected' && (
                            <button
                              type="button"
                              onClick={() => reviewOvertimeLog(ot.id, 'rejected', 'Flagged by supervisor')}
                              className="px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                            >
                              Reject
                            </button>
                          )}
                          {confirmDeleteId === ot.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteOvertimeLog(ot.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-1 rounded bg-red-600 text-white text-[11px]"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(ot.id)}
                              className="p-1 text-slate-400 dark:text-slate-500 hover:text-red-700 dark:hover:text-red-400"
                              title="Delete overtime entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {editingOt ? 'Edit Overtime Entry' : 'Log Overtime Entry'}
                </h3>
                {editingOt && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Technician: {editingOt.technicianName} {editingOt.technicianBadgeId ? `(${editingOt.technicianBadgeId})` : ''}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                  {errorMsg}
                </div>
              )}
              {duplicateSlotWarning && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400" />
                  <span>You already submitted an overtime entry for this exact date and time window.</span>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Building *
                  </label>
                  <select
                    disabled={Boolean(editingOt)}
                    value={buildingId}
                    onChange={(e) => setBuildingId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-600"
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
                    OT Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={otDate}
                    onChange={(e) => setOtDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              {!editingOt &&
                isSupervisor &&
                technicians.some((t) => t.role === 'technician' && t.status === 'active') && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Technician
                    </label>
                    <select
                      value={targetTechId}
                      onChange={(e) => setTargetTechId(e.target.value)}
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

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    From *
                  </label>
                  <input
                    type="time"
                    required
                    value={fromTime}
                    onChange={(e) => setFromTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    To *
                  </label>
                  <input
                    type="time"
                    required
                    value={toTime}
                    onChange={(e) => setToTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Calculated Hours
                  </label>
                  <div className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-sm font-mono font-semibold text-brand-700 dark:text-brand-400">
                    {computedHours.toFixed(2)} hrs
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    OT Category *
                  </label>
                  <select
                    value={otCategoryType}
                    onChange={(e) => setOtCategoryType(e.target.value as OvertimeCategoryType)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    {OT_CATS.map((c) => (
                      <option key={c} value={c}>
                        {OT_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Work Type *
                  </label>
                  <SpellCheckInput
                    required
                    maxLength={120}
                    value={workType}
                    onValueChange={setWorkType}
                    placeholder="e.g. Emergency Repairs"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Location *
                </label>
                <SpellCheckInput
                  required
                  maxLength={120}
                  value={location}
                  onValueChange={setLocation}
                  placeholder="e.g. Basement Pump Room / Apt 402"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description of Overtime Work *
                </label>
                <SpellCheckTextarea
                  rows={2}
                  required
                  maxLength={1500}
                  value={workDescription}
                  onValueChange={setWorkDescription}
                  placeholder="Details of work performed during overtime..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              {editingOt && isSupervisor && (
                <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Approval Status
                    </label>
                    <select
                      value={approvalStatus}
                      onChange={(e) =>
                        setApprovalStatus(e.target.value as 'pending_approval' | 'approved' | 'rejected')
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    >
                      <option value="approved">Approved</option>
                      <option value="pending_approval">Pending Approval</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Review Notes
                    </label>
                    <SpellCheckInput
                      maxLength={500}
                      value={reviewNotes}
                      onValueChange={setReviewNotes}
                      placeholder="Optional supervisor remark"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                  </div>
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
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60 transition-colors"
                >
                  {submitting
                    ? 'Saving...'
                    : editingOt
                      ? 'Save Overtime Changes'
                      : 'Submit Overtime'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
