import * as XLSX from 'xlsx';
import {
  buildUtilityMeterSeries,
  calculateTimeHours,
  computeWorkLogDurationHours,
  dedupeOvertimeLogs,
  round2,
} from './operationsAnalytics';
import {
  APPROVAL_STATUS_LABELS,
  ApprovalStatus,
  Asset,
  Building,
  clampStr,
  DEFAULT_METER_UNITS,
  DISCIPLINE_OPTIONS,
  ENTRY_TYPE_LABELS,
  EntryType,
  FREQUENCY_LABELS,
  generateSafeId,
  MaintenanceLog,
  MaintenanceNotification,
  MAX_LENGTHS,
  NotificationSeverity,
  NotificationStatus,
  OUTCOME_LABELS,
  OvertimeCategoryType,
  OvertimeLog,
  PpmFrequency,
  Technician,
  TenantSchedule,
  TenantScheduleStatus,
  UserRole,
  UtilityMeter,
  UtilityMeterType,
  UtilityReading,
  WorkLog,
  WorkOutcome,
  WorkPriority,
  WorkShift,
  WorkStatus,
} from '../types';

export interface ParsedBuildingRow {
  rowNum: number;
  id?: string;
  action?: 'create' | 'update';
  code: string;
  name: string;
  address: string;
  floorsCount: number;
  facilityManager: string;
  amcContractors: string[];
  status?: 'active' | 'inactive';
}

export interface ParsedTechnicianRow {
  rowNum: number;
  id?: string;
  action?: 'create' | 'update';
  role?: UserRole;
  name: string;
  badgeId: string;
  username?: string;
  trade: string;
  phone?: string;
  email?: string;
  status?: 'active' | 'inactive';
  buildingCode: string;
  assignedBuildingCodes?: string[];
}

export interface ParsedAssetRow {
  rowNum: number;
  id?: string;
  action?: 'create' | 'update';
  buildingCode: string;
  assetTag: string;
  assetName: string;
  discipline: string;
  locationZone: string;
  manufacturerModel: string;
  serialNumber: string;
  ppmFrequency: PpmFrequency;
  status: 'active' | 'inactive';
}

export interface ParsedLogRow {
  rowNum: number;
  id?: string;
  action?: 'create' | 'update';
  buildingCode: string;
  entryType: EntryType;
  discipline: string;
  assetName: string;
  assetTag: string;
  locationZone: string;
  title: string;
  workNotes: string;
  ppmFrequency: PpmFrequency;
  nextDueDate?: string;
  amcContractor: string;
  scheduledDate: string;
  completedDate: string;
  outcome: WorkOutcome;
  partsUsed: string;
  laborHours: number;
  approvalStatus: ApprovalStatus;
  submittedByName?: string;
  reviewNotes?: string;
}

export interface ParsedWorkLogRow {
  rowNum: number;
  action?: 'create' | 'update';
  id: string;
  buildingCode: string;
  logDate: string;
  shift: WorkShift;
  woNumber: string;
  location: string;
  category: string;
  priority: WorkPriority;
  complaint: string;
  actionTaken: string;
  materials: string;
  receivedTime: string;
  startTime: string;
  finishTime: string;
  durationHours: number;
  status: WorkStatus;
  pendingReason: string;
  remarks: string;
  technicianName: string;
  supervisorName: string;
}

export interface ParsedOvertimeRow {
  rowNum: number;
  action?: 'create' | 'update';
  id: string;
  buildingCode: string;
  otDate: string;
  fromTime: string;
  toTime: string;
  hours: number;
  otCategoryType: OvertimeCategoryType;
  workType: string;
  location: string;
  workDescription: string;
  technicianName: string;
  approvalStatus?: 'pending_approval' | 'approved' | 'rejected';
  reviewNotes?: string;
}

export interface ParsedMeterRow {
  rowNum: number;
  id?: string;
  action?: 'create' | 'update';
  buildingCode: string;
  meterType: UtilityMeterType;
  area: string;
  meterNo: string;
  accountNo: string;
  unit: string;
  status?: 'active' | 'inactive';
}

export interface ParsedReadingRow {
  rowNum: number;
  action?: 'create' | 'update';
  id: string;
  buildingCode: string;
  readingDate: string;
  meterType: string;
  area: string;
  meterNo: string;
  accountNo: string;
  readingValue: number;
  notes: string;
  technicianName: string;
}

export interface ParsedScheduleRow {
  rowNum: number;
  action?: 'create' | 'update';
  id: string;
  buildingCode: string;
  scheduleDate: string;
  timeSlot: string;
  unitOrLocation: string;
  tenantName: string;
  category: string;
  description: string;
  assignedTechName: string;
  status: TenantScheduleStatus;
  completionNotes: string;
}

export interface ParsedNotificationRow {
  rowNum: number;
  id?: string;
  action?: 'create' | 'update';
  buildingCode: string;
  severity: NotificationSeverity;
  category: string;
  title: string;
  message: string;
  locationZone: string;
  status: NotificationStatus;
  expiresAtDate: string;
  createdByName: string;
}

export interface ImportDedupeContext {
  existingBuildings: Building[];
  existingTechnicians?: Technician[];
  existingAssets?: Asset[];
  existingLogs?: MaintenanceLog[];
  existingWorkLogs?: WorkLog[];
  existingOvertimeLogs?: OvertimeLog[];
  existingMeters?: UtilityMeter[];
  existingReadings?: UtilityReading[];
  existingSchedules?: TenantSchedule[];
  existingNotifications?: MaintenanceNotification[];
}

export interface WorkbookImportPreview {
  buildingsToCreate: ParsedBuildingRow[];
  techniciansToCreate: ParsedTechnicianRow[];
  assetsToCreate: ParsedAssetRow[];
  logsToCreate: ParsedLogRow[];
  workLogsToCreate: ParsedWorkLogRow[];
  overtimeToCreate: ParsedOvertimeRow[];
  metersToCreate: ParsedMeterRow[];
  readingsToCreate: ParsedReadingRow[];
  schedulesToCreate: ParsedScheduleRow[];
  notificationsToCreate: ParsedNotificationRow[];
  updateCount: number;
  skippedDuplicates: number;
  ignoredItems: string[];
  errors: string[];
}

export interface MasterTemplatePayload {
  buildings: Building[];
  technicians: Technician[];
  assets?: Asset[];
  utilityMeters?: UtilityMeter[];
  logs?: MaintenanceLog[];
  workLogs?: WorkLog[];
  overtimeLogs?: OvertimeLog[];
  utilityReadings?: UtilityReading[];
  tenantSchedules?: TenantSchedule[];
  notifications?: MaintenanceNotification[];
}

function normalizeEntryType(raw: string): EntryType | null {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (v === 'ppm_inhouse' || v === 'inhouse_ppm' || v === 'in_house_ppm' || v === 'inhouse') {
    return 'ppm_inhouse';
  }
  if (v === 'ppm_amc' || v === 'amc_ppm' || v === 'amc_contractor_ppm' || v === 'amc') {
    return 'ppm_amc';
  }
  if (v === 'repair' || v === 'repair_work' || v === 'corrective') {
    return 'repair';
  }
  if (v === 'upgradation' || v === 'upgrade' || v === 'upgradation_work') {
    return 'upgradation';
  }
  return null;
}

function normalizeFrequency(raw: string): PpmFrequency {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (v === 'weekly' || v === 'monthly' || v === 'quarterly' || v === 'semi_annual' || v === 'annual') {
    return v;
  }
  if (v === 'semiannual' || v === '6_months') return 'semi_annual';
  return 'none';
}

function normalizeOutcome(raw: string): WorkOutcome {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (v.includes('critical') || v.includes('fault') || v.includes('fail')) return 'critical_fault';
  if (v.includes('minor') || v.includes('obs')) return 'minor_observation';
  return 'operational';
}

function normalizeApprovalStatus(raw: string): ApprovalStatus {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (v.includes('reject')) return 'rejected';
  if (v.includes('revision')) return 'revision_requested';
  if (v.includes('pending')) return 'pending_approval';
  return 'approved';
}

function normalizeActiveStatus(raw: string): 'active' | 'inactive' {
  return raw.trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';
}

function normalizeNotificationSeverity(raw: string): NotificationSeverity {
  const v = raw.trim().toLowerCase();
  if (v.includes('crit')) return 'critical';
  if (v.includes('urg')) return 'urgent';
  return 'advisory';
}

function normalizeNotificationStatus(raw: string): NotificationStatus {
  return raw.trim().toLowerCase() === 'resolved' ? 'resolved' : 'active';
}

