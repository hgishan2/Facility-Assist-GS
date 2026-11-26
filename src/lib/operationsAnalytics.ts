import {
  Building,
  EntryType,
  MaintenanceLog,
  OvertimeCategoryType,
  OvertimeLog,
  Technician,
  TenantSchedule,
  UtilityMeter,
  UtilityReading,
  WorkLog,
  WorkOutcome,
} from '../types';

export const STANDARD_DAILY_DUTY_HOURS = 9;
export const MAX_SINGLE_WORK_HOURS = 10;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateTimeHours(fromHHMM: string, toHHMM: string): number {
  if (!fromHHMM || !toHHMM || !fromHHMM.includes(':') || !toHHMM.includes(':')) {
    return 0;
  }
  const [fh, fm] = fromHHMM.split(':').map(Number);
  const [th, tm] = toHHMM.split(':').map(Number);
  if ([fh, fm, th, tm].some((n) => Number.isNaN(n))) return 0;
  const startMin = fh * 60 + fm;
  const endMin = th * 60 + tm;
  const diffMin = ((endMin - startMin) % 1440 + 1440) % 1440;
  const hours = round2(diffMin / 60);
  return hours > 24 ? 0 : hours;
}

export function computeRawTimeSpanHours(
  receivedTime: string,
  startTime: string,
  finishTime: string
): number {
  const startRef = startTime || receivedTime;
  if (!startRef || !finishTime) return 0;
  return calculateTimeHours(startRef, finishTime);
}

export function computeWorkLogDurationHours(
  receivedTime: string,
  startTime: string,
  finishTime: string
): number {
  const h = computeRawTimeSpanHours(receivedTime, startTime, finishTime);
  return h > 16 ? 0 : h;
}

export interface WorkDurationValidation {
  hours: number;
  hasBothTimes: boolean;
  valid: boolean;
  error?: string;
}

export function validateSingleWorkDuration(
  receivedTime: string,
  startTime: string,
  finishTime: string
): WorkDurationValidation {
  const startRef = (startTime || receivedTime || '').trim();
  const finRef = (finishTime || '').trim();
  if (!startRef || !finRef) {
    return { hours: 0, hasBothTimes: false, valid: true };
  }
  const hours = computeRawTimeSpanHours(receivedTime, startRef, finRef);
  if (hours > MAX_SINGLE_WORK_HOURS) {
    return {
      hours,
      hasBothTimes: true,
      valid: false,
      error: `Single work duration (${hours}h) cannot exceed ${MAX_SINGLE_WORK_HOURS} hours (standard technician duty is ${STANDARD_DAILY_DUTY_HOURS} hrs/day). Please check Start/Received and Finish times.`,
    };
  }
  return { hours, hasBothTimes: true, valid: true };
}

