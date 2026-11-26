import React, { useMemo, useState } from 'react';
import { CalendarClock, Camera, FileText, Paperclip, ScanLine, Trash2, WifiOff, X } from 'lucide-react';
import { submitMaintenanceLog, supervisorUpdateMaintenanceLog } from '../lib/dataService';
import { computeNextPpmDueDate } from '../lib/ppmSchedule';
import {
  ApprovalStatus,
  AttachmentKind,
  Building,
  DISCIPLINE_OPTIONS,
  ENTRY_TYPE_LABELS,
  EntryType,
  FREQUENCY_LABELS,
  MaintenanceLog,
  OUTCOME_LABELS,
  PendingAttachmentDraft,
  PpmFrequency,
  UserRole,
  WorkOutcome,
} from '../types';
import { ScannerModal } from './ScannerModal';
import { SpellCheckInput, SpellCheckTextarea } from './SpellCheckField';

export interface LogPrefillTemplate {
  buildingId?: string;
  entryType?: EntryType;
  discipline?: string;
  assetName?: string;
  assetTag?: string;
  locationZone?: string;
  ppmFrequency?: PpmFrequency;
  amcContractor?: string;
  scheduledDate?: string;
  title?: string;
}

interface LogFormModalProps {
  buildings: Building[];
  defaultBuildingId?: string;
  defaultEntryType?: EntryType;
  prefillTemplate?: LogPrefillTemplate | null;
  resubmitLog?: MaintenanceLog | null;
  supervisorEditLog?: MaintenanceLog | null;
  user: { uid: string; name: string; email: string; role: UserRole };
  isEffectiveOnline: boolean;
  onClose: () => void;
  onSubmitted: (result: { logId: string; offlineQueued: boolean; isSupervisorEdit?: boolean }) => void;
}

