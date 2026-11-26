import { MaintenanceLog, PpmFrequency } from '../types';

export interface ActivePpmSchedule {
  scheduleKey: string;
  latestLog: MaintenanceLog;
  nextDueDate: string;
  daysUntilDue: number;
  urgency: 'overdue' | 'due_soon' | 'upcoming';
}

function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;

  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(Date.UTC(targetYear, normalizedMonth, clampedDay));
}

export function computeNextPpmDueDate(
  completedDateIso: string,
  frequency: PpmFrequency
): string {
  if (!completedDateIso || frequency === 'none') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(completedDateIso.trim());
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const base = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(base.getTime())) return '';

  let next: Date;
  switch (frequency) {
    case 'weekly':
      next = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      next = addMonthsClamped(base, 1);
      break;
    case 'quarterly':
      next = addMonthsClamped(base, 3);
      break;
    case 'semi_annual':
      next = addMonthsClamped(base, 6);
      break;
    case 'annual':
      next = addMonthsClamped(base, 12);
      break;
    default:
      return '';
  }

  return next.toISOString().slice(0, 10);
}

export function getDaysUntilDue(
  nextDueDateIso: string,
  referenceDateIso: string = new Date().toISOString().slice(0, 10)
): number | null {
  if (!nextDueDateIso) return null;
  const due = new Date(`${nextDueDateIso}T00:00:00Z`);
  const ref = new Date(`${referenceDateIso}T00:00:00Z`);
  if (Number.isNaN(due.getTime()) || Number.isNaN(ref.getTime())) return null;
  return Math.round((due.getTime() - ref.getTime()) / (24 * 60 * 60 * 1000));
}

export function formatDueDeltaLabel(daysUntilDue: number): string {
  if (daysUntilDue < 0) {
    const abs = Math.abs(daysUntilDue);
    return `Overdue by ${abs} day${abs === 1 ? '' : 's'}`;
  }
  if (daysUntilDue === 0) return 'Due today';
  if (daysUntilDue === 1) return 'Due tomorrow';
  return `Due in ${daysUntilDue} days`;
}

export function buildActivePpmSchedules(
  logs: MaintenanceLog[],
  referenceDateIso: string = new Date().toISOString().slice(0, 10)
): ActivePpmSchedule[] {
  const latestByAsset = new Map<string, MaintenanceLog>();

  for (const log of logs) {
    if (log.entryType !== 'ppm_inhouse' && log.entryType !== 'ppm_amc') continue;
    if (log.ppmFrequency === 'none') continue;
    if (log.approvalStatus === 'rejected') continue;

    const assetKeyPart = (log.assetTag || log.assetName).trim().toLowerCase();
    const key = `${log.buildingId}::${log.entryType}::${log.discipline.toLowerCase()}::${assetKeyPart}`;

    const existing = latestByAsset.get(key);
    if (!existing) {
      latestByAsset.set(key, log);
    } else {
      // Prefer newer completedDate; tie-break by approved status
      if (log.completedDate > existing.completedDate) {
        latestByAsset.set(key, log);
      } else if (
        log.completedDate === existing.completedDate &&
        log.approvalStatus === 'approved' &&
        existing.approvalStatus !== 'approved'
      ) {
        latestByAsset.set(key, log);
      }
    }
  }

  const schedules: ActivePpmSchedule[] = [];
  for (const [key, log] of latestByAsset.entries()) {
    const nextDue = log.nextDueDate || computeNextPpmDueDate(log.completedDate, log.ppmFrequency);
    if (!nextDue) continue;
    const days = getDaysUntilDue(nextDue, referenceDateIso);
    if (days === null) continue;

    const urgency: ActivePpmSchedule['urgency'] =
      days < 0 ? 'overdue' : days <= 14 ? 'due_soon' : 'upcoming';

    schedules.push({
      scheduleKey: key,
      latestLog: log,
      nextDueDate: nextDue,
      daysUntilDue: days,
      urgency,
    });
  }

  return schedules.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}