export function isoDayDiff(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return 0;
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function addDaysIso(dateIso: string, delta: number): string {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateIso;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function computePreviousPeriodRange(
  fromIso: string,
  toIso: string
): { from: string; to: string; days: number } {
  const days = Math.max(1, isoDayDiff(fromIso, toIso) + 1);
  const prevTo = addDaysIso(fromIso, -1);
  const prevFrom = addDaysIso(fromIso, -days);
  return { from: prevFrom, to: prevTo, days };
}

export function dedupeOvertimeLogs(logs: OvertimeLog[]): OvertimeLog[] {
  const map = new Map<string, OvertimeLog>();
  for (const r of logs) {
    const k = `${r.otDate}_${r.technicianEmail}_${r.fromTime}_${r.toTime}`;
    const prev = map.get(k);
    if (!prev || r.id >= prev.id) {
      map.set(k, r);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.otDate.localeCompare(a.otDate));
}

export interface UtilityStep {
  readingId: string;
  date: string;
  previousDate: string | null;
  readingValue: number;
  previousValue: number | null;
  daysGap: number;
  consumption: number | null;
  ratePerDay: number | null;
  enteredBy: string;
  notes: string;
}

export interface MeterSeries {
  meterId: string;
  buildingCode: string;
  meterType: string;
  area: string;
  meterNo: string;
  accountNo: string;
  unit: string;
  steps: UtilityStep[];
  openingReading: number | null;
  closingReading: number | null;
  totalConsumption: number;
  readingsCount: number;
  avgPerDay: number | null;
}

export interface UtilityAlert {
  severity: 'danger' | 'warning';
  meterId: string;
  buildingCode: string;
  meterType: string;
  area: string;
  meterNo: string;
  date: string;
  message: string;
}

/**
 * Computes per-meter dated step series across all readings up to dateTo,
 * then slices steps within [dateFrom, dateTo] while preserving the immediate
 * prior reading before dateFrom so opening consumption is accurate.
 */
export function buildUtilityMeterSeries(
  allReadings: UtilityReading[],
  meters: UtilityMeter[],
  dateFrom?: string,
  dateTo?: string
): MeterSeries[] {
  // Deduplicate same meterId + readingDate keeping latest entry
  const deduped = new Map<string, UtilityReading>();
  for (const r of allReadings) {
    if (dateTo && r.readingDate > dateTo) continue;
    const key = `${r.meterId}|${r.readingDate}`;
    const prev = deduped.get(key);
    if (!prev || r.id >= prev.id) {
      deduped.set(key, r);
    }
  }

  const byMeter = new Map<string, UtilityReading[]>();
  for (const r of deduped.values()) {
    const arr = byMeter.get(r.meterId) || [];
    arr.push(r);
    byMeter.set(r.meterId, arr);
  }

  const meterMap = new Map<string, UtilityMeter>();
  for (const m of meters) meterMap.set(m.id, m);

  // Include any meters present in readings even if deleted later
  for (const [mId, list] of byMeter.entries()) {
    if (!meterMap.has(mId) && list[0]) {
      meterMap.set(mId, {
        id: mId,
        buildingId: list[0].buildingId,
        buildingCode: list[0].buildingCode,
        meterType: (list[0].meterType as UtilityMeter['meterType']) || 'Other',
        area: list[0].area,
        meterNo: list[0].meterNo,
        accountNo: list[0].accountNo,
        unit: list[0].meterType === 'Electricity' ? 'kWh' : list[0].meterType === 'Water' ? 'm³' : 'Units',
        status: 'active',
        supervisorEmails: [],
        buildingMemberEmails: [],
        createdByUid: '',
      });
    }
  }

  const out: MeterSeries[] = [];

  for (const meter of meterMap.values()) {
    const sorted = [...(byMeter.get(meter.id) || [])].sort((a, b) =>
      a.readingDate.localeCompare(b.readingDate)
    );

    const allSteps: UtilityStep[] = sorted.map((r, idx) => {
      const prev = idx > 0 ? sorted[idx - 1] : null;
      const daysGap = prev ? Math.max(1, isoDayDiff(prev.readingDate, r.readingDate)) : 0;
      const consumption = prev ? round2(r.readingValue - prev.readingValue) : null;
      const ratePerDay = consumption != null && daysGap > 0 ? round2(consumption / daysGap) : null;

      return {
        readingId: r.id,
        date: r.readingDate,
        previousDate: prev ? prev.readingDate : null,
        readingValue: r.readingValue,
        previousValue: prev ? prev.readingValue : null,
        daysGap,
        consumption,
        ratePerDay,
        enteredBy: r.technicianName,
        notes: r.notes || '',
      };
    });

    const rangedSteps = allSteps.filter((s) => {
      if (dateFrom && s.date < dateFrom) return false;
      if (dateTo && s.date > dateTo) return false;
      return true;
    });

    const totalConsumption = round2(
      rangedSteps.reduce((sum, s) => sum + (s.consumption ?? 0), 0)
    );
    const totalDays = rangedSteps.reduce(
      (sum, s) => sum + (s.consumption != null ? s.daysGap : 0),
      0
    );

    const openingReading =
      rangedSteps.length > 0
        ? rangedSteps[0].previousValue ?? rangedSteps[0].readingValue
        : null;
    const closingReading =
      rangedSteps.length > 0 ? rangedSteps[rangedSteps.length - 1].readingValue : null;

    out.push({
      meterId: meter.id,
      buildingCode: meter.buildingCode,
      meterType: meter.meterType,
      area: meter.area,
      meterNo: meter.meterNo,
      accountNo: meter.accountNo,
      unit: meter.unit,
      steps: rangedSteps,
      openingReading,
      closingReading,
      totalConsumption,
      readingsCount: rangedSteps.length,
      avgPerDay: totalDays > 0 ? round2(totalConsumption / totalDays) : null,
    });
  }

  return out.sort((a, b) =>
    `${a.buildingCode}|${a.meterType}|${a.area}`.localeCompare(
      `${b.buildingCode}|${b.meterType}|${b.area}`
    )
  );
}

export function computeUtilityAlerts(
  allReadings: UtilityReading[],
  meters: UtilityMeter[],
  spikeMultiplier: number,
  dateFrom?: string,
  dateTo?: string
): UtilityAlert[] {
  const series = buildUtilityMeterSeries(allReadings, meters, dateFrom, dateTo);
  const alerts: UtilityAlert[] = [];

  for (const s of series) {
    const activeMeter = meters.find((m) => m.id === s.meterId);
    if (s.steps.length === 0) {
      if (activeMeter && activeMeter.status === 'active') {
        alerts.push({
          severity: 'danger',
          meterId: s.meterId,
          buildingCode: s.buildingCode,
          meterType: s.meterType,
          area: s.area,
          meterNo: s.meterNo,
          date: '-',
          message: 'No readings recorded in selected date range',
        });
      }
      continue;
    }

    const positiveRates = s.steps
      .filter((x) => x.consumption != null && x.consumption > 0 && x.daysGap > 0)
      .map((x) => (x.consumption as number) / x.daysGap)
      .sort((a, b) => a - b);
    const medianRate =
      positiveRates.length > 0 ? positiveRates[Math.floor(positiveRates.length / 2)] : 0;

    for (const step of s.steps) {
      if (step.consumption != null && step.consumption < 0) {
        alerts.push({
          severity: 'danger',
          meterId: s.meterId,
          buildingCode: s.buildingCode,
          meterType: s.meterType,
          area: s.area,
          meterNo: s.meterNo,
          date: step.date,
          message: `Reading dropped from ${step.previousValue} to ${step.readingValue}`,
        });
      } else if (step.previousDate && step.daysGap > 1) {
        alerts.push({
          severity: 'warning',
          meterId: s.meterId,
          buildingCode: s.buildingCode,
          meterType: s.meterType,
          area: s.area,
          meterNo: s.meterNo,
          date: step.date,
          message: `${step.daysGap - 1} day(s) skipped before this reading`,
        });
      }

      if (
        step.consumption != null &&
        step.consumption > 0 &&
        positiveRates.length >= 4 &&
        medianRate > 0 &&
        step.consumption / step.daysGap > spikeMultiplier * medianRate
      ) {
        alerts.push({
          severity: 'warning',
          meterId: s.meterId,
          buildingCode: s.buildingCode,
          meterType: s.meterType,
          area: s.area,
          meterNo: s.meterNo,
          date: step.date,
          message: `High consumption spike: ${round2(step.consumption / step.daysGap)} ${s.unit}/day vs median ${round2(medianRate)} ${s.unit}/day`,
        });
      }
    }
  }

  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'danger' ? -1 : 1;
    return b.date.localeCompare(a.date);
  });
}

export interface TechnicianScorecardRow {
  technicianName: string;
  badgeId: string;
  trade: string;
  totalJobs: number;
  completedJobs: number;
  pendingJobs: number;
  completionRate: number;
  avgFinishHours: number | null;
  productiveWorkHours: number;
  ppmLaborHours: number;
  totalProductiveHours: number;
  activeDutyDays: number;
  expectedDutyHours: number;
  dutyUtilizationPct: number;
  avgJobHoursPerDay: number;
  over10hFlaggedJobs: number;
  ppmReports: number;
  utilityReadings: number;
  tenantSchedules: number;
  overtimeEntries: number;
  overtimeHours: number;
  otByCategory: Record<OvertimeCategoryType, number>;
}

function normalizeTechWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) =>
      w === 'muhammad' ? 'mohammad' : w === 'hasan' ? 'hassan' : w
    );
}

