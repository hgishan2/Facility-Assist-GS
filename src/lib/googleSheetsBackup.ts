import {
  APPROVAL_STATUS_LABELS,
  Asset,
  Building,
  ENTRY_TYPE_LABELS,
  FREQUENCY_LABELS,
  MaintenanceLog,
  MaintenanceNotification,
  NOTIFICATION_SEVERITY_LABELS,
  OUTCOME_LABELS,
  OvertimeLog,
  TenantSchedule,
  UtilityMeter,
  UtilityReading,
  WorkLog,
} from '../types';

const BACKUP_CONFIG_STORAGE_KEY = 'facility_assist_gsheets_backup_cfg';
const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export const BACKUP_TAB_NAMES = [
  'Backup_Overview',
  'Buildings',
  'Assets_Registry',
  'Maintenance_PPM_Logs',
  'Work_Logs',
  'Overtime_Logs',
  'Utility_Meters',
  'Utility_Readings',
  'Tenant_Schedules',
  'Maintenance_Notifications',
] as const;

export type BackupTabName = (typeof BACKUP_TAB_NAMES)[number];

export interface GoogleSheetsBackupConfig {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  autoBackupEnabled: boolean;
  lastSyncedAtIso: string | null;
  lastRowCount: number;
  lastError: string | null;
}

export interface BackupDatasetSnapshot {
  buildings: Building[];
  assets?: Asset[];
  logs: MaintenanceLog[];
  workLogs: WorkLog[];
  overtimeLogs: OvertimeLog[];
  utilityMeters: UtilityMeter[];
  utilityReadings: UtilityReading[];
  tenantSchedules: TenantSchedule[];
  notifications?: MaintenanceNotification[];
  syncedByLabel: string;
}

export class GoogleSheetsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSheetsAuthError';
  }
}

const DEFAULT_CONFIG: GoogleSheetsBackupConfig = {
  spreadsheetId: '',
  spreadsheetTitle: '',
  spreadsheetUrl: '',
  autoBackupEnabled: false,
  lastSyncedAtIso: null,
  lastRowCount: 0,
  lastError: null,
};