function normalizeExcelDate(val: unknown): string {
  if (typeof val === 'number' && val > 20000 && val < 90000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) {
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${m}-${d}`;
    }
  }
  const s = String(val ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return s.slice(0, 20);
}

function normalizeExcelTime(val: unknown): string {
  if (typeof val === 'number' && val >= 0 && val < 1) {
    const totalMinutes = Math.round(val * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return cleanSingleLine(val, MAX_LENGTHS.timeStr);
}

export function downloadImportTemplate(
  buildingsOrPayload: Building[] | MasterTemplatePayload,
  techniciansArg: Technician[] = []
): void {
  const payload: MasterTemplatePayload = Array.isArray(buildingsOrPayload)
    ? { buildings: buildingsOrPayload, technicians: techniciansArg }
    : buildingsOrPayload;

  const buildings = payload.buildings || [];
  const technicians = payload.technicians || [];
  const assets = payload.assets || [];
  const utilityMeters = payload.utilityMeters || [];
  const logs = payload.logs || [];
  const workLogs = payload.workLogs || [];
  const overtimeLogs = payload.overtimeLogs || [];
  const utilityReadings = payload.utilityReadings || [];
  const tenantSchedules = payload.tenantSchedules || [];
  const notifications = payload.notifications || [];

  const buildingCodeById = new Map<string, string>();
  for (const b of buildings) {
    buildingCodeById.set(b.id, b.code);
  }

  const wb = XLSX.utils.book_new();
  const today = new Date().toISOString().slice(0, 10);
  const sampleCode = buildings[0]?.code || 'BLD-01';

  // Sheet 1: Instructions & Reference Values
  const instructionsRows: unknown[][] = [
    ['Facility Assist Master Data Workbook — Edit & Bulk Upload Guide'],
    ['Generated On', new Date().toISOString().slice(0, 19).replace('T', ' ')],
    [''],
    ['HOW EDIT & RE-UPLOAD WORKS', 'RULES'],
    [
      '1. Update Existing Records',
      'Keep the "ID" column untouched and edit any other fields on that row. When re-uploaded, only modified rows are updated in Firestore.',
    ],
    [
      '2. Add New Records',
      'Add a new row at the bottom of any tab and leave the "ID" column blank. A safe unique ID is generated automatically upon upload.',
    ],
    [
      '3. Unchanged Rows',
      'Existing rows you did not modify are automatically skipped without overwriting audit timestamps or auth links.',
    ],
    [
      '4. Team Roster Accounts',
      'Editing Name, Badge ID, Trade, Phone, Email, Status, or Assigned Building Codes updates roster & permissions safely. Passwords & Firebase Auth UIDs are never altered via Excel.',
    ],
    [
      '5. Valid Maintenance Entry Types',
      'ppm_inhouse, ppm_amc, repair, upgradation',
    ],
    [
      '6. Valid PPM Frequencies',
      'none, weekly, monthly, quarterly, semi_annual, annual',
    ],
    [
      '7. Valid Maintenance Outcomes',
      'operational, minor_observation, critical_fault',
    ],
    [
      '8. Valid Approval Statuses',
      'approved, pending_approval, revision_requested, rejected',
    ],
    [
      '9. Valid Work Log Shifts / Priorities / Statuses',
      'Shift: Day, Night | Priority: Normal, Urgent, Emergency | Status: Completed, Pending, On Hold',
    ],
    [
      '10. Valid Overtime Categories',
      'N, WO, PH, N. Shift',
    ],
    [
      '11. Valid Meter Types',
      'Electricity, Water, Chilled Water, Gas, Other',
    ],
    [
      '12. Valid Schedule Statuses & Alert Severities',
      'Schedule: Pending, In Progress, Completed, Cancelled | Alert Severity: critical, urgent, advisory | Alert Status: active, resolved',
    ],
    ['13. Date & Time Formats', 'Date: YYYY-MM-DD (e.g., 2026-11-24) | Time: HH:MM 24h (e.g., 08:30)'],
    ['14. Standard Disciplines', DISCIPLINE_OPTIONS.join(', ')],
    [''],
    ['Current Portfolio Record Counts', 'Count'],
    ['Buildings', buildings.length],
    ['Team Roster', technicians.length],
    ['Assets (QR Registry)', assets.length],
    ['Utility Meters', utilityMeters.length],
    ['Maintenance & PPM Logs', logs.length],
    ['Daily Work Logs', workLogs.length],
    ['Overtime Logs', overtimeLogs.length],
    ['Utility Readings', utilityReadings.length],
    ['Tenant Schedules', tenantSchedules.length],
    ['Urgent Alerts', notifications.length],
  ];
  const wsInst = XLSX.utils.aoa_to_sheet(instructionsRows);
  wsInst['!cols'] = [{ wch: 36 }, { wch: 96 }];
  XLSX.utils.book_append_sheet(wb, wsInst, 'Instructions');

  // Sheet 2: Buildings
  const bldHeader = [
    'ID',
    'Building Code*',
    'Building Name*',
    'Address',
    'Floors Count*',
    'Facility Manager',
    'AMC Contractors (comma-separated)',
    'Status (active/inactive)',
  ];
  const bldRows =
    buildings.length > 0
      ? buildings.map((b) => [
          b.id,
          b.code,
          b.name,
          b.address,
          b.floorsCount,
          b.facilityManager,
          b.amcContractors.join(', '),
          b.status,
        ])
      : [['', 'BLD-01', 'North Corporate Tower', '120 Harbor Plaza', 18, 'Facility Manager', 'CoolAir HVAC LLC, Otis Elevators', 'active']];
  const wsBld = XLSX.utils.aoa_to_sheet([bldHeader, ...bldRows]);
  wsBld['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 26 }, { wch: 30 }, { wch: 14 }, { wch: 22 }, { wch: 36 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsBld, 'Buildings');

  // Sheet 3: Team_Roster
  const teamHeader = [
    'ID',
    'Role (technician/supervisor)',
    'Full Name*',
    'Badge / Emp ID*',
    'Login Username',
    'Trade / Designation',
    'Phone',
    'Email',
    'Status (active/inactive)',
    'Assigned Building Codes (comma-separated)',
  ];
  const teamRows = technicians.map((t) => [
    t.id,
    t.role,
    t.name,
    t.badgeId,
    t.username || '',
    t.trade,
    t.phone || '',
    t.email || '',
    t.status,
    (t.assignedBuildingIds || [])
      .map((bid) => buildingCodeById.get(bid) || '')
      .filter(Boolean)
      .join(', '),
  ]);
  const wsTeam = XLSX.utils.aoa_to_sheet([teamHeader, ...teamRows]);
  wsTeam['!cols'] = [
    { wch: 22 }, { wch: 22 }, { wch: 26 }, { wch: 16 }, { wch: 18 },
    { wch: 24 }, { wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 34 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTeam, 'Team_Roster');

  // Sheet 4: Assets_QR
  const assetHeader = [
    'ID',
    'Building Code*',
    'Asset Tag*',
    'Asset Name*',
    'Discipline*',
    'Location / Zone',
    'Manufacturer / Model',
    'Serial Number',
    'PPM Frequency',
    'Status (active/inactive)',
  ];
  const assetRows = assets.map((a) => [
    a.id,
    a.buildingCode,
    a.assetTag,
    a.assetName,
    a.discipline,
    a.locationZone,
    a.manufacturerModel,
    a.serialNumber,
    a.ppmFrequency,
    a.status,
  ]);
  const wsAssets = XLSX.utils.aoa_to_sheet([assetHeader, ...assetRows]);
  wsAssets['!cols'] = [
    { wch: 22 }, { wch: 15 }, { wch: 16 }, { wch: 26 }, { wch: 22 },
    { wch: 22 }, { wch: 24 }, { wch: 20 }, { wch: 15 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAssets, 'Assets_QR');

  // Sheet 5: Utility_Meters
  const meterHeader = [
    'ID',
    'Building Code*',
    'Meter Type*',
    'Unit / Area*',
    'Meter No*',
    'Account No',
    'Unit',
    'Status (active/inactive)',
  ];
  const meterRows = utilityMeters.map((m) => [
    m.id,
    m.buildingCode,
    m.meterType,
    m.area,
    m.meterNo,
    m.accountNo,
    m.unit,
    m.status,
  ]);
  const wsMeters = XLSX.utils.aoa_to_sheet([meterHeader, ...meterRows]);
  wsMeters['!cols'] = [
    { wch: 22 }, { wch: 15 }, { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMeters, 'Utility_Meters');

  // Sheet 6: Maintenance_Logs
  const logsHeader = [
    'ID',
    'Building Code*',
    'Entry Type*',
    'Discipline*',
    'Asset Name*',
    'Asset Tag',
    'Location / Zone',
    'Work Title*',
    'Work Notes',
    'PPM Frequency',
    'Next Due Date',
    'AMC Contractor',
    'Scheduled Date',
    'Completed Date*',
    'Outcome',
    'Parts Used',
    'Labor Hours',
    'Approval Status',
    'Submitted By Name',
    'Review Notes',
  ];
  const logRows =
    logs.length > 0
      ? logs.map((l) => [
          l.id,
          l.buildingCode,
          l.entryType,
          l.discipline,
          l.assetName,
          l.assetTag,
          l.locationZone,
          l.title,
          l.workNotes,
          l.ppmFrequency,
          l.nextDueDate || '',
          l.amcContractor || '',
          l.scheduledDate || '',
          l.completedDate,
          l.outcome,
          l.partsUsed || '',
          l.laborHours,
          l.approvalStatus,
          l.submittedByName || '',
          l.reviewNotes || '',
        ])
      : buildings.length === 0
        ? [
            [
              '',
              sampleCode,
              'ppm_inhouse',
              'HVAC & Chillers',
              'AHU Unit 03',
              'AHU-03',
              'Level 4 Mechanical Room',
              'Monthly Filter & Belt Inspection',
              'Replaced pre-filters, checked belt tension and bearing temperature.',
              'monthly',
              '',
              '',
              today,
              today,
              'operational',
              '2x MERV-13 Pleated Filters',
              2.5,
              'approved',
              '',
              '',
            ],
          ]
        : [];
  const wsLogs = XLSX.utils.aoa_to_sheet([logsHeader, ...logRows]);
  wsLogs['!cols'] = [
    { wch: 22 }, { wch: 15 }, { wch: 15 }, { wch: 22 }, { wch: 22 },
    { wch: 14 }, { wch: 20 }, { wch: 28 }, { wch: 36 }, { wch: 15 },
    { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
    { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLogs, 'Maintenance_Logs');

  // Sheet 7: Work_Logs
  const wlHeader = [
    'ID',
    'Building Code*',
    'Log Date*',
    'Shift',
    'WO Number',
    'Location / Unit*',
    'Category*',
    'Priority',
    'Complaint*',
    'Action Taken',
    'Materials Used',
    'Received Time',
    'Start Time',
    'Finish Time',
    'Duration Hours',
    'Status',
    'Pending Reason',
    'Remarks',
    'Technician Name',
    'Supervisor Name',
  ];
  const wlRows = workLogs.map((w) => [
    w.id,
    w.buildingCode,
    w.logDate,
    w.shift,
    w.woNumber || '',
    w.location,
    w.category,
    w.priority,
    w.complaint,
    w.action || '',
    w.materials || '',
    w.receivedTime || '',
    w.startTime || '',
    w.finishTime || '',
    w.durationHours ?? 0,
    w.status,
    w.pendingReason || '',
    w.remarks || '',
    w.technicianName || '',
    w.supervisorName || '',
  ]);
  const wsWl = XLSX.utils.aoa_to_sheet([wlHeader, ...wlRows]);
  wsWl['!cols'] = [
    { wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
    { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 34 }, { wch: 34 },
    { wch: 24 }, { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 12 }, { wch: 24 }, { wch: 28 }, { wch: 24 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsWl, 'Work_Logs');

  // Sheet 8: Overtime_Logs
  const otHeader = [
    'ID',
    'Building Code*',
    'OT Date*',
    'From Time*',
    'To Time*',
    'Hours',
    'OT Category (N/WO/PH/N. Shift)',
    'Work Type',
    'Location',
    'Work Description',
    'Technician Name',
    'Approval Status',
    'Review Notes',
  ];
  const otRows = overtimeLogs.map((o) => [
    o.id,
    o.buildingCode,
    o.otDate,
    o.fromTime,
    o.toTime,
    o.hours,
    o.otCategoryType,
    o.workType,
    o.location,
    o.workDescription,
    o.technicianName,
    o.approvalStatus,
    o.reviewNotes || '',
  ]);
  const wsOt = XLSX.utils.aoa_to_sheet([otHeader, ...otRows]);
  wsOt['!cols'] = [
    { wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 24 }, { wch: 22 }, { wch: 20 }, { wch: 36 },
    { wch: 24 }, { wch: 18 }, { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, wsOt, 'Overtime_Logs');

  // Sheet 9: Utility_Readings
  const rdHeader = [
    'ID',
    'Building Code*',
    'Reading Date*',
    'Meter Type',
    'Area',
    'Meter No*',
    'Account No',
    'Reading Value*',
    'Notes',
    'Technician Name',
  ];
  const rdRows = utilityReadings.map((r) => [
    r.id,
    r.buildingCode,
    r.readingDate,
    r.meterType,
    r.area,
    r.meterNo,
    r.accountNo || '',
    r.readingValue,
    r.notes || '',
    r.technicianName || '',
  ]);
  const wsRd = XLSX.utils.aoa_to_sheet([rdHeader, ...rdRows]);
  wsRd['!cols'] = [
    { wch: 22 }, { wch: 15 }, { wch: 14 }, { wch: 16 }, { wch: 20 },
    { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 28 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRd, 'Utility_Readings');

  // Sheet 10: Tenant_Schedules
  const schHeader = [
    'ID',
    'Building Code*',
    'Schedule Date*',
    'Time Slot',
    'Unit / Location*',
    'Tenant Name',
    'Category',
    'Description*',
    'Assigned Technician',
    'Status',
    'Completion Notes',
  ];
  const schRows = tenantSchedules.map((s) => [
    s.id,
    s.buildingCode,
    s.scheduleDate,
    s.timeSlot || '',
    s.unitOrLocation,
    s.tenantName || '',
    s.category,
    s.description,
    s.assignedTechName || '',
    s.status,
    s.completionNotes || '',
  ]);
  const wsSch = XLSX.utils.aoa_to_sheet([schHeader, ...schRows]);
  wsSch['!cols'] = [
    { wch: 22 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 20 },
    { wch: 20 }, { wch: 20 }, { wch: 36 }, { wch: 24 }, { wch: 14 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSch, 'Tenant_Schedules');

  // Sheet 11: Urgent_Alerts
  const alertHeader = [
    'ID',
    'Building Code*',
    'Severity (critical/urgent/advisory)',
    'Category',
    'Title*',
    'Message*',
    'Location / Zone',
    'Status (active/resolved)',
    'Expires Date (YYYY-MM-DD)',
    'Created By Name',
  ];
  const alertRows = notifications.map((n) => [
    n.id,
    n.buildingCode,
    n.severity,
    n.category,
    n.title,
    n.message,
    n.locationZone || '',
    n.status,
    n.expiresAtDate || '',
    n.createdByName || '',
  ]);
  const wsAlerts = XLSX.utils.aoa_to_sheet([alertHeader, ...alertRows]);
  wsAlerts['!cols'] = [
    { wch: 22 }, { wch: 15 }, { wch: 28 }, { wch: 22 }, { wch: 28 },
    { wch: 42 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAlerts, 'Urgent_Alerts');

  XLSX.writeFile(wb, `Facility_Assist_Master_Data_Template_${today}.xlsx`);
}

function sanitizeDocId(raw: unknown, prefix: string, used: Set<string>): string {
  let base = String(raw ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, MAX_LENGTHS.id);
  if (!base) {
    base = generateSafeId(prefix);
  }
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let idx = 2;
  while (used.has(`${base.slice(0, 118)}_${idx}`)) {
    idx += 1;
  }
  const unique = `${base.slice(0, 118)}_${idx}`;
  used.add(unique);
  return unique;
}

function cleanSingleLine(val: unknown, max: number): string {
  return String(val ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeWorkShift(raw: string): WorkShift {
  return raw.trim().toLowerCase() === 'night' ? 'Night' : 'Day';
}

function normalizeWorkPriority(raw: string): WorkPriority {
  const v = raw.trim().toLowerCase();
  if (v === 'emergency') return 'Emergency';
  if (v === 'urgent' || v === 'high') return 'Urgent';
  return 'Normal';
}

function normalizeWorkStatus(raw: string): WorkStatus {
  const v = raw.trim().toLowerCase();
  if (v === 'completed') return 'Completed';
  if (v === 'on hold' || v === 'on_hold' || v === 'hold') return 'On Hold';
  return 'Pending';
}

function normalizeOtCategory(raw: string): OvertimeCategoryType {
  const v = raw.trim();
  if (v === 'N' || v === 'WO' || v === 'PH' || v === 'N. Shift') return v;
  const low = v.toLowerCase();
  if (low === 'wo' || low.includes('weekly')) return 'WO';
  if (low === 'ph' || low.includes('holiday')) return 'PH';
  if (low.includes('night') || low.includes('shift')) return 'N. Shift';
  return 'N';
}

function normalizeMeterType(raw: string): UtilityMeterType {
  const v = raw.trim().toLowerCase();
  if (v === 'electricity' || v === 'electric' || v === 'power') return 'Electricity';
  if (v === 'chilled water' || v === 'chilled_water' || v === 'chw') return 'Chilled Water';
  if (v === 'water') return 'Water';
  if (v === 'gas') return 'Gas';
  return 'Other';
}

function normalizeScheduleStatus(raw: string): TenantScheduleStatus {
  const v = raw.trim().toLowerCase();
  if (v === 'completed') return 'Completed';
  if (v === 'in progress' || v === 'in_progress') return 'In Progress';
  if (v === 'cancelled' || v === 'canceled') return 'Cancelled';
  return 'Pending';
}

function normalizeHeaderKey(h: unknown): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\*+/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildColResolver(rawHeaders: string[]) {
  const normHeaders = rawHeaders.map(normalizeHeaderKey);
  return (...candidates: string[]): number => {
    for (const c of candidates) {
      const exactIdx = rawHeaders.indexOf(c);
      if (exactIdx >= 0) return exactIdx;
      const normIdx = normHeaders.indexOf(normalizeHeaderKey(c));
      if (normIdx >= 0) return normIdx;
    }
    return -1;
  };
}

function normStrEq(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').trim() === (b ?? '').trim();
}

function normArrEq(a: string[] | undefined, b: string[] | undefined): boolean {
  const arrA = (a || []).map((s) => s.trim()).filter(Boolean);
  const arrB = (b || []).map((s) => s.trim()).filter(Boolean);
  return arrA.length === arrB.length && arrA.every((v, i) => v === arrB[i]);
}

export function applyImportDeduplication(
  raw: WorkbookImportPreview,
  ctx: ImportDedupeContext
): WorkbookImportPreview {
  const buildingById = new Map(ctx.existingBuildings.map((b) => [b.id, b]));
  const buildingByCode = new Map(ctx.existingBuildings.map((b) => [b.code.trim().toUpperCase(), b]));

  const techById = new Map((ctx.existingTechnicians || []).map((t) => [t.id, t]));
  const techByBadge = new Map(
    (ctx.existingTechnicians || [])
      .filter((t) => t.badgeId)
      .map((t) => [t.badgeId.trim().toUpperCase(), t])
  );

  const assetById = new Map((ctx.existingAssets || []).map((a) => [a.id, a]));
  const assetByKey = new Map(
    (ctx.existingAssets || []).map((a) => [
      `${a.buildingCode.trim().toUpperCase()}::${a.assetTag.trim().toUpperCase()}`,
      a,
    ])
  );

  const meterById = new Map((ctx.existingMeters || []).map((m) => [m.id, m]));
  const meterByKey = new Map(
    (ctx.existingMeters || []).map((m) => [
      `${m.buildingCode.trim().toUpperCase()}::${m.meterNo.trim().toUpperCase()}`,
      m,
    ])
  );

  const logById = new Map((ctx.existingLogs || []).map((l) => [l.id, l]));
  const workById = new Map((ctx.existingWorkLogs || []).map((w) => [w.id, w]));
  const otById = new Map((ctx.existingOvertimeLogs || []).map((o) => [o.id, o]));
  const readingById = new Map((ctx.existingReadings || []).map((r) => [r.id, r]));
  const scheduleById = new Map((ctx.existingSchedules || []).map((s) => [s.id, s]));
  const notifById = new Map((ctx.existingNotifications || []).map((n) => [n.id, n]));

  let skippedDuplicates = raw.skippedDuplicates || 0;
  let updateCount = 0;

  // 1. Buildings (dedupe or mark update)
  const seenBuildingCodes = new Set<string>();
  const buildingsToCreate: ParsedBuildingRow[] = [];
  for (const row of raw.buildingsToCreate) {
    const code = row.code.trim().toUpperCase();
    if (!code || seenBuildingCodes.has(code)) {
      skippedDuplicates += 1;
      continue;
    }
    seenBuildingCodes.add(code);
    const existing = (row.id ? buildingById.get(row.id) : undefined) || buildingByCode.get(code);
    if (existing) {
      const nextStatus = row.status || existing.status || 'active';
      const changed =
        !normStrEq(existing.code.toUpperCase(), code) ||
        !normStrEq(existing.name, row.name) ||
        !normStrEq(existing.address, row.address) ||
        Number(existing.floorsCount) !== Number(row.floorsCount) ||
        !normStrEq(existing.facilityManager, row.facilityManager) ||
        !normArrEq(existing.amcContractors, row.amcContractors) ||
        existing.status !== nextStatus;
      if (!changed) {
        skippedDuplicates += 1;
        continue;
      }
      buildingsToCreate.push({ ...row, id: existing.id, status: nextStatus, action: 'update' });
      updateCount += 1;
    } else {
      buildingsToCreate.push({ ...row, action: 'create' });
    }
  }

  // Build code->buildingId map including new buildings for comparing technician assignedBuildingIds
  const codeToId = new Map<string, string>(
    ctx.existingBuildings.map((b) => [b.code.trim().toUpperCase(), b.id])
  );

  // 2. Team Roster
  const seenTechKeys = new Set<string>();
  const techniciansToCreate: ParsedTechnicianRow[] = [];
  for (const row of raw.techniciansToCreate) {
    const badge = row.badgeId.trim().toUpperCase();
    if (!badge || seenTechKeys.has(badge)) {
      skippedDuplicates += 1;
      continue;
    }
    seenTechKeys.add(badge);
    const existing = (row.id ? techById.get(row.id) : undefined) || techByBadge.get(badge);
    if (existing) {
      const desiredRole = row.role || existing.role;
      const desiredStatus = row.status || existing.status;
      const desiredCodes =
        row.assignedBuildingCodes && row.assignedBuildingCodes.length > 0
          ? row.assignedBuildingCodes
          : row.buildingCode
            ? [row.buildingCode]
            : [];
      const desiredBuildingIds = desiredCodes
        .map((c) => codeToId.get(c.trim().toUpperCase()))
        .filter((x): x is string => Boolean(x));
      const buildingIdsChanged =
        desiredCodes.length > 0 &&
        (desiredBuildingIds.length !== desiredCodes.length ||
          !normArrEq([...(existing.assignedBuildingIds || [])].sort(), [...desiredBuildingIds].sort()));

      const changed =
        !normStrEq(existing.name, row.name) ||
        !normStrEq(existing.badgeId.toUpperCase(), badge) ||
        !normStrEq(existing.username || '', row.username || '') ||
        !normStrEq(existing.trade, row.trade) ||
        !normStrEq(existing.phone || '', row.phone || '') ||
        !normStrEq((existing.email || '').toLowerCase(), (row.email || '').toLowerCase()) ||
        existing.status !== desiredStatus ||
        existing.role !== desiredRole ||
        buildingIdsChanged;

      if (!changed) {
        skippedDuplicates += 1;
        continue;
      }
      techniciansToCreate.push({ ...row, id: existing.id, action: 'update' });
      updateCount += 1;
    } else {
      techniciansToCreate.push({ ...row, action: 'create' });
    }
  }

  // 3. Assets
  const seenAssetKeys = new Set<string>();
  const assetsToCreate: ParsedAssetRow[] = [];
  for (const row of raw.assetsToCreate || []) {
    const naturalKey = `${row.buildingCode.trim().toUpperCase()}::${row.assetTag.trim().toUpperCase()}`;
    const dedupeKey = row.id || naturalKey;
    if (seenAssetKeys.has(dedupeKey)) {
      skippedDuplicates += 1;
      continue;
    }
    seenAssetKeys.add(dedupeKey);
    const existing = (row.id ? assetById.get(row.id) : undefined) || assetByKey.get(naturalKey);
    if (existing) {
      const changed =
        !normStrEq(existing.buildingCode.toUpperCase(), row.buildingCode.toUpperCase()) ||
        !normStrEq(existing.assetTag, row.assetTag) ||
        !normStrEq(existing.assetName, row.assetName) ||
        !normStrEq(existing.discipline, row.discipline) ||
        !normStrEq(existing.locationZone, row.locationZone) ||
        !normStrEq(existing.manufacturerModel, row.manufacturerModel) ||
        !normStrEq(existing.serialNumber, row.serialNumber) ||
        existing.ppmFrequency !== row.ppmFrequency ||
        existing.status !== row.status;
      if (!changed) {
        skippedDuplicates += 1;
        continue;
      }
      assetsToCreate.push({ ...row, id: existing.id, action: 'update' });
      updateCount += 1;
    } else {
      assetsToCreate.push({ ...row, action: 'create' });
    }
  }

  // 4. Utility Meters
  const seenMeterKeys = new Set<string>();
  const metersToCreate: ParsedMeterRow[] = [];
  for (const row of raw.metersToCreate) {
    const naturalKey = `${row.buildingCode.trim().toUpperCase()}::${row.meterNo.trim().toUpperCase()}`;
    const dedupeKey = row.id || naturalKey;
    if (seenMeterKeys.has(dedupeKey)) {
      skippedDuplicates += 1;
      continue;
    }
    seenMeterKeys.add(dedupeKey);
    const existing = (row.id ? meterById.get(row.id) : undefined) || meterByKey.get(naturalKey);
    if (existing) {
      const nextStatus = row.status || existing.status || 'active';
      const changed =
        existing.meterType !== row.meterType ||
        !normStrEq(existing.area, row.area) ||
        !normStrEq(existing.meterNo, row.meterNo) ||
        !normStrEq(existing.accountNo, row.accountNo) ||
        !normStrEq(existing.unit, row.unit) ||
        existing.status !== nextStatus;
      if (!changed) {
        skippedDuplicates += 1;
        continue;
      }
      metersToCreate.push({ ...row, id: existing.id, status: nextStatus, action: 'update' });
      updateCount += 1;
    } else {
      metersToCreate.push({ ...row, action: 'create' });
    }
  }

  // 5. Maintenance Logs
  const seenLogIds = new Set<string>();
  const logsToCreate: ParsedLogRow[] = [];
  for (const row of raw.logsToCreate) {
    const existing = row.id ? logById.get(row.id) : undefined;
    if (row.id && seenLogIds.has(row.id)) {
      skippedDuplicates += 1;
      continue;
    }
    if (row.id) seenLogIds.add(row.id);
    if (existing) {
      const changed =
        !normStrEq(existing.buildingCode.toUpperCase(), row.buildingCode.toUpperCase()) ||
        existing.entryType !== row.entryType ||
        !normStrEq(existing.discipline, row.discipline) ||
        !normStrEq(existing.assetName, row.assetName) ||
        !normStrEq(existing.assetTag, row.assetTag) ||
        !normStrEq(existing.locationZone, row.locationZone) ||
        !normStrEq(existing.title, row.title) ||
        !normStrEq(existing.workNotes, row.workNotes) ||
        existing.ppmFrequency !== row.ppmFrequency ||
        !normStrEq(existing.nextDueDate || '', row.nextDueDate ?? existing.nextDueDate ?? '') ||
        !normStrEq(existing.amcContractor, row.amcContractor) ||
        !normStrEq(existing.scheduledDate, row.scheduledDate) ||
        !normStrEq(existing.completedDate, row.completedDate) ||
        existing.outcome !== row.outcome ||
        !normStrEq(existing.partsUsed, row.partsUsed) ||
        round2(Number(existing.laborHours) || 0) !== round2(Number(row.laborHours) || 0) ||
        existing.approvalStatus !== row.approvalStatus ||
        (row.reviewNotes !== undefined && !normStrEq(existing.reviewNotes, row.reviewNotes));
      if (!changed) {
        skippedDuplicates += 1;
        continue;
      }
      logsToCreate.push({ ...row, id: existing.id, action: 'update' });
      updateCount += 1;
    } else {
      logsToCreate.push({ ...row, action: 'create' });
    }
  }

  // 6. Work Logs
  const seenWorkIds = new Set<string>();
  const workLogsToCreate: ParsedWorkLogRow[] = [];
  for (const row of raw.workLogsToCreate) {
    if (seenWorkIds.has(row.id)) {
      skippedDuplicates += 1;
      continue;
    }
    seenWorkIds.add(row.id);
    const legacyAction = (row as { action?: unknown }).action;
    const rowActionText =
      row.actionTaken ??
      (typeof legacyAction === 'string' && legacyAction !== 'create' && legacyAction !== 'update'
        ? legacyAction
        : '');
    const existing = workById.get(row.id);
    if (existing) {
      const changed =
        !normStrEq(existing.logDate, row.logDate) ||
        existing.shift !== row.shift ||
        !normStrEq(existing.woNumber, row.woNumber) ||
        !normStrEq(existing.location, row.location) ||
        !normStrEq(existing.category, row.category) ||
        existing.priority !== row.priority ||
        !normStrEq(existing.complaint, row.complaint) ||
        !normStrEq(existing.action, rowActionText) ||
        !normStrEq(existing.materials, row.materials) ||
        !normStrEq(existing.receivedTime, row.receivedTime) ||
        !normStrEq(existing.startTime, row.startTime) ||
        !normStrEq(existing.finishTime, row.finishTime) ||
        round2(Number(existing.durationHours) || 0) !== round2(Number(row.durationHours) || 0) ||
        existing.status !== row.status ||
        !normStrEq(existing.pendingReason, row.status === 'Completed' ? '' : row.pendingReason) ||
        !normStrEq(existing.remarks, row.remarks) ||
        !normStrEq(existing.technicianName, row.technicianName) ||
        !normStrEq(existing.supervisorName, row.supervisorName);
      if (!changed) {
        skippedDuplicates += 1;
        continue;
      }
      workLogsToCreate.push({ ...row, actionTaken: rowActionText, action: 'update' });
      updateCount += 1;
    } else {
      workLogsToCreate.push({ ...row, actionTaken: rowActionText, action: 'create' });
    }
  }

  // 7. Overtime Logs
  const seenOtIds = new Set<string>();
  const overtimeToCreate: ParsedOvertimeRow[] = [];
  for (const row of raw.overtimeToCreate) {
    if (seenOtIds.has(row.id)) {
      skippedDuplicates += 1;
      continue;
    }
    seenOtIds.add(row.id);
    const existing = otById.get(row.id);
    if (existing) {
      const nextStatus = row.approvalStatus || existing.approvalStatus;
      const nextNotes = row.reviewNotes !== undefined ? row.reviewNotes : existing.reviewNotes;
      const changed =
        !normStrEq(existing.otDate, row.otDate) ||
        !normStrEq(existing.fromTime, row.fromTime) ||
        !normStrEq(existing.toTime, row.toTime) ||
        round2(Number(existing.hours) || 0) !== round2(Number(row.hours) || 0) ||
        existing.otCategoryType !== row.otCategoryType ||
        !normStrEq(existing.workType, row.workType) ||
        !normStrEq(existing.location, row.location) ||
        !normStrEq(existing.workDescription, row.workDescription) ||
        !normStrEq(existing.technicianName, row.technicianName) ||
        existing.approvalStatus !== nextStatus ||
        !normStrEq(existing.reviewNotes, nextNotes);
      if (!changed) {
        skippedDuplicates += 1;
        continue;
      }
      overtimeToCreate.push({
        ...row,
        approvalStatus: nextStatus,
        reviewNotes: nextNotes,
        action: 'update',
      });
      updateCount += 1;
    } else {
      overtimeToCreate.push({ ...row, action: 'create' });
    }
  }

  // 8. Utility Readings
  const seenReadingIds = new Set<string>();
  const readingsToCreate: ParsedReadingRow[] = [];
  for (const row of raw.readingsToCreate) {
    if (seenReadingIds.has(row.id)) {
      skippedDuplicates += 1;
      continue;
    }
    seenReadingIds.add(row.id);
    const existing = readingById.get(row.id);
    if (existing) {
      const changed =
        !normStrEq(existing.readingDate, row.readingDate) ||
        round2(Number(existing.readingValue) || 0) !== round2(Number(row.readingValue) || 0) ||
        !normStrEq(existing.notes, row.notes) ||
        !normStrEq(existing.technicianName, row.technicianName);
      if (!changed) {
        skippedDuplicates += 1;
        continue;
      }
      readingsToCreate.push({ ...row, action: 'update' });
      updateCount += 1;
    } else {
      readingsToCreate.push({ ...row, action: 'create' });
    }
  }

  // 9. Tenant Schedules
  const seenScheduleIds = new Set<string>();
  const schedulesToCreate: ParsedScheduleRow[] = [];
  for (const row of raw.schedulesToCreate) {
    if (seenScheduleIds.has(row.id)) {
      skippedDuplicates += 1;
      continue;
    }
    seenScheduleIds.add(row.id);
    const existing = scheduleById.get(row.id);
    if (existing) {
      const changed =
        !normStrEq(existing.scheduleDate, row.scheduleDate) ||
        !normStrEq(existing.timeSlot, row.timeSlot) ||
        !normStrEq(existing.unitOrLocation, row.unitOrLocation) ||
        !normStrEq(existing.tenantName, row.tenantName) ||
        !normStrEq(existing.category, row.category) ||
        !normStrEq(existing.description, row.description) ||
        !normStrEq(existing.assignedTechName, row.assignedTechName) ||
        existing.status !== row.status ||
        !normStrEq(existing.completionNotes, row.completionNotes);
      if (!changed) {
        skippedDuplicates += 1;
        continue;
      }
      schedulesToCreate.push({ ...row, action: 'update' });
      updateCount += 1;
    } else {
      schedulesToCreate.push({ ...row, action: 'create' });
    }
  }

  // 10. Urgent Alerts
  const seenNotifIds = new Set<string>();
  const notificationsToCreate: ParsedNotificationRow[] = [];
  for (const row of raw.notificationsToCreate || []) {
    if (row.id && seenNotifIds.has(row.id)) {
      skippedDuplicates += 1;
      continue;
    }
    if (row.id) seenNotifIds.add(row.id);
    const existing = row.id ? notifById.get(row.id) : undefined;
    if (existing) {
      const changed =
        !normStrEq(existing.buildingCode.toUpperCase(), row.buildingCode.toUpperCase()) ||
        existing.severity !== row.severity ||
        !normStrEq(existing.category, row.category) ||
        !normStrEq(existing.title, row.title) ||
        !normStrEq(existing.message, row.message) ||
        !normStrEq(existing.locationZone, row.locationZone) ||
        existing.status !== row.status ||
        !normStrEq(existing.expiresAtDate, row.expiresAtDate);
      if (!changed) {
        skippedDuplicates += 1;
        continue;
      }
      notificationsToCreate.push({ ...row, id: existing.id, action: 'update' });
      updateCount += 1;
    } else {
      notificationsToCreate.push({ ...row, action: 'create' });
    }
  }

  return {
    buildingsToCreate,
    techniciansToCreate,
    assetsToCreate,
    logsToCreate,
    workLogsToCreate,
    overtimeToCreate,
    metersToCreate,
    readingsToCreate,
    schedulesToCreate,
    notificationsToCreate,
    updateCount,
    skippedDuplicates,
    ignoredItems: raw.ignoredItems,
    errors: raw.errors,
  };
}

export async function parseImportFiles(
  files: File[],
  context: ImportDedupeContext
): Promise<WorkbookImportPreview> {
  const errors: string[] = [];
  const ignoredItems: string[] = [];
  const buildingsToCreate: ParsedBuildingRow[] = [];
  const techniciansToCreate: ParsedTechnicianRow[] = [];
  const assetsToCreate: ParsedAssetRow[] = [];
  const logsToCreate: ParsedLogRow[] = [];
  const workLogsToCreate: ParsedWorkLogRow[] = [];
  const overtimeToCreate: ParsedOvertimeRow[] = [];
  const metersToCreate: ParsedMeterRow[] = [];
  const readingsToCreate: ParsedReadingRow[] = [];
  const schedulesToCreate: ParsedScheduleRow[] = [];
  const notificationsToCreate: ParsedNotificationRow[] = [];

  const knownCodes = new Set(context.existingBuildings.map((b) => b.code.trim().toUpperCase()));
  const defaultBuildingCode = context.existingBuildings[0]?.code.trim().toUpperCase() || 'GST1';
  const usedWorkIds = new Set<string>();
  const usedOtIds = new Set<string>();
  const usedReadingIds = new Set<string>();
  const usedScheduleIds = new Set<string>();

  const pendingAutoBuildings = new Set<string>();
  let inferredSupervisor = '';

  for (const file of files) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
      const nonEmptyRows = aoa.filter((r) => r && r.some((c) => String(c ?? '').trim() !== ''));
      if (nonEmptyRows.length <= 1) {
        if (!sheetName.toLowerCase().includes('instruction')) {
          ignoredItems.push(`${file.name} (${sheetName}) — no data rows`);
        }
        continue;
      }

      const rawHeaders = (aoa[0] || []).map((h) => String(h ?? '').trim().toLowerCase());
      const normHeaders = rawHeaders.map(normalizeHeaderKey);
      const headerSet = new Set(rawHeaders.filter(Boolean));
      const normHeaderSet = new Set(normHeaders.filter(Boolean));
      const col = buildColResolver(rawHeaders);
      const sheetLower = sheetName.toLowerCase();
      const fileLower = file.name.toLowerCase();
      const label = files.length > 1 ? `${file.name} [${sheetName}]` : sheetName;

      if (sheetLower.includes('instruction')) {
        continue;
      }

      // 1. Buildings (Master template OR Buildings_Setup)
      if (
        sheetLower === 'buildings' ||
        sheetLower.includes('buildings_setup') ||
        (normHeaderSet.has('building code') && normHeaderSet.has('building name'))
      ) {
        const iId = col('id');
        const iCode = col('building code');
        const iName = col('building name');
        const iAddr = col('address');
        const iFloors = col('floors count', 'floors');
        const iFm = col('facility manager');
        const iAmc = col('amc contractors');
        const iStatus = col('status');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const code = clampStr(r[iCode >= 0 ? iCode : 0], MAX_LENGTHS.buildingCode).toUpperCase();
          const name = clampStr(r[iName >= 0 ? iName : 1], MAX_LENGTHS.buildingName);
          if (!code || !name) {
            errors.push(`${label} Row ${i + 1}: Building Code and Building Name are required.`);
            continue;
          }
          const floorsRaw = Number(r[iFloors >= 0 ? iFloors : 3] ?? 1);
          const floorsCount =
            Number.isFinite(floorsRaw) && floorsRaw >= 1 ? Math.min(200, Math.round(floorsRaw)) : 1;
          const contractors = String(r[iAmc >= 0 ? iAmc : 5] ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 20);
          buildingsToCreate.push({
            rowNum: i + 1,
            id: iId >= 0 ? clampStr(r[iId], MAX_LENGTHS.id) : undefined,
            code,
            name,
            address: clampStr(r[iAddr >= 0 ? iAddr : 2], MAX_LENGTHS.address),
            floorsCount,
            facilityManager: clampStr(r[iFm >= 0 ? iFm : 4], MAX_LENGTHS.facilityManager),
            amcContractors: contractors,
            status: iStatus >= 0 ? normalizeActiveStatus(String(r[iStatus] ?? 'active')) : 'active',
          });
          knownCodes.add(code);
        }
        continue;
      }

      // 2. Team_Roster (Master template) OR Legacy Lists sheet
      if (
        sheetLower === 'team_roster' ||
        (normHeaderSet.has('full name') && normHeaderSet.has('badge / emp id')) ||
        (headerSet.has('technicians') && (headerSet.has('emp code') || headerSet.has('designation'))) ||
        sheetLower === 'lists'
      ) {
        if (headerSet.has('pin') || headerSet.has('admin pin')) {
          ignoredItems.push(`${label}: PIN & Admin PIN columns ignored (legacy credentials excluded)`);
        }
        const iId = col('id');
        const iRole = col('role');
        const iName = col('full name', 'technicians');
        const iBadge = col('badge / emp id', 'emp code');
        const iUser = col('login username', 'username');
        const iTrade = col('trade / designation', 'designation');
        const iPhone = col('phone');
        const iEmail = col('email');
        const iStatus = col('status');
        const iAssigned = col('assigned building codes', 'assigned buildings');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const techName = cleanSingleLine(r[iName >= 0 ? iName : 0], MAX_LENGTHS.techName);
          const badgeId = cleanSingleLine(r[iBadge >= 0 ? iBadge : 4], MAX_LENGTHS.badgeId).toUpperCase();
          const trade =
            cleanSingleLine(r[iTrade >= 0 ? iTrade : 5], MAX_LENGTHS.trade) || 'General Technician';
          if (!techName || !badgeId) continue;

          const rawRole = iRole >= 0 ? String(r[iRole] ?? '').trim().toLowerCase() : 'technician';
          const role: UserRole =
            rawRole === 'admin' ? 'admin' : rawRole === 'supervisor' ? 'supervisor' : 'technician';
          const assignedCodes =
            iAssigned >= 0
              ? String(r[iAssigned] ?? '')
                  .split(',')
                  .map((s) => s.trim().toUpperCase())
                  .filter(Boolean)
              : [defaultBuildingCode];

          techniciansToCreate.push({
            rowNum: i + 1,
            id: iId >= 0 ? clampStr(r[iId], MAX_LENGTHS.id) : undefined,
            role,
            name: techName,
            badgeId,
            username: iUser >= 0 ? clampStr(r[iUser], MAX_LENGTHS.username) : undefined,
            trade,
            phone: iPhone >= 0 ? clampStr(r[iPhone], MAX_LENGTHS.phone) : '',
            email: iEmail >= 0 ? clampStr(r[iEmail], MAX_LENGTHS.email) : '',
            status: iStatus >= 0 ? normalizeActiveStatus(String(r[iStatus] ?? 'active')) : 'active',
            buildingCode: assignedCodes[0] || defaultBuildingCode,
            assignedBuildingCodes: assignedCodes,
          });
        }
        continue;
      }

      // 3. Assets_QR (Master template)
      if (
        sheetLower === 'assets_qr' ||
        (normHeaderSet.has('asset tag') && normHeaderSet.has('asset name'))
      ) {
        const iId = col('id');
        const iBld = col('building code');
        const iTag = col('asset tag');
        const iName = col('asset name');
        const iDisc = col('discipline');
        const iLoc = col('location / zone', 'location');
        const iModel = col('manufacturer / model', 'model');
        const iSerial = col('serial number');
        const iFreq = col('ppm frequency');
        const iStat = col('status');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const bCode =
            (iBld >= 0 ? cleanSingleLine(r[iBld], MAX_LENGTHS.buildingCode).toUpperCase() : '') ||
            defaultBuildingCode;
          if (!knownCodes.has(bCode)) pendingAutoBuildings.add(bCode);
          const assetTag = cleanSingleLine(r[iTag], MAX_LENGTHS.assetTag);
          const assetName = cleanSingleLine(r[iName], MAX_LENGTHS.assetName);
          if (!assetTag || !assetName) {
            errors.push(`${label} Row ${i + 1}: Asset Tag and Asset Name are required.`);
            continue;
          }
          assetsToCreate.push({
            rowNum: i + 1,
            id: iId >= 0 ? clampStr(r[iId], MAX_LENGTHS.id) : undefined,
            buildingCode: bCode,
            assetTag,
            assetName,
            discipline:
              (iDisc >= 0 ? cleanSingleLine(r[iDisc], MAX_LENGTHS.discipline) : '') || 'General MEP',
            locationZone:
              iLoc >= 0 ? cleanSingleLine(r[iLoc], MAX_LENGTHS.locationZone) : '',
            manufacturerModel:
              iModel >= 0 ? cleanSingleLine(r[iModel], MAX_LENGTHS.manufacturerModel) : '',
            serialNumber:
              iSerial >= 0 ? cleanSingleLine(r[iSerial], MAX_LENGTHS.serialNumber) : '',
            ppmFrequency: normalizeFrequency(iFreq >= 0 ? String(r[iFreq] ?? 'none') : 'none'),
            status: iStat >= 0 ? normalizeActiveStatus(String(r[iStat] ?? 'active')) : 'active',
          });
        }
        continue;
      }

      // 4. Utility Meters (Master template OR Legacy Meters CSV)
      if (
        sheetLower === 'utility_meters' ||
        (normHeaderSet.has('meter type') && normHeaderSet.has('meter no')) ||
        (headerSet.has('meter no') && headerSet.has('unit/area') && !headerSet.has('reading')) ||
        (headerSet.has('meterno') && !headerSet.has('readingvalue') && !headerSet.has('reading'))
      ) {
        const iId = col('id');
        const iBld = col('building code', 'building');
        const iType = col('meter type', 'type');
        const iArea = col('unit / area', 'unit/area', 'area');
        const iMeter = col('meter no', 'meterno');
        const iAcct = col('account no', 'accountno');
        const iUnit = col('unit');
        const iStatus = col('status');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const bCode =
            iBld >= 0
              ? cleanSingleLine(r[iBld], MAX_LENGTHS.buildingCode).toUpperCase() || defaultBuildingCode
              : defaultBuildingCode;
          if (!knownCodes.has(bCode)) pendingAutoBuildings.add(bCode);
          const meterType = normalizeMeterType(String(r[iType >= 0 ? iType : 0] ?? 'Other'));
          const area = cleanSingleLine(r[iArea >= 0 ? iArea : 1], MAX_LENGTHS.locationZone) || 'Common';
          const meterNo = cleanSingleLine(r[iMeter >= 0 ? iMeter : 2], MAX_LENGTHS.meterNo);
          const accountNo = iAcct >= 0 ? cleanSingleLine(r[iAcct], MAX_LENGTHS.accountNo) : '';
          if (!meterNo) continue;
          const unit =
            (iUnit >= 0 ? cleanSingleLine(r[iUnit], MAX_LENGTHS.meterUnit) : '') ||
            DEFAULT_METER_UNITS[meterType];
          metersToCreate.push({
            rowNum: i + 1,
            id: iId >= 0 ? clampStr(r[iId], MAX_LENGTHS.id) : undefined,
            buildingCode: bCode,
            meterType,
            area,
            meterNo,
            accountNo,
            unit,
            status: iStatus >= 0 ? normalizeActiveStatus(String(r[iStatus] ?? 'active')) : 'active',
          });
        }
        continue;
      }

      // 5. Daily Work Logs (Master Work_Logs OR Legacy Logs CSV)
      if (
        sheetLower === 'work_logs' ||
        (normHeaderSet.has('complaint') && (normHeaderSet.has('logdate') || normHeaderSet.has('log date')))
      ) {
        const iId = col('id');
        const iBld = col('building code', 'building');
        const iDate = col('log date', 'logdate');
        const iSup = col('supervisor name', 'supervisor');
        const iShift = col('shift');
        const iWo = col('wo number', 'wo');
        const iLoc = col('location / unit', 'location');
        const iComp = col('complaint');
        const iTech = col('technician name', 'technician');
        const iAct = col('action taken', 'action');
        const iCat = col('category');
        const iPrio = col('priority');
        const iRecv = col('received time', 'received');
        const iStart = col('start time', 'start');
        const iFin = col('finish time', 'finish');
        const iDur = col('duration hours');
        const iMat = col('materials used', 'materials');
        const iStat = col('status');
        const iPend = col('pending reason', 'pending');
        const iRem = col('remarks');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const bCode =
            (iBld >= 0 ? cleanSingleLine(r[iBld], MAX_LENGTHS.buildingCode).toUpperCase() : '') ||
            defaultBuildingCode;
          if (!knownCodes.has(bCode)) pendingAutoBuildings.add(bCode);
          const supName = iSup >= 0 ? cleanSingleLine(r[iSup], MAX_LENGTHS.techName) : '';
          if (supName && !inferredSupervisor) inferredSupervisor = supName;
          const recv = iRecv >= 0 ? normalizeExcelTime(r[iRecv]) : '';
          const start = iStart >= 0 ? normalizeExcelTime(r[iStart]) : '';
          const finish = iFin >= 0 ? normalizeExcelTime(r[iFin]) : '';
          const status = normalizeWorkStatus(iStat >= 0 ? String(r[iStat] ?? '') : 'Pending');
          const actionText = iAct >= 0 ? cleanSingleLine(r[iAct], MAX_LENGTHS.action) : '';
          const explicitDur = iDur >= 0 && String(r[iDur] ?? '').trim() !== '' ? Number(r[iDur]) : NaN;
          const durationHours =
            Number.isFinite(explicitDur) && explicitDur >= 0
              ? round2(Math.min(48, explicitDur))
              : computeWorkLogDurationHours(recv, start, finish);

          workLogsToCreate.push({
            rowNum: i + 1,
            id: sanitizeDocId(iId >= 0 ? r[iId] : '', 'wl', usedWorkIds),
            buildingCode: bCode,
            logDate: normalizeExcelDate(iDate >= 0 ? r[iDate] : '') || new Date().toISOString().slice(0, 10),
            shift: normalizeWorkShift(iShift >= 0 ? String(r[iShift] ?? '') : 'Day'),
            woNumber: iWo >= 0 ? cleanSingleLine(r[iWo], MAX_LENGTHS.woNumber) : '',
            location: (iLoc >= 0 ? cleanSingleLine(r[iLoc], MAX_LENGTHS.locationZone) : '') || 'General',
            category: (iCat >= 0 ? cleanSingleLine(r[iCat], MAX_LENGTHS.discipline) : '') || 'General Maintenance',
            priority: normalizeWorkPriority(iPrio >= 0 ? String(r[iPrio] ?? '') : 'Normal'),
            complaint: (iComp >= 0 ? cleanSingleLine(r[iComp], MAX_LENGTHS.complaint) : '') || 'Maintenance work',
            actionTaken: actionText,
            materials: iMat >= 0 ? cleanSingleLine(r[iMat], MAX_LENGTHS.materials) : '',
            receivedTime: recv,
            startTime: start,
            finishTime: finish,
            durationHours,
            status,
            pendingReason: status === 'Completed' || iPend < 0 ? '' : cleanSingleLine(r[iPend], MAX_LENGTHS.pendingReason),
            remarks: iRem >= 0 ? cleanSingleLine(r[iRem], MAX_LENGTHS.remarks) : '',
            technicianName: (iTech >= 0 ? cleanSingleLine(r[iTech], MAX_LENGTHS.techName) : '') || 'Field Technician',
            supervisorName: supName,
          });
        }
        continue;
      }

      // 6. Overtime Logs (Master Overtime_Logs OR Legacy Overtime CSV)
      if (
        sheetLower === 'overtime_logs' ||
        ((normHeaderSet.has('ot date') || headerSet.has('otdate')) &&
          (normHeaderSet.has('from time') || headerSet.has('from') || headerSet.has('otcategorytype')))
      ) {
        const iId = col('id');
        const iTech = col('technician name', 'technician');
        const iDate = col('ot date', 'otdate');
        const iFrom = col('from time', 'from');
        const iTo = col('to time', 'to');
        const iHours = col('hours');
        const iType = col('work type', 'type');
        const iLoc = col('location');
        const iWork = col('work description', 'work');
        const iCat = col('ot category', 'otcategorytype');
        const iBld = col('building code', 'building');
        const iApp = col('approval status');
        const iRev = col('review notes');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const bCode =
            (iBld >= 0 ? cleanSingleLine(r[iBld], MAX_LENGTHS.buildingCode).toUpperCase() : '') ||
            defaultBuildingCode;
          if (!knownCodes.has(bCode)) pendingAutoBuildings.add(bCode);
          const fromTime = (iFrom >= 0 ? normalizeExcelTime(r[iFrom]) : '') || '00:00';
          const toTime = (iTo >= 0 ? normalizeExcelTime(r[iTo]) : '') || '00:00';
          const explicitH = iHours >= 0 && String(r[iHours] ?? '').trim() !== '' ? Number(r[iHours]) : NaN;
          const hours =
            Number.isFinite(explicitH) && explicitH >= 0
              ? round2(Math.min(24, explicitH))
              : calculateTimeHours(fromTime, toTime);
          const rawApp = iApp >= 0 ? String(r[iApp] ?? '').trim().toLowerCase() : 'approved';
          const approvalStatus: 'pending_approval' | 'approved' | 'rejected' =
            rawApp.includes('reject')
              ? 'rejected'
              : rawApp.includes('pending')
                ? 'pending_approval'
                : 'approved';

          overtimeToCreate.push({
            rowNum: i + 1,
            id: sanitizeDocId(iId >= 0 ? r[iId] : '', 'ot', usedOtIds),
            buildingCode: bCode,
            otDate: normalizeExcelDate(iDate >= 0 ? r[iDate] : '') || new Date().toISOString().slice(0, 10),
            fromTime,
            toTime,
            hours,
            otCategoryType: normalizeOtCategory(iCat >= 0 ? String(r[iCat] ?? '') : 'N'),
            workType: (iType >= 0 ? cleanSingleLine(r[iType], MAX_LENGTHS.workType) : '') || 'Overtime Work',
            location: (iLoc >= 0 ? cleanSingleLine(r[iLoc], MAX_LENGTHS.locationZone) : '') || 'Common Area',
            workDescription:
              (iWork >= 0 ? cleanSingleLine(r[iWork], MAX_LENGTHS.workDescription) : '') || 'Overtime duty',
            technicianName: (iTech >= 0 ? cleanSingleLine(r[iTech], MAX_LENGTHS.techName) : '') || 'Technician',
            approvalStatus,
            reviewNotes: iRev >= 0 ? cleanSingleLine(r[iRev], MAX_LENGTHS.reviewNotes) : undefined,
          });
        }
        continue;
      }

      // 7. Utility Readings (Master Utility_Readings OR Legacy Readings CSV)
      if (
        sheetLower === 'utility_readings' ||
        ((normHeaderSet.has('reading value') || headerSet.has('reading')) &&
          (normHeaderSet.has('meter no') || headerSet.has('meter')) &&
          (normHeaderSet.has('reading date') || headerSet.has('date')))
      ) {
        const iId = col('id');
        const iTech = col('technician name', 'technician');
        const iDate = col('reading date', 'date');
        const iType = col('meter type', 'type');
        const iArea = col('area');
        const iMeter = col('meter no', 'meter');
        const iAcct = col('account no', 'account');
        const iReading = col('reading value', 'reading');
        const iNotes = col('notes');
        const iBld = col('building code', 'building');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const bCode =
            (iBld >= 0 ? cleanSingleLine(r[iBld], MAX_LENGTHS.buildingCode).toUpperCase() : '') ||
            defaultBuildingCode;
          if (!knownCodes.has(bCode)) pendingAutoBuildings.add(bCode);
          const val = Number(iReading >= 0 ? r[iReading] : 0);
          readingsToCreate.push({
            rowNum: i + 1,
            id: sanitizeDocId(iId >= 0 ? r[iId] : '', 'urd', usedReadingIds),
            buildingCode: bCode,
            readingDate: normalizeExcelDate(iDate >= 0 ? r[iDate] : '') || new Date().toISOString().slice(0, 10),
            meterType: (iType >= 0 ? cleanSingleLine(r[iType], 40) : '') || 'Electricity',
            area: (iArea >= 0 ? cleanSingleLine(r[iArea], MAX_LENGTHS.locationZone) : '') || 'Common',
            meterNo: iMeter >= 0 ? cleanSingleLine(r[iMeter], MAX_LENGTHS.meterNo) : '',
            accountNo: iAcct >= 0 ? cleanSingleLine(r[iAcct], MAX_LENGTHS.accountNo) : '',
            readingValue: Number.isFinite(val) ? Math.max(0, Math.min(999999999, val)) : 0,
            notes: iNotes >= 0 ? cleanSingleLine(r[iNotes], 400) : '',
            technicianName: (iTech >= 0 ? cleanSingleLine(r[iTech], MAX_LENGTHS.techName) : '') || 'Technician',
          });
        }
        continue;
      }

      // 8. Tenant Schedules (Master Tenant_Schedules OR Legacy Schedules CSV)
      if (
        sheetLower === 'tenant_schedules' ||
        (normHeaderSet.has('schedule date') && normHeaderSet.has('description')) ||
        (headerSet.has('desc') && headerSet.has('location') && headerSet.has('date'))
      ) {
        const iId = col('id');
        const iTech = col('assigned technician', 'technician');
        const iDate = col('schedule date', 'date');
        const iSlot = col('time slot');
        const iLoc = col('unit / location', 'location');
        const iTenant = col('tenant name');
        const iCat = col('category');
        const iDesc = col('description', 'desc');
        const iStat = col('status');
        const iCompNotes = col('completion notes');
        const iUpd = col('updatedat');
        const iFin = col('finish');
        const iObs = col('observations');
        const iRem = col('remarks');
        const iBld = col('building code', 'building');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const bCode =
            (iBld >= 0 ? cleanSingleLine(r[iBld], MAX_LENGTHS.buildingCode).toUpperCase() : '') ||
            defaultBuildingCode;
          if (!knownCodes.has(bCode)) pendingAutoBuildings.add(bCode);

          let timeSlot = iSlot >= 0 ? cleanSingleLine(r[iSlot], MAX_LENGTHS.timeSlot) : '';
          if (!timeSlot) {
            const maybeStart = iUpd >= 0 ? cleanSingleLine(r[iUpd], 40) : '';
            const maybeEnd = iFin >= 0 ? cleanSingleLine(r[iFin], 40) : '';
            const isTimePair = /^\d{1,2}:\d{2}$/.test(maybeStart) && /^\d{1,2}:\d{2}$/.test(maybeEnd);
            if (isTimePair) timeSlot = `${maybeStart} - ${maybeEnd}`;
          }

          const notes =
            iCompNotes >= 0
              ? cleanSingleLine(r[iCompNotes], MAX_LENGTHS.completionNotes)
              : [
                  iObs >= 0 ? cleanSingleLine(r[iObs], 400) : '',
                  iRem >= 0 ? cleanSingleLine(r[iRem], 500) : '',
                ]
                  .filter(Boolean)
                  .join(' — ');

          schedulesToCreate.push({
            rowNum: i + 1,
            id: sanitizeDocId(iId >= 0 ? r[iId] : '', 'sch', usedScheduleIds),
            buildingCode: bCode,
            scheduleDate: normalizeExcelDate(iDate >= 0 ? r[iDate] : '') || new Date().toISOString().slice(0, 10),
            timeSlot: clampStr(timeSlot, MAX_LENGTHS.timeSlot),
            unitOrLocation: (iLoc >= 0 ? cleanSingleLine(r[iLoc], MAX_LENGTHS.locationZone) : '') || 'Unit',
            tenantName: iTenant >= 0 ? cleanSingleLine(r[iTenant], MAX_LENGTHS.techName) : '',
            category: (iCat >= 0 ? cleanSingleLine(r[iCat], MAX_LENGTHS.discipline) : '') || 'General Maintenance',
            description:
              (iDesc >= 0 ? cleanSingleLine(r[iDesc], MAX_LENGTHS.workDescription) : '') ||
              'Scheduled unit maintenance',
            assignedTechName:
              (iTech >= 0 ? cleanSingleLine(r[iTech], MAX_LENGTHS.techName) : '') || 'Technician',
            status: normalizeScheduleStatus(iStat >= 0 ? String(r[iStat] ?? '') : 'Pending'),
            completionNotes: clampStr(notes, MAX_LENGTHS.completionNotes),
          });
        }
        continue;
      }

      // 9. Urgent Alerts (Master Urgent_Alerts)
      if (
        sheetLower === 'urgent_alerts' ||
        (normHeaderSet.has('severity') && normHeaderSet.has('title') && normHeaderSet.has('message'))
      ) {
        const iId = col('id');
        const iBld = col('building code');
        const iSev = col('severity');
        const iCat = col('category');
        const iTitle = col('title');
        const iMsg = col('message');
        const iLoc = col('location / zone', 'location');
        const iStat = col('status');
        const iExp = col('expires date');
        const iBy = col('created by name');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const bCode =
            (iBld >= 0 ? cleanSingleLine(r[iBld], MAX_LENGTHS.buildingCode).toUpperCase() : '') ||
            defaultBuildingCode;
          if (!knownCodes.has(bCode)) pendingAutoBuildings.add(bCode);
          const title = cleanSingleLine(r[iTitle], MAX_LENGTHS.title);
          const message = cleanSingleLine(r[iMsg], MAX_LENGTHS.notificationMessage);
          if (!title || !message) {
            errors.push(`${label} Row ${i + 1}: Urgent Alert Title and Message are required.`);
            continue;
          }
          notificationsToCreate.push({
            rowNum: i + 1,
            id: iId >= 0 ? clampStr(r[iId], MAX_LENGTHS.id) : undefined,
            buildingCode: bCode,
            severity: normalizeNotificationSeverity(iSev >= 0 ? String(r[iSev] ?? '') : 'urgent'),
            category:
              (iCat >= 0 ? cleanSingleLine(r[iCat], MAX_LENGTHS.discipline) : '') ||
              'General Building Alert',
            title,
            message,
            locationZone: iLoc >= 0 ? cleanSingleLine(r[iLoc], MAX_LENGTHS.locationZone) : '',
            status: iStat >= 0 ? normalizeNotificationStatus(String(r[iStat] ?? 'active')) : 'active',
            expiresAtDate: iExp >= 0 ? normalizeExcelDate(r[iExp]) : '',
            createdByName: iBy >= 0 ? cleanSingleLine(r[iBy], MAX_LENGTHS.techName) : '',
          });
        }
        continue;
      }

      // 10. Maintenance_Logs (Master 20-col OR Legacy 16-col Maintenance_Logs_Import)
      if (
        sheetLower === 'maintenance_logs' ||
        sheetLower.includes('maintenance') ||
        (normHeaderSet.has('entry type') && normHeaderSet.has('building code')) ||
        (!sheetLower.includes('instruction') && !fileLower.includes('technician_logs'))
      ) {
        const iId = col('id');
        const iBld = col('building code');
        const iType = col('entry type');
        const iDisc = col('discipline');
        const iAsset = col('asset name');
        const iTag = col('asset tag');
        const iLoc = col('location / zone', 'location / floor', 'location');
        const iTitle = col('work title');
        const iNotes = col('work notes', 'work notes / checklist findings');
        const iFreq = col('ppm frequency');
        const iNext = col('next due date');
        const iAmc = col('amc contractor');
        const iSched = col('scheduled date');
        const iComp = col('completed date');
        const iOut = col('outcome');
        const iParts = col('parts used');
        const iHours = col('labor hours');
        const iApp = col('approval status');
        const iSubBy = col('submitted by name');
        const iRevNotes = col('review notes');

        const isMasterHeader = iId >= 0 && iType >= 0;

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;

          const buildingCode = clampStr(
            r[isMasterHeader ? iBld : 0],
            MAX_LENGTHS.buildingCode
          ).toUpperCase();
          const entryType = normalizeEntryType(String(r[isMasterHeader ? iType : 1] ?? ''));
          const discipline =
            clampStr(r[isMasterHeader ? iDisc : 2], MAX_LENGTHS.discipline) || 'General MEP';
          const assetName = clampStr(r[isMasterHeader ? iAsset : 3], MAX_LENGTHS.assetName);
          const assetTag = clampStr(r[isMasterHeader ? iTag : 4], MAX_LENGTHS.assetTag);
          const locationZone = clampStr(r[isMasterHeader ? iLoc : 5], MAX_LENGTHS.locationZone);
          const title = clampStr(r[isMasterHeader ? iTitle : 6], MAX_LENGTHS.title);
          const workNotes = clampStr(r[isMasterHeader ? iNotes : 7], MAX_LENGTHS.workNotes);
          const ppmFrequency = normalizeFrequency(String(r[isMasterHeader ? iFreq : 8] ?? 'none'));
          const nextDueDate = iNext >= 0 ? normalizeExcelDate(r[iNext]) : undefined;
          const amcContractor = clampStr(r[isMasterHeader ? iAmc : 9], MAX_LENGTHS.amcContractor);
          const scheduledDate = normalizeExcelDate(r[isMasterHeader ? iSched : 10]);
          const completedDate =
            normalizeExcelDate(r[isMasterHeader ? iComp : 11]) ||
            new Date().toISOString().slice(0, 10);
          const outcome = normalizeOutcome(String(r[isMasterHeader ? iOut : 12] ?? 'operational'));
          const partsUsed = clampStr(r[isMasterHeader ? iParts : 13], MAX_LENGTHS.partsUsed);
          const laborRaw = Number(r[isMasterHeader ? iHours : 14] ?? 0);
          const laborHours =
            Number.isFinite(laborRaw) && laborRaw >= 0 ? Math.min(1000, laborRaw) : 0;
          const approvalStatus = normalizeApprovalStatus(
            String(r[isMasterHeader ? iApp : 15] ?? 'approved')
          );

          if (!buildingCode || !entryType || !assetName || !title) {
            if (i === 1 && !entryType) {
              ignoredItems.push(`${label} — unrecognized worksheet format ignored`);
              break;
            }
            errors.push(
              `${label} Row ${i + 1}: Missing required Maintenance Log fields (Building Code, Entry Type, Asset Name, Work Title).`
            );
            continue;
          }
          if (!knownCodes.has(buildingCode) && !pendingAutoBuildings.has(buildingCode)) {
            errors.push(
              `${label} Row ${i + 1}: Building Code "${buildingCode}" does not exist in your portfolio or Buildings sheet.`
            );
            continue;
          }

          logsToCreate.push({
            rowNum: i + 1,
            id: iId >= 0 ? clampStr(r[iId], MAX_LENGTHS.id) : undefined,
            buildingCode,
            entryType,
            discipline,
            assetName,
            assetTag,
            locationZone,
            title,
            workNotes,
            ppmFrequency,
            nextDueDate,
            amcContractor,
            scheduledDate,
            completedDate,
            outcome,
            partsUsed,
            laborHours,
            approvalStatus,
            submittedByName: iSubBy >= 0 ? clampStr(r[iSubBy], MAX_LENGTHS.techName) : undefined,
            reviewNotes: iRevNotes >= 0 ? clampStr(r[iRevNotes], MAX_LENGTHS.reviewNotes) : undefined,
          });
        }
      } else {
        ignoredItems.push(`${label} — unrelated worksheet ignored`);
      }
    }
  }

  for (const code of pendingAutoBuildings) {
    if (!knownCodes.has(code)) {
      buildingsToCreate.push({
        rowNum: 0,
        code,
        name: `${code} Tower`,
        address: '',
        floorsCount: code === 'GST1' ? 37 : 10,
        facilityManager: inferredSupervisor || '',
        amcContractors: [],
        status: 'active',
      });
      knownCodes.add(code);
    }
  }

  return applyImportDeduplication(
    {
      buildingsToCreate,
      techniciansToCreate,
      assetsToCreate,
      logsToCreate,
      workLogsToCreate,
      overtimeToCreate,
      metersToCreate,
      readingsToCreate,
      schedulesToCreate,
      notificationsToCreate,
      updateCount: 0,
      skippedDuplicates: 0,
      ignoredItems,
      errors,
    },
    context
  );
}

export async function parseImportWorkbook(
  file: File,
  existingBuildings: Building[]
): Promise<WorkbookImportPreview> {
  return parseImportFiles([file], { existingBuildings });
}

export async function loadLegacyGst1ImportPreview(
  context: ImportDedupeContext
): Promise<WorkbookImportPreview> {
  const resp = await fetch('/data/legacy_gst1_clean.json');
  if (!resp.ok) {
    throw new Error('Could not load the sanitized GST1 dataset archive.');
  }
  const data = (await resp.json()) as Partial<WorkbookImportPreview>;
  const raw: WorkbookImportPreview = {
    buildingsToCreate: Array.isArray(data.buildingsToCreate) ? data.buildingsToCreate : [],
    techniciansToCreate: Array.isArray(data.techniciansToCreate) ? data.techniciansToCreate : [],
    assetsToCreate: Array.isArray(data.assetsToCreate) ? data.assetsToCreate : [],
    logsToCreate: Array.isArray(data.logsToCreate) ? data.logsToCreate : [],
    workLogsToCreate: Array.isArray(data.workLogsToCreate) ? data.workLogsToCreate : [],
    overtimeToCreate: Array.isArray(data.overtimeToCreate) ? data.overtimeToCreate : [],
    metersToCreate: Array.isArray(data.metersToCreate) ? data.metersToCreate : [],
    readingsToCreate: Array.isArray(data.readingsToCreate) ? data.readingsToCreate : [],
    schedulesToCreate: Array.isArray(data.schedulesToCreate) ? data.schedulesToCreate : [],
    notificationsToCreate: Array.isArray(data.notificationsToCreate)
      ? data.notificationsToCreate
      : [],
    updateCount: 0,
    skippedDuplicates: 0,
    ignoredItems: Array.isArray(data.ignoredItems) ? data.ignoredItems : [],
    errors: [],
  };
  return applyImportDeduplication(raw, context);
}

export function exportManagerSummaryWorkbook(
  logs: MaintenanceLog[],
  buildings: Building[],
  meta: {
    buildingLabel: string;
    dateFrom: string;
    dateTo: string;
    generatedBy: string;
  }
): void {
  const wb = XLSX.utils.book_new();

  const totalLogs = logs.length;
  const ppmInhouse = logs.filter((l) => l.entryType === 'ppm_inhouse');
  const ppmAmc = logs.filter((l) => l.entryType === 'ppm_amc');
  const repairs = logs.filter((l) => l.entryType === 'repair');
  const upgrades = logs.filter((l) => l.entryType === 'upgradation');
  const approvedCount = logs.filter((l) => l.approvalStatus === 'approved').length;
  const pendingCount = logs.filter((l) => l.approvalStatus === 'pending_approval').length;
  const totalHours = logs.reduce((sum, l) => sum + (Number(l.laborHours) || 0), 0);
  const criticalCount = logs.filter((l) => l.outcome === 'critical_fault').length;

  // Sheet 1: Executive Summary
  const summaryRows: unknown[][] = [
    ['Facility Assist — Executive Summary Report'],
    ['Scope', meta.buildingLabel],
    ['Reporting Window', `${meta.dateFrom || 'All Dates'} to ${meta.dateTo || 'Present'}`],
    ['Generated By', meta.generatedBy],
    ['Generated On', new Date().toISOString().slice(0, 19).replace('T', ' ')],
    [''],
    ['Portfolio Key Metrics', 'Count / Value'],
    ['Total Maintenance Records', totalLogs],
    ['In-House PPM Reports', ppmInhouse.length],
    ['AMC Contractor PPM Reports', ppmAmc.length],
    ['Repair Works Logged', repairs.length],
    ['Upgradation Works Logged', upgrades.length],
    ['Approved Records', approvedCount],
    ['Pending Supervisor Approval', pendingCount],
    ['Critical Faults Flagged', criticalCount],
    ['Total Logged Labor Hours', Number(totalHours.toFixed(2))],
    [''],
    ['Breakdown by Building', 'Code', 'In-House PPM', 'AMC PPM', 'Repairs', 'Upgrades', 'Approved', 'Pending', 'Labor Hours'],
  ];

  for (const b of buildings) {
    const bLogs = logs.filter((l) => l.buildingId === b.id);
    if (bLogs.length === 0 && meta.buildingLabel !== 'All Buildings') continue;
    summaryRows.push([
      b.name,
      b.code,
      bLogs.filter((l) => l.entryType === 'ppm_inhouse').length,
      bLogs.filter((l) => l.entryType === 'ppm_amc').length,
      bLogs.filter((l) => l.entryType === 'repair').length,
      bLogs.filter((l) => l.entryType === 'upgradation').length,
      bLogs.filter((l) => l.approvalStatus === 'approved').length,
      bLogs.filter((l) => l.approvalStatus === 'pending_approval').length,
      Number(bLogs.reduce((s, l) => s + (Number(l.laborHours) || 0), 0).toFixed(2)),
    ]);
  }

  // Discipline Breakdown
  summaryRows.push(['']);
  summaryRows.push(['Breakdown by System Discipline', 'Total Works', 'PPM (In-House + AMC)', 'Repairs + Upgrades', 'Critical Faults']);
  const disciplines = Array.from(new Set(logs.map((l) => l.discipline))).sort();
  for (const d of disciplines) {
    const dLogs = logs.filter((l) => l.discipline === d);
    summaryRows.push([
      d,
      dLogs.length,
      dLogs.filter((l) => l.entryType === 'ppm_inhouse' || l.entryType === 'ppm_amc').length,
      dLogs.filter((l) => l.entryType === 'repair' || l.entryType === 'upgradation').length,
      dLogs.filter((l) => l.outcome === 'critical_fault').length,
    ]);
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 32 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive_Summary');

  // Sheet 2: PPM Compliance Register
  const ppmLogs = [...ppmInhouse, ...ppmAmc];
  const ppmSheetRows: unknown[][] = [
    [
      'Log ID',
      'Building Code',
      'Building Name',
      'PPM Type',
      'Frequency',
      'AMC Contractor',
      'Discipline',
      'Asset Name',
      'Asset Tag',
      'Location',
      'Work Title',
      'Scheduled Date',
      'Completed Date',
      'Next PPM Due',
      'Outcome',
      'Labor Hours',
      'Before Photos',
      'After Photos',
      'AMC Scans',
      'Approval Status',
      'Submitted By',
      'Reviewed By',
      'Work Notes',
    ],
    ...ppmLogs.map((l) => [
      l.id,
      l.buildingCode,
      l.buildingName,
      ENTRY_TYPE_LABELS[l.entryType],
      FREQUENCY_LABELS[l.ppmFrequency],
      l.amcContractor || 'In-House Team',
      l.discipline,
      l.assetName,
      l.assetTag,
      l.locationZone,
      l.title,
      l.scheduledDate,
      l.completedDate,
      l.nextDueDate || '-',
      OUTCOME_LABELS[l.outcome],
      l.laborHours,
      l.beforePhotoIds.length,
      l.afterPhotoIds.length,
      l.scannedReportIds.length,
      APPROVAL_STATUS_LABELS[l.approvalStatus],
      `${l.submittedByName} (${l.submittedByEmail})`,
      l.reviewedByName || '-',
      l.workNotes,
    ]),
  ];
  const wsPpm = XLSX.utils.aoa_to_sheet(ppmSheetRows);
  wsPpm['!cols'] = [
    { wch: 18 }, { wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 22 },
    { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 18 }, { wch: 28 }, { wch: 20 }, { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, wsPpm, 'PPM_Compliance_Register');

  // Sheet 3: Repairs & Upgradations
  const rwLogs = [...repairs, ...upgrades];
  const rwSheetRows: unknown[][] = [
    [
      'Log ID',
      'Building Code',
      'Building Name',
      'Work Type',
      'Discipline',
      'Asset Name',
      'Asset Tag',
      'Location',
      'Work Title',
      'Completed Date',
      'Outcome',
      'Parts / Materials Used',
      'Labor Hours',
      'Before Photos',
      'After Photos',
      'Approval Status',
      'Submitted By',
      'Reviewed By',
      'Review Notes',
      'Work Notes',
    ],
    ...rwLogs.map((l) => [
      l.id,
      l.buildingCode,
      l.buildingName,
      ENTRY_TYPE_LABELS[l.entryType],
      l.discipline,
      l.assetName,
      l.assetTag,
      l.locationZone,
      l.title,
      l.completedDate,
      OUTCOME_LABELS[l.outcome],
      l.partsUsed || '-',
      l.laborHours,
      l.beforePhotoIds.length,
      l.afterPhotoIds.length,
      APPROVAL_STATUS_LABELS[l.approvalStatus],
      `${l.submittedByName} (${l.submittedByEmail})`,
      l.reviewedByName || '-',
      l.reviewNotes || '-',
      l.workNotes,
    ]),
  ];
  const wsRw = XLSX.utils.aoa_to_sheet(rwSheetRows);
  wsRw['!cols'] = [
    { wch: 18 }, { wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 22 }, { wch: 22 },
    { wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 26 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 20 },
    { wch: 28 }, { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRw, 'Repairs_and_Upgradations');

  // Sheet 4: Building Portfolio
  const bldSheetRows: unknown[][] = [
    ['Code', 'Building Name', 'Address', 'Floors', 'Facility Manager', 'AMC Contractors', 'Status'],
    ...buildings.map((b) => [
      b.code,
      b.name,
      b.address,
      b.floorsCount,
      b.facilityManager,
      b.amcContractors.join(', '),
      b.status,
    ]),
  ];
  const wsBld = XLSX.utils.aoa_to_sheet(bldSheetRows);
  wsBld['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 30 }, { wch: 10 }, { wch: 22 }, { wch: 36 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsBld, 'Building_Portfolio');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Facility_Assist_FM_Summary_${stamp}.xlsx`);
}