export const LogFormModal: React.FC<LogFormModalProps> = ({
  buildings,
  defaultBuildingId,
  defaultEntryType = 'ppm_inhouse',
  prefillTemplate,
  resubmitLog,
  supervisorEditLog,
  user,
  isEffectiveOnline,
  onClose,
  onSubmitted,
}) => {
  const isManager = user.role === 'supervisor' || user.role === 'admin';
  const editingTarget = supervisorEditLog || resubmitLog || null;
  const isSupervisorEdit = Boolean(supervisorEditLog && isManager);

  const activeBuildings = buildings.filter((b) => b.status === 'active');
  const initialBuildingId =
    editingTarget?.buildingId ||
    prefillTemplate?.buildingId ||
    (defaultBuildingId && defaultBuildingId !== 'all'
      ? defaultBuildingId
      : activeBuildings[0]?.id || buildings[0]?.id || '');

  const [buildingId, setBuildingId] = useState(initialBuildingId);
  const [entryType, setEntryType] = useState<EntryType>(
    editingTarget?.entryType || prefillTemplate?.entryType || defaultEntryType
  );
  const [discipline, setDiscipline] = useState<string>(
    editingTarget?.discipline || prefillTemplate?.discipline || DISCIPLINE_OPTIONS[0]
  );
  const [assetName, setAssetName] = useState(editingTarget?.assetName || prefillTemplate?.assetName || '');
  const [assetTag, setAssetTag] = useState(editingTarget?.assetTag || prefillTemplate?.assetTag || '');
  const [locationZone, setLocationZone] = useState(
    editingTarget?.locationZone || prefillTemplate?.locationZone || ''
  );
  const [title, setTitle] = useState(editingTarget?.title || prefillTemplate?.title || '');
  const [workNotes, setWorkNotes] = useState(editingTarget?.workNotes || '');
  const [ppmFrequency, setPpmFrequency] = useState<PpmFrequency>(
    editingTarget?.ppmFrequency && editingTarget.ppmFrequency !== 'none'
      ? editingTarget.ppmFrequency
      : prefillTemplate?.ppmFrequency && prefillTemplate.ppmFrequency !== 'none'
        ? prefillTemplate.ppmFrequency
        : 'monthly'
  );
  const [amcContractor, setAmcContractor] = useState(
    editingTarget?.amcContractor || prefillTemplate?.amcContractor || ''
  );
  const [scheduledDate, setScheduledDate] = useState(
    editingTarget?.scheduledDate || prefillTemplate?.scheduledDate || new Date().toISOString().slice(0, 10)
  );
  const [completedDate, setCompletedDate] = useState(
    editingTarget?.completedDate || new Date().toISOString().slice(0, 10)
  );
  const [customNextDueDate, setCustomNextDueDate] = useState(editingTarget?.nextDueDate || '');
  const [outcome, setOutcome] = useState<WorkOutcome>(editingTarget?.outcome || 'operational');
  const [partsUsed, setPartsUsed] = useState(editingTarget?.partsUsed || '');
  const [laborHours, setLaborHours] = useState(String(editingTarget?.laborHours ?? 1));
  const [approvalChoice, setApprovalChoice] = useState<'approved' | 'pending_approval'>('approved');
  const [editApprovalStatus, setEditApprovalStatus] = useState<ApprovalStatus>(
    supervisorEditLog?.approvalStatus || 'approved'
  );
  const [editReviewNotes, setEditReviewNotes] = useState(supervisorEditLog?.reviewNotes || '');

  const [attachments, setAttachments] = useState<PendingAttachmentDraft[]>([]);
  const [scannerKind, setScannerKind] = useState<AttachmentKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedBuilding = buildings.find((b) => b.id === buildingId) || buildings[0];

  const isPpm = entryType === 'ppm_inhouse' || entryType === 'ppm_amc';
  const autoNextDueDate = useMemo(() => {
    if (!isPpm) return '';
    return computeNextPpmDueDate(completedDate, ppmFrequency);
  }, [isPpm, completedDate, ppmFrequency]);

  const effectiveNextDueDate = customNextDueDate || autoNextDueDate;

  const beforeDrafts = attachments.filter((a) => a.kind === 'before_photo');
  const afterDrafts = attachments.filter((a) => a.kind === 'after_photo');
  const scanDrafts = attachments.filter((a) => a.kind === 'amc_scan');

  const handleRemoveDraft = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBuilding) {
      setErrorMsg('Please select a building first.');
      return;
    }
    if (!assetName.trim() || !title.trim()) {
      setErrorMsg('Equipment / Asset Name and Work Title are required.');
      return;
    }
    if (entryType === 'ppm_amc' && !amcContractor.trim()) {
      setErrorMsg('Please specify the AMC Contractor name for AMC PPM reports.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (isSupervisorEdit && supervisorEditLog) {
        await supervisorUpdateMaintenanceLog(
          supervisorEditLog,
          {
            building: selectedBuilding,
            entryType,
            discipline,
            assetName,
            assetTag,
            locationZone,
            title,
            workNotes,
            ppmFrequency,
            nextDueDateOverride: customNextDueDate || undefined,
            amcContractor,
            scheduledDate,
            completedDate,
            outcome,
            partsUsed,
            laborHours: Number(laborHours) || 0,
            newAttachments: attachments,
            existingBeforeIds: supervisorEditLog.beforePhotoIds || [],
            existingAfterIds: supervisorEditLog.afterPhotoIds || [],
            existingScanIds: supervisorEditLog.scannedReportIds || [],
            approvalStatus: editApprovalStatus,
            reviewNotes: editReviewNotes,
          },
          {
            uid: user.uid,
            name: user.name,
            email: user.email,
          }
        );
        onSubmitted({ logId: supervisorEditLog.id, offlineQueued: false, isSupervisorEdit: true });
        onClose();
        return;
      }

      const res = await submitMaintenanceLog(
        {
          logId: resubmitLog?.id,
          isResubmit: Boolean(resubmitLog),
          building: selectedBuilding,
          entryType,
          discipline,
          assetName,
          assetTag,
          locationZone,
          title,
          workNotes,
          ppmFrequency,
          nextDueDateOverride: customNextDueDate || undefined,
          amcContractor,
          scheduledDate,
          completedDate,
          outcome,
          partsUsed,
          laborHours: Number(laborHours) || 0,
          newAttachments: attachments,
          existingBeforeIds: resubmitLog?.beforePhotoIds || [],
          existingAfterIds: resubmitLog?.afterPhotoIds || [],
          existingScanIds: resubmitLog?.scannedReportIds || [],
          approvalStatusOverride: isManager ? approvalChoice : 'pending_approval',
        },
        {
          uid: user.uid,
          name: user.name,
          email: user.email,
          role: user.role,
          isEffectiveOnline,
        }
      );
      onSubmitted(res);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save maintenance log.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:bg-slate-100 dark:disabled:bg-slate-800';
  const labelClass = 'block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {isSupervisorEdit
                ? `Supervisor Edit Record — ${supervisorEditLog?.title}`
                : resubmitLog
                  ? `Resubmit Work Log — ${resubmitLog.title}`
                  : 'Log Facility Work / PPM Report'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isSupervisorEdit
                ? `Editing record originally submitted by ${supervisorEditLog?.submittedByName}. Original submitter attribution is preserved.`
                : user.role === 'technician'
                  ? 'Submissions route automatically to Supervisor Review before entering the master database.'
                  : 'Log directly to the master ledger or route to pending review.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {!isEffectiveOnline && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Offline Mode Active:</span> This report and all attached photos/scans will be stored securely on your device and synced automatically once signal returns.
              </div>
            </div>
          )}

          {resubmitLog?.reviewNotes && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
              <span className="font-semibold">Supervisor Revision Note:</span> {resubmitLog.reviewNotes}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Two-Tier Entry Category Selector */}
          <div className="space-y-2.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Work / Report Category *
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  if (entryType !== 'ppm_inhouse' && entryType !== 'ppm_amc') {
                    setEntryType('ppm_inhouse');
                  }
                }}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  entryType === 'ppm_inhouse' || entryType === 'ppm_amc'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                PPM Reports (In-House / AMC)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (entryType !== 'repair' && entryType !== 'upgradation') {
                    setEntryType('repair');
                  }
                }}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  entryType === 'repair' || entryType === 'upgradation'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Repair &amp; Upgradation Works
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(entryType === 'ppm_inhouse' || entryType === 'ppm_amc'
                ? (['ppm_inhouse', 'ppm_amc'] as EntryType[])
                : (['repair', 'upgradation'] as EntryType[])
              ).map((subType) => (
                <button
                  key={subType}
                  type="button"
                  onClick={() => setEntryType(subType)}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-left ${
                    entryType === subType
                      ? 'border-brand-600 dark:border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-800 dark:text-brand-200'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {ENTRY_TYPE_LABELS[subType]}
                </button>
              ))}
            </div>
          </div>

          {/* Building & Discipline */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Building *</label>
              <select
                value={buildingId}
                disabled={Boolean(editingTarget)}
                onChange={(e) => setBuildingId(e.target.value)}
                className={inputClass}
              >
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>System Discipline *</label>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className={inputClass}
              >
                {DISCIPLINE_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Asset & Location */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Asset / Equipment *</label>
              <SpellCheckInput
                required
                maxLength={140}
                value={assetName}
                onValueChange={setAssetName}
                placeholder="e.g. Chiller Unit 01"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Asset Tag / Serial</label>
              <input
                type="text"
                maxLength={64}
                value={assetTag}
                onChange={(e) => setAssetTag(e.target.value)}
                placeholder="CH-01"
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Floor / Zone</label>
              <SpellCheckInput
                maxLength={120}
                value={locationZone}
                onValueChange={setLocationZone}
                placeholder="Roof Plant Room"
                className={inputClass}
              />
            </div>
          </div>

          {/* PPM Specific Fields + Automatic Next Due Date */}
          {isPpm && (
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>PPM Frequency *</label>
                  <select
                    value={ppmFrequency}
                    onChange={(e) => {
                      setPpmFrequency(e.target.value as PpmFrequency);
                      setCustomNextDueDate('');
                    }}
                    className={inputClass}
                  >
                    {(['weekly', 'monthly', 'quarterly', 'semi_annual', 'annual'] as PpmFrequency[]).map((f) => (
                      <option key={f} value={f}>
                        {FREQUENCY_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Next PPM Due (Auto)</label>
                  <input
                    type="date"
                    value={effectiveNextDueDate}
                    onChange={(e) => setCustomNextDueDate(e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                </div>

                {entryType === 'ppm_amc' && (
                  <div>
                    <label className={labelClass}>AMC Contractor *</label>
                    <SpellCheckInput
                      required
                      maxLength={140}
                      list="building-amc-list"
                      value={amcContractor}
                      onValueChange={setAmcContractor}
                      placeholder="Select or type contractor"
                      className={inputClass}
                    />
                    <datalist id="building-amc-list">
                      {(selectedBuilding?.amcContractors || []).map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>

              {effectiveNextDueDate && (
                <div className="flex items-center gap-2 text-xs text-brand-900 dark:text-brand-200 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 rounded-lg px-3 py-2">
                  <CalendarClock className="w-4 h-4 text-brand-700 dark:text-brand-400 shrink-0" />
                  <span>
                    Next <strong>{FREQUENCY_LABELS[ppmFrequency]}</strong> PPM will be automatically scheduled due on{' '}
                    <strong className="font-mono">{effectiveNextDueDate}</strong> with supervisor reminders 14 days prior.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Work Title & Notes */}
          <div>
            <label className={labelClass}>Work Title / Summary *</label>
            <SpellCheckInput
              required
              showToggle
              maxLength={180}
              value={title}
              onValueChange={setTitle}
              placeholder={
                entryType === 'repair'
                  ? 'e.g. Replaced leaking isolation valve on chilled water riser'
                  : entryType === 'upgradation'
                    ? 'e.g. Upgraded lobby lighting to DALI LED fixtures'
                    : 'e.g. Monthly preventive maintenance inspection & filter replacement'
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Technical Findings / Work Performed</label>
            <SpellCheckTextarea
              rows={3}
              maxLength={3000}
              value={workNotes}
              onValueChange={setWorkNotes}
              placeholder="Detail inspection readings, corrective actions taken, or contractor observations..."
              className={inputClass}
            />
          </div>

          {/* Dates, Outcome, Labor & Parts */}
          <div className="grid sm:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>Scheduled Date</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Completed Date *</label>
              <input
                type="date"
                required
                value={completedDate}
                onChange={(e) => setCompletedDate(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Outcome / Condition</label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as WorkOutcome)}
                className={inputClass}
              >
                {(['operational', 'minor_observation', 'critical_fault'] as WorkOutcome[]).map((o) => (
                  <option key={o} value={o}>
                    {OUTCOME_LABELS[o]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Labor Hours</label>
              <input
                type="number"
                min={0}
                max={1000}
                step="0.5"
                value={laborHours}
                onChange={(e) => setLaborHours(e.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Parts / Materials Used</label>
            <SpellCheckInput
              maxLength={500}
              value={partsUsed}
              onValueChange={setPartsUsed}
              placeholder="e.g. 2x MERV-13 filters, 1x 50mm butterfly valve, PTFE tape"
              className={inputClass}
            />
          </div>

          {/* Evidence Capture */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Visual Evidence &amp; Scanned Contractor Reports
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={(editingTarget?.beforePhotoIds.length || 0) + beforeDrafts.length >= 6}
                  onClick={() => setScannerKind('before_photo')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                  Add Before Photo ({(editingTarget?.beforePhotoIds.length || 0) + beforeDrafts.length}/6)
                </button>
                <button
                  type="button"
                  disabled={(editingTarget?.afterPhotoIds.length || 0) + afterDrafts.length >= 6}
                  onClick={() => setScannerKind('after_photo')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  Add After Photo ({(editingTarget?.afterPhotoIds.length || 0) + afterDrafts.length}/6)
                </button>
                <button
                  type="button"
                  disabled={(editingTarget?.scannedReportIds.length || 0) + scanDrafts.length >= 6}
                  onClick={() => setScannerKind('amc_scan')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/60 text-xs font-medium text-brand-800 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/60 disabled:opacity-50"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  Scan AMC Report ({(editingTarget?.scannedReportIds.length || 0) + scanDrafts.length}/6)
                </button>
              </div>
            </div>

            {attachments.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="relative rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden"
                  >
                    {att.mimeType === 'application/pdf' ? (
                      <div className="h-24 flex flex-col items-center justify-center p-2 text-center">
                        <FileText className="w-6 h-6 text-brand-700 dark:text-brand-400" />
                        <span className="mt-1 text-xs text-slate-700 dark:text-slate-200 truncate max-w-full">
                          {att.fileName}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={att.dataUrl}
                        alt={att.caption || att.fileName}
                        className="w-full h-24 object-cover"
                      />
                    )}
                    <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">
                        {att.kind === 'before_photo'
                          ? 'Before'
                          : att.kind === 'after_photo'
                            ? 'After'
                            : 'AMC Scan'}
                        {att.caption ? ` · ${att.caption}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDraft(att.id)}
                        className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        aria-label="Remove attachment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 py-1">
                <Paperclip className="w-3.5 h-3.5" />
                <span>
                  Attach before/after work photos or scan physical AMC service reports using camera or file upload.
                </span>
              </div>
            )}
          </div>

          {isSupervisorEdit ? (
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Approval Status &amp; Supervisor Edit Remarks
                </span>
                <select
                  value={editApprovalStatus}
                  onChange={(e) => setEditApprovalStatus(e.target.value as ApprovalStatus)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 font-medium text-slate-800 dark:text-slate-100"
                >
                  <option value="approved">Approved</option>
                  <option value="pending_approval">Pending Review</option>
                  <option value="revision_requested">Revision Requested</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <SpellCheckInput
                maxLength={1000}
                value={editReviewNotes}
                onValueChange={setEditReviewNotes}
                placeholder="Optional supervisor review / correction note..."
                className={inputClass}
              />
            </div>
          ) : (
            isManager &&
            !resubmitLog && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Supervisor Commit Status
                </span>
                <select
                  value={approvalChoice}
                  onChange={(e) => setApprovalChoice(e.target.value as 'approved' | 'pending_approval')}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 font-medium text-slate-800 dark:text-slate-100"
                >
                  <option value="approved">Commit Directly as Approved</option>
                  <option value="pending_approval">Save as Pending Review</option>
                </select>
              </div>
            )
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
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
              className="px-5 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60 transition-colors"
            >
              {submitting
                ? 'Saving...'
                : isSupervisorEdit
                  ? 'Save Record Changes'
                  : !isEffectiveOnline
                    ? 'Save to Offline Queue'
                    : resubmitLog
                      ? 'Resubmit for Approval'
                      : user.role === 'technician'
                        ? 'Submit for Supervisor Review'
                        : 'Save Maintenance Log'}
            </button>
          </div>
        </form>
      </div>

      {scannerKind && (
        <ScannerModal
          kind={scannerKind}
          onAttach={(draft) => setAttachments((prev) => [...prev, draft])}
          onClose={() => setScannerKind(null)}
        />
      )}
    </div>
  );
};