export function loadBackupConfig(): GoogleSheetsBackupConfig {
  try {
    const raw = localStorage.getItem(BACKUP_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<GoogleSheetsBackupConfig>;
    return {
      spreadsheetId: typeof parsed.spreadsheetId === 'string' ? parsed.spreadsheetId : '',
      spreadsheetTitle: typeof parsed.spreadsheetTitle === 'string' ? parsed.spreadsheetTitle : '',
      spreadsheetUrl: typeof parsed.spreadsheetUrl === 'string' ? parsed.spreadsheetUrl : '',
      autoBackupEnabled: Boolean(parsed.autoBackupEnabled),
      lastSyncedAtIso: typeof parsed.lastSyncedAtIso === 'string' ? parsed.lastSyncedAtIso : null,
      lastRowCount: typeof parsed.lastRowCount === 'number' ? parsed.lastRowCount : 0,
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveBackupConfig(cfg: GoogleSheetsBackupConfig): GoogleSheetsBackupConfig {
  try {
    // Store ONLY non-secret spreadsheet metadata (never access tokens)
    localStorage.setItem(BACKUP_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage errors
  }
  return cfg;
}

export function clearBackupConfig(): GoogleSheetsBackupConfig {
  try {
    localStorage.removeItem(BACKUP_CONFIG_STORAGE_KEY);
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG };
}

export function parseSpreadsheetIdInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed.replace(/[^a-zA-Z0-9-_]/g, '');
}

async function sheetsFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (res.status === 401 || res.status === 403) {
    const txt = await res.text();
    throw new GoogleSheetsAuthError(
      res.status === 401
        ? 'Google Sheets session expired. Reconnect Google Sheets to continue.'
        : `Google Sheets permission denied: ${txt.slice(0, 180)}`
    );
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Sheets API error (${res.status}): ${errBody.slice(0, 220)}`);
  }

  return (await res.json()) as T;
}

export async function createBackupSpreadsheet(
  accessToken: string,
  title = 'Facility Assist — Full Auto Backup'
): Promise<{ spreadsheetId: string; spreadsheetTitle: string; spreadsheetUrl: string }> {
  const body = {
    properties: {
      title,
    },
    sheets: BACKUP_TAB_NAMES.map((tabName) => ({
      properties: {
        title: tabName,
        gridProperties: { frozenRowCount: 1 },
      },
    })),
  };

  const data = await sheetsFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties?: { title?: string };
  }>(SHEETS_API_BASE, accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetTitle: data.properties?.title || title,
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
  };
}

function safeCell(val: unknown): string | number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  const str = String(val ?? '');
  // Keep cells comfortably below Sheets 50k char limit
  return str.length > 10000 ? str.slice(0, 10000) : str;
}

function buildSheetPayloads(snapshot: BackupDatasetSnapshot): {
  tabName: BackupTabName;
  values: (string | number)[][];
  recordCount: number;
}[] {
  const nowIso = new Date().toISOString();

  const overviewRows: (string | number)[][] = [
    ['Facility Assist — Full Auto Backup Overview', '', ''],
    ['Generated At (UTC)', nowIso, ''],
    ['Synced By', snapshot.syncedByLabel, ''],
    ['', '', ''],
    ['Module Tab', 'Record Count', 'Notes'],
    ['Buildings', snapshot.buildings.length, 'Portfolio properties & AMC contractors'],
    ['Assets_Registry', (snapshot.assets || []).length, 'QR-tagged physical equipment & asset registry'],
    ['Maintenance_PPM_Logs', snapshot.logs.length, 'In-House PPM, AMC PPM, Repair & Upgradation logs'],
    ['Work_Logs', snapshot.workLogs.length, 'Daily shift work orders & tenant complaints'],
    ['Overtime_Logs', snapshot.overtimeLogs.length, 'Overtime claims (N, WO, PH, N. Shift)'],
    ['Utility_Meters', snapshot.utilityMeters.length, 'Registered electricity, water & chilled water meters'],
    ['Utility_Readings', snapshot.utilityReadings.length, 'Daily meter readings & notes'],
    ['Tenant_Schedules', snapshot.tenantSchedules.length, 'Scheduled apartment & tenant visits'],
    ['Maintenance_Notifications', (snapshot.notifications || []).length, 'Broadcasted urgent maintenance alerts & acknowledgments'],
  ];

  const buildingsRows: (string | number)[][] = [
    ['Building ID', 'Code', 'Name', 'Address', 'Floors', 'Facility Manager', 'AMC Contractors', 'Status'],
    ...snapshot.buildings.map((b) => [
      safeCell(b.id),
      safeCell(b.code),
      safeCell(b.name),
      safeCell(b.address),
      safeCell(b.floorsCount),
      safeCell(b.facilityManager),
      safeCell(b.amcContractors.join(', ')),
      safeCell(b.status),
    ]),
  ];

  const assets = snapshot.assets || [];
  const assetRows: (string | number)[][] = [
    [
      'Asset ID',
      'Asset Tag',
      'Asset Name',
      'Building Code',
      'Building Name',
      'Discipline',
      'Location / Zone',
      'Manufacturer / Model',
      'Serial Number',
      'PPM Frequency',
      'Status',
    ],
    ...assets.map((a) => [
      safeCell(a.id),
      safeCell(a.assetTag),
      safeCell(a.assetName),
      safeCell(a.buildingCode),
      safeCell(a.buildingName),
      safeCell(a.discipline),
      safeCell(a.locationZone),
      safeCell(a.manufacturerModel),
      safeCell(a.serialNumber),
      safeCell(FREQUENCY_LABELS[a.ppmFrequency] || a.ppmFrequency),
      safeCell(a.status),
    ]),
  ];

  const maintenanceRows: (string | number)[][] = [
    [
      'Log ID',
      'Building Code',
      'Building Name',
      'Entry Type',
      'Discipline',
      'Asset Name',
      'Asset Tag',
      'Location / Zone',
      'Work Title',
      'PPM Frequency',
      'Scheduled Date',
      'Completed Date',
      'Next PPM Due',
      'AMC Contractor',
      'Outcome',
      'Labor Hours',
      'Parts Used',
      'Approval Status',
      'Submitted By',
      'Submitted Email',
      'Reviewed By',
      'Review Notes',
      'Work Notes',
      'Evidence Counts (Before / After / Scans)',
    ],
    ...snapshot.logs.map((l) => [
      safeCell(l.id),
      safeCell(l.buildingCode),
      safeCell(l.buildingName),
      safeCell(ENTRY_TYPE_LABELS[l.entryType] || l.entryType),
      safeCell(l.discipline),
      safeCell(l.assetName),
      safeCell(l.assetTag),
      safeCell(l.locationZone),
      safeCell(l.title),
      safeCell(FREQUENCY_LABELS[l.ppmFrequency] || l.ppmFrequency),
      safeCell(l.scheduledDate),
      safeCell(l.completedDate),
      safeCell(l.nextDueDate),
      safeCell(l.amcContractor),
      safeCell(OUTCOME_LABELS[l.outcome] || l.outcome),
      safeCell(l.laborHours),
      safeCell(l.partsUsed),
      safeCell(APPROVAL_STATUS_LABELS[l.approvalStatus] || l.approvalStatus),
      safeCell(l.submittedByName),
      safeCell(l.submittedByEmail),
      safeCell(l.reviewedByName),
      safeCell(l.reviewNotes),
      safeCell(l.workNotes),
      `${l.beforePhotoIds.length} / ${l.afterPhotoIds.length} / ${l.scannedReportIds.length}`,
    ]),
  ];

  const workLogsRows: (string | number)[][] = [
    [
      'Work Log ID',
      'Date',
      'Shift',
      'Building Code',
      'Building Name',
      'WO Number',
      'Location',
      'Category',
      'Priority',
      'Complaint / Details',
      'Action Taken',
      'Materials Used',
      'Received Time',
      'Start Time',
      'Finish Time',
      'Duration (hrs)',
      'Status',
      'Pending Reason',
      'Technician',
      'Supervisor',
      'Session #',
      'Root Job ID',
      'Superseded By',
      'Chain Resolved',
      'Remarks',
    ],
    ...snapshot.workLogs.map((w) => [
      safeCell(w.id),
      safeCell(w.logDate),
      safeCell(w.shift),
      safeCell(w.buildingCode),
      safeCell(w.buildingName),
      safeCell(w.woNumber),
      safeCell(w.location),
      safeCell(w.category),
      safeCell(w.priority),
      safeCell(w.complaint),
      safeCell(w.action),
      safeCell(w.materials),
      safeCell(w.receivedTime),
      safeCell(w.startTime),
      safeCell(w.finishTime),
      safeCell(w.durationHours),
      safeCell(w.status),
      safeCell(w.pendingReason),
      safeCell(w.technicianName),
      safeCell(w.supervisorName),
      safeCell(w.sessionNumber || 1),
      safeCell(w.rootWorkLogId || w.id),
      safeCell(w.supersededByLogId || ''),
      w.status === 'Completed' || w.chainResolved ? 'Yes' : 'No',
      safeCell(w.remarks),
    ]),
  ];

  const overtimeRows: (string | number)[][] = [
    [
      'Overtime ID',
      'OT Date',
      'Building Code',
      'Building Name',
      'Technician',
      'Badge ID',
      'From Time',
      'To Time',
      'Hours',
      'OT Category',
      'Work Type',
      'Location',
      'Work Description',
      'Approval Status',
      'Review Notes',
    ],
    ...snapshot.overtimeLogs.map((o) => [
      safeCell(o.id),
      safeCell(o.otDate),
      safeCell(o.buildingCode),
      safeCell(o.buildingName),
      safeCell(o.technicianName),
      safeCell(o.technicianBadgeId),
      safeCell(o.fromTime),
      safeCell(o.toTime),
      safeCell(o.hours),
      safeCell(o.otCategoryType),
      safeCell(o.workType),
      safeCell(o.location),
      safeCell(o.workDescription),
      safeCell(o.approvalStatus),
      safeCell(o.reviewNotes),
    ]),
  ];

  const meterRows: (string | number)[][] = [
    ['Meter ID', 'Building Code', 'Utility Type', 'Area / Unit', 'Meter No', 'Account No', 'Unit', 'Status'],
    ...snapshot.utilityMeters.map((m) => [
      safeCell(m.id),
      safeCell(m.buildingCode),
      safeCell(m.meterType),
      safeCell(m.area),
      safeCell(m.meterNo),
      safeCell(m.accountNo),
      safeCell(m.unit),
      safeCell(m.status),
    ]),
  ];

  const readingRows: (string | number)[][] = [
    [
      'Reading ID',
      'Reading Date',
      'Building Code',
      'Utility Type',
      'Area',
      'Meter No',
      'Account No',
      'Reading Value',
      'Entered By',
      'Notes',
    ],
    ...snapshot.utilityReadings.map((r) => [
      safeCell(r.id),
      safeCell(r.readingDate),
      safeCell(r.buildingCode),
      safeCell(r.meterType),
      safeCell(r.area),
      safeCell(r.meterNo),
      safeCell(r.accountNo),
      safeCell(r.readingValue),
      safeCell(r.technicianName),
      safeCell(r.notes),
    ]),
  ];

  const scheduleRows: (string | number)[][] = [
    [
      'Schedule ID',
      'Schedule Date',
      'Time Slot',
      'Building Code',
      'Building Name',
      'Unit / Location',
      'Tenant Name',
      'Category',
      'Description',
      'Assigned Technician',
      'Status',
      'Completion Notes',
    ],
    ...snapshot.tenantSchedules.map((s) => [
      safeCell(s.id),
      safeCell(s.scheduleDate),
      safeCell(s.timeSlot),
      safeCell(s.buildingCode),
      safeCell(s.buildingName),
      safeCell(s.unitOrLocation),
      safeCell(s.tenantName),
      safeCell(s.category),
      safeCell(s.description),
      safeCell(s.assignedTechName),
      safeCell(s.status),
      safeCell(s.completionNotes),
    ]),
  ];

  const notifications = snapshot.notifications || [];
  const notificationRows: (string | number)[][] = [
    [
      'Notification ID',
      'Building Code',
      'Building Name',
      'Severity',
      'Category',
      'Title',
      'Message',
      'Location / Zone',
      'Status',
      'Broadcast By',
      'Acknowledged By',
      'Resolved By',
      'Resolved At',
      'Expires On',
    ],
    ...notifications.map((n) => [
      safeCell(n.id),
      safeCell(n.buildingCode),
      safeCell(n.buildingName),
      safeCell(NOTIFICATION_SEVERITY_LABELS[n.severity] || n.severity),
      safeCell(n.category),
      safeCell(n.title),
      safeCell(n.message),
      safeCell(n.locationZone),
      safeCell(n.status),
      safeCell(n.createdByName),
      safeCell(n.acknowledgedByEmails.join(', ')),
      safeCell(n.resolvedByName),
      safeCell(n.resolvedAtIso),
      safeCell(n.expiresAtDate),
    ]),
  ];

  return [
    { tabName: 'Backup_Overview', values: overviewRows, recordCount: 0 },
    { tabName: 'Buildings', values: buildingsRows, recordCount: snapshot.buildings.length },
    { tabName: 'Assets_Registry', values: assetRows, recordCount: assets.length },
    { tabName: 'Maintenance_PPM_Logs', values: maintenanceRows, recordCount: snapshot.logs.length },
    { tabName: 'Work_Logs', values: workLogsRows, recordCount: snapshot.workLogs.length },
    { tabName: 'Overtime_Logs', values: overtimeRows, recordCount: snapshot.overtimeLogs.length },
    { tabName: 'Utility_Meters', values: meterRows, recordCount: snapshot.utilityMeters.length },
    { tabName: 'Utility_Readings', values: readingRows, recordCount: snapshot.utilityReadings.length },
    { tabName: 'Tenant_Schedules', values: scheduleRows, recordCount: snapshot.tenantSchedules.length },
    { tabName: 'Maintenance_Notifications', values: notificationRows, recordCount: notifications.length },
  ];
}

export async function syncAllDataToGoogleSheets(
  accessToken: string,
  spreadsheetId: string,
  snapshot: BackupDatasetSnapshot
): Promise<{
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  syncedAtIso: string;
  totalRows: number;
}> {
  // 1. Always read spreadsheet metadata first to verify access & inspect existing tab names
  const meta = await sheetsFetch<{
    spreadsheetId: string;
    spreadsheetUrl?: string;
    properties?: { title?: string };
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  }>(
    `${SHEETS_API_BASE}/${spreadsheetId}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)`,
    accessToken
  );

  const existingTitles = new Set(
    (meta.sheets || []).map((s) => s.properties?.title).filter((t): t is string => Boolean(t))
  );

  // 2. Ensure all 8 backup tabs exist
  const missingTabs = BACKUP_TAB_NAMES.filter((t) => !existingTitles.has(t));
  if (missingTabs.length > 0) {
    await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        requests: missingTabs.map((title) => ({
          addSheet: {
            properties: {
              title,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        })),
      }),
    });
  }

  // 3. Clear existing cells on those 8 tabs
  await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchClear`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      ranges: BACKUP_TAB_NAMES.map((tab) => `'${tab}'!A1:Z50000`),
    }),
  });

  // 4. Write all 8 sheets in one batchUpdate
  const payloads = buildSheetPayloads(snapshot);
  await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: payloads.map((p) => ({
        range: `'${p.tabName}'!A1`,
        majorDimension: 'ROWS',
        values: p.values,
      })),
    }),
  });

  const totalRows = payloads.reduce((sum, p) => sum + p.recordCount, 0);
  const syncedAtIso = new Date().toISOString();

  return {
    spreadsheetId: meta.spreadsheetId || spreadsheetId,
    spreadsheetTitle: meta.properties?.title || 'Facility Assist — Full Auto Backup',
    spreadsheetUrl:
      meta.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    syncedAtIso,
    totalRows,
  };
}

