export type UserRole = 'admin' | 'supervisor' | 'technician';

export type TechAuthMode = 'badge_passcode' | 'username_password' | 'google';

export type EntryType = 'ppm_inhouse' | 'ppm_amc' | 'repair' | 'upgradation';

export type PpmFrequency =
  | 'none'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual';

export type WorkOutcome = 'operational' | 'minor_observation' | 'critical_fault';

export type ApprovalStatus =
  | 'pending_approval'
  | 'approved'
  | 'revision_requested'
  | 'rejected';

export type AttachmentKind = 'before_photo' | 'after_photo' | 'amc_scan';

export type LogSource = 'portal' | 'excel_import' | 'offline_sync';

export interface Building {
  id: string;
  code: string;
  name: string;
  address: string;
  floorsCount: number;
  facilityManager: string;
  amcContractors: string[];
  status: 'active' | 'inactive';
  supervisorEmails: string[];
  memberEmails: string[];
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Technician {
  id: string;
  name: string;
  email: string;
  username?: string;
  authMode: TechAuthMode;
  authEmail: string;
  authUid: string;
  badgeId: string;
  trade: string;
  phone: string;
  role: UserRole;
  status: 'active' | 'inactive';
  assignedBuildingIds: string[];
  supervisorEmails: string[];
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AccessGrant {
  email: string;
  username?: string;
  authMode: TechAuthMode;
  authEmail: string;
  authUid: string;
  techId: string;
  name: string;
  badgeId: string;
  trade: string;
  role: UserRole;
  status: 'active' | 'inactive';
  assignedBuildingIds: string[];
  supervisorEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Asset {
  id: string;
  buildingId: string;
  buildingCode: string;
  buildingName: string;
  assetTag: string;
  assetName: string;
  discipline: string;
  locationZone: string;
  manufacturerModel: string;
  serialNumber: string;
  ppmFrequency: PpmFrequency;
  status: 'active' | 'inactive';
  supervisorEmails: string[];
  buildingMemberEmails: string[];
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WorkAttachment {
  id: string;
  logId: string;
  buildingId: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/webp' | 'image/png' | 'application/pdf';
  dataUrl: string;
  caption: string;
  uploadedByUid: string;
  uploadedByEmail: string;
  supervisorEmails: string[];
  buildingMemberEmails: string[];
  createdAt?: unknown;
}

export interface MaintenanceLog {
  id: string;
  buildingId: string;
  buildingCode: string;
  buildingName: string;
  entryType: EntryType;
  discipline: string;
  assetName: string;
  assetTag: string;
  locationZone: string;
  title: string;
  workNotes: string;
  ppmFrequency: PpmFrequency;
  nextDueDate: string;
  amcContractor: string;
  scheduledDate: string;
  completedDate: string;
  outcome: WorkOutcome;
  partsUsed: string;
  laborHours: number;
  beforePhotoIds: string[];
  afterPhotoIds: string[];
  scannedReportIds: string[];
  approvalStatus: ApprovalStatus;
  submittedByUid: string;
  submittedByName: string;
  submittedByEmail: string;
  submittedByRole: UserRole;
  reviewNotes: string;
  reviewedByUid: string;
  reviewedByName: string;
  reviewedAtIso: string;
  supervisorEmails: string[];
  buildingMemberEmails: string[];
  source: LogSource;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PendingAttachmentDraft {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/webp' | 'image/png' | 'application/pdf';
  dataUrl: string;
  caption: string;
}

export interface OfflineQueueItem {
  queueId: string;
  action: 'create_log' | 'resubmit_log';
  logPayload: Omit<MaintenanceLog, 'createdAt' | 'updatedAt'>;
  attachments: PendingAttachmentDraft[];
  queuedAtIso: string;
  attempts: number;
  lastError?: string;
}

export type WorkShift = 'Day' | 'Night';
export type WorkPriority = 'Normal' | 'Urgent' | 'Emergency';
export type WorkStatus = 'Completed' | 'Pending' | 'On Hold';

export interface WorkLog {
  id: string;
  buildingId: string;
  buildingCode: string;
  buildingName: string;
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
  technicianUid: string;
  technicianName: string;
  technicianEmail: string;
  supervisorName: string;
  supervisorEmails: string[];
  buildingMemberEmails: string[];
  source: 'portal' | 'offline_sync';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type OvertimeCategoryType = 'N' | 'WO' | 'PH' | 'N. Shift';

export interface OvertimeLog {
  id: string;
  buildingId: string;
  buildingCode: string;
  buildingName: string;
  otDate: string;
  fromTime: string;
  toTime: string;
  hours: number;
  otCategoryType: OvertimeCategoryType;
  workType: string;
  location: string;
  workDescription: string;
  approvalStatus: 'pending_approval' | 'approved' | 'rejected';
  reviewNotes: string;
  technicianUid: string;
  technicianName: string;
  technicianBadgeId: string;
  technicianEmail: string;
  supervisorEmails: string[];
  buildingMemberEmails: string[];
  source: 'portal' | 'offline_sync';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type UtilityMeterType = 'Electricity' | 'Water' | 'Chilled Water' | 'Gas' | 'Other';

export interface UtilityMeter {
  id: string;
  buildingId: string;
  buildingCode: string;
  meterType: UtilityMeterType;
  area: string;
  meterNo: string;
  accountNo: string;
  unit: string;
  status: 'active' | 'inactive';
  supervisorEmails: string[];
  buildingMemberEmails: string[];
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UtilityReading {
  id: string;
  buildingId: string;
  buildingCode: string;
  meterId: string;
  meterType: string;
  area: string;
  meterNo: string;
  accountNo: string;
  readingDate: string;
  readingValue: number;
  notes: string;
  technicianUid: string;
  technicianName: string;
  technicianEmail: string;
  supervisorEmails: string[];
  buildingMemberEmails: string[];
  source: 'portal' | 'offline_sync';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type TenantScheduleStatus = 'Pending' | 'In Progress' | 'Completed' | 'Cancelled';

export interface TenantSchedule {
  id: string;
  buildingId: string;
  buildingCode: string;
  buildingName: string;
  scheduleDate: string;
  timeSlot: string;
  unitOrLocation: string;
  tenantName: string;
  category: string;
  description: string;
  assignedTechUid: string;
  assignedTechName: string;
  assignedTechEmail: string;
  status: TenantScheduleStatus;
  completionNotes: string;
  createdByUid: string;
  createdByName: string;
  supervisorEmails: string[];
  buildingMemberEmails: string[];
  source: 'portal' | 'offline_sync';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type NotificationSeverity = 'critical' | 'urgent' | 'advisory';
export type NotificationStatus = 'active' | 'resolved';

export interface MaintenanceNotification {
  id: string;
  buildingId: string;
  buildingCode: string;
  buildingName: string;
  severity: NotificationSeverity;
  category: string;
  title: string;
  message: string;
  locationZone: string;
  status: NotificationStatus;
  acknowledgedByEmails: string[];
  createdByUid: string;
  createdByName: string;
  createdByEmail: string;
  resolvedByName: string;
  resolvedAtIso: string;
  expiresAtDate: string;
  supervisorEmails: string[];
  buildingMemberEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type OfflineOpKind = 'work_log' | 'overtime_log' | 'utility_reading' | 'tenant_schedule';

export interface OfflineOpItem {
  queueId: string;
  kind: OfflineOpKind;
  collectionName: 'work_logs' | 'overtime_logs' | 'utility_readings' | 'tenant_schedules';
  docId: string;
  payload: Record<string, unknown>;
  queuedAtIso: string;
  attempts: number;
  lastError?: string;
}

export const ADMIN_USERNAME = 'admin';
export const ADMIN_AUTH_EMAIL = 'admin@siteledger.internal';

export const ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export const MAX_LENGTHS = {
  id: 128,
  buildingCode: 24,
  buildingName: 120,
  address: 240,
  facilityManager: 120,
  techName: 120,
  username: 64,
  email: 160,
  badgeId: 32,
  trade: 64,
  phone: 40,
  discipline: 64,
  assetName: 140,
  assetTag: 64,
  manufacturerModel: 140,
  serialNumber: 80,
  locationZone: 120,
  title: 180,
  workNotes: 3000,
  amcContractor: 140,
  dateStr: 20,
  timeStr: 10,
  woNumber: 40,
  complaint: 1500,
  action: 1500,
  materials: 500,
  pendingReason: 500,
  remarks: 1500,
  workType: 120,
  workDescription: 1500,
  meterNo: 64,
  accountNo: 64,
  meterUnit: 24,
  timeSlot: 40,
  completionNotes: 1000,
  notificationMessage: 1500,
  partsUsed: 500,
  reviewNotes: 1000,
  fileName: 160,
  caption: 200,
  dataUrl: 450000,
} as const;

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  ppm_inhouse: 'In-House PPM',
  ppm_amc: 'AMC Contractor PPM',
  repair: 'Repair Work',
  upgradation: 'Upgradation Work',
};

export const FREQUENCY_LABELS: Record<PpmFrequency, string> = {
  none: 'N/A (Ad-hoc)',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annual: 'Semi-Annual',
  annual: 'Annual',
};

export const OUTCOME_LABELS: Record<WorkOutcome, string> = {
  operational: 'Operational / Passed',
  minor_observation: 'Minor Observation',
  critical_fault: 'Critical Fault',
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending_approval: 'Pending Review',
  approved: 'Approved',
  revision_requested: 'Revision Requested',
  rejected: 'Rejected',
};

export const DISCIPLINE_OPTIONS = [
  'HVAC & Chillers',
  'Electrical & Switchgear',
  'Plumbing & Drainage',
  'Fire & Life Safety',
  'Elevators & Escalators',
  'BMS & ELV Systems',
  'Generators & UPS',
  'Civil & Architectural',
  'Water Treatment & Pumps',
  'General MEP',
] as const;

export const TRADE_OPTIONS = [
  'HVAC Technician',
  'Electrical Technician',
  'Plumbing Technician',
  'Fire & Safety Specialist',
  'BMS / ELV Engineer',
  'Multi-Skilled MEP Technician',
  'Civil Maintenance',
  'Facility Supervisor',
] as const;

export const WORK_CATEGORIES = [
  'Electrical',
  'Plumbing',
  'Air Conditioning',
  'Civil / Painting',
  'Carpentry',
  'Fire & Life Safety',
  'General Maintenance',
  'PPM',
  'Other',
] as const;

export const WORK_PRIORITIES: WorkPriority[] = ['Normal', 'Urgent', 'Emergency'];

export const WORK_STATUSES: WorkStatus[] = ['Completed', 'Pending', 'On Hold'];

export const OT_CATEGORY_LABELS: Record<OvertimeCategoryType, string> = {
  N: 'N — Normal Overtime',
  WO: 'WO — Weekly Off',
  PH: 'PH — Public Holiday',
  'N. Shift': 'N. Shift — Night Shift',
};

export const METER_TYPES: UtilityMeterType[] = [
  'Electricity',
  'Water',
  'Chilled Water',
  'Gas',
  'Other',
];

export const DEFAULT_METER_UNITS: Record<UtilityMeterType, string> = {
  Electricity: 'kWh',
  Water: 'm³',
  'Chilled Water': 'TRh',
  Gas: 'm³',
  Other: 'Units',
};

export const NOTIFICATION_SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  critical: 'Critical Emergency',
  urgent: 'Urgent Action',
  advisory: 'Team Advisory',
};

export const NOTIFICATION_CATEGORIES = [
  'Power & Electrical',
  'HVAC & Chiller',
  'Water & Plumbing',
  'Fire & Life Safety',
  'Elevator & Access',
  'Safety & Shutdown',
  'General Building Alert',
] as const;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeUsername(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

export function supervisorToAuthEmail(username: string): string {
  const clean = normalizeUsername(username);
  if (!clean || clean === ADMIN_USERNAME) {
    return ADMIN_AUTH_EMAIL;
  }
  const slug = clean.replace(/[^a-z0-9_-]/g, '_');
  return `sup.${slug}@siteledger.internal`;
}

export function badgeToAuthEmail(badgeId: string): string {
  const slug = badgeId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  return `${slug}@siteledger.internal`;
}

export function emailToGrantId(email: string): string {
  return normalizeEmail(email).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export function generateSafeId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'doc';
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${cleanPrefix}_${ts}_${rand}`;
}

export function clampStr(value: unknown, maxLen: number): string {
  const s = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}