function safeSheetName(raw: string, used: Set<string>): string {
  const cleaned = raw.replace(/[\\/*?:[\]]/g, '-').trim().slice(0, 31) || 'Sheet';
  let name = cleaned;
  let n = 2;
  while (used.has(name)) {
    const suffix = ` (${n++})`;
    name = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name);
  return name;
}

export function exportWorkLogsWorkbook(
  workLogs: WorkLog[],
  meta: { buildingLabel: string; dateFrom: string; dateTo: string; generatedBy: string }
): void {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  const completed = workLogs.filter((w) => w.status === 'Completed').length;
  const pending = workLogs.filter((w) => w.status === 'Pending').length;
  const onHold = workLogs.filter((w) => w.status === 'On Hold').length;

  const summaryRows: unknown[][] = [
    ['Facility Assist — Daily Work Order & Maintenance Log Report'],
    ['Building Scope', meta.buildingLabel],
    ['Date Range', `${meta.dateFrom || 'Start'} to ${meta.dateTo || 'Present'}`],
    ['Generated By', meta.generatedBy],
    ['Total Work Orders', workLogs.length],
    ['Completed', completed],
    ['Pending', pending],
    ['On Hold', onHold],
    [''],
    [
      'Date',
      'Building',
      'Shift',
      'WO Number',
      'Location',
      'Category',
      'Priority',
      'Complaint / Request',
      'Technician',
      'Action Taken',
      'Received',
      'Start',
      'Finish',
      'Duration (h)',
      'Materials Used',
      'Status',
      'Pending Reason',
      'Session #',
      'Root Job ID',
      'Chain Resolved',
      'Remarks / Audit Trail',
    ],
    ...workLogs
      .slice()
      .sort((a, b) => a.logDate.localeCompare(b.logDate) || a.startTime.localeCompare(b.startTime))
      .map((w) => [
        w.logDate,
        `${w.buildingCode} — ${w.buildingName}`,
        w.shift,
        w.woNumber || '-',
        w.location,
        w.category,
        w.priority,
        w.complaint,
        w.technicianName,
        w.action || '-',
        w.receivedTime || '-',
        w.startTime || '-',
        w.finishTime || '-',
        w.durationHours || 0,
        w.materials || '-',
        w.status,
        w.pendingReason || '-',
        w.sessionNumber || 1,
        w.rootWorkLogId || w.id,
        w.status === 'Completed' || w.chainResolved ? 'Yes' : 'No',
        w.remarks || '-',
      ]),
  ];

  const wsAll = XLSX.utils.aoa_to_sheet(summaryRows);
  wsAll['!cols'] = [
    { wch: 12 }, { wch: 24 }, { wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
    { wch: 11 }, { wch: 32 }, { wch: 22 }, { wch: 32 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 24 }, { wch: 10 },
    { wch: 20 }, { wch: 13 }, { wch: 34 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, safeSheetName('Work_Logs_Register', usedNames));

  // Per-day worksheets (up to 31 days to keep workbook crisp)
  const byDay = new Map<string, WorkLog[]>();
  for (const w of workLogs) {
    const arr = byDay.get(w.logDate) || [];
    arr.push(w);
    byDay.set(w.logDate, arr);
  }
  const dayKeys = Array.from(byDay.keys()).sort().slice(0, 31);
  for (const day of dayKeys) {
    const dayRows = byDay.get(day) || [];
    const sheetAoa: unknown[][] = [
      [`Daily Technician Work Log — ${day}`, `Scope: ${meta.buildingLabel}`],
      [
        'S.No',
        'Building',
        'Shift',
        'WO#',
        'Location',
        'Complaint',
        'Technician',
        'Action Taken',
        'Category',
        'Priority',
        'Received',
        'Start',
        'Finish',
        'Duration (h)',
        'Materials',
        'Status',
        'Pending Reason',
        'Session #',
        'Remarks',
      ],
      ...dayRows.map((w, idx) => [
        idx + 1,
        w.buildingCode,
        w.shift,
        w.woNumber || '-',
        w.location,
        w.complaint,
        w.technicianName,
        w.action || '-',
        w.category,
        w.priority,
        w.receivedTime || '-',
        w.startTime || '-',
        w.finishTime || '-',
        w.durationHours || 0,
        w.materials || '-',
        w.status,
        w.pendingReason || '-',
        w.sessionNumber || 1,
        w.remarks || '-',
      ]),
    ];
    const wsDay = XLSX.utils.aoa_to_sheet(sheetAoa);
    wsDay['!cols'] = [
      { wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 18 }, { wch: 30 },
      { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 11 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDay, safeSheetName(day, usedNames));
  }

  const fromLbl = meta.dateFrom || 'all';
  const toLbl = meta.dateTo || 'latest';
  XLSX.writeFile(wb, `Facility_Assist_Work_Logs_${fromLbl}_to_${toLbl}.xlsx`);
}

export function exportOvertimeWorkbook(
  overtimeLogs: OvertimeLog[],
  technicians: Technician[],
  meta: { buildingLabel: string; dateFrom: string; dateTo: string; generatedBy: string }
): void {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const deduped = dedupeOvertimeLogs(overtimeLogs);
  const cats: OvertimeCategoryType[] = ['N', 'WO', 'PH', 'N. Shift'];

  // Sheet 1: Overtime Summary by Technician
  const byTech = new Map<
    string,
    { name: string; badgeId: string; trade: string; totals: Record<OvertimeCategoryType, number>; entries: number }
  >();
  for (const ot of deduped) {
    const key = ot.technicianName.trim().toLowerCase();
    const match = technicians.find((t) => t.name.trim().toLowerCase() === key);
    const cur = byTech.get(key) || {
      name: ot.technicianName,
      badgeId: ot.technicianBadgeId || match?.badgeId || '-',
      trade: match?.trade || '-',
      totals: { N: 0, WO: 0, PH: 0, 'N. Shift': 0 },
      entries: 0,
    };
    const cat = cats.includes(ot.otCategoryType) ? ot.otCategoryType : 'N';
    cur.totals[cat] = round2(cur.totals[cat] + ot.hours);
    cur.entries += 1;
    byTech.set(key, cur);
  }

  const summaryRows: unknown[][] = [
    ['Facility Assist — Overtime Timesheet Summary Report'],
    ['Building Scope', meta.buildingLabel],
    ['Date Range', `${meta.dateFrom || 'Start'} to ${meta.dateTo || 'Present'}`],
    ['Generated By', meta.generatedBy],
    [''],
    ['Technician Name', 'Badge / Emp Code', 'Trade / Designation', 'N (Normal OT)', 'WO (Weekly Off)', 'PH (Public Holiday)', 'N. Shift', 'Total Hours', 'Entries'],
  ];

  const techRows = Array.from(byTech.values()).sort((a, b) => a.name.localeCompare(b.name));
  for (const t of techRows) {
    const tot = round2(t.totals.N + t.totals.WO + t.totals.PH + t.totals['N. Shift']);
    summaryRows.push([
      t.name,
      t.badgeId,
      t.trade,
      t.totals.N,
      t.totals.WO,
      t.totals.PH,
      t.totals['N. Shift'],
      tot,
      t.entries,
    ]);
  }
  summaryRows.push([
    'GRAND TOTAL',
    '',
    '',
    round2(techRows.reduce((s, r) => s + r.totals.N, 0)),
    round2(techRows.reduce((s, r) => s + r.totals.WO, 0)),
    round2(techRows.reduce((s, r) => s + r.totals.PH, 0)),
    round2(techRows.reduce((s, r) => s + r.totals['N. Shift'], 0)),
    round2(techRows.reduce((s, r) => s + r.totals.N + r.totals.WO + r.totals.PH + r.totals['N. Shift'], 0)),
    deduped.length,
  ]);

  const wsSum = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSum['!cols'] = [
    { wch: 26 }, { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSum, safeSheetName('Overtime_Summary', usedNames));

  // Sheet 2: Detailed OT Log
  const detailRows: unknown[][] = [
    ['Date', 'Building', 'Technician', 'Badge ID', 'From', 'To', 'Hours', 'OT Category', 'Work Type', 'Location', 'Work Description', 'Approval Status'],
    ...deduped
      .slice()
      .sort((a, b) => a.otDate.localeCompare(b.otDate) || a.fromTime.localeCompare(b.fromTime))
      .map((r) => [
        r.otDate,
        `${r.buildingCode} — ${r.buildingName}`,
        r.technicianName,
        r.technicianBadgeId || '-',
        r.fromTime,
        r.toTime,
        r.hours,
        r.otCategoryType,
        r.workType,
        r.location,
        r.workDescription,
        r.approvalStatus,
      ]),
  ];
  const wsDet = XLSX.utils.aoa_to_sheet(detailRows);
  wsDet['!cols'] = [
    { wch: 12 }, { wch: 22 }, { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 36 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDet, safeSheetName('All_OT_Entries', usedNames));

  // Individual sheets per technician
  for (const t of techRows) {
    const items = deduped
      .filter((r) => r.technicianName.trim().toLowerCase() === t.name.trim().toLowerCase())
      .sort((a, b) => a.otDate.localeCompare(b.otDate) || a.fromTime.localeCompare(b.fromTime));
    const tSheetRows: unknown[][] = [
      [`Individual Overtime Sheet — ${t.name}`],
      ['Badge / Emp Code', t.badgeId, 'Designation', t.trade],
      ['Period', `${meta.dateFrom || 'Start'} to ${meta.dateTo || 'Present'}`],
      [''],
      ['Date', 'Building', 'From', 'To', 'N', 'WO', 'PH', 'N. Shift', 'Location & Work Description'],
      ...items.map((e) => [
        e.otDate,
        e.buildingCode,
        e.fromTime,
        e.toTime,
        e.otCategoryType === 'N' ? e.hours : '',
        e.otCategoryType === 'WO' ? e.hours : '',
        e.otCategoryType === 'PH' ? e.hours : '',
        e.otCategoryType === 'N. Shift' ? e.hours : '',
        `${e.location} — ${e.workType}: ${e.workDescription}`,
      ]),
      [
        'Grand Total',
        '',
        '',
        '',
        t.totals.N,
        t.totals.WO,
        t.totals.PH,
        t.totals['N. Shift'],
        `Total: ${round2(t.totals.N + t.totals.WO + t.totals.PH + t.totals['N. Shift'])} hrs`,
      ],
    ];
    const wsInd = XLSX.utils.aoa_to_sheet(tSheetRows);
    wsInd['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 46 },
    ];
    XLSX.utils.book_append_sheet(wb, wsInd, safeSheetName(t.name, usedNames));
  }

  const fromLbl = meta.dateFrom || 'all';
  const toLbl = meta.dateTo || 'latest';
  XLSX.writeFile(wb, `Facility_Assist_Overtime_Report_${fromLbl}_to_${toLbl}.xlsx`);
}

export function exportUtilityReportWorkbook(
  allReadings: UtilityReading[],
  meters: UtilityMeter[],
  meta: { buildingLabel: string; dateFrom: string; dateTo: string; generatedBy: string }
): void {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const series = buildUtilityMeterSeries(allReadings, meters, meta.dateFrom || undefined, meta.dateTo || undefined);

  // Sheet 1: Consumption Summary per meter
  const sumRows: unknown[][] = [
    ['Facility Assist — Utility Consumption Summary Report'],
    ['Building Scope', meta.buildingLabel],
    ['Date Range', `${meta.dateFrom || 'Start'} to ${meta.dateTo || 'Present'}`],
    ['Generated By', meta.generatedBy],
    [''],
    ['Building', 'Type', 'Unit / Area', 'Meter No', 'Account No', 'Unit', 'Opening Reading', 'Closing Reading', 'Total Consumption', 'Readings in Period', 'Avg per Day'],
    ...series.map((s) => [
      s.buildingCode,
      s.meterType,
      s.area,
      s.meterNo,
      s.accountNo || '-',
      s.unit,
      s.openingReading ?? '-',
      s.closingReading ?? '-',
      s.totalConsumption,
      s.readingsCount,
      s.avgPerDay ?? '-',
    ]),
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(sumRows);
  wsSum['!cols'] = [
    { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
    { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSum, safeSheetName('Consumption_Summary', usedNames));

  // Sheet 2: Daily Readings & Consumption
  const flatSteps: unknown[][] = [
    ['Date', 'Building', 'Type', 'Unit / Area', 'Meter No', 'Account No', 'Reading', 'Previous Reading', 'Previous Date', 'Days', 'Consumption', 'Entered By', 'Check / Notes'],
  ];
  for (const s of series) {
    for (const st of s.steps) {
      const checkMsg =
        st.consumption == null
          ? 'First reading'
          : st.consumption < 0
            ? 'Lower than previous - check'
            : st.daysGap > 1
              ? `${st.daysGap}-day gap`
              : st.notes || '';
      flatSteps.push([
        st.date,
        s.buildingCode,
        s.meterType,
        s.area,
        s.meterNo,
        s.accountNo || '-',
        st.readingValue,
        st.previousValue ?? '-',
        st.previousDate ?? '-',
        st.daysGap || '-',
        st.consumption ?? '-',
        st.enteredBy,
        checkMsg,
      ]);
    }
  }
  const wsDaily = XLSX.utils.aoa_to_sheet(flatSteps);
  wsDaily['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 22 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDaily, safeSheetName('Daily_Readings', usedNames));

  // Sheets 3+: Date x Meter matrix per utility type
  const types = Array.from(new Set(series.filter((s) => s.steps.length > 0).map((s) => s.meterType)));
  for (const t of types) {
    const ms = series.filter((s) => s.meterType === t);
    const allDates = Array.from(new Set(ms.flatMap((m) => m.steps.map((st) => st.date)))).sort();
    const headerRow: unknown[] = ['Date'];
    for (const m of ms) {
      headerRow.push(`${m.buildingCode} ${m.area} (${m.meterNo}) Reading`);
      headerRow.push(`${m.buildingCode} ${m.area} Consumption (${m.unit})`);
    }
    const matrix: unknown[][] = [
      [`${t} Readings & Daily Consumption Matrix`],
      ['Period', `${meta.dateFrom || 'Start'} to ${meta.dateTo || 'Present'}`],
      headerRow,
    ];
    for (const d of allDates) {
      const row: unknown[] = [d];
      for (const m of ms) {
        const st = m.steps.find((x) => x.date === d);
        row.push(st ? st.readingValue : '');
        row.push(st && st.consumption != null ? st.consumption : '');
      }
      matrix.push(row);
    }
    const totRow: unknown[] = ['Total Consumption'];
    for (const m of ms) {
      totRow.push('');
      totRow.push(m.totalConsumption);
    }
    matrix.push(totRow);

    const wsMat = XLSX.utils.aoa_to_sheet(matrix);
    wsMat['!cols'] = [{ wch: 14 }, ...ms.flatMap(() => [{ wch: 22 }, { wch: 22 }])];
    XLSX.utils.book_append_sheet(wb, wsMat, safeSheetName(t, usedNames));
  }

  const fromLbl = meta.dateFrom || 'all';
  const toLbl = meta.dateTo || 'latest';
  XLSX.writeFile(wb, `Facility_Assist_Utility_Report_${fromLbl}_to_${toLbl}.xlsx`);
}

export function exportTenantSchedulesWorkbook(
  schedules: TenantSchedule[],
  meta: { buildingLabel: string; dateFrom: string; dateTo: string; generatedBy: string }
): void {
  const wb = XLSX.utils.book_new();
  const rows: unknown[][] = [
    ['Facility Assist — Tenant & Unit Maintenance Schedules'],
    ['Building Scope', meta.buildingLabel],
    ['Date Range', `${meta.dateFrom || 'Start'} to ${meta.dateTo || 'Present'}`],
    ['Generated By', meta.generatedBy],
    [''],
    ['Date', 'Time Slot', 'Building', 'Unit / Location', 'Tenant Name', 'Category', 'Assigned Technician', 'Status', 'Task Description', 'Completion Notes'],
    ...schedules
      .slice()
      .sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate))
      .map((s) => [
        s.scheduleDate,
        s.timeSlot || '-',
        `${s.buildingCode} — ${s.buildingName}`,
        s.unitOrLocation,
        s.tenantName || '-',
        s.category,
        s.assignedTechName,
        s.status,
        s.description,
        s.completionNotes || '-',
      ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 20 },
    { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 36 }, { wch: 32 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Tenant_Schedules');
  const fromLbl = meta.dateFrom || 'all';
  const toLbl = meta.dateTo || 'latest';
  XLSX.writeFile(wb, `Facility_Assist_Tenant_Schedules_${fromLbl}_to_${toLbl}.xlsx`);
}
