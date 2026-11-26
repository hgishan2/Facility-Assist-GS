import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarClock,
  Camera,
  CheckCircle2,
  Clock,
  Plus,
  QrCode,
  RotateCcw,
  ScanLine,
  Search,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import type { ParsedAssetQr } from '../lib/qrUtils';
import {
  APPROVAL_STATUS_LABELS,
  ApprovalStatus,
  Asset,
  ENTRY_TYPE_LABELS,
  EntryType,
  FREQUENCY_LABELS,
  MaintenanceLog,
  OfflineQueueItem,
  OUTCOME_LABELS,
  UserRole,
} from '../types';
import type { LogPrefillTemplate } from './LogFormModal';

interface MaintenanceLogsViewProps {
  logs: MaintenanceLog[];
  assets?: Asset[];
  offlineQueue: OfflineQueueItem[];
  userRole?: UserRole;
  initialApprovalFilter?: 'all' | ApprovalStatus;
  initialTypeFilter?: 'all' | EntryType;
  scannedAssetFilter?: ParsedAssetQr | null;
  onSelectLog: (log: MaintenanceLog) => void;
  onCreateNew: (defaultType?: EntryType, prefill?: LogPrefillTemplate) => void;
  onClearAssetFilter?: () => void;
}

export const MaintenanceLogsView: React.FC<MaintenanceLogsViewProps> = ({
  logs,
  assets = [],
  offlineQueue,
  userRole,
  initialApprovalFilter = 'all',
  initialTypeFilter = 'all',
  scannedAssetFilter = null,
  onSelectLog,
  onCreateNew,
  onClearAssetFilter,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | EntryType>(initialTypeFilter);
  const [approvalFilter, setApprovalFilter] = useState<'all' | ApprovalStatus>(initialApprovalFilter);

  const assetMatchedLogs = useMemo(() => {
    if (!scannedAssetFilter) return logs;
    const targetTag = scannedAssetFilter.assetTag.trim().toUpperCase();
    const targetBld = (scannedAssetFilter.buildingCode || '').trim().toUpperCase();
    return logs.filter((l) => {
      const tagMatches = l.assetTag.trim().toUpperCase() === targetTag;
      if (!tagMatches) return false;
      if (targetBld && l.buildingCode.trim().toUpperCase() !== targetBld) return false;
      return true;
    });
  }, [logs, scannedAssetFilter]);

  const matchedAssetRecord = useMemo(() => {
    if (!scannedAssetFilter) return null;
    if (scannedAssetFilter.assetId) {
      const byId = assets.find((a) => a.id === scannedAssetFilter.assetId);
      if (byId) return byId;
    }
    const targetTag = scannedAssetFilter.assetTag.trim().toUpperCase();
    const targetBld = (scannedAssetFilter.buildingCode || '').trim().toUpperCase();
    return (
      assets.find(
        (a) =>
          a.assetTag.trim().toUpperCase() === targetTag &&
          (!targetBld || a.buildingCode.trim().toUpperCase() === targetBld)
      ) || null
    );
  }, [assets, scannedAssetFilter]);

  const lastPpmReport = useMemo(() => {
    if (!scannedAssetFilter) return null;
    const ppmOnly = assetMatchedLogs
      .filter((l) => l.entryType === 'ppm_inhouse' || l.entryType === 'ppm_amc')
      .sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''));
    return ppmOnly[0] || null;
  }, [assetMatchedLogs, scannedAssetFilter]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assetMatchedLogs.filter((l) => {
      if (typeFilter !== 'all' && l.entryType !== typeFilter) return false;
      if (approvalFilter !== 'all' && l.approvalStatus !== approvalFilter) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        l.assetName.toLowerCase().includes(q) ||
        l.assetTag.toLowerCase().includes(q) ||
        l.buildingCode.toLowerCase().includes(q) ||
        l.buildingName.toLowerCase().includes(q) ||
        l.amcContractor.toLowerCase().includes(q) ||
        l.submittedByName.toLowerCase().includes(q)
      );
    });
  }, [assetMatchedLogs, search, typeFilter, approvalFilter]);

  const renderStatus = (status: ApprovalStatus) => {
    if (status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          {APPROVAL_STATUS_LABELS[status]}
        </span>
      );
    }
    if (status === 'revision_requested') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          {APPROVAL_STATUS_LABELS[status]}
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          {APPROVAL_STATUS_LABELS[status]}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 dark:text-brand-400 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        {APPROVAL_STATUS_LABELS[status]}
      </span>
    );
  };

  const scannedFallbackMeta = assetMatchedLogs[0] || null;
  const scannedTitle =
    matchedAssetRecord?.assetName || scannedFallbackMeta?.assetName || 'Scanned Asset';
  const scannedBuildingLabel = matchedAssetRecord
    ? `${matchedAssetRecord.buildingCode} · ${matchedAssetRecord.buildingName}`
    : scannedFallbackMeta
      ? `${scannedFallbackMeta.buildingCode} · ${scannedFallbackMeta.buildingName}`
      : scannedAssetFilter?.buildingCode || 'Portfolio Lookup';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {userRole === 'technician' ? 'My Maintenance & PPM Logs' : 'Maintenance & PPM Register'}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {userRole === 'technician'
              ? 'Your submitted In-House PPM, AMC contractor reports, repair works, and building upgradations.'
              : 'In-house PPM, AMC contractor reports, repair works, and building upgradations.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onCreateNew(typeFilter === 'all' ? 'ppm_inhouse' : typeFilter)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Log Work Entry
          </button>
        </div>
      </div>

      {/* Scanned Asset Quick Inspection & Last PPM Report */}
      {scannedAssetFilter && (
        <div className="bg-brand-50/70 dark:bg-brand-950/35 border border-brand-200 dark:border-brand-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-brand-700 text-white font-mono font-semibold">
                  <QrCode className="w-3 h-3" />
                  {scannedAssetFilter.assetTag}
                </span>
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium">
                  <Building2 className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                  {scannedBuildingLabel}
                </span>
                {(matchedAssetRecord?.discipline || scannedFallbackMeta?.discipline) && (
                  <span className="text-slate-500 dark:text-slate-400">
                    · {matchedAssetRecord?.discipline || scannedFallbackMeta?.discipline}
                  </span>
                )}
                {(matchedAssetRecord?.locationZone || scannedFallbackMeta?.locationZone) && (
                  <span className="text-slate-500 dark:text-slate-400">
                    · {matchedAssetRecord?.locationZone || scannedFallbackMeta?.locationZone}
                  </span>
                )}
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {scannedTitle}
              </h3>
              {(matchedAssetRecord?.manufacturerModel || matchedAssetRecord?.serialNumber) && (
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {matchedAssetRecord.manufacturerModel && `Model: ${matchedAssetRecord.manufacturerModel}`}
                  {matchedAssetRecord.manufacturerModel && matchedAssetRecord.serialNumber ? ' · ' : ''}
                  {matchedAssetRecord.serialNumber && `S/N: ${matchedAssetRecord.serialNumber}`}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onCreateNew('ppm_inhouse', {
                    buildingId: matchedAssetRecord?.buildingId || scannedFallbackMeta?.buildingId,
                    assetName: matchedAssetRecord?.assetName || scannedFallbackMeta?.assetName || '',
                    assetTag: scannedAssetFilter.assetTag,
                    discipline: matchedAssetRecord?.discipline || scannedFallbackMeta?.discipline,
                    locationZone: matchedAssetRecord?.locationZone || scannedFallbackMeta?.locationZone,
                    ppmFrequency:
                      matchedAssetRecord?.ppmFrequency && matchedAssetRecord.ppmFrequency !== 'none'
                        ? matchedAssetRecord.ppmFrequency
                        : lastPpmReport?.ppmFrequency,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Log Entry for Asset
              </button>
              {onClearAssetFilter && (
                <button
                  type="button"
                  onClick={onClearAssetFilter}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear Filter
                </button>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-brand-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CalendarClock className="w-5 h-5 text-brand-700 dark:text-brand-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Last PPM Report ({assetMatchedLogs.length} total log{assetMatchedLogs.length === 1 ? '' : 's'} for asset)
                </p>
                {lastPpmReport ? (
                  <div className="mt-1 space-y-0.5 text-xs">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {lastPpmReport.title} ·{' '}
                      <span className="font-mono text-brand-700 dark:text-brand-400">
                        {lastPpmReport.completedDate}
                      </span>
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      {ENTRY_TYPE_LABELS[lastPpmReport.entryType]}
                      {lastPpmReport.amcContractor ? ` (${lastPpmReport.amcContractor})` : ''}
                      {' · '}
                      {FREQUENCY_LABELS[lastPpmReport.ppmFrequency]}
                      {' · '}
                      Outcome: <strong>{OUTCOME_LABELS[lastPpmReport.outcome]}</strong>
                      {lastPpmReport.nextDueDate ? ` · Next Due: ${lastPpmReport.nextDueDate}` : ''}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    No In-House or AMC PPM report has been logged for tag{' '}
                    <span className="font-mono font-semibold">{scannedAssetFilter.assetTag}</span> yet.
                  </p>
                )}
              </div>
            </div>

            {lastPpmReport && (
              <button
                type="button"
                onClick={() => onSelectLog(lastPpmReport)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/60 text-xs font-semibold text-brand-800 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/60 whitespace-nowrap"
              >
                View Last PPM Report
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
            {(['all', 'ppm_inhouse', 'ppm_amc', 'repair', 'upgradation'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  typeFilter === t
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t === 'all' ? 'All Works' : ENTRY_TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <select
            value={approvalFilter}
            onChange={(e) => setApprovalFilter(e.target.value as 'all' | ApprovalStatus)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950"
          >
            <option value="all">All Statuses</option>
            <option value="pending_approval">Pending Review</option>
            <option value="approved">Approved Only</option>
            <option value="revision_requested">Revision Requested</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search asset, building, vendor..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
      </div>

      {/* Offline Outbox Rows */}
      {offlineQueue.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <WifiOff className="w-4 h-4" />
            Offline Queue ({offlineQueue.length} pending auto-sync)
          </div>
          <div className="divide-y divide-amber-200/70 dark:divide-amber-800/60">
            {offlineQueue.map((item) => (
              <div key={item.queueId} className="py-2 flex items-center justify-between gap-4 text-xs">
                <div>
                  <span className="font-mono font-semibold text-amber-950 dark:text-amber-100">
                    {item.logPayload.buildingCode}
                  </span>
                  <span className="mx-1.5 text-amber-700 dark:text-amber-400">·</span>
                  <span className="font-medium text-amber-950 dark:text-amber-100">
                    {item.logPayload.title}
                  </span>
                  <span className="mx-1.5 text-amber-700 dark:text-amber-400">·</span>
                  <span className="text-amber-800 dark:text-amber-300">
                    {item.attachments.length} attachment(s)
                  </span>
                </div>
                <span className="font-mono text-[11px] text-amber-800 dark:text-amber-300 whitespace-nowrap">
                  Queued {item.queuedAtIso.slice(11, 16)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Register Table */}
      {filteredLogs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <AlertCircle className="w-7 h-7 text-slate-400 mx-auto" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            No matching maintenance records
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Adjust your active filters or log a new PPM, AMC contractor report, repair, or upgradation work.
          </p>
          <button
            type="button"
            onClick={() => onCreateNew('ppm_inhouse')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800"
          >
            <Plus className="w-4 h-4" />
            Log First Entry
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Building &amp; Asset</th>
                  <th className="py-3 px-4">Work Title &amp; Category</th>
                  <th className="py-3 px-4">Evidence</th>
                  <th className="py-3 px-4">Outcome</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {filteredLogs.map((log) => {
                  const photoCount = log.beforePhotoIds.length + log.afterPhotoIds.length;
                  const scanCount = log.scannedReportIds.length;

                  return (
                    <tr
                      key={log.id}
                      onClick={() => onSelectLog(log)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <p>{log.completedDate}</p>
                        {log.nextDueDate && (
                          <p className="text-[11px] text-brand-700 dark:text-brand-400">
                            Due {log.nextDueDate}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {log.buildingCode}
                          </span>
                          {' · '}
                          <span>{log.assetTag || log.locationZone || log.discipline}</span>
                        </p>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{log.assetName}</p>
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {log.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {ENTRY_TYPE_LABELS[log.entryType]}
                          {log.amcContractor ? ` · ${log.amcContractor}` : ''}
                          {' · '}
                          By {log.submittedByName}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <div className="flex items-center gap-3 font-mono tabular-nums">
                          {photoCount > 0 && (
                            <span className="inline-flex items-center gap-1" title="Before/After Photos">
                              <Camera className="w-3.5 h-3.5 text-slate-400" />
                              {photoCount}
                            </span>
                          )}
                          {scanCount > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-400"
                              title="AMC Scans"
                            >
                              <ScanLine className="w-3.5 h-3.5" />
                              {scanCount}
                            </span>
                          )}
                          {photoCount === 0 && scanCount === 0 && <span className="text-slate-400">—</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        <span
                          className={
                            log.outcome === 'critical_fault'
                              ? 'text-red-700 dark:text-red-400 font-medium'
                              : log.outcome === 'minor_observation'
                                ? 'text-amber-700 dark:text-amber-400 font-medium'
                                : 'text-slate-700 dark:text-slate-300'
                          }
                        >
                          {OUTCOME_LABELS[log.outcome]}
                        </span>
                      </td>
                      <td className="py-3 px-4">{renderStatus(log.approvalStatus)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