function resolveRosterTechnician(
  name: string,
  email: string | undefined,
  technicians: Technician[]
): Technician | undefined {
  const cleanName = name.trim().toLowerCase();
  const cleanEmail = (email || '').trim().toLowerCase();

  // 1. Exact email or exact name match
  const exact = technicians.find(
    (t) =>
      t.name.trim().toLowerCase() === cleanName ||
      (cleanEmail &&
        ((t.authEmail || '').toLowerCase() === cleanEmail ||
          (t.email || '').toLowerCase() === cleanEmail))
  );
  if (exact) return exact;

  // 2. Token-based fuzzy match (handles "Madhab" vs "Madhab Charan", "Mehedi" vs "Mehedi Hasan Liyakat Ali", etc.)
  const words = normalizeTechWords(name);
  if (words.length === 0) return undefined;

  let best: Technician | undefined;
  let bestScore = 0;

  for (const t of technicians) {
    const tWords = normalizeTechWords(t.name);
    if (tWords.length === 0) continue;
    const overlap = words.filter((w) => tWords.includes(w)).length;
    if (overlap === 0) continue;
    const allTokensMatch =
      words.length <= tWords.length
        ? words.every((w) => tWords.includes(w))
        : tWords.every((w) => words.includes(w));
    if (allTokensMatch || overlap >= 2) {
      const score = overlap * 10 - Math.abs(tWords.length - words.length);
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
  }
  return best;
}

export function getEffectiveWorkHours(w: WorkLog): {
  hours: number;
  rawHours: number;
  exceeds10h: boolean;
} {
  const rawHours = computeRawTimeSpanHours(w.receivedTime, w.startTime, w.finishTime);
  const stored = w.durationHours > 0 ? w.durationHours : computeWorkLogDurationHours(w.receivedTime, w.startTime, w.finishTime);
  const exceeds10h = stored > MAX_SINGLE_WORK_HOURS || rawHours > MAX_SINGLE_WORK_HOURS;
  // Cap single historical anomaly contribution at 10h when computing productive duty hours so AM/PM typos (e.g. 23h) do not distort totals
  const hours = stored > MAX_SINGLE_WORK_HOURS ? MAX_SINGLE_WORK_HOURS : round2(stored);
  return { hours, rawHours, exceeds10h };
}

export function computeTechnicianPerformance(params: {
  workLogs: WorkLog[];
  maintenanceLogs: MaintenanceLog[];
  utilityReadings: UtilityReading[];
  overtimeLogs: OvertimeLog[];
  tenantSchedules?: TenantSchedule[];
  technicians: Technician[];
}): TechnicianScorecardRow[] {
  const dedupedOt = dedupeOvertimeLogs(params.overtimeLogs);
  const map = new Map<string, TechnicianScorecardRow>();
  const activeDatesMap = new Map<string, Set<string>>();
  const durationTotals = new Map<string, { sum: number; count: number }>();

  const ensureRow = (name: string, email?: string): { key: string; row: TechnicianScorecardRow } => {
    const rosterMatch = resolveRosterTechnician(name, email, params.technicians);
    const displayName = rosterMatch?.name || name.trim() || 'Unknown';
    const key = displayName.trim().toLowerCase();
    const existing = map.get(key);
    if (existing) return { key, row: existing };

    const row: TechnicianScorecardRow = {
      technicianName: displayName,
      badgeId: rosterMatch?.badgeId || '-',
      trade: rosterMatch?.trade || 'Technician',
      totalJobs: 0,
      completedJobs: 0,
      pendingJobs: 0,
      completionRate: 0,
      avgFinishHours: null,
      productiveWorkHours: 0,
      ppmLaborHours: 0,
      totalProductiveHours: 0,
      activeDutyDays: 0,
      expectedDutyHours: 0,
      dutyUtilizationPct: 0,
      avgJobHoursPerDay: 0,
      over10hFlaggedJobs: 0,
      ppmReports: 0,
      utilityReadings: 0,
      tenantSchedules: 0,
      overtimeEntries: 0,
      overtimeHours: 0,
      otByCategory: { N: 0, WO: 0, PH: 0, 'N. Shift': 0 },
    };
    map.set(key, row);
    activeDatesMap.set(key, new Set<string>());
    return { key, row };
  };

  for (const t of params.technicians) {
    if (t.status === 'active' && t.role === 'technician') {
      ensureRow(t.name, t.authEmail);
    }
  }

  for (const w of params.workLogs) {
    const { key, row } = ensureRow(w.technicianName, w.technicianEmail);
    row.totalJobs += 1;
    if (w.logDate) activeDatesMap.get(key)?.add(w.logDate);

    const { hours, exceeds10h } = getEffectiveWorkHours(w);
    if (exceeds10h) {
      row.over10hFlaggedJobs += 1;
    }
    if (hours > 0) {
      row.productiveWorkHours = round2(row.productiveWorkHours + hours);
    }

    if (w.status === 'Completed') {
      row.completedJobs += 1;
      if (hours > 0) {
        const cur = durationTotals.get(key) || { sum: 0, count: 0 };
        cur.sum += hours;
        cur.count += 1;
        durationTotals.set(key, cur);
      }
    } else {
      row.pendingJobs += 1;
    }
  }

  for (const m of params.maintenanceLogs) {
    const { key, row } = ensureRow(m.submittedByName, m.submittedByEmail);
    row.ppmReports += 1;
    const hrs = Math.max(0, Number(m.laborHours) || 0);
    if (hrs > 0) {
      row.ppmLaborHours = round2(row.ppmLaborHours + hrs);
    }
    if (m.completedDate) activeDatesMap.get(key)?.add(m.completedDate);
  }

  for (const r of params.utilityReadings) {
    const { key, row } = ensureRow(r.technicianName, r.technicianEmail);
    row.utilityReadings += 1;
    if (r.readingDate) activeDatesMap.get(key)?.add(r.readingDate);
  }

  for (const s of params.tenantSchedules || []) {
    if (!s.assignedTechName) continue;
    const { key, row } = ensureRow(s.assignedTechName, s.assignedTechEmail);
    row.tenantSchedules += 1;
    if (s.scheduleDate) activeDatesMap.get(key)?.add(s.scheduleDate);
  }

  for (const ot of dedupedOt) {
    const { row } = ensureRow(ot.technicianName, ot.technicianEmail);
    row.overtimeEntries += 1;
    row.overtimeHours = round2(row.overtimeHours + ot.hours);
    const cat = ot.otCategoryType in row.otByCategory ? ot.otCategoryType : 'N';
    row.otByCategory[cat] = round2(row.otByCategory[cat] + ot.hours);
  }

  const rows = Array.from(map.entries()).map(([key, row]) => {
    const dur = durationTotals.get(key);
    const activeDutyDays = activeDatesMap.get(key)?.size || 0;
    const totalProductiveHours = round2(row.productiveWorkHours + row.ppmLaborHours);
    const expectedDutyHours = round2(activeDutyDays * STANDARD_DAILY_DUTY_HOURS);
    const dutyUtilizationPct =
      expectedDutyHours > 0 ? Math.round((totalProductiveHours / expectedDutyHours) * 100) : 0;
    const avgJobHoursPerDay =
      activeDutyDays > 0 ? round2(totalProductiveHours / activeDutyDays) : 0;

    return {
      ...row,
      totalProductiveHours,
      activeDutyDays,
      expectedDutyHours,
      dutyUtilizationPct,
      avgJobHoursPerDay,
      completionRate: row.totalJobs > 0 ? Math.round((row.completedJobs / row.totalJobs) * 100) : 0,
      avgFinishHours: dur && dur.count > 0 ? round2(dur.sum / dur.count) : null,
    };
  });

  return rows.sort(
    (a, b) =>
      b.totalProductiveHours - a.totalProductiveHours ||
      b.totalJobs + b.ppmReports - (a.totalJobs + a.ppmReports)
  );
}

export function computeOpenJobAgingBuckets(workLogs: WorkLog[], todayIso: string) {
  const buckets = {
    '0-1 days': 0,
    '2-3 days': 0,
    '4-7 days': 0,
    'Over 7 days': 0,
  };
  for (const w of workLogs) {
    if (w.status === 'Completed') continue;
    const age = Math.max(0, isoDayDiff(w.logDate, todayIso));
    if (age <= 1) buckets['0-1 days'] += 1;
    else if (age <= 3) buckets['2-3 days'] += 1;
    else if (age <= 7) buckets['4-7 days'] += 1;
    else buckets['Over 7 days'] += 1;
  }
  return buckets;
}

export function computeRepeatLocations(workLogs: WorkLog[]) {
  const map = new Map<
    string,
    { location: string; buildingCode: string; total: number; open: number; hours: number; categories: Map<string, number> }
  >();
  for (const w of workLogs) {
    const locClean = w.location.trim().toUpperCase() || '-';
    const key = `${w.buildingCode}|${locClean}`;
    const cur = map.get(key) || {
      location: locClean,
      buildingCode: w.buildingCode,
      total: 0,
      open: 0,
      hours: 0,
      categories: new Map<string, number>(),
    };
    cur.total += 1;
    if (w.status !== 'Completed') cur.open += 1;
    cur.hours = round2(cur.hours + getEffectiveWorkHours(w).hours);
    cur.categories.set(w.category, (cur.categories.get(w.category) || 0) + 1);
    map.set(key, cur);
  }

  return Array.from(map.values())
    .map((entry) => {
      const topCat = Array.from(entry.categories.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      return {
        buildingCode: entry.buildingCode,
        location: entry.location,
        total: entry.total,
        open: entry.open,
        hours: entry.hours,
        topCategory: topCat,
        recurring: entry.total >= 3,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface DailyActivityPoint {
  date: string;
  logged: number;
  completed: number;
  pending: number;
  workHours: number;
  ppmCount: number;
  ppmHours: number;
  overtimeHours: number;
  totalProductiveHours: number;
}

export function computeDailyActivitySeries(params: {
  workLogs: WorkLog[];
  maintenanceLogs: MaintenanceLog[];
  overtimeLogs: OvertimeLog[];
  maxPoints?: number;
}): DailyActivityPoint[] {
  const map = new Map<string, DailyActivityPoint>();
  const ensure = (date: string): DailyActivityPoint => {
    const cur = map.get(date);
    if (cur) return cur;
    const pt: DailyActivityPoint = {
      date,
      logged: 0,
      completed: 0,
      pending: 0,
      workHours: 0,
      ppmCount: 0,
      ppmHours: 0,
      overtimeHours: 0,
      totalProductiveHours: 0,
    };
    map.set(date, pt);
    return pt;
  };

  for (const w of params.workLogs) {
    if (!w.logDate) continue;
    const pt = ensure(w.logDate);
    pt.logged += 1;
    if (w.status === 'Completed') pt.completed += 1;
    else pt.pending += 1;
    const { hours } = getEffectiveWorkHours(w);
    pt.workHours = round2(pt.workHours + hours);
  }

  for (const m of params.maintenanceLogs) {
    if (!m.completedDate) continue;
    const pt = ensure(m.completedDate);
    pt.ppmCount += 1;
    pt.ppmHours = round2(pt.ppmHours + Math.max(0, Number(m.laborHours) || 0));
  }

  for (const ot of dedupeOvertimeLogs(params.overtimeLogs)) {
    if (!ot.otDate) continue;
    const pt = ensure(ot.otDate);
    pt.overtimeHours = round2(pt.overtimeHours + ot.hours);
  }

  const limit = params.maxPoints ?? 31;
  return Array.from(map.values())
    .map((pt) => ({
      ...pt,
      totalProductiveHours: round2(pt.workHours + pt.ppmHours),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit);
}

export interface CategoryBreakdownRow {
  category: string;
  total: number;
  completed: number;
  open: number;
  totalHours: number;
  avgHours: number;
  pctOfJobs: number;
}

export function computeCategoryBreakdown(workLogs: WorkLog[]): CategoryBreakdownRow[] {
  const map = new Map<string, { total: number; completed: number; open: number; totalHours: number; timedCount: number }>();
  for (const w of workLogs) {
    const cat = w.category.trim() || 'General Maintenance';
    const cur = map.get(cat) || { total: 0, completed: 0, open: 0, totalHours: 0, timedCount: 0 };
    cur.total += 1;
    if (w.status === 'Completed') cur.completed += 1;
    else cur.open += 1;
    const { hours } = getEffectiveWorkHours(w);
    if (hours > 0) {
      cur.totalHours = round2(cur.totalHours + hours);
      cur.timedCount += 1;
    }
    map.set(cat, cur);
  }

  const totalAll = Math.max(1, workLogs.length);
  return Array.from(map.entries())
    .map(([category, v]) => ({
      category,
      total: v.total,
      completed: v.completed,
      open: v.open,
      totalHours: v.totalHours,
      avgHours: v.timedCount > 0 ? round2(v.totalHours / v.timedCount) : 0,
      pctOfJobs: Math.round((v.total / totalAll) * 100),
    }))
    .sort((a, b) => b.total - a.total || b.totalHours - a.totalHours);
}

export function computeShiftAndPriorityStats(workLogs: WorkLog[]) {
  const shifts = {
    Day: { count: 0, completed: 0, hours: 0 },
    Night: { count: 0, completed: 0, hours: 0 },
  };
  const priorities = {
    Normal: { count: 0, completed: 0, hours: 0, timed: 0, avgHours: 0 },
    Urgent: { count: 0, completed: 0, hours: 0, timed: 0, avgHours: 0 },
    Emergency: { count: 0, completed: 0, hours: 0, timed: 0, avgHours: 0 },
  };

  for (const w of workLogs) {
    const { hours } = getEffectiveWorkHours(w);
    const sKey = w.shift === 'Night' ? 'Night' : 'Day';
    shifts[sKey].count += 1;
    if (w.status === 'Completed') shifts[sKey].completed += 1;
    shifts[sKey].hours = round2(shifts[sKey].hours + hours);

    const pKey = w.priority in priorities ? w.priority : 'Normal';
    priorities[pKey].count += 1;
    if (w.status === 'Completed') priorities[pKey].completed += 1;
    if (hours > 0) {
      priorities[pKey].hours = round2(priorities[pKey].hours + hours);
      priorities[pKey].timed += 1;
    }
  }

  (['Normal', 'Urgent', 'Emergency'] as const).forEach((k) => {
    priorities[k].avgHours =
      priorities[k].timed > 0 ? round2(priorities[k].hours / priorities[k].timed) : 0;
  });

  return { shifts, priorities };
}

export function computeMaintenanceBreakdown(logs: MaintenanceLog[]) {
  const byType: Record<EntryType, { count: number; hours: number }> = {
    ppm_inhouse: { count: 0, hours: 0 },
    ppm_amc: { count: 0, hours: 0 },
    repair: { count: 0, hours: 0 },
    upgradation: { count: 0, hours: 0 },
  };
  const byOutcome: Record<WorkOutcome, number> = {
    operational: 0,
    minor_observation: 0,
    critical_fault: 0,
  };
  const byApproval = {
    approved: 0,
    pending_approval: 0,
    revision_requested: 0,
    rejected: 0,
  };
  const disciplineMap = new Map<string, { count: number; hours: number }>();

  let totalLaborHours = 0;
  for (const m of logs) {
    const hrs = Math.max(0, Number(m.laborHours) || 0);
    totalLaborHours = round2(totalLaborHours + hrs);
    if (m.entryType in byType) {
      byType[m.entryType].count += 1;
      byType[m.entryType].hours = round2(byType[m.entryType].hours + hrs);
    }
    if (m.outcome in byOutcome) {
      byOutcome[m.outcome] += 1;
    }
    if (m.approvalStatus in byApproval) {
      byApproval[m.approvalStatus] += 1;
    }
    const disc = m.discipline?.trim() || 'General';
    const dCur = disciplineMap.get(disc) || { count: 0, hours: 0 };
    dCur.count += 1;
    dCur.hours = round2(dCur.hours + hrs);
    disciplineMap.set(disc, dCur);
  }

  const byDiscipline = Array.from(disciplineMap.entries())
    .map(([discipline, v]) => ({ discipline, ...v }))
    .sort((a, b) => b.count - a.count || b.hours - a.hours);

  return {
    total: logs.length,
    totalLaborHours,
    byType,
    byOutcome,
    byApproval,
    byDiscipline,
  };
}

export function computeTenantScheduleSummary(schedules: TenantSchedule[]) {
  const counts = {
    Completed: 0,
    'In Progress': 0,
    Pending: 0,
    Cancelled: 0,
  };
  const byCategoryMap = new Map<string, { total: number; completed: number }>();

  for (const s of schedules) {
    if (s.status in counts) {
      counts[s.status] += 1;
    }
    const cat = s.category?.trim() || 'Other';
    const cur = byCategoryMap.get(cat) || { total: 0, completed: 0 };
    cur.total += 1;
    if (s.status === 'Completed') cur.completed += 1;
    byCategoryMap.set(cat, cur);
  }

  const total = schedules.length;
  const completionRate = total > 0 ? Math.round((counts.Completed / total) * 100) : 0;
  const byCategory = Array.from(byCategoryMap.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total);

  return { total, counts, completionRate, byCategory };
}

export interface BuildingComparisonRow {
  buildingId: string;
  buildingCode: string;
  buildingName: string;
  totalJobs: number;
  completedJobs: number;
  openJobs: number;
  completionRate: number;
  workHours: number;
  ppmCount: number;
  ppmHours: number;
  totalProductiveHours: number;
  overtimeHours: number;
  readingsCount: number;
  schedulesCount: number;
}

export function computeBuildingComparison(params: {
  buildings: Building[];
  workLogs: WorkLog[];
  maintenanceLogs: MaintenanceLog[];
  overtimeLogs: OvertimeLog[];
  utilityReadings: UtilityReading[];
  tenantSchedules: TenantSchedule[];
}): BuildingComparisonRow[] {
  const map = new Map<string, BuildingComparisonRow>();
  const ensure = (id: string, code: string, name: string): BuildingComparisonRow => {
    const cur = map.get(id);
    if (cur) return cur;
    const row: BuildingComparisonRow = {
      buildingId: id,
      buildingCode: code,
      buildingName: name,
      totalJobs: 0,
      completedJobs: 0,
      openJobs: 0,
      completionRate: 0,
      workHours: 0,
      ppmCount: 0,
      ppmHours: 0,
      totalProductiveHours: 0,
      overtimeHours: 0,
      readingsCount: 0,
      schedulesCount: 0,
    };
    map.set(id, row);
    return row;
  };

  for (const b of params.buildings) {
    ensure(b.id, b.code, b.name);
  }

  for (const w of params.workLogs) {
    const row = ensure(w.buildingId, w.buildingCode, w.buildingName);
    row.totalJobs += 1;
    if (w.status === 'Completed') row.completedJobs += 1;
    else row.openJobs += 1;
    row.workHours = round2(row.workHours + getEffectiveWorkHours(w).hours);
  }

  for (const m of params.maintenanceLogs) {
    const row = ensure(m.buildingId, m.buildingCode, m.buildingName);
    row.ppmCount += 1;
    row.ppmHours = round2(row.ppmHours + Math.max(0, Number(m.laborHours) || 0));
  }

  for (const ot of dedupeOvertimeLogs(params.overtimeLogs)) {
    const row = ensure(ot.buildingId, ot.buildingCode, ot.buildingName);
    row.overtimeHours = round2(row.overtimeHours + ot.hours);
  }

  for (const r of params.utilityReadings) {
    const row = ensure(r.buildingId, r.buildingCode, r.buildingCode);
    row.readingsCount += 1;
  }

  for (const s of params.tenantSchedules) {
    const row = ensure(s.buildingId, s.buildingCode, s.buildingName);
    row.schedulesCount += 1;
  }

  return Array.from(map.values())
    .map((r) => ({
      ...r,
      totalProductiveHours: round2(r.workHours + r.ppmHours),
      completionRate: r.totalJobs > 0 ? Math.round((r.completedJobs / r.totalJobs) * 100) : 0,
    }))
    .sort((a, b) => b.totalProductiveHours - a.totalProductiveHours || b.totalJobs - a.totalJobs);
}

export function computeOvertimeWorkTypeDrivers(overtimeLogs: OvertimeLog[]) {
  const deduped = dedupeOvertimeLogs(overtimeLogs);
  const byReason = new Map<string, { workType: string; entries: number; hours: number }>();
  const byDate = new Map<string, number>();

  for (const ot of deduped) {
    const label = (ot.workType || 'General Duty').trim();
    const cur = byReason.get(label) || { workType: label, entries: 0, hours: 0 };
    cur.entries += 1;
    cur.hours = round2(cur.hours + ot.hours);
    byReason.set(label, cur);

    if (ot.otDate) {
      byDate.set(ot.otDate, round2((byDate.get(ot.otDate) || 0) + ot.hours));
    }
  }

  const topDrivers = Array.from(byReason.values()).sort((a, b) => b.hours - a.hours);
  const dailySeries = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-20)
    .map(([date, hours]) => ({ date, hours }));

  return { topDrivers, dailySeries };
}

export function computeFlaggedOver10hWorkLogs(workLogs: WorkLog[]) {
  return workLogs
    .map((w) => {
      const info = getEffectiveWorkHours(w);
      return { log: w, rawHours: info.rawHours, exceeds10h: info.exceeds10h };
    })
    .filter((item) => item.exceeds10h)
    .sort((a, b) => b.rawHours - a.rawHours);
}

