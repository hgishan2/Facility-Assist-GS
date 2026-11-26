import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Unlink,
  Upload,
  X,
} from 'lucide-react';
import type { UseGoogleSheetsAutoBackupReturn } from '../hooks/useGoogleSheetsAutoBackup';
import { bulkImportWorkbookData, BulkImportResult } from '../lib/dataService';
import { BACKUP_TAB_NAMES, parseSpreadsheetIdInput } from '../lib/googleSheetsBackup';
import {
  downloadImportTemplate,
  exportManagerSummaryWorkbook,
  exportOvertimeWorkbook,
  exportTenantSchedulesWorkbook,
  exportUtilityReportWorkbook,
  exportWorkLogsWorkbook,
  loadLegacyGst1ImportPreview,
  parseImportFiles,
  WorkbookImportPreview,
} from '../lib/excelUtils';
import {
  Asset,
  Building,
  ENTRY_TYPE_LABELS,
  EntryType,
  MaintenanceLog,
  OvertimeLog,
  Technician,
  TenantSchedule,
  UserRole,
  UtilityMeter,
  UtilityReading,
  WorkLog,
} from '../types';

interface ExcelHubViewProps {
  buildings: Building[];
  assets?: Asset[];
  technicians: Technician[];
  logs: MaintenanceLog[];
  workLogs: WorkLog[];
  overtimeLogs: OvertimeLog[];
  utilityMeters: UtilityMeter[];
  utilityReadings: UtilityReading[];
  tenantSchedules: TenantSchedule[];
  user: { uid: string; name: string; email: string; role?: UserRole };
  googleBackup: UseGoogleSheetsAutoBackupReturn;
  onImportComplete: (summary: BulkImportResult) => void;
}

type PendingSheetAction =
  | { kind: 'create' }
  | { kind: 'link'; rawInput: string; parsedId: string }
  | { kind: 'sync_now' }
  | { kind: 'enable_auto' }
  | { kind: 'disconnect' };

