import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Pencil,
  QrCode,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  deleteMaintenanceLog,
  fetchAttachmentsForLog,
  reviewMaintenanceLog,
} from '../lib/dataService';
import {
  APPROVAL_STATUS_LABELS,
  ENTRY_TYPE_LABELS,
  FREQUENCY_LABELS,
  MaintenanceLog,
  OUTCOME_LABELS,
  UserRole,
  WorkAttachment,
} from '../types';
import { AssetQrPreviewModal } from './AssetsQrView';
import { SpellCheckTextarea } from './SpellCheckField';

interface LogDetailModalProps {
  log: MaintenanceLog;
  user: { uid: string; name: string; role: UserRole };
  onClose: () => void;
  onResubmitRequested?: (log: MaintenanceLog) => void;
  onSupervisorEditRequested?: (log: MaintenanceLog) => void;
}

export const LogDetailModal: React.FC<LogDetailModalProps> = ({
  log,
  user,
  onClose,
  onResubmitRequested,
  onSupervisorEditRequested,
}) => {
  const [attachments, setAttachments] = useState<WorkAttachment[]>([]);
  const [loadingAtts, setLoadingAtts] = useState(false);
  const [reviewNotes, setReviewNotes] = useState(log.reviewNotes || '');
  const [savingReview, setSavingReview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightboxAtt, setLightboxAtt] = useState<WorkAttachment | null>(null);
  const [qrPreviewOpen, setQrPreviewOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isManager = user.role === 'supervisor' || user.role === 'admin';

  useEffect(() => {
    const total =
      log.beforePhotoIds.length + log.afterPhotoIds.length + log.scannedReportIds.length;
    if (total === 0) {
      setAttachments([]);
      return;
    }
    setLoadingAtts(true);
    fetchAttachmentsForLog(log)
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setLoadingAtts(false));
  }, [log]);

  const beforePhotos = attachments.filter((a) => a.kind === 'before_photo');
  const afterPhotos = attachments.filter((a) => a.kind === 'after_photo');
  const amcScans = attachments.filter((a) => a.kind === 'amc_scan');

  const handleDecision = async (decision: 'approved' | 'revision_requested' | 'rejected') => {
    if ((decision === 'revision_requested' || decision === 'rejected') && !reviewNotes.trim()) {
      setErrorMsg('Please enter review notes explaining what needs revision or why it is rejected.');
      return;
    }
    setSavingReview(true);
    setErrorMsg(null);
    try {
      await reviewMaintenanceLog(log.id, decision, reviewNotes, {
        uid: user.uid,
        name: user.name,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save review decision.');
    } finally {
      setSavingReview(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteMaintenanceLog(log);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete record.');
      setDeleting(false);
    }
  };

  const renderStatusBadge = () => {
    if (log.approvalStatus === 'approved') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {APPROVAL_STATUS_LABELS[log.approvalStatus]}
        </span>
      );
    }
    if (log.approvalStatus === 'revision_requested') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-800 dark:text-amber-300">
          <RotateCcw className="w-3.5 h-3.5" />
          {APPROVAL_STATUS_LABELS[log.approvalStatus]}
        </span>
      );
    }
    if (log.approvalStatus === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs font-medium text-red-800 dark:text-red-300">
          <XCircle className="w-3.5 h-3.5" />
          {APPROVAL_STATUS_LABELS[log.approvalStatus]}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 text-xs font-medium text-brand-800 dark:text-brand-300">
        <AlertCircle className="w-3.5 h-3.5" />
        {APPROVAL_STATUS_LABELS[log.approvalStatus]}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {log.buildingCode}
              </span>
              <span aria-hidden="true">·</span>
              <span>{log.buildingName}</span>
              <span aria-hidden="true">·</span>
              <span>{ENTRY_TYPE_LABELS[log.entryType]}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{log.completedDate}</span>
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {log.title}
            </h2>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {(log.assetTag || log.assetName) && (
              <button
                type="button"
                onClick={() => setQrPreviewOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <QrCode className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                QR Label
              </button>
            )}
            {isManager && onSupervisorEditRequested && (
              <button
                type="button"
                onClick={() => onSupervisorEditRequested(log)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Pencil className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                Edit Record
              </button>
            )}
            {renderStatusBadge()}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Structured Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Asset / Equipment</p>
              <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{log.assetName}</p>
              {log.assetTag && <p className="font-mono text-slate-500 dark:text-slate-400">{log.assetTag}</p>}
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Discipline &amp; Zone</p>
              <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{log.discipline}</p>
              <p className="text-slate-500 dark:text-slate-400">{log.locationZone || 'General Area'}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Outcome &amp; Labor</p>
              <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                {OUTCOME_LABELS[log.outcome]}
              </p>
              <p className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {log.laborHours} hrs logged
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Submitted By</p>
              <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                {log.submittedByName}
              </p>
              <p className="text-slate-500 dark:text-slate-400 truncate">{log.submittedByEmail}</p>
            </div>
          </div>

          {(log.entryType === 'ppm_inhouse' || log.entryType === 'ppm_amc') && (
            <div className="flex flex-wrap items-center gap-6 text-xs text-slate-600 dark:text-slate-300 px-1">
              <span>
                <strong className="text-slate-800 dark:text-slate-100">Frequency:</strong>{' '}
                {FREQUENCY_LABELS[log.ppmFrequency]}
              </span>
              {log.scheduledDate && (
                <span>
                  <strong className="text-slate-800 dark:text-slate-100">Scheduled:</strong>{' '}
                  <span className="font-mono">{log.scheduledDate}</span>
                </span>
              )}
              {log.nextDueDate && (
                <span>
                  <strong className="text-slate-800 dark:text-slate-100">Next PPM Due:</strong>{' '}
                  <span className="font-mono font-semibold text-brand-700 dark:text-brand-400">
                    {log.nextDueDate}
                  </span>
                </span>
              )}
              {log.amcContractor && (
                <span>
                  <strong className="text-slate-800 dark:text-slate-100">AMC Contractor:</strong>{' '}
                  {log.amcContractor}
                </span>
              )}
            </div>
          )}

          {/* Notes & Parts */}
          <div className="grid sm:grid-cols-3 gap-5">
            <div className="sm:col-span-2">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Technical Notes &amp; Findings
              </h3>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 min-h-[76px]">
                {log.workNotes || 'No detailed notes entered.'}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Parts &amp; Materials Used
              </h3>
              <p className="text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 min-h-[76px]">
                {log.partsUsed || 'None listed'}
              </p>
            </div>
          </div>

          {/* Before / After Comparison & AMC Scans */}
          {loadingAtts ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-lg">
              Loading attached photos and scanned reports...
            </div>
          ) : (
            <div className="space-y-5">
              {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      Before Photos ({beforePhotos.length})
                    </h3>
                    {beforePhotos.length === 0 ? (
                      <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                        No before photos attached.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2.5">
                        {beforePhotos.map((att) => (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() => setLightboxAtt(att)}
                            className="text-left rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden hover:border-brand-600 transition-colors"
                          >
                            <img
                              src={att.dataUrl}
                              alt={att.caption || att.fileName}
                              className="w-full h-28 object-cover"
                            />
                            <p className="px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 truncate bg-slate-50 dark:bg-slate-800">
                              {att.caption || att.fileName}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      After Photos ({afterPhotos.length})
                    </h3>
                    {afterPhotos.length === 0 ? (
                      <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                        No after photos attached.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2.5">
                        {afterPhotos.map((att) => (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() => setLightboxAtt(att)}
                            className="text-left rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden hover:border-brand-600 transition-colors"
                          >
                            <img
                              src={att.dataUrl}
                              alt={att.caption || att.fileName}
                              className="w-full h-28 object-cover"
                            />
                            <p className="px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 truncate bg-slate-50 dark:bg-slate-800">
                              {att.caption || att.fileName}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {amcScans.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Scanned AMC Contractor Reports ({amcScans.length})
                  </h3>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {amcScans.map((att) => (
                      <div
                        key={att.id}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800"
                      >
                        {att.mimeType === 'application/pdf' ? (
                          <div className="p-4 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-5 h-5 text-brand-700 dark:text-brand-400 shrink-0" />
                              <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                {att.fileName}
                              </span>
                            </div>
                            <a
                              href={att.dataUrl}
                              download={att.fileName}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
                            >
                              <Download className="w-3 h-3" />
                              PDF
                            </a>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setLightboxAtt(att)}
                            className="w-full text-left"
                          >
                            <img
                              src={att.dataUrl}
                              alt={att.caption || att.fileName}
                              className="w-full h-32 object-cover"
                            />
                            <p className="px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 truncate bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                              {att.caption || att.fileName}
                            </p>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Review History / Supervisor Approval Panel */}
          {log.reviewedByName && (
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                Supervisor Audit · Reviewed by {log.reviewedByName}
                {log.reviewedAtIso ? ` on ${log.reviewedAtIso.slice(0, 10)}` : ''}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                {log.reviewNotes || 'No review remarks.'}
              </p>
            </div>
          )}

          {isManager && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Supervisor Approval &amp; Review Remarks
              </label>
              <SpellCheckTextarea
                rows={2}
                maxLength={1000}
                value={reviewNotes}
                onValueChange={setReviewNotes}
                placeholder="Add verification notes or instructions if requesting revision..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Record
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={handleDelete}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                      >
                        {deleting ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={savingReview}
                    onClick={() => handleDecision('rejected')}
                    className="px-3.5 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={savingReview}
                    onClick={() => handleDecision('revision_requested')}
                    className="px-3.5 py-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950"
                  >
                    Request Revision
                  </button>
                  <button
                    type="button"
                    disabled={savingReview}
                    onClick={() => handleDecision('approved')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {savingReview ? 'Saving...' : 'Approve & Commit'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {user.role === 'technician' &&
            log.approvalStatus === 'revision_requested' &&
            log.submittedByUid === user.uid &&
            onResubmitRequested && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => onResubmitRequested(log)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit &amp; Resubmit for Approval
                </button>
              </div>
            )}
        </div>
      </div>

      {lightboxAtt && (
        <div
          onClick={() => setLightboxAtt(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl w-full bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {lightboxAtt.caption || lightboxAtt.fileName}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxAtt.dataUrl}
                  download={lightboxAtt.fileName}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxAtt(null)}
                  className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="bg-slate-950 flex items-center justify-center max-h-[78vh] overflow-auto">
              <img
                src={lightboxAtt.dataUrl}
                alt={lightboxAtt.fileName}
                className="max-h-[78vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {qrPreviewOpen && (
        <AssetQrPreviewModal
          asset={{
            id: log.id,
            assetTag: log.assetTag || log.id.slice(-6).toUpperCase(),
            assetName: log.assetName,
            buildingCode: log.buildingCode,
            buildingName: log.buildingName,
            locationZone: log.locationZone,
            discipline: log.discipline,
          }}
          onClose={() => setQrPreviewOpen(false)}
        />
      )}
    </div>
  );
};