export function computeBackupFingerprint(snapshot: BackupDatasetSnapshot): string {
  const bSig = snapshot.buildings.map((b) => `${b.id}:${b.name}:${b.status}:${b.amcContractors.join(',')}`).join('|');
  const aSig = (snapshot.assets || []).map((a) => `${a.id}:${a.assetTag}:${a.assetName}:${a.status}`).join('|');
  const lSig = snapshot.logs.map((l) => `${l.id}:${l.approvalStatus}:${l.title}:${l.completedDate}:${l.workNotes.length}:${l.laborHours}`).join('|');
  const wSig = snapshot.workLogs.map((w) => `${w.id}:${w.status}:${w.complaint}:${w.action}:${w.finishTime}:${w.remarks}`).join('|');
  const oSig = snapshot.overtimeLogs.map((o) => `${o.id}:${o.approvalStatus}:${o.hours}:${o.workDescription}`).join('|');
  const mSig = snapshot.utilityMeters.map((m) => `${m.id}:${m.meterNo}:${m.status}`).join('|');
  const rSig = snapshot.utilityReadings.map((r) => `${r.id}:${r.readingDate}:${r.readingValue}:${r.notes}`).join('|');
  const sSig = snapshot.tenantSchedules.map((s) => `${s.id}:${s.scheduleDate}:${s.status}:${s.completionNotes}`).join('|');
  const nSig = (snapshot.notifications || [])
    .map((n) => `${n.id}:${n.status}:${n.severity}:${n.title}:${n.acknowledgedByEmails.length}`)
    .join('|');
  return `${bSig}#${aSig}#${lSig}#${wSig}#${oSig}#${mSig}#${rSig}#${sSig}#${nSig}`;
}