export const ExcelHubView: React.FC<ExcelHubViewProps> = ({
  buildings,
  assets = [],
  technicians,
  logs,
  workLogs,
  overtimeLogs,
  utilityMeters,
  utilityReadings,
  tenantSchedules,
  user,
  googleBackup,
  onImportComplete,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  // Export Filters
  const [exportBuildingId, setExportBuildingId] = useState<string>('all');
  const [exportType, setExportType] = useState<'all' | EntryType>('all');
  const [exportApproval, setExportApproval] = useState<'approved' | 'all'>('approved');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Operational Date-Range Export Filters
  const [opsBuildingId, setOpsBuildingId] = useState<string>('all');
  const [opsFrom, setOpsFrom] = useState(thirtyDaysAgo);
  const [opsTo, setOpsTo] = useState(today);

  // Import State
  const [preview, setPreview] = useState<WorkbookImportPreview | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [importBanner, setImportBanner] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Google Sheets Auto Backup UI State
  const [sheetLinkInput, setSheetLinkInput] = useState('');
  const [sheetUiError, setSheetUiError] = useState<string | null>(null);
  const [pendingSheetAction, setPendingSheetAction] = useState<PendingSheetAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const totalBackupRecords =
    buildings.length +
    assets.length +
    logs.length +
    workLogs.length +
    overtimeLogs.length +
    utilityMeters.length +
    utilityReadings.length +
    tenantSchedules.length;

  const {
    config: backupCfg,
    tokenConnected,
    syncing: sheetSyncing,
    connectAndRefreshToken,
    createNewBackupSheet,
    connectExistingSheet,
    syncNow,
    toggleAutoBackup,
    disconnectBackup,
  } = googleBackup;

  const handleRequestLinkExisting = () => {
    setSheetUiError(null);
    const parsedId = parseSpreadsheetIdInput(sheetLinkInput);
    if (!parsedId) {
      setSheetUiError('Enter a valid Google Spreadsheet URL or Spreadsheet ID.');
      return;
    }
    setPendingSheetAction({ kind: 'link', rawInput: sheetLinkInput, parsedId });
  };

  const handleConfirmSheetAction = async () => {
    if (!pendingSheetAction) return;
    setConfirmBusy(true);
    setSheetUiError(null);
    try {
      if (pendingSheetAction.kind === 'create') {
        await createNewBackupSheet(true);
      } else if (pendingSheetAction.kind === 'link') {
        await connectExistingSheet(pendingSheetAction.rawInput, true);
        setSheetLinkInput('');
      } else if (pendingSheetAction.kind === 'sync_now') {
        await syncNow();
      } else if (pendingSheetAction.kind === 'enable_auto') {
        if (!tokenConnected) {
          await connectAndRefreshToken();
        }
        toggleAutoBackup(true);
        await syncNow();
      } else if (pendingSheetAction.kind === 'disconnect') {
        disconnectBackup();
      }
      setPendingSheetAction(null);
    } catch (err) {
      setSheetUiError(
        err instanceof Error ? err.message : 'Google Sheets operation failed.'
      );
      setPendingSheetAction(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  const filteredExportLogs = logs.filter((l) => {
    if (exportBuildingId !== 'all' && l.buildingId !== exportBuildingId) return false;
    if (exportType !== 'all' && l.entryType !== exportType) return false;
    if (exportApproval === 'approved' && l.approvalStatus !== 'approved') return false;
    if (dateFrom && l.completedDate < dateFrom) return false;
    if (dateTo && l.completedDate > dateTo) return false;
    return true;
  });

  const opsBuildingLabel =
    opsBuildingId === 'all'
      ? 'All Buildings'
      : buildings.find((b) => b.id === opsBuildingId)?.name || 'Selected Building';

  const scopedOpsWork = workLogs.filter((w) => {
    if (opsBuildingId !== 'all' && w.buildingId !== opsBuildingId) return false;
    if (opsFrom && w.logDate < opsFrom) return false;
    if (opsTo && w.logDate > opsTo) return false;
    return true;
  });

  const scopedOpsOt = overtimeLogs.filter((o) => {
    if (opsBuildingId !== 'all' && o.buildingId !== opsBuildingId) return false;
    if (opsFrom && o.otDate < opsFrom) return false;
    if (opsTo && o.otDate > opsTo) return false;
    return true;
  });

  const scopedOpsMeters = utilityMeters.filter(
    (m) => opsBuildingId === 'all' || m.buildingId === opsBuildingId
  );
  const scopedOpsReadings = utilityReadings.filter(
    (r) => opsBuildingId === 'all' || r.buildingId === opsBuildingId
  );
  const opsReadingsInPeriod = scopedOpsReadings.filter(
    (r) => (!opsFrom || r.readingDate >= opsFrom) && (!opsTo || r.readingDate <= opsTo)
  );

  const scopedOpsSchedules = tenantSchedules.filter((s) => {
    if (opsBuildingId !== 'all' && s.buildingId !== opsBuildingId) return false;
    if (opsFrom && s.scheduleDate < opsFrom) return false;
    if (opsTo && s.scheduleDate > opsTo) return false;
    return true;
  });

  const handleExportSummary = () => {
    const bLabel =
      exportBuildingId === 'all'
        ? 'All Buildings'
        : buildings.find((b) => b.id === exportBuildingId)?.name || 'Selected Building';
    exportManagerSummaryWorkbook(filteredExportLogs, buildings, {
      buildingLabel: bLabel,
      dateFrom,
      dateTo,
      generatedBy: `${user.name} (${user.email})`,
    });
  };

  const importContext = {
    existingBuildings: buildings,
    existingTechnicians: technicians,
    existingWorkLogs: workLogs,
    existingOvertimeLogs: overtimeLogs,
    existingMeters: utilityMeters,
    existingReadings: utilityReadings,
    existingSchedules: tenantSchedules,
  };

  const previewTotalRecords = preview
    ? preview.buildingsToCreate.length +
      preview.techniciansToCreate.length +
      preview.logsToCreate.length +
      preview.workLogsToCreate.length +
      preview.overtimeToCreate.length +
      preview.metersToCreate.length +
      preview.readingsToCreate.length +
      preview.schedulesToCreate.length
    : 0;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setParsing(true);
    setImportBanner(null);
    setFileName(
      files.length === 1 ? files[0].name : `${files.length} files (${files.map((f) => f.name).join(', ')})`
    );
    try {
      const parsed = await parseImportFiles(files, importContext);
      setPreview(parsed);
    } catch (err) {
      setPreview({
        buildingsToCreate: [],
        techniciansToCreate: [],
        logsToCreate: [],
        workLogsToCreate: [],
        overtimeToCreate: [],
        metersToCreate: [],
        readingsToCreate: [],
        schedulesToCreate: [],
        skippedDuplicates: 0,
        ignoredItems: [],
        errors: [err instanceof Error ? err.message : 'Unable to parse uploaded file(s).'],
      });
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLoadUploadedLegacyGst1 = async () => {
    setParsing(true);
    setImportBanner(null);
    setFileName('Uploaded Existing App Export (GST1)');
    try {
      const parsed = await loadLegacyGst1ImportPreview(importContext);
      setPreview(parsed);
    } catch (err) {
      setPreview({
        buildingsToCreate: [],
        techniciansToCreate: [],
        logsToCreate: [],
        workLogsToCreate: [],
        overtimeToCreate: [],
        metersToCreate: [],
        readingsToCreate: [],
        schedulesToCreate: [],
        skippedDuplicates: 0,
        ignoredItems: [],
        errors: [err instanceof Error ? err.message : 'Unable to load GST1 dataset.'],
      });
    } finally {
      setParsing(false);
    }
  };

  const handleCommitImport = async () => {
    if (!preview || previewTotalRecords === 0) return;

    setImporting(true);
    setImportProgress('Preparing records...');
    setImportBanner(null);
    try {
      const res = await bulkImportWorkbookData(
        {
          buildingsToCreate: preview.buildingsToCreate,
          techniciansToCreate: preview.techniciansToCreate,
          logsToCreate: preview.logsToCreate,
          workLogsToCreate: preview.workLogsToCreate,
          overtimeToCreate: preview.overtimeToCreate,
          metersToCreate: preview.metersToCreate,
          readingsToCreate: preview.readingsToCreate,
          schedulesToCreate: preview.schedulesToCreate,
        },
        {
          uid: user.uid,
          name: user.name,
          email: user.email,
          role: user.role,
          existingBuildings: buildings,
          technicians,
          existingMeters: utilityMeters,
          existingWorkLogs: workLogs,
          existingOvertimeLogs: overtimeLogs,
          existingReadings: utilityReadings,
          existingSchedules: tenantSchedules,
          onProgress: (label) => setImportProgress(label),
        }
      );
      const parts: string[] = [];
      if (res.createdBuildings) parts.push(`${res.createdBuildings} building(s)`);
      if (res.createdTechnicians) parts.push(`${res.createdTechnicians} technician(s)`);
      if (res.createdMeters) parts.push(`${res.createdMeters} meter(s)`);
      if (res.createdWorkLogs) parts.push(`${res.createdWorkLogs} work log(s)`);
      if (res.createdOvertime) parts.push(`${res.createdOvertime} overtime log(s)`);
      if (res.createdReadings) parts.push(`${res.createdReadings} reading(s)`);
      if (res.createdSchedules) parts.push(`${res.createdSchedules} schedule(s)`);
      if (res.createdLogs) parts.push(`${res.createdLogs} maintenance/PPM log(s)`);
      const summaryText = parts.length > 0 ? parts.join(', ') : '0 new records (already synced)';
      setImportBanner(
        `Imported ${summaryText} into Firestore.${res.skippedDuplicates > 0 ? ` (${res.skippedDuplicates} existing duplicates skipped.)` : ''}`
      );
      setPreview(null);
      onImportComplete(res);
    } catch (err) {
      setImportBanner(err instanceof Error ? err.message : 'Bulk import failed.');
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Excel Reports, Google Sheets Backup &amp; Bulk Import
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Maintain a live full auto-backup in Google Sheets, generate multi-sheet Excel reports, or bulk-populate buildings and maintenance logs.
        </p>
      </div>

      {/* Google Sheets Full Auto Backup */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
              {backupCfg.spreadsheetId && backupCfg.autoBackupEnabled && tokenConnected ? (
                <Cloud className="w-5 h-5" />
              ) : (
                <CloudOff className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Google Sheets Full Auto Backup
                </h3>
                {backupCfg.spreadsheetId ? (
                  !tokenConnected ? (
                    <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                      Session Reconnect Needed
                    </span>
                  ) : backupCfg.autoBackupEnabled ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                      Live Auto-Sync Active
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Linked (Manual Only)
                    </span>
                  )
                ) : (
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Not Linked
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Mirrors all {totalBackupRecords.toLocaleString()} portfolio records across {BACKUP_TAB_NAMES.length} structured tabs in your Google Spreadsheet whenever changes occur.
              </p>
            </div>
          </div>

          {backupCfg.spreadsheetId && (
            <div className="flex flex-wrap items-center gap-2">
              {!tokenConnected && (
                <button
                  type="button"
                  onClick={async () => {
                    setSheetUiError(null);
                    try {
                      await connectAndRefreshToken();
                    } catch (err) {
                      setSheetUiError(
                        err instanceof Error
                          ? err.message
                          : 'Unable to authorize Google Sheets.'
                      );
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reconnect Google Sheets
                </button>
              )}

              <button
                type="button"
                disabled={sheetSyncing}
                onClick={() => {
                  setSheetUiError(null);
                  setPendingSheetAction({ kind: 'sync_now' });
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60 whitespace-nowrap transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${sheetSyncing ? 'animate-spin' : ''}`} />
                {sheetSyncing ? 'Syncing...' : 'Sync Backup Now'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSheetUiError(null);
                  if (backupCfg.autoBackupEnabled) {
                    toggleAutoBackup(false);
                  } else {
                    setPendingSheetAction({ kind: 'enable_auto' });
                  }
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
                  backupCfg.autoBackupEnabled
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                Auto-Sync: {backupCfg.autoBackupEnabled ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                onClick={() => setPendingSheetAction({ kind: 'disconnect' })}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-700 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-800"
              >
                <Unlink className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          )}
        </div>

        {(sheetUiError || backupCfg.lastError) && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{sheetUiError || backupCfg.lastError}</span>
          </div>
        )}

        {backupCfg.spreadsheetId ? (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {backupCfg.spreadsheetTitle || 'Facility Assist — Full Auto Backup'}
                </span>
                <a
                  href={backupCfg.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-400 hover:underline shrink-0"
                >
                  Open in Google Sheets
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                ID: {backupCfg.spreadsheetId}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Last Synced</p>
                <p className="font-mono font-medium text-slate-900 dark:text-slate-100">
                  {backupCfg.lastSyncedAtIso
                    ? new Date(backupCfg.lastSyncedAtIso).toLocaleString()
                    : 'Pending first sync'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Backed Up Rows</p>
                <p className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {backupCfg.lastRowCount.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-col justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Option A: Create New Auto-Backup Sheet
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Creates a brand-new Google Spreadsheet in your Google account pre-configured with all {BACKUP_TAB_NAMES.length} backup worksheets and enables automatic live syncing.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  disabled={sheetSyncing}
                  onClick={() => {
                    setSheetUiError(null);
                    setPendingSheetAction({ kind: 'create' });
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create Backup Sheet &amp; Enable Auto-Sync
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-col justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Option B: Link Existing Google Spreadsheet
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Paste an existing Google Sheets URL or Spreadsheet ID you own or have edit access to.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={sheetLinkInput}
                  onChange={(e) => setSheetLinkInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
                <button
                  type="button"
                  disabled={!sheetLinkInput.trim() || sheetSyncing}
                  onClick={handleRequestLinkExisting}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  <Link2 className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                  Link Sheet
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-300 mr-1">
            Synchronized Worksheets ({BACKUP_TAB_NAMES.length}):
          </span>
          {BACKUP_TAB_NAMES.map((tab) => (
            <code
              key={tab}
              className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[10px]"
            >
              {tab}
            </code>
          ))}
        </div>
      </section>

      {/* Date-Range Operational Reports (.xlsx) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Date-Range Operational Reports (.xlsx)
            </h3>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Select any date range and building scope to generate Work Log (summary + daily tabs), Overtime Timesheet (summary + per-technician tabs), Utility Consumption Matrix, or Tenant Schedule workbooks.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={opsBuildingId}
              onChange={(e) => setOpsBuildingId(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="all">All Buildings ({buildings.length})</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={opsFrom}
              onChange={(e) => setOpsFrom(e.target.value)}
              aria-label="Operational report from date"
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
            <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
            <input
              type="date"
              value={opsTo}
              onChange={(e) => setOpsTo(e.target.value)}
              aria-label="Operational report to date"
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Daily Work Logs</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {scopedOpsWork.length} work order(s) in range
              </p>
            </div>
            <button
              type="button"
              disabled={scopedOpsWork.length === 0}
              onClick={() =>
                exportWorkLogsWorkbook(scopedOpsWork, {
                  buildingLabel: opsBuildingLabel,
                  dateFrom: opsFrom,
                  dateTo: opsTo,
                  generatedBy: `${user.name} (${user.email})`,
                })
              }
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Work Log (.xlsx)
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Overtime Timesheet</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {scopedOpsOt.length} OT entry/entries in range
              </p>
            </div>
            <button
              type="button"
              disabled={scopedOpsOt.length === 0}
              onClick={() =>
                exportOvertimeWorkbook(scopedOpsOt, technicians, {
                  buildingLabel: opsBuildingLabel,
                  dateFrom: opsFrom,
                  dateTo: opsTo,
                  generatedBy: `${user.name} (${user.email})`,
                })
              }
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Overtime (.xlsx)
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Utility Consumption</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {opsReadingsInPeriod.length} reading(s) · {scopedOpsMeters.length} meter(s)
              </p>
            </div>
            <button
              type="button"
              disabled={scopedOpsReadings.length === 0}
              onClick={() =>
                exportUtilityReportWorkbook(scopedOpsReadings, scopedOpsMeters, {
                  buildingLabel: opsBuildingLabel,
                  dateFrom: opsFrom,
                  dateTo: opsTo,
                  generatedBy: `${user.name} (${user.email})`,
                })
              }
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Utility Report (.xlsx)
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tenant Schedules</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {scopedOpsSchedules.length} visit(s) in range
              </p>
            </div>
            <button
              type="button"
              disabled={scopedOpsSchedules.length === 0}
              onClick={() =>
                exportTenantSchedulesWorkbook(scopedOpsSchedules, {
                  buildingLabel: opsBuildingLabel,
                  dateFrom: opsFrom,
                  dateTo: opsTo,
                  generatedBy: `${user.name} (${user.email})`,
                })
              }
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Schedules (.xlsx)
            </button>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* Card 1: Facility Manager Excel Summary Export */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 flex items-center justify-center text-brand-700 dark:text-brand-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Facility Manager Summary Report (.xlsx)
              </h3>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                Includes Executive Summary, PPM Compliance Register, Repairs &amp; Upgradations, and Building Portfolio tabs.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Building Scope
              </label>
              <select
                value={exportBuildingId}
                onChange={(e) => setExportBuildingId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="all">All Buildings ({buildings.length})</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Work Type
              </label>
              <select
                value={exportType}
                onChange={(e) => setExportType(e.target.value as 'all' | EntryType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="all">All Categories</option>
                {(['ppm_inhouse', 'ppm_amc', 'repair', 'upgradation'] as EntryType[]).map((t) => (
                  <option key={t} value={t}>
                    {ENTRY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Include:</label>
              <select
                value={exportApproval}
                onChange={(e) => setExportApproval(e.target.value as 'approved' | 'all')}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="approved">Approved Logs Only</option>
                <option value="all">All Logs (Incl. Pending)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleExportSummary}
              disabled={filteredExportLogs.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export Excel ({filteredExportLogs.length} rows)
            </button>
          </div>
        </section>

        {/* Card 2: Template Download & Bulk Database Populate */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Template Download &amp; Bulk Upload
              </h3>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                Download the pre-configured template containing your active building codes, fill in historical or batch logs, and upload to populate Firestore automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => downloadImportTemplate(buildings, technicians)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
              Download Template
            </button>
          </div>

          {importBanner && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{importBanner}</span>
            </div>
          )}

          {/* 1-Click Loader for Uploaded Existing App Export (GST1) */}
          <div className="p-4 rounded-xl border border-brand-200 dark:border-brand-800/80 bg-brand-50/50 dark:bg-brand-950/30 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Existing App Spreadsheet Ready (GST1)
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Includes Building GST1, 9 team profiles, 7 meters, 982 work logs, 67 overtime entries, 246 readings &amp; 14 tenant schedules. Unrelated PIN columns &amp; empty sheets are automatically excluded.
              </p>
            </div>
            <button
              type="button"
              disabled={parsing || importing}
              onClick={handleLoadUploadedLegacyGst1}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60 whitespace-nowrap shrink-0 transition-colors"
            >
              <Database className="w-3.5 h-3.5" />
              {parsing ? 'Loading...' : 'Preview & Import GST1 Data'}
            </button>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center hover:border-brand-600 dark:hover:border-brand-500 hover:bg-brand-50/30 dark:hover:bg-brand-950/20 transition-colors cursor-pointer"
          >
            <Upload className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto" />
            <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
              {parsing ? 'Parsing uploaded file(s)...' : 'Or upload .xlsx, .xls, or multiple .csv files'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Supports multi-sheet Workbooks and Logs, Overtime, Meters, Readings, Schedules, Lists &amp; PPM templates.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {preview && (
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{fileName}</span>
                <span className="font-mono tabular-nums font-medium text-brand-700 dark:text-brand-400">
                  {previewTotalRecords.toLocaleString()} ready to import
                  {preview.skippedDuplicates > 0 ? ` · ${preview.skippedDuplicates} duplicates skipped` : ''}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                {[
                  { label: 'Buildings', count: preview.buildingsToCreate.length },
                  { label: 'Technicians', count: preview.techniciansToCreate.length },
                  { label: 'Work Logs', count: preview.workLogsToCreate.length },
                  { label: 'Overtime', count: preview.overtimeToCreate.length },
                  { label: 'Utility Meters', count: preview.metersToCreate.length },
                  { label: 'Meter Readings', count: preview.readingsToCreate.length },
                  { label: 'Tenant Schedules', count: preview.schedulesToCreate.length },
                  { label: 'PPM / Repairs', count: preview.logsToCreate.length },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex items-center justify-between"
                  >
                    <span className="text-slate-600 dark:text-slate-400">{stat.label}</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {stat.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              {preview.ignoredItems.length > 0 && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                  <p className="font-medium text-slate-700 dark:text-slate-300">
                    Ignored Unrelated / Empty Data:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {preview.ignoredItems.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-300 space-y-1 max-h-36 overflow-y-auto">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Validation Warnings ({preview.errors.length})
                  </div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {preview.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {importing && importProgress && (
                <p className="text-xs font-medium text-brand-700 dark:text-brand-400">
                  {importProgress}
                </p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => setPreview(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  Discard
                </button>
                {previewTotalRecords > 0 && (
                  <button
                    type="button"
                    disabled={importing}
                    onClick={handleCommitImport}
                    className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 disabled:opacity-60"
                  >
                    {importing
                      ? 'Populating Database...'
                      : `Populate Database (${previewTotalRecords.toLocaleString()} records)`}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Confirmation Modal for Google Sheets Backup Actions */}
      {pendingSheetAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {pendingSheetAction.kind === 'create'
                    ? 'Create Google Sheets Auto-Backup?'
                    : pendingSheetAction.kind === 'link'
                      ? 'Link & Overwrite Backup Tabs?'
                      : pendingSheetAction.kind === 'sync_now'
                        ? 'Overwrite Backup Tabs Now?'
                        : pendingSheetAction.kind === 'enable_auto'
                          ? 'Enable Live Auto-Sync to Google Sheets?'
                          : 'Disconnect Google Sheets Backup?'}
                </h3>
              </div>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setPendingSheetAction(null)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {pendingSheetAction.kind === 'disconnect' ? (
                <p>
                  This will unlink{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {backupCfg.spreadsheetTitle || backupCfg.spreadsheetId}
                  </strong>{' '}
                  from Facility Assist and stop automatic backups. Your existing spreadsheet file in Google Drive will{' '}
                  <strong className="text-slate-900 dark:text-slate-100">not</strong> be deleted.
                </p>
              ) : (
                <>
                  <p>
                    {pendingSheetAction.kind === 'create'
                      ? `Facility Assist will create a new Google Spreadsheet titled "Facility Assist — Full Auto Backup" in your Google account, create ${BACKUP_TAB_NAMES.length} backup tabs, and write all current records.`
                      : pendingSheetAction.kind === 'link'
                        ? `Facility Assist will connect to spreadsheet "${pendingSheetAction.parsedId}", add any missing backup tabs, and clear/overwrite the contents of those ${BACKUP_TAB_NAMES.length} tabs.`
                        : pendingSheetAction.kind === 'enable_auto'
                          ? `Enabling Live Auto-Sync will automatically clear and overwrite the ${BACKUP_TAB_NAMES.length} backup tabs in "${backupCfg.spreadsheetTitle || backupCfg.spreadsheetId}" whenever facility records are created, edited, or deleted.`
                          : `This will clear and overwrite all ${BACKUP_TAB_NAMES.length} backup tabs in "${backupCfg.spreadsheetTitle || backupCfg.spreadsheetId}" with your latest Facility Assist database snapshot.`}
                  </p>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      Affected Dataset ({totalBackupRecords.toLocaleString()} total records across {BACKUP_TAB_NAMES.length} tabs):
                    </p>
                    <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                      {BACKUP_TAB_NAMES.join(', ')}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setPendingSheetAction(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={handleConfirmSheetAction}
                className={`px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-60 transition-colors ${
                  pendingSheetAction.kind === 'disconnect'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-brand-700 hover:bg-brand-800'
                }`}
              >
                {confirmBusy
                  ? 'Processing...'
                  : pendingSheetAction.kind === 'disconnect'
                    ? 'Confirm Disconnect'
                    : 'Confirm & Proceed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
