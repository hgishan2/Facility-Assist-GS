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
  Building,
  clampStr,
  DEFAULT_METER_UNITS,
  DISCIPLINE_OPTIONS,
  ENTRY_TYPE_LABELS,
  EntryType,
  FREQUENCY_LABELS,
  generateSafeId,
  MaintenanceLog,
  MAX_LENGTHS,
  OUTCOME_LABELS,
  OvertimeCategoryType,
  OvertimeLog,
  PpmFrequency,
  Technician,
  TenantSchedule,
  TenantScheduleStatus,
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
  code: string;
  name: string;
  address: string;
  floorsCount: number;
  facilityManager: string;
  amcContractors: string[];
}

export interface ParsedTechnicianRow {
  rowNum: number;
  name: string;
  badgeId: string;
  trade: string;
  buildingCode: string;
}

export interface ParsedLogRow {
  rowNum: number;
  buildingCode: string;
  entryType: EntryType;
  discipline: string;
  assetName: string;
  assetTag: string;
  locationZone: string;
  title: string;
  workNotes: string;
  ppmFrequency: PpmFrequency;
  amcContractor: string;
  scheduledDate: string;
  completedDate: string;
  outcome: WorkOutcome;
  partsUsed: string;
  laborHours: number;
  approvalStatus: 'approved' | 'pending_approval';
}

export interface ParsedWorkLogRow {
  rowNum: number;
  id: string;
  buildingCode: string;
  logDate: string;
  shift: WorkShift;
  woNumber: string;
  location: string;
  category: string;
  priority: WorkPriority;
  complaint: string;
  action: string;
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
}

export interface ParsedMeterRow {
  rowNum: number;
  buildingCode: string;
  meterType: UtilityMeterType;
  area: string;
  meterNo: string;
  accountNo: string;
  unit: string;
}

export interface ParsedReadingRow {
  rowNum: number;
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

export interface ImportDedupeContext {
  existingBuildings: Building[];
  existingTechnicians?: Technician[];
  existingWorkLogs?: WorkLog[];
  existingOvertimeLogs?: OvertimeLog[];
  existingMeters?: UtilityMeter[];
  existingReadings?: UtilityReading[];
  existingSchedules?: TenantSchedule[];
}

export interface WorkbookImportPreview {
  buildingsToCreate: ParsedBuildingRow[];
  techniciansToCreate: ParsedTechnicianRow[];
  logsToCreate: ParsedLogRow[];
  workLogsToCreate: ParsedWorkLogRow[];
  overtimeToCreate: ParsedOvertimeRow[];
  metersToCreate: ParsedMeterRow[];
  readingsToCreate: ParsedReadingRow[];
  schedulesToCreate: ParsedScheduleRow[];
  skippedDuplicates: number;
  ignoredItems: string[];
  errors: string[];
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

export function downloadImportTemplate(buildings: Building[], technicians: Technician[]): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Instructions & Reference Values
  const sampleCode = buildings[0]?.code || 'BLD-01';
  const instructionsRows = [
    ['Facility Assist Bulk Import Template — Instructions'],
    [''],
    ['1. Optional Buildings Sheet', 'Use the "Buildings_Setup" sheet to add new buildings before importing logs.'],
    ['2. Maintenance Logs Sheet', 'Fill in "Maintenance_Logs_Import" with In-House PPM, AMC PPM, Repair, or Upgradation rows.'],
    ['3. Valid Entry Types', 'ppm_inhouse, ppm_amc, repair, upgradation'],
    ['4. Valid PPM Frequencies', 'none, weekly, monthly, quarterly, semi_annual, annual'],
    ['5. Valid Outcomes', 'operational, minor_observation, critical_fault'],
    ['6. Valid Approval Statuses', 'approved, pending_approval'],
    ['7. Date Format', 'YYYY-MM-DD (e.g., 2026-11-24)'],
    ['8. Valid Disciplines', DISCIPLINE_OPTIONS.join(', ')],
    [''],
    ['Active Building Codes in Database', 'Building Name', 'AMC Contractors'],
    ...buildings.map((b) => [b.code, b.name, b.amcContractors.join(', ')]),
    [''],
    ['Active Technicians', 'Email', 'Trade'],
    ...technicians.map((t) => [t.name, t.email, t.trade]),
  ];
  const wsInst = XLSX.utils.aoa_to_sheet(instructionsRows);
  wsInst['!cols'] = [{ wch: 30 }, { wch: 68 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, wsInst, 'Instructions');

  // Sheet 2: Buildings_Setup
  const buildingsHeader = [
    'Building Code*',
    'Building Name*',
    'Address',
    'Floors Count*',
    'Facility Manager',
    'AMC Contractors (comma-separated)',
  ];
  const buildingsSample =
    buildings.length === 0
      ? [buildingsHeader, ['BLD-01', 'North Corporate Tower', '120 Harbor Plaza', 18, 'Facility Manager', 'CoolAir HVAC LLC, Otis Elevators']]
      : [buildingsHeader];
  const wsBld = XLSX.utils.aoa_to_sheet(buildingsSample);
  wsBld['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 30 }, { wch: 14 }, { wch: 22 }, { wch: 38 }];
  XLSX.utils.book_append_sheet(wb, wsBld, 'Buildings_Setup');

  // Sheet 3: Maintenance_Logs_Import
  const logsHeader = [
    'Building Code*',
    'Entry Type*',
    'Discipline*',
    'Asset Name*',
    'Asset Tag',
    'Location / Floor',
    'Work Title*',
    'Work Notes / Checklist Findings',
    'PPM Frequency',
    'AMC Contractor',
    'Scheduled Date (YYYY-MM-DD)',
    'Completed Date* (YYYY-MM-DD)',
    'Outcome',
    'Parts Used',
    'Labor Hours',
    'Approval Status',
  ];
  const today = new Date().toISOString().slice(0, 10);
  const sampleRows = [
    logsHeader,
    [
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
      today,
      today,
      'operational',
      '2x MERV-13 Pleated Filters',
      2.5,
      'approved',
    ],
    [
      sampleCode,
      'ppm_amc',
      'Elevators & Escalators',
      'Passenger Lift P2',
      'LIFT-P2',
      'Core Shaft B',
      'Quarterly AMC Safety & Brake Check',
      'Vendor completed door interlock calibration and emergency alarm check.',
      'quarterly',
      'Otis Elevators',
      today,
      today,
      'operational',
      'None',
      3.0,
      'approved',
    ],
  ];
  const wsLogs = XLSX.utils.aoa_to_sheet(sampleRows);
  wsLogs['!cols'] = [
    { wch: 16 },
    { wch: 16 },
    { wch: 24 },
    { wch: 22 },
    { wch: 14 },
    { wch: 22 },
    { wch: 32 },
    { wch: 42 },
    { wch: 15 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
    { wch: 24 },
    { wch: 12 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLogs, 'Maintenance_Logs_Import');

  XLSX.writeFile(wb, `Facility_Assist_Import_Template_${today}.xlsx`);
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

export function applyImportDeduplication(
  raw: WorkbookImportPreview,
  ctx: ImportDedupeContext
): WorkbookImportPreview {
  const knownBuildingCodes = new Set(ctx.existingBuildings.map((b) => b.code.trim().toUpperCase()));
  const existingTechBadges = new Set(
    (ctx.existingTechnicians || []).map((t) => t.badgeId.trim().toUpperCase()).filter(Boolean)
  );
  const existingWorkIds = new Set((ctx.existingWorkLogs || []).map((w) => w.id));
  const existingOtIds = new Set((ctx.existingOvertimeLogs || []).map((o) => o.id));
  const existingMeterKeys = new Set(
    (ctx.existingMeters || []).map(
      (m) => `${m.buildingCode.trim().toUpperCase()}::${m.meterNo.trim().toUpperCase()}`
    )
  );
  const existingReadingIds = new Set((ctx.existingReadings || []).map((r) => r.id));
  const existingScheduleIds = new Set((ctx.existingSchedules || []).map((s) => s.id));

  let skippedDuplicates = raw.skippedDuplicates || 0;

  const buildingsToCreate = raw.buildingsToCreate.filter((b) => {
    const k = b.code.trim().toUpperCase();
    if (knownBuildingCodes.has(k)) {
      skippedDuplicates += 1;
      return false;
    }
    knownBuildingCodes.add(k);
    return true;
  });

  const techniciansToCreate = raw.techniciansToCreate.filter((t) => {
    const k = t.badgeId.trim().toUpperCase();
    if (existingTechBadges.has(k)) {
      skippedDuplicates += 1;
      return false;
    }
    existingTechBadges.add(k);
    return true;
  });

  const metersToCreate = raw.metersToCreate.filter((m) => {
    const k = `${m.buildingCode.trim().toUpperCase()}::${m.meterNo.trim().toUpperCase()}`;
    if (existingMeterKeys.has(k)) {
      skippedDuplicates += 1;
      return false;
    }
    existingMeterKeys.add(k);
    return true;
  });

  const workLogsToCreate = raw.workLogsToCreate.filter((w) => {
    if (existingWorkIds.has(w.id)) {
      skippedDuplicates += 1;
      return false;
    }
    existingWorkIds.add(w.id);
    return true;
  });

  const overtimeToCreate = raw.overtimeToCreate.filter((o) => {
    if (existingOtIds.has(o.id)) {
      skippedDuplicates += 1;
      return false;
    }
    existingOtIds.add(o.id);
    return true;
  });

  const readingsToCreate = raw.readingsToCreate.filter((r) => {
    if (existingReadingIds.has(r.id)) {
      skippedDuplicates += 1;
      return false;
    }
    existingReadingIds.add(r.id);
    return true;
  });

  const schedulesToCreate = raw.schedulesToCreate.filter((s) => {
    if (existingScheduleIds.has(s.id)) {
      skippedDuplicates += 1;
      return false;
    }
    existingScheduleIds.add(s.id);
    return true;
  });

  return {
    buildingsToCreate,
    techniciansToCreate,
    logsToCreate: raw.logsToCreate,
    workLogsToCreate,
    overtimeToCreate,
    metersToCreate,
    readingsToCreate,
    schedulesToCreate,
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
  const logsToCreate: ParsedLogRow[] = [];
  const workLogsToCreate: ParsedWorkLogRow[] = [];
  const overtimeToCreate: ParsedOvertimeRow[] = [];
  const metersToCreate: ParsedMeterRow[] = [];
  const readingsToCreate: ParsedReadingRow[] = [];
  const schedulesToCreate: ParsedScheduleRow[] = [];

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
        ignoredItems.push(`${file.name} (${sheetName}) — empty worksheet`);
        continue;
      }

      const rawHeaders = (aoa[0] || []).map((h) => String(h ?? '').trim().toLowerCase());
      const headerSet = new Set(rawHeaders.filter(Boolean));
      const sheetLower = sheetName.toLowerCase();
      const fileLower = file.name.toLowerCase();
      const label = files.length > 1 ? `${file.name} [${sheetName}]` : sheetName;

      // 1. Buildings_Setup
      if (
        sheetLower.includes('building') ||
        (headerSet.has('building code*') && headerSet.has('building name*'))
      ) {
        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const code = clampStr(r[0], MAX_LENGTHS.buildingCode).toUpperCase();
          const name = clampStr(r[1], MAX_LENGTHS.buildingName);
          if (!code || !name) {
            errors.push(`${label} Row ${i + 1}: Building Code and Building Name are required.`);
            continue;
          }
          if (knownCodes.has(code)) continue;
          const floorsRaw = Number(r[3] ?? 1);
          const floorsCount =
            Number.isFinite(floorsRaw) && floorsRaw >= 1 ? Math.min(200, Math.round(floorsRaw)) : 1;
          const contractors = String(r[5] ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 20);
          buildingsToCreate.push({
            rowNum: i + 1,
            code,
            name,
            address: clampStr(r[2], MAX_LENGTHS.address),
            floorsCount,
            facilityManager: clampStr(r[4], MAX_LENGTHS.facilityManager),
            amcContractors: contractors,
          });
          knownCodes.add(code);
        }
        continue;
      }

      // 2. Legacy Team / Lists sheet (exclude sensitive PIN / Admin PIN columns)
      if (
        (headerSet.has('technicians') && (headerSet.has('emp code') || headerSet.has('designation'))) ||
        sheetLower === 'lists'
      ) {
        const idxName = rawHeaders.indexOf('technicians');
        const idxEmp = rawHeaders.indexOf('emp code');
        const idxDesig = rawHeaders.indexOf('designation');
        if (headerSet.has('pin') || headerSet.has('admin pin')) {
          ignoredItems.push(`${label}: PIN & Admin PIN columns ignored (legacy credentials excluded)`);
        }
        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const techName = cleanSingleLine(r[idxName >= 0 ? idxName : 0], MAX_LENGTHS.techName);
          const badgeId = cleanSingleLine(r[idxEmp >= 0 ? idxEmp : 4], MAX_LENGTHS.badgeId).toUpperCase();
          const trade = cleanSingleLine(r[idxDesig >= 0 ? idxDesig : 5], MAX_LENGTHS.trade) || 'General Technician';
          if (!techName || !badgeId) continue;
          techniciansToCreate.push({
            rowNum: i + 1,
            name: techName,
            badgeId,
            trade,
            buildingCode: defaultBuildingCode,
          });
        }
        continue;
      }

      // 3. Utility Meters sheet
      if (
        (headerSet.has('meter no') && headerSet.has('unit/area') && !headerSet.has('reading')) ||
        (headerSet.has('meterno') && !headerSet.has('readingvalue') && !headerSet.has('reading'))
      ) {
        const col = (name: string, fb: number) => {
          const idx = rawHeaders.indexOf(name);
          return idx >= 0 ? idx : fb;
        };
        const iType = col('type', 0);
        const iArea = col('unit/area', 1);
        const iMeter = col('meter no', 2);
        const iAcct = col('account no', 3);
        const iBld = rawHeaders.indexOf('building');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const bCode =
            iBld >= 0
              ? cleanSingleLine(r[iBld], MAX_LENGTHS.buildingCode).toUpperCase() || defaultBuildingCode
              : defaultBuildingCode;
          if (!knownCodes.has(bCode)) pendingAutoBuildings.add(bCode);
          const meterType = normalizeMeterType(String(r[iType] ?? 'Other'));
          const area = cleanSingleLine(r[iArea], MAX_LENGTHS.locationZone) || 'Common';
          const meterNo = cleanSingleLine(r[iMeter], MAX_LENGTHS.meterNo);
          const accountNo = cleanSingleLine(r[iAcct], MAX_LENGTHS.accountNo);
          if (!meterNo) continue;
          metersToCreate.push({
            rowNum: i + 1,
            buildingCode: bCode,
            meterType,
            area,
            meterNo,
            accountNo,
            unit: DEFAULT_METER_UNITS[meterType],
          });
        }
        continue;
      }

      // 4. Daily Work Logs (Complaint / Action / Shift)
      if (headerSet.has('complaint') && headerSet.has('logdate')) {
        const idx = (name: string) => rawHeaders.indexOf(name);
        const iId = idx('id');
        const iBld = idx('building');
        const iDate = idx('logdate');
        const iSup = idx('supervisor');
        const iShift = idx('shift');
        const iWo = idx('wo');
        const iLoc = idx('location');
        const iComp = idx('complaint');
        const iTech = idx('technician');
        const iAct = idx('action');
        const iCat = idx('category');
        const iPrio = idx('priority');
        const iRecv = idx('received');
        const iStart = idx('start');
        const iFin = idx('finish');
        const iMat = idx('materials');
        const iStat = idx('status');
        const iPend = idx('pending');
        const iRem = idx('remarks');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const bCode =
            (iBld >= 0 ? cleanSingleLine(r[iBld], MAX_LENGTHS.buildingCode).toUpperCase() : '') ||
            defaultBuildingCode;
          if (!knownCodes.has(bCode)) pendingAutoBuildings.add(bCode);
          const supName = iSup >= 0 ? cleanSingleLine(r[iSup], MAX_LENGTHS.techName) : '';
          if (supName && !inferredSupervisor) inferredSupervisor = supName;
          const recv = iRecv >= 0 ? cleanSingleLine(r[iRecv], MAX_LENGTHS.timeStr) : '';
          const start = iStart >= 0 ? cleanSingleLine(r[iStart], MAX_LENGTHS.timeStr) : '';
          const finish = iFin >= 0 ? cleanSingleLine(r[iFin], MAX_LENGTHS.timeStr) : '';
          const status = normalizeWorkStatus(iStat >= 0 ? String(r[iStat] ?? '') : 'Pending');

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
            action: iAct >= 0 ? cleanSingleLine(r[iAct], MAX_LENGTHS.action) : '',
            materials: iMat >= 0 ? cleanSingleLine(r[iMat], MAX_LENGTHS.materials) : '',
            receivedTime: recv,
            startTime: start,
            finishTime: finish,
            durationHours: computeWorkLogDurationHours(recv, start, finish),
            status,
            pendingReason: status === 'Completed' || iPend < 0 ? '' : cleanSingleLine(r[iPend], MAX_LENGTHS.pendingReason),
            remarks: iRem >= 0 ? cleanSingleLine(r[iRem], MAX_LENGTHS.remarks) : '',
            technicianName: (iTech >= 0 ? cleanSingleLine(r[iTech], MAX_LENGTHS.techName) : '') || 'Field Technician',
            supervisorName: supName,
          });
        }
        continue;
      }

      // 5. Overtime Sheet
      if (headerSet.has('otdate') && (headerSet.has('otcategorytype') || headerSet.has('from'))) {
        const idx = (name: string) => rawHeaders.indexOf(name);
        const iId = idx('id');
        const iTech = idx('technician');
        const iDate = idx('otdate');
        const iFrom = idx('from');
        const iTo = idx('to');
        const iType = idx('type');
        const iLoc = idx('location');
        const iWork = idx('work');
        const iCat = idx('otcategorytype');
        const iBld = idx('building');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const bCode =
            (iBld >= 0 ? cleanSingleLine(r[iBld], MAX_LENGTHS.buildingCode).toUpperCase() : '') ||
            defaultBuildingCode;
          if (!knownCodes.has(bCode)) pendingAutoBuildings.add(bCode);
          const fromTime = (iFrom >= 0 ? cleanSingleLine(r[iFrom], MAX_LENGTHS.timeStr) : '') || '00:00';
          const toTime = (iTo >= 0 ? cleanSingleLine(r[iTo], MAX_LENGTHS.timeStr) : '') || '00:00';

          overtimeToCreate.push({
            rowNum: i + 1,
            id: sanitizeDocId(iId >= 0 ? r[iId] : '', 'ot', usedOtIds),
            buildingCode: bCode,
            otDate: normalizeExcelDate(iDate >= 0 ? r[iDate] : '') || new Date().toISOString().slice(0, 10),
            fromTime,
            toTime,
            hours: calculateTimeHours(fromTime, toTime),
            otCategoryType: normalizeOtCategory(iCat >= 0 ? String(r[iCat] ?? '') : 'N'),
            workType: (iType >= 0 ? cleanSingleLine(r[iType], MAX_LENGTHS.workType) : '') || 'Overtime Work',
            location: (iLoc >= 0 ? cleanSingleLine(r[iLoc], MAX_LENGTHS.locationZone) : '') || 'Common Area',
            workDescription:
              (iWork >= 0 ? cleanSingleLine(r[iWork], MAX_LENGTHS.workDescription) : '') || 'Overtime duty',
            technicianName: (iTech >= 0 ? cleanSingleLine(r[iTech], MAX_LENGTHS.techName) : '') || 'Technician',
          });
        }
        continue;
      }

      // 6. Utility Readings Sheet
      if (headerSet.has('reading') && headerSet.has('meter') && headerSet.has('date')) {
        const idx = (name: string) => rawHeaders.indexOf(name);
        const iId = idx('id');
        const iTech = idx('technician');
        const iDate = idx('date');
        const iType = idx('type');
        const iArea = idx('area');
        const iMeter = idx('meter');
        const iAcct = idx('account');
        const iReading = idx('reading');
        const iBld = idx('building');

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
            notes: '',
            technicianName: (iTech >= 0 ? cleanSingleLine(r[iTech], MAX_LENGTHS.techName) : '') || 'Technician',
          });
        }
        continue;
      }

      // 7. Tenant Schedules Sheet
      if (headerSet.has('desc') && headerSet.has('location') && headerSet.has('date')) {
        const idx = (name: string) => rawHeaders.indexOf(name);
        const iId = idx('id');
        const iTech = idx('technician');
        const iDate = idx('date');
        const iLoc = idx('location');
        const iCat = idx('category');
        const iDesc = idx('desc');
        const iStat = idx('status');
        const iUpd = idx('updatedat');
        const iFin = idx('finish');
        const iObs = idx('observations');
        const iRem = idx('remarks');
        const iBld = idx('building');

        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
          const bCode =
            (iBld >= 0 ? cleanSingleLine(r[iBld], MAX_LENGTHS.buildingCode).toUpperCase() : '') ||
            defaultBuildingCode;
          if (!knownCodes.has(bCode)) pendingAutoBuildings.add(bCode);
          const maybeStart = iUpd >= 0 ? cleanSingleLine(r[iUpd], 40) : '';
          const maybeEnd = iFin >= 0 ? cleanSingleLine(r[iFin], 40) : '';
          const isTimePair = /^\d{1,2}:\d{2}$/.test(maybeStart) && /^\d{1,2}:\d{2}$/.test(maybeEnd);
          const timeSlot = isTimePair ? `${maybeStart} - ${maybeEnd}` : '';
          const notes = [
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
            tenantName: '',
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

      // 8. Maintenance_Logs_Import (Facility Assist PPM/Repair Template)
      if (
        sheetLower.includes('maintenance') ||
        (headerSet.has('entry type*') && headerSet.has('building code*')) ||
        (!sheetLower.includes('instruction') && !fileLower.includes('technician_logs'))
      ) {
        if (sheetLower.includes('instruction')) {
          continue;
        }
        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i];
          if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;

          const buildingCode = clampStr(r[0], MAX_LENGTHS.buildingCode).toUpperCase();
          const entryType = normalizeEntryType(String(r[1] ?? ''));
          const discipline = clampStr(r[2], MAX_LENGTHS.discipline) || 'General MEP';
          const assetName = clampStr(r[3], MAX_LENGTHS.assetName);
          const assetTag = clampStr(r[4], MAX_LENGTHS.assetTag);
          const locationZone = clampStr(r[5], MAX_LENGTHS.locationZone);
          const title = clampStr(r[6], MAX_LENGTHS.title);
          const workNotes = clampStr(r[7], MAX_LENGTHS.workNotes);
          const ppmFrequency = normalizeFrequency(String(r[8] ?? 'none'));
          const amcContractor = clampStr(r[9], MAX_LENGTHS.amcContractor);
          const scheduledDate = normalizeExcelDate(r[10]);
          const completedDate = normalizeExcelDate(r[11]) || new Date().toISOString().slice(0, 10);
          const outcome = normalizeOutcome(String(r[12] ?? 'operational'));
          const partsUsed = clampStr(r[13], MAX_LENGTHS.partsUsed);
          const laborRaw = Number(r[14] ?? 0);
          const laborHours = Number.isFinite(laborRaw) && laborRaw >= 0 ? Math.min(1000, laborRaw) : 0;
          const rawStatus = String(r[15] ?? '').trim().toLowerCase();
          const approvalStatus: 'approved' | 'pending_approval' =
            rawStatus.includes('pending') ? 'pending_approval' : 'approved';

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
              `${label} Row ${i + 1}: Building Code "${buildingCode}" does not exist in your portfolio or Buildings_Setup sheet.`
            );
            continue;
          }

          logsToCreate.push({
            rowNum: i + 1,
            buildingCode,
            entryType,
            discipline,
            assetName,
            assetTag,
            locationZone,
            title,
            workNotes,
            ppmFrequency,
            amcContractor,
            scheduledDate,
            completedDate,
            outcome,
            partsUsed,
            laborHours,
            approvalStatus,
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
      });
      knownCodes.add(code);
    }
  }

  return applyImportDeduplication(
    {
      buildingsToCreate,
      techniciansToCreate,
      logsToCreate,
      workLogsToCreate,
      overtimeToCreate,
      metersToCreate,
      readingsToCreate,
      schedulesToCreate,
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
    logsToCreate: Array.isArray(data.logsToCreate) ? data.logsToCreate : [],
    workLogsToCreate: Array.isArray(data.workLogsToCreate) ? data.workLogsToCreate : [],
    overtimeToCreate: Array.isArray(data.overtimeToCreate) ? data.overtimeToCreate : [],
    metersToCreate: Array.isArray(data.metersToCreate) ? data.metersToCreate : [],
    readingsToCreate: Array.isArray(data.readingsToCreate) ? data.readingsToCreate : [],
    schedulesToCreate: Array.isArray(data.schedulesToCreate) ? data.schedulesToCreate : [],
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
