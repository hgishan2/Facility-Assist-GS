import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  OperationType,
  provisionUserAuthAccount,
} from './firebase';
import {
  cacheAttachmentLocally,
  enqueueOfflineLog,
  enqueueOfflineOp,
  getCachedAttachment,
  getOfflineOpsQueue,
  getOfflineQueue,
  removeOfflineOpItem,
  removeOfflineQueueItem,
  updateOfflineOpError,
  updateOfflineQueueError,
} from './offlineQueue';
import { computeNextPpmDueDate } from './ppmSchedule';
import {
  calculateTimeHours,
  computeWorkLogDurationHours,
  validateSingleWorkDuration,
} from './operationsAnalytics';
import { sanitizeTagSlug } from './qrUtils';
import type {
  ParsedBuildingRow,
  ParsedLogRow,
  ParsedMeterRow,
  ParsedOvertimeRow,
  ParsedReadingRow,
  ParsedScheduleRow,
  ParsedTechnicianRow,
  ParsedWorkLogRow,
} from './excelUtils';
import {
  ADMIN_AUTH_EMAIL,
  ADMIN_USERNAME,
  ApprovalStatus,
  Asset,
  badgeToAuthEmail,
  Building,
  clampStr,
  DEFAULT_METER_UNITS,
  emailToGrantId,
  generateSafeId,
  MaintenanceLog,
  MaintenanceNotification,
  MAX_LENGTHS,
  normalizeEmail,
  normalizeUsername,
  NotificationSeverity,
  OfflineQueueItem,
  OvertimeCategoryType,
  OvertimeLog,
  PendingAttachmentDraft,
  PpmFrequency,
  supervisorToAuthEmail,
  TechAuthMode,
  Technician,
  TenantSchedule,
  TenantScheduleStatus,
  UserRole,
  UtilityMeter,
  UtilityMeterType,
  UtilityReading,
  WorkAttachment,
  WorkLog,
  WorkPriority,
  WorkShift,
  WorkStatus,
} from '../types';

export function buildBuildingSupervisorEmails(
  ownerEmail?: string | null,
  existingEmails?: string[]
): string[] {
  const set = new Set<string>([ADMIN_AUTH_EMAIL]);
  if (ownerEmail) {
    set.add(normalizeEmail(ownerEmail));
  } else if (existingEmails && existingEmails.length > 0) {
    for (const e of existingEmails) {
      if (e) set.add(normalizeEmail(e));
    }
  }
  return Array.from(set).filter(Boolean).slice(0, 10);
}

export function buildBuildingMemberEmails(
  buildingId: string,
  technicians: Technician[],
  supervisorEmails: string[]
): string[] {
  const normalizedSups = supervisorEmails.map(normalizeEmail).filter(Boolean);
  const set = new Set<string>(normalizedSups);
  for (const t of technicians) {
    if (
      t.status === 'active' &&
      t.role === 'technician' &&
      t.assignedBuildingIds.includes(buildingId)
    ) {
      const canonical = normalizeEmail(t.authEmail || t.email);
      if (canonical) set.add(canonical);
    }
  }
  return Array.from(set).slice(0, 50);
}

export async function saveBuilding(
  input: {
    id?: string;
    code: string;
    name: string;
    address: string;
    floorsCount: number;
    facilityManager: string;
    amcContractors: string[];
    status: 'active' | 'inactive';
    ownerSupervisorEmail?: string;
  },
  ctx: {
    uid: string;
    email: string;
    role: UserRole;
    technicians: Technician[];
    existing?: Building | null;
  }
): Promise<string> {
  const id = input.id || generateSafeId('bld');
  const ownerEmail =
    ctx.role === 'admin' && input.ownerSupervisorEmail
      ? normalizeEmail(input.ownerSupervisorEmail)
      : ctx.existing && ctx.role === 'admin' && !input.ownerSupervisorEmail
      ? undefined
      : normalizeEmail(ctx.email);

  const supervisorEmails = buildBuildingSupervisorEmails(
    ownerEmail,
    ctx.existing?.supervisorEmails
  );
  const memberEmails = buildBuildingMemberEmails(id, ctx.technicians, supervisorEmails);

  const payload = {
    id,
    code: clampStr(input.code, MAX_LENGTHS.buildingCode).toUpperCase(),
    name: clampStr(input.name, MAX_LENGTHS.buildingName),
    address: clampStr(input.address, MAX_LENGTHS.address),
    floorsCount: Math.max(1, Math.min(200, Math.round(Number(input.floorsCount) || 1))),
    facilityManager: clampStr(input.facilityManager, MAX_LENGTHS.facilityManager),
    amcContractors: input.amcContractors.map((c) => clampStr(c, 80)).filter(Boolean).slice(0, 20),
    status: input.status,
    supervisorEmails,
    memberEmails,
  };

  const path = `buildings/${id}`;
  try {
    if (ctx.existing) {
      await updateDoc(doc(db, 'buildings', id), {
        code: payload.code,
        name: payload.name,
        address: payload.address,
        floorsCount: payload.floorsCount,
        facilityManager: payload.facilityManager,
        amcContractors: payload.amcContractors,
        status: payload.status,
        supervisorEmails: payload.supervisorEmails,
        memberEmails: payload.memberEmails,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'buildings', id), {
        ...payload,
        createdByUid: ctx.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, ctx.existing ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteBuilding(buildingId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'buildings', buildingId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `buildings/${buildingId}`);
  }
}

export async function claimDefaultAdminGrant(uid: string): Promise<void> {
  const grantId = emailToGrantId(ADMIN_AUTH_EMAIL);
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'system_config', 'admin_lock'), {
      claimed: true,
      adminUid: uid,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'access_grants', grantId), {
      email: ADMIN_AUTH_EMAIL,
      username: ADMIN_USERNAME,
      authMode: 'username_password',
      authEmail: ADMIN_AUTH_EMAIL,
      authUid: uid,
      techId: 'admin_root',
      name: 'System Admin',
      badgeId: 'ADMIN',
      trade: 'System Administrator',
      role: 'admin',
      status: 'active',
      assignedBuildingIds: [],
      supervisorEmails: [ADMIN_AUTH_EMAIL],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `access_grants/${grantId}`);
  }
}

export async function saveSupervisorAccount(
  input: {
    id?: string;
    name: string;
    username: string;
    password?: string;
    email?: string;
    trade: string;
    phone: string;
    status: 'active' | 'inactive';
  },
  ctx: {
    uid: string;
    existing?: Technician | null;
  }
): Promise<{
  supervisorId: string;
  username: string;
  authStatus: 'created' | 'already_exists' | 'provider_disabled' | 'unchanged';
}> {
  const cleanUsername = normalizeUsername(input.username);
  if (cleanUsername.length < 3) {
    throw new Error('Supervisor username must be at least 3 characters (letters, numbers, dot, underscore, hyphen).');
  }
  if (cleanUsername === ADMIN_USERNAME) {
    throw new Error('The username "admin" is reserved for the root Admin account.');
  }

  const supId = input.id || generateSafeId('sup');
  const authEmail = supervisorToAuthEmail(cleanUsername);
  const cleanContactEmail = normalizeEmail(input.email || authEmail);

  let authUid = ctx.existing?.authUid || '';
  let authStatus: 'created' | 'already_exists' | 'provider_disabled' | 'unchanged' = 'unchanged';

  if (input.password && input.password.trim().length >= 6) {
    const prov = await provisionUserAuthAccount(authEmail, input.password.trim(), input.name.trim());
    authStatus = prov.status;
    if (prov.uid) authUid = prov.uid;
  }

  const grantId = emailToGrantId(authEmail);
  const supervisorEmails = [authEmail, ADMIN_AUTH_EMAIL];
  const badgeId = `SUP-${cleanUsername.toUpperCase().replace(/[^A-Z0-9_-]/g, '')}`.slice(0, MAX_LENGTHS.badgeId);

  const supData = {
    id: supId,
    name: clampStr(input.name, MAX_LENGTHS.techName),
    email: clampStr(cleanContactEmail, MAX_LENGTHS.email),
    username: clampStr(cleanUsername, MAX_LENGTHS.username),
    authMode: 'username_password' as TechAuthMode,
    authEmail: clampStr(authEmail, MAX_LENGTHS.email),
    authUid: clampStr(authUid, MAX_LENGTHS.id),
    badgeId,
    trade: clampStr(input.trade || 'Facility Supervisor', MAX_LENGTHS.trade),
    phone: clampStr(input.phone, MAX_LENGTHS.phone),
    role: 'supervisor' as UserRole,
    status: input.status,
    assignedBuildingIds: [] as string[],
    supervisorEmails,
  };

  try {
    const batch = writeBatch(db);
    const techRef = doc(db, 'technicians', supId);
    const grantRef = doc(db, 'access_grants', grantId);

    if (ctx.existing) {
      batch.update(techRef, {
        ...supData,
        updatedAt: serverTimestamp(),
      });
      const prevAuthEmail = normalizeEmail(ctx.existing.authEmail || ctx.existing.email);
      if (prevAuthEmail !== authEmail) {
        batch.delete(doc(db, 'access_grants', emailToGrantId(prevAuthEmail)));
        batch.set(grantRef, {
          email: supData.email,
          username: supData.username,
          authMode: supData.authMode,
          authEmail: supData.authEmail,
          authUid: supData.authUid,
          techId: supId,
          name: supData.name,
          badgeId: supData.badgeId,
          trade: supData.trade,
          role: 'supervisor',
          status: supData.status,
          assignedBuildingIds: [],
          supervisorEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(grantRef, {
          email: supData.email,
          username: supData.username,
          authMode: supData.authMode,
          authEmail: supData.authEmail,
          authUid: supData.authUid,
          techId: supId,
          name: supData.name,
          badgeId: supData.badgeId,
          trade: supData.trade,
          role: 'supervisor',
          status: supData.status,
          assignedBuildingIds: [],
          supervisorEmails,
          createdAt: ctx.existing.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      batch.set(techRef, {
        ...supData,
        createdByUid: ctx.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(grantRef, {
        email: supData.email,
        username: supData.username,
        authMode: supData.authMode,
        authEmail: supData.authEmail,
        authUid: supData.authUid,
        techId: supId,
        name: supData.name,
        badgeId: supData.badgeId,
        trade: supData.trade,
        role: 'supervisor',
        status: supData.status,
        assignedBuildingIds: [],
        supervisorEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return { supervisorId: supId, username: cleanUsername, authStatus };
  } catch (error) {
    handleFirestoreError(error, ctx.existing ? OperationType.UPDATE : OperationType.CREATE, `technicians/${supId}`);
  }
}

export async function deleteSupervisorAccount(supervisor: Technician): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'technicians', supervisor.id));
    batch.delete(doc(db, 'access_grants', emailToGrantId(supervisor.authEmail || supervisor.email)));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `technicians/${supervisor.id}`);
  }
}

export async function saveTechnician(
  input: {
    id?: string;
    name: string;
    email: string;
    authMode?: TechAuthMode;
    passcode?: string;
    badgeId: string;
    trade: string;
    phone: string;
    role?: UserRole;
    status: 'active' | 'inactive';
    assignedBuildingIds: string[];
    ownerSupervisorEmail?: string;
  },
  ctx: {
    uid: string;
    email: string;
    role: UserRole;
    technicians: Technician[];
    buildings: Building[];
    existing?: Technician | null;
  }
): Promise<{ techId: string; authStatus: 'google' | 'created' | 'already_exists' | 'provider_disabled' | 'unchanged' }> {
  const techId = input.id || generateSafeId('tech');
  const cleanBadge = clampStr(input.badgeId, MAX_LENGTHS.badgeId).toUpperCase();
  const cleanContactEmail = normalizeEmail(input.email || '');
  const effectiveAuthMode: TechAuthMode = 'badge_passcode';
  const authEmail = badgeToAuthEmail(cleanBadge);

  if (!cleanBadge || cleanBadge.length < 2) {
    throw new Error('A valid Badge ID is required for technician access.');
  }

  let authUid = ctx.existing?.authUid || '';
  let authStatus: 'google' | 'created' | 'already_exists' | 'provider_disabled' | 'unchanged' = 'unchanged';

  if (input.passcode && input.passcode.trim().length >= 6) {
    const prov = await provisionUserAuthAccount(authEmail, input.passcode.trim(), input.name.trim());
    authStatus = prov.status;
    if (prov.uid) authUid = prov.uid;
  }

  const ownerSupEmail = normalizeEmail(
    (ctx.role === 'admin' && input.ownerSupervisorEmail) ||
      ctx.existing?.supervisorEmails?.find((e) => normalizeEmail(e) !== ADMIN_AUTH_EMAIL) ||
      ctx.email
  );
  const supervisorEmails = buildBuildingSupervisorEmails(ownerSupEmail);
  const grantId = emailToGrantId(authEmail);

  const techData = {
    id: techId,
    name: clampStr(input.name, MAX_LENGTHS.techName),
    email: clampStr(cleanContactEmail, MAX_LENGTHS.email),
    authMode: effectiveAuthMode,
    authEmail: clampStr(authEmail, MAX_LENGTHS.email),
    authUid: clampStr(authUid, MAX_LENGTHS.id),
    badgeId: cleanBadge,
    trade: clampStr(input.trade, MAX_LENGTHS.trade),
    phone: clampStr(input.phone, MAX_LENGTHS.phone),
    role: 'technician' as UserRole,
    status: input.status,
    assignedBuildingIds: input.assignedBuildingIds.slice(0, 30),
    supervisorEmails,
  };

  try {
    const batch = writeBatch(db);
    const techRef = doc(db, 'technicians', techId);
    const grantRef = doc(db, 'access_grants', grantId);

    if (ctx.existing) {
      batch.update(techRef, {
        ...techData,
        updatedAt: serverTimestamp(),
      });
      const prevAuthEmail = normalizeEmail(ctx.existing.authEmail || ctx.existing.email);
      if (prevAuthEmail !== authEmail) {
        batch.delete(doc(db, 'access_grants', emailToGrantId(prevAuthEmail)));
        batch.set(grantRef, {
          email: techData.email,
          authMode: techData.authMode,
          authEmail: techData.authEmail,
          authUid: techData.authUid,
          techId,
          name: techData.name,
          badgeId: techData.badgeId,
          trade: techData.trade,
          role: 'technician',
          status: techData.status,
          assignedBuildingIds: techData.assignedBuildingIds,
          supervisorEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(
          grantRef,
          {
            email: techData.email,
            authMode: techData.authMode,
            authEmail: techData.authEmail,
            authUid: techData.authUid,
            techId,
            name: techData.name,
            badgeId: techData.badgeId,
            trade: techData.trade,
            role: 'technician',
            status: techData.status,
            assignedBuildingIds: techData.assignedBuildingIds,
            supervisorEmails,
            createdAt: ctx.existing.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: false }
        );
      }
    } else {
      batch.set(techRef, {
        ...techData,
        createdByUid: ctx.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(grantRef, {
        email: techData.email,
        authMode: techData.authMode,
        authEmail: techData.authEmail,
        authUid: techData.authUid,
        techId,
        name: techData.name,
        badgeId: techData.badgeId,
        trade: techData.trade,
        role: 'technician',
        status: techData.status,
        assignedBuildingIds: techData.assignedBuildingIds,
        supervisorEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const updatedTechList: Technician[] = ctx.existing
      ? ctx.technicians.map((t) => (t.id === techId ? { ...t, ...techData } : t))
      : [...ctx.technicians, { ...techData, createdByUid: ctx.uid }];

    const callerClean = normalizeEmail(ctx.email);
    const scopedBuildings = ctx.buildings.filter(
      (b) =>
        ctx.role === 'admin' ||
        b.supervisorEmails.map(normalizeEmail).includes(callerClean)
    );

    for (const b of scopedBuildings) {
      const nextMembers = buildBuildingMemberEmails(b.id, updatedTechList, b.supervisorEmails);
      batch.update(doc(db, 'buildings', b.id), {
        memberEmails: nextMembers,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return { techId, authStatus };
  } catch (error) {
    handleFirestoreError(error, ctx.existing ? OperationType.UPDATE : OperationType.CREATE, `technicians/${techId}`);
  }
}

export async function retryProvisionTechnicianLogin(
  tech: Technician,
  passcode: string,
  ctx: { uid: string; email: string; role: UserRole; technicians: Technician[]; buildings: Building[] }
) {
  return saveTechnician(
    {
      id: tech.id,
      name: tech.name,
      email: tech.email,
      authMode: tech.authMode || 'badge_passcode',
      passcode,
      badgeId: tech.badgeId,
      trade: tech.trade,
      phone: tech.phone,
      role: tech.role,
      status: tech.status,
      assignedBuildingIds: tech.assignedBuildingIds,
    },
    { ...ctx, existing: tech }
  );
}

export async function deleteTechnician(
  tech: Technician,
  ctx: { email: string; role: UserRole; technicians: Technician[]; buildings: Building[] }
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'technicians', tech.id));
    batch.delete(doc(db, 'access_grants', emailToGrantId(tech.authEmail || tech.email)));

    const remainingTechs = ctx.technicians.filter((t) => t.id !== tech.id);
    const callerClean = normalizeEmail(ctx.email);
    const scopedBuildings = ctx.buildings.filter(
      (b) =>
        ctx.role === 'admin' ||
        b.supervisorEmails.map(normalizeEmail).includes(callerClean)
    );

    for (const b of scopedBuildings) {
      const nextMembers = buildBuildingMemberEmails(b.id, remainingTechs, b.supervisorEmails);
      batch.update(doc(db, 'buildings', b.id), {
        memberEmails: nextMembers,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `technicians/${tech.id}`);
  }
}

export async function submitMaintenanceLog(
  params: {
    logId?: string;
    isResubmit?: boolean;
    building: Building;
    entryType: MaintenanceLog['entryType'];
    discipline: string;
    assetName: string;
    assetTag: string;
    locationZone: string;
    title: string;
    workNotes: string;
    ppmFrequency: MaintenanceLog['ppmFrequency'];
    nextDueDateOverride?: string;
    amcContractor: string;
    scheduledDate: string;
    completedDate: string;
    outcome: MaintenanceLog['outcome'];
    partsUsed: string;
    laborHours: number;
    newAttachments: PendingAttachmentDraft[];
    existingBeforeIds: string[];
    existingAfterIds: string[];
    existingScanIds: string[];
    approvalStatusOverride?: 'approved' | 'pending_approval';
  },
  ctx: {
    uid: string;
    name: string;
    email: string;
    role: UserRole;
    isEffectiveOnline: boolean;
  }
): Promise<{ logId: string; offlineQueued: boolean }> {
  const logId = params.logId || generateSafeId('log');
  const cleanEmail = normalizeEmail(ctx.email);

  const newBeforeIds = params.newAttachments.filter((a) => a.kind === 'before_photo').map((a) => a.id);
  const newAfterIds = params.newAttachments.filter((a) => a.kind === 'after_photo').map((a) => a.id);
  const newScanIds = params.newAttachments.filter((a) => a.kind === 'amc_scan').map((a) => a.id);

  const beforePhotoIds = [...params.existingBeforeIds, ...newBeforeIds].slice(0, 6);
  const afterPhotoIds = [...params.existingAfterIds, ...newAfterIds].slice(0, 6);
  const scannedReportIds = [...params.existingScanIds, ...newScanIds].slice(0, 6);

  const isManager = ctx.role === 'supervisor' || ctx.role === 'admin';
  const approvalStatus: ApprovalStatus = isManager
    ? params.approvalStatusOverride || 'approved'
    : 'pending_approval';

  const isPpm = params.entryType === 'ppm_inhouse' || params.entryType === 'ppm_amc';
  const effectiveFreq = isPpm ? params.ppmFrequency : 'none';
  const resolvedCompleted =
    clampStr(params.completedDate, MAX_LENGTHS.dateStr) || new Date().toISOString().slice(0, 10);
  const computedNextDue = isPpm
    ? clampStr(params.nextDueDateOverride || '', MAX_LENGTHS.dateStr) ||
      computeNextPpmDueDate(resolvedCompleted, effectiveFreq)
    : '';

  const basePayload: Omit<MaintenanceLog, 'createdAt' | 'updatedAt'> = {
    id: logId,
    buildingId: params.building.id,
    buildingCode: clampStr(params.building.code, MAX_LENGTHS.buildingCode),
    buildingName: clampStr(params.building.name, MAX_LENGTHS.buildingName),
    entryType: params.entryType,
    discipline: clampStr(params.discipline, MAX_LENGTHS.discipline),
    assetName: clampStr(params.assetName, MAX_LENGTHS.assetName),
    assetTag: clampStr(params.assetTag, MAX_LENGTHS.assetTag),
    locationZone: clampStr(params.locationZone, MAX_LENGTHS.locationZone),
    title: clampStr(params.title, MAX_LENGTHS.title),
    workNotes: clampStr(params.workNotes, MAX_LENGTHS.workNotes),
    ppmFrequency: effectiveFreq,
    nextDueDate: computedNextDue,
    amcContractor: params.entryType === 'ppm_amc' ? clampStr(params.amcContractor, MAX_LENGTHS.amcContractor) : '',
    scheduledDate: clampStr(params.scheduledDate, MAX_LENGTHS.dateStr),
    completedDate: resolvedCompleted,
    outcome: params.outcome,
    partsUsed: clampStr(params.partsUsed, MAX_LENGTHS.partsUsed),
    laborHours: Math.max(0, Math.min(1000, Number(params.laborHours) || 0)),
    beforePhotoIds,
    afterPhotoIds,
    scannedReportIds,
    approvalStatus,
    submittedByUid: ctx.uid,
    submittedByName: clampStr(ctx.name || cleanEmail.split('@')[0], MAX_LENGTHS.techName),
    submittedByEmail: clampStr(cleanEmail, MAX_LENGTHS.email),
    submittedByRole: ctx.role,
    reviewNotes:
      isManager && approvalStatus === 'approved'
        ? `Verified and logged by ${ctx.role === 'admin' ? 'admin' : 'supervisor'}.`
        : '',
    reviewedByUid: isManager && approvalStatus === 'approved' ? ctx.uid : '',
    reviewedByName:
      isManager && approvalStatus === 'approved' ? clampStr(ctx.name, MAX_LENGTHS.techName) : '',
    reviewedAtIso: isManager && approvalStatus === 'approved' ? new Date().toISOString() : '',
    supervisorEmails: params.building.supervisorEmails,
    buildingMemberEmails: params.building.memberEmails,
    source: ctx.isEffectiveOnline ? 'portal' : 'offline_sync',
  };

  if (!ctx.isEffectiveOnline) {
    const queueItem: OfflineQueueItem = {
      queueId: generateSafeId('q'),
      action: params.isResubmit ? 'resubmit_log' : 'create_log',
      logPayload: basePayload,
      attachments: params.newAttachments,
      queuedAtIso: new Date().toISOString(),
      attempts: 0,
    };
    await enqueueOfflineLog(queueItem);
    return { logId, offlineQueued: true };
  }

  try {
    for (const att of params.newAttachments) {
      const attDoc: WorkAttachment = {
        id: att.id,
        logId,
        buildingId: params.building.id,
        kind: att.kind,
        fileName: clampStr(att.fileName, MAX_LENGTHS.fileName),
        mimeType: att.mimeType,
        dataUrl: att.dataUrl,
        caption: clampStr(att.caption, MAX_LENGTHS.caption),
        uploadedByUid: ctx.uid,
        uploadedByEmail: clampStr(cleanEmail, MAX_LENGTHS.email),
        supervisorEmails: params.building.supervisorEmails,
        buildingMemberEmails: params.building.memberEmails,
      };
      await setDoc(doc(db, 'attachments', att.id), {
        ...attDoc,
        createdAt: serverTimestamp(),
      });
      await cacheAttachmentLocally(attDoc);
    }

    if (params.isResubmit) {
      await updateDoc(doc(db, 'maintenance_logs', logId), {
        entryType: basePayload.entryType,
        discipline: basePayload.discipline,
        assetName: basePayload.assetName,
        assetTag: basePayload.assetTag,
        locationZone: basePayload.locationZone,
        title: basePayload.title,
        workNotes: basePayload.workNotes,
        ppmFrequency: basePayload.ppmFrequency,
        nextDueDate: basePayload.nextDueDate,
        amcContractor: basePayload.amcContractor,
        scheduledDate: basePayload.scheduledDate,
        completedDate: basePayload.completedDate,
        outcome: basePayload.outcome,
        partsUsed: basePayload.partsUsed,
        laborHours: basePayload.laborHours,
        beforePhotoIds: basePayload.beforePhotoIds,
        afterPhotoIds: basePayload.afterPhotoIds,
        scannedReportIds: basePayload.scannedReportIds,
        approvalStatus: 'pending_approval',
        source: 'portal',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'maintenance_logs', logId), {
        ...basePayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    return { logId, offlineQueued: false };
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('network') || msg.includes('offline') || msg.includes('unavailable')) {
      const queueItem: OfflineQueueItem = {
        queueId: generateSafeId('q'),
        action: params.isResubmit ? 'resubmit_log' : 'create_log',
        logPayload: { ...basePayload, source: 'offline_sync' },
        attachments: params.newAttachments,
        queuedAtIso: new Date().toISOString(),
        attempts: 0,
      };
      await enqueueOfflineLog(queueItem);
      return { logId, offlineQueued: true };
    }
    handleFirestoreError(
      error,
      params.isResubmit ? OperationType.UPDATE : OperationType.CREATE,
      `maintenance_logs/${logId}`
    );
  }
}

export async function reviewMaintenanceLog(
  logId: string,
  decision: 'approved' | 'revision_requested' | 'rejected',
  reviewNotes: string,
  reviewer: { uid: string; name: string }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'maintenance_logs', logId), {
      approvalStatus: decision,
      reviewNotes: clampStr(reviewNotes, MAX_LENGTHS.reviewNotes),
      reviewedByUid: reviewer.uid,
      reviewedByName: clampStr(reviewer.name, MAX_LENGTHS.techName),
      reviewedAtIso: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `maintenance_logs/${logId}`);
  }
}

export async function supervisorUpdateMaintenanceLog(
  existing: MaintenanceLog,
  params: {
    building: Building;
    entryType: MaintenanceLog['entryType'];
    discipline: string;
    assetName: string;
    assetTag: string;
    locationZone: string;
    title: string;
    workNotes: string;
    ppmFrequency: MaintenanceLog['ppmFrequency'];
    nextDueDateOverride?: string;
    amcContractor: string;
    scheduledDate: string;
    completedDate: string;
    outcome: MaintenanceLog['outcome'];
    partsUsed: string;
    laborHours: number;
    newAttachments: PendingAttachmentDraft[];
    existingBeforeIds: string[];
    existingAfterIds: string[];
    existingScanIds: string[];
    approvalStatus: ApprovalStatus;
    reviewNotes: string;
  },
  reviewer: { uid: string; name: string; email: string }
): Promise<void> {
  const cleanEmail = normalizeEmail(reviewer.email);
  const isPpm = params.entryType === 'ppm_inhouse' || params.entryType === 'ppm_amc';
  const effectiveFreq = isPpm ? params.ppmFrequency : 'none';
  const resolvedCompleted =
    clampStr(params.completedDate, MAX_LENGTHS.dateStr) || existing.completedDate;
  const computedNextDue = isPpm
    ? clampStr(params.nextDueDateOverride || '', MAX_LENGTHS.dateStr) ||
      computeNextPpmDueDate(resolvedCompleted, effectiveFreq)
    : '';

  const newBeforeIds = params.newAttachments.filter((a) => a.kind === 'before_photo').map((a) => a.id);
  const newAfterIds = params.newAttachments.filter((a) => a.kind === 'after_photo').map((a) => a.id);
  const newScanIds = params.newAttachments.filter((a) => a.kind === 'amc_scan').map((a) => a.id);

  const beforePhotoIds = [...params.existingBeforeIds, ...newBeforeIds].slice(0, 6);
  const afterPhotoIds = [...params.existingAfterIds, ...newAfterIds].slice(0, 6);
  const scannedReportIds = [...params.existingScanIds, ...newScanIds].slice(0, 6);

  try {
    for (const att of params.newAttachments) {
      const attDoc: WorkAttachment = {
        id: att.id,
        logId: existing.id,
        buildingId: existing.buildingId,
        kind: att.kind,
        fileName: clampStr(att.fileName, MAX_LENGTHS.fileName),
        mimeType: att.mimeType,
        dataUrl: att.dataUrl,
        caption: clampStr(att.caption, MAX_LENGTHS.caption),
        uploadedByUid: reviewer.uid,
        uploadedByEmail: clampStr(cleanEmail, MAX_LENGTHS.email),
        supervisorEmails: params.building.supervisorEmails,
        buildingMemberEmails: params.building.memberEmails,
      };
      await setDoc(doc(db, 'attachments', att.id), {
        ...attDoc,
        createdAt: serverTimestamp(),
      });
      await cacheAttachmentLocally(attDoc);
    }

    await updateDoc(doc(db, 'maintenance_logs', existing.id), {
      buildingCode: clampStr(params.building.code, MAX_LENGTHS.buildingCode),
      buildingName: clampStr(params.building.name, MAX_LENGTHS.buildingName),
      entryType: params.entryType,
      discipline: clampStr(params.discipline, MAX_LENGTHS.discipline),
      assetName: clampStr(params.assetName, MAX_LENGTHS.assetName),
      assetTag: clampStr(params.assetTag, MAX_LENGTHS.assetTag),
      locationZone: clampStr(params.locationZone, MAX_LENGTHS.locationZone),
      title: clampStr(params.title, MAX_LENGTHS.title),
      workNotes: clampStr(params.workNotes, MAX_LENGTHS.workNotes),
      ppmFrequency: effectiveFreq,
      nextDueDate: computedNextDue,
      amcContractor:
        params.entryType === 'ppm_amc'
          ? clampStr(params.amcContractor, MAX_LENGTHS.amcContractor)
          : '',
      scheduledDate: clampStr(params.scheduledDate, MAX_LENGTHS.dateStr),
      completedDate: resolvedCompleted,
      outcome: params.outcome,
      partsUsed: clampStr(params.partsUsed, MAX_LENGTHS.partsUsed),
      laborHours: Math.max(0, Math.min(1000, Number(params.laborHours) || 0)),
      beforePhotoIds,
      afterPhotoIds,
      scannedReportIds,
      approvalStatus: params.approvalStatus,
      reviewNotes: clampStr(params.reviewNotes, MAX_LENGTHS.reviewNotes),
      reviewedByUid: reviewer.uid,
      reviewedByName: clampStr(reviewer.name, MAX_LENGTHS.techName),
      reviewedAtIso: new Date().toISOString(),
      supervisorEmails: params.building.supervisorEmails,
      buildingMemberEmails: params.building.memberEmails,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `maintenance_logs/${existing.id}`);
  }
}

export async function deleteMaintenanceLog(log: MaintenanceLog): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'maintenance_logs', log.id));
    const allAttIds = [...log.beforePhotoIds, ...log.afterPhotoIds, ...log.scannedReportIds];
    for (const attId of allAttIds) {
      batch.delete(doc(db, 'attachments', attId));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `maintenance_logs/${log.id}`);
  }
}

export async function fetchAttachmentById(attachmentId: string): Promise<WorkAttachment | null> {
  const cached = await getCachedAttachment(attachmentId);
  if (cached) return cached;

  try {
    const snap = await getDoc(doc(db, 'attachments', attachmentId));
    if (!snap.exists()) return null;
    const data = snap.data() as WorkAttachment;
    await cacheAttachmentLocally(data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `attachments/${attachmentId}`);
  }
}

export async function fetchAttachmentsForLog(log: MaintenanceLog): Promise<WorkAttachment[]> {
  const ids = [...log.beforePhotoIds, ...log.afterPhotoIds, ...log.scannedReportIds];
  if (ids.length === 0) return [];
  const results = await Promise.all(ids.map((id) => fetchAttachmentById(id)));
  return results.filter((a): a is WorkAttachment => a !== null);
}

export async function flushOfflineQueue(ctx: {
  uid: string;
  email: string;
}): Promise<{ syncedCount: number; failedCount: number }> {
  const queue = await getOfflineQueue();
  const opsQueue = await getOfflineOpsQueue();
  if (queue.length === 0 && opsQueue.length === 0) return { syncedCount: 0, failedCount: 0 };

  let syncedCount = 0;
  let failedCount = 0;

  for (const item of queue) {
    try {
      for (const att of item.attachments) {
        await setDoc(doc(db, 'attachments', att.id), {
          id: att.id,
          logId: item.logPayload.id,
          buildingId: item.logPayload.buildingId,
          kind: att.kind,
          fileName: clampStr(att.fileName, MAX_LENGTHS.fileName),
          mimeType: att.mimeType,
          dataUrl: att.dataUrl,
          caption: clampStr(att.caption, MAX_LENGTHS.caption),
          uploadedByUid: ctx.uid,
          uploadedByEmail: normalizeEmail(ctx.email),
          supervisorEmails: item.logPayload.supervisorEmails,
          buildingMemberEmails: item.logPayload.buildingMemberEmails,
          createdAt: serverTimestamp(),
        });
      }

      if (item.action === 'resubmit_log') {
        await updateDoc(doc(db, 'maintenance_logs', item.logPayload.id), {
          entryType: item.logPayload.entryType,
          discipline: item.logPayload.discipline,
          assetName: item.logPayload.assetName,
          assetTag: item.logPayload.assetTag,
          locationZone: item.logPayload.locationZone,
          title: item.logPayload.title,
          workNotes: item.logPayload.workNotes,
          ppmFrequency: item.logPayload.ppmFrequency,
          nextDueDate: item.logPayload.nextDueDate || '',
          amcContractor: item.logPayload.amcContractor,
          scheduledDate: item.logPayload.scheduledDate,
          completedDate: item.logPayload.completedDate,
          outcome: item.logPayload.outcome,
          partsUsed: item.logPayload.partsUsed,
          laborHours: item.logPayload.laborHours,
          beforePhotoIds: item.logPayload.beforePhotoIds,
          afterPhotoIds: item.logPayload.afterPhotoIds,
          scannedReportIds: item.logPayload.scannedReportIds,
          approvalStatus: 'pending_approval',
          source: 'offline_sync',
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'maintenance_logs', item.logPayload.id), {
          ...item.logPayload,
          nextDueDate: item.logPayload.nextDueDate || '',
          source: 'offline_sync',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await removeOfflineQueueItem(item.queueId);
      syncedCount += 1;
    } catch (error) {
      failedCount += 1;
      const msg = error instanceof Error ? error.message : 'Sync failed';
      await updateOfflineQueueError(item.queueId, msg);
    }
  }

  for (const op of opsQueue) {
    try {
      await setDoc(doc(db, op.collectionName, op.docId), {
        ...op.payload,
        source: 'offline_sync',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await removeOfflineOpItem(op.queueId);
      syncedCount += 1;
    } catch (error) {
      failedCount += 1;
      const msg = error instanceof Error ? error.message : 'Sync failed';
      await updateOfflineOpError(op.queueId, msg);
    }
  }

  return { syncedCount, failedCount };
}

export interface BulkImportResult {
  createdBuildings: number;
  createdTechnicians: number;
  createdLogs: number;
  createdWorkLogs: number;
  createdOvertime: number;
  createdMeters: number;
  createdReadings: number;
  createdSchedules: number;
  skippedDuplicates: number;
}

export async function bulkImportWorkbookData(
  params: {
    buildingsToCreate: ParsedBuildingRow[];
    techniciansToCreate?: ParsedTechnicianRow[];
    logsToCreate: ParsedLogRow[];
    workLogsToCreate?: ParsedWorkLogRow[];
    overtimeToCreate?: ParsedOvertimeRow[];
    metersToCreate?: ParsedMeterRow[];
    readingsToCreate?: ParsedReadingRow[];
    schedulesToCreate?: ParsedScheduleRow[];
  },
  ctx: {
    uid: string;
    name: string;
    email: string;
    role?: UserRole;
    existingBuildings: Building[];
    technicians: Technician[];
    existingMeters?: UtilityMeter[];
    existingWorkLogs?: WorkLog[];
    existingOvertimeLogs?: OvertimeLog[];
    existingReadings?: UtilityReading[];
    existingSchedules?: TenantSchedule[];
    onProgress?: (label: string, completed: number, total: number) => void;
  }
): Promise<BulkImportResult> {
  const cleanEmail = normalizeEmail(ctx.email);
  const actorName = clampStr(ctx.name || cleanEmail.split('@')[0] || 'Supervisor', MAX_LENGTHS.techName);
  const supervisorEmails = buildBuildingSupervisorEmails(cleanEmail);

  const buildingMap = new Map<string, Building>();
  for (const b of ctx.existingBuildings) {
    buildingMap.set(b.code.trim().toUpperCase(), b);
  }

  let createdBuildings = 0;
  let createdTechnicians = 0;
  let createdLogs = 0;
  let createdWorkLogs = 0;
  let createdOvertime = 0;
  let createdMeters = 0;
  let createdReadings = 0;
  let createdSchedules = 0;
  let skippedDuplicates = 0;

  const techRows = params.techniciansToCreate || [];
  const workRows = params.workLogsToCreate || [];
  const otRows = params.overtimeToCreate || [];
  const meterRows = params.metersToCreate || [];
  const readingRows = params.readingsToCreate || [];
  const scheduleRows = params.schedulesToCreate || [];

  const existingTechByBadge = new Set(
    ctx.technicians.map((t) => t.badgeId.trim().toUpperCase()).filter(Boolean)
  );
  const existingTechByName = new Map<string, Technician>();
  for (const t of ctx.technicians) {
    existingTechByName.set(t.name.trim().toLowerCase(), t);
  }

  // Pre-assign IDs for new buildings so new technicians can reference them immediately
  const pendingBuildings: Building[] = [];
  for (const row of params.buildingsToCreate) {
    const code = clampStr(row.code, MAX_LENGTHS.buildingCode).toUpperCase();
    if (!code || buildingMap.has(code)) {
      skippedDuplicates += 1;
      continue;
    }
    const id = generateSafeId('bld');
    const bDoc: Building = {
      id,
      code,
      name: clampStr(row.name || `${code} Tower`, MAX_LENGTHS.buildingName),
      address: clampStr(row.address, MAX_LENGTHS.address),
      floorsCount: Math.max(1, Math.min(200, Math.round(Number(row.floorsCount) || 1))),
      facilityManager: clampStr(row.facilityManager, MAX_LENGTHS.facilityManager),
      amcContractors: row.amcContractors.map((c) => clampStr(c, 80)).filter(Boolean).slice(0, 20),
      status: 'active',
      supervisorEmails,
      memberEmails: [...supervisorEmails],
      createdByUid: ctx.uid,
    };
    buildingMap.set(code, bDoc);
    pendingBuildings.push(bDoc);
  }

  // Prepare new technician roster entries (with badge_passcode grant, authUid='', no legacy PINs)
  const allTechnicians: Technician[] = [...ctx.technicians];
  const pendingTechPayloads: {
    techId: string;
    grantId: string;
    techData: Omit<Technician, 'createdAt' | 'updatedAt'>;
  }[] = [];
  const touchedExistingBuildingIds = new Set<string>();

  for (const row of techRows) {
    const badge = clampStr(row.badgeId, MAX_LENGTHS.badgeId).toUpperCase();
    const cleanName = clampStr(row.name, MAX_LENGTHS.techName);
    if (!badge || !cleanName) continue;
    if (existingTechByBadge.has(badge) || existingTechByName.has(cleanName.toLowerCase())) {
      skippedDuplicates += 1;
      continue;
    }
    const targetBuilding =
      buildingMap.get((row.buildingCode || '').trim().toUpperCase()) ||
      pendingBuildings[0] ||
      ctx.existingBuildings[0];
    const assignedIds = targetBuilding ? [targetBuilding.id] : [];
    const authEmail = clampStr(badgeToAuthEmail(badge), MAX_LENGTHS.email);
    const techId = generateSafeId('tech');
    const grantId = emailToGrantId(authEmail);

    const techDoc: Omit<Technician, 'createdAt' | 'updatedAt'> = {
      id: techId,
      name: cleanName,
      email: '',
      authMode: 'badge_passcode',
      authEmail,
      authUid: '',
      badgeId: badge,
      trade: clampStr(row.trade || 'General Technician', MAX_LENGTHS.trade),
      phone: '',
      role: 'technician',
      status: 'active',
      assignedBuildingIds: assignedIds,
      supervisorEmails,
      createdByUid: ctx.uid,
    };

    pendingTechPayloads.push({ techId, grantId, techData: techDoc });
    allTechnicians.push(techDoc);
    existingTechByBadge.add(badge);
    existingTechByName.set(cleanName.toLowerCase(), techDoc);
    for (const bid of assignedIds) {
      if (ctx.existingBuildings.some((b) => b.id === bid)) {
        touchedExistingBuildingIds.add(bid);
      }
    }
  }

  // Recompute memberEmails for new buildings and touched existing buildings
  for (const b of pendingBuildings) {
    b.memberEmails = buildBuildingMemberEmails(b.id, allTechnicians, b.supervisorEmails);
  }

  const totalOps =
    pendingBuildings.length +
    pendingTechPayloads.length +
    meterRows.length +
    params.logsToCreate.length +
    workRows.length +
    otRows.length +
    readingRows.length +
    scheduleRows.length;
  let completedOps = 0;

  // Stage 1: Commit Buildings, Technicians & Access Grants first (so building docs exist for rules)
  if (pendingBuildings.length > 0 || pendingTechPayloads.length > 0 || touchedExistingBuildingIds.size > 0) {
    ctx.onProgress?.('Setting up buildings and team roster...', completedOps, totalOps);
    const stage1Ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

    for (const bDoc of pendingBuildings) {
      stage1Ops.push((batch) => {
        batch.set(doc(db, 'buildings', bDoc.id), {
          ...bDoc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    }

    for (const bid of touchedExistingBuildingIds) {
      const existingB = ctx.existingBuildings.find((b) => b.id === bid);
      if (!existingB) continue;
      const nextMembers = buildBuildingMemberEmails(existingB.id, allTechnicians, existingB.supervisorEmails);
      buildingMap.set(existingB.code.trim().toUpperCase(), { ...existingB, memberEmails: nextMembers });
      stage1Ops.push((batch) => {
        batch.update(doc(db, 'buildings', existingB.id), {
          memberEmails: nextMembers,
          updatedAt: serverTimestamp(),
        });
      });
    }

    for (const item of pendingTechPayloads) {
      stage1Ops.push((batch) => {
        batch.set(doc(db, 'technicians', item.techId), {
          ...item.techData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'access_grants', item.grantId), {
          email: item.techData.email,
          authMode: item.techData.authMode,
          authEmail: item.techData.authEmail,
          authUid: item.techData.authUid,
          techId: item.techId,
          name: item.techData.name,
          badgeId: item.techData.badgeId,
          trade: item.techData.trade,
          role: 'technician',
          status: item.techData.status,
          assignedBuildingIds: item.techData.assignedBuildingIds,
          supervisorEmails: item.techData.supervisorEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    }

    for (let i = 0; i < stage1Ops.length; i += 200) {
      const batch = writeBatch(db);
      for (const fn of stage1Ops.slice(i, i + 200)) fn(batch);
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'buildings');
      }
    }
    createdBuildings = pendingBuildings.length;
    createdTechnicians = pendingTechPayloads.length;
    completedOps += createdBuildings + createdTechnicians;
  }

  // Stage 2: Utility Meters (plus auto-create any missing meter referenced by readings)
  const meterByBuildingAndNo = new Map<string, UtilityMeter>();
  const meterByBuildingTypeArea = new Map<string, UtilityMeter>();
  for (const m of ctx.existingMeters || []) {
    meterByBuildingAndNo.set(`${m.buildingId}::${m.meterNo.trim().toUpperCase()}`, m);
    meterByBuildingTypeArea.set(
      `${m.buildingId}::${m.meterType.toLowerCase()}::${m.area.trim().toLowerCase()}`,
      m
    );
  }

  const metersToWrite: UtilityMeter[] = [];
  for (const row of meterRows) {
    const b = buildingMap.get(row.buildingCode.toUpperCase());
    if (!b) continue;
    const keyNo = `${b.id}::${row.meterNo.trim().toUpperCase()}`;
    if (meterByBuildingAndNo.has(keyNo)) {
      skippedDuplicates += 1;
      continue;
    }
    const id = generateSafeId('mtr');
    const meterDoc: UtilityMeter = {
      id,
      buildingId: b.id,
      buildingCode: b.code,
      meterType: row.meterType,
      area: clampStr(row.area, MAX_LENGTHS.locationZone) || 'Common',
      meterNo: clampStr(row.meterNo, MAX_LENGTHS.meterNo),
      accountNo: clampStr(row.accountNo, MAX_LENGTHS.accountNo),
      unit: clampStr(row.unit || DEFAULT_METER_UNITS[row.meterType], MAX_LENGTHS.meterUnit),
      status: 'active',
      supervisorEmails: b.supervisorEmails,
      buildingMemberEmails: b.memberEmails,
      createdByUid: ctx.uid,
    };
    meterByBuildingAndNo.set(keyNo, meterDoc);
    meterByBuildingTypeArea.set(
      `${b.id}::${meterDoc.meterType.toLowerCase()}::${meterDoc.area.trim().toLowerCase()}`,
      meterDoc
    );
    metersToWrite.push(meterDoc);
  }

  // Ensure any reading with an unregistered meter gets a registered meter first
  for (const r of readingRows) {
    const b = buildingMap.get(r.buildingCode.toUpperCase());
    if (!b || !r.meterNo.trim()) continue;
    const keyNo = `${b.id}::${r.meterNo.trim().toUpperCase()}`;
    if (!meterByBuildingAndNo.has(keyNo)) {
      const mType: UtilityMeterType =
        r.meterType === 'Electricity' ||
        r.meterType === 'Water' ||
        r.meterType === 'Chilled Water' ||
        r.meterType === 'Gas'
          ? r.meterType
          : 'Other';
      const id = generateSafeId('mtr');
      const meterDoc: UtilityMeter = {
        id,
        buildingId: b.id,
        buildingCode: b.code,
        meterType: mType,
        area: clampStr(r.area || 'Common', MAX_LENGTHS.locationZone),
        meterNo: clampStr(r.meterNo, MAX_LENGTHS.meterNo),
        accountNo: clampStr(r.accountNo, MAX_LENGTHS.accountNo),
        unit: DEFAULT_METER_UNITS[mType],
        status: 'active',
        supervisorEmails: b.supervisorEmails,
        buildingMemberEmails: b.memberEmails,
        createdByUid: ctx.uid,
      };
      meterByBuildingAndNo.set(keyNo, meterDoc);
      metersToWrite.push(meterDoc);
    }
  }

  if (metersToWrite.length > 0) {
    ctx.onProgress?.('Registering utility meters...', completedOps, totalOps);
    const batch = writeBatch(db);
    for (const m of metersToWrite) {
      batch.set(doc(db, 'utility_meters', m.id), {
        ...m,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
      createdMeters = metersToWrite.length;
      completedOps += createdMeters;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'utility_meters');
    }
  }

  const chunkSize = 300;

  // Stage 3: Maintenance Logs
  for (let i = 0; i < params.logsToCreate.length; i += chunkSize) {
    ctx.onProgress?.('Importing maintenance & PPM logs...', completedOps, totalOps);
    const slice = params.logsToCreate.slice(i, i + chunkSize);
    const batch = writeBatch(db);

    for (const row of slice) {
      const b = buildingMap.get(row.buildingCode.toUpperCase());
      if (!b) continue;
      const logId = generateSafeId('log');
      const isApproved = row.approvalStatus === 'approved';
      const isPpm = row.entryType === 'ppm_inhouse' || row.entryType === 'ppm_amc';
      const freq = isPpm ? row.ppmFrequency : 'none';
      const nextDueDate = isPpm ? computeNextPpmDueDate(row.completedDate, freq) : '';

      batch.set(doc(db, 'maintenance_logs', logId), {
        id: logId,
        buildingId: b.id,
        buildingCode: b.code,
        buildingName: b.name,
        entryType: row.entryType,
        discipline: row.discipline,
        assetName: row.assetName,
        assetTag: row.assetTag,
        locationZone: row.locationZone,
        title: row.title,
        workNotes: row.workNotes,
        ppmFrequency: freq,
        nextDueDate,
        amcContractor: row.entryType === 'ppm_amc' ? row.amcContractor : '',
        scheduledDate: row.scheduledDate,
        completedDate: row.completedDate,
        outcome: row.outcome,
        partsUsed: row.partsUsed,
        laborHours: row.laborHours,
        beforePhotoIds: [],
        afterPhotoIds: [],
        scannedReportIds: [],
        approvalStatus: row.approvalStatus,
        submittedByUid: ctx.uid,
        submittedByName: actorName,
        submittedByEmail: clampStr(cleanEmail, MAX_LENGTHS.email),
        submittedByRole: ctx.role === 'admin' ? 'admin' : 'supervisor',
        reviewNotes: isApproved ? 'Imported via Excel template.' : '',
        reviewedByUid: isApproved ? ctx.uid : '',
        reviewedByName: isApproved ? actorName : '',
        reviewedAtIso: isApproved ? new Date().toISOString() : '',
        supervisorEmails: b.supervisorEmails,
        buildingMemberEmails: b.memberEmails,
        source: 'excel_import',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdLogs += 1;
    }

    try {
      await batch.commit();
      completedOps += slice.length;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'maintenance_logs');
    }
  }

  // Stage 4: Daily Work Logs
  const existingWorkIdSet = new Set((ctx.existingWorkLogs || []).map((w) => w.id));
  for (let i = 0; i < workRows.length; i += chunkSize) {
    ctx.onProgress?.(`Importing work logs (${i + 1}–${Math.min(workRows.length, i + chunkSize)} of ${workRows.length})...`, completedOps, totalOps);
    const slice = workRows.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    let opsInBatch = 0;

    for (const row of slice) {
      const b = buildingMap.get(row.buildingCode.toUpperCase());
      if (!b) continue;
      const docId = clampStr(row.id, MAX_LENGTHS.id) || generateSafeId('wl');
      if (existingWorkIdSet.has(docId)) {
        skippedDuplicates += 1;
        continue;
      }
      existingWorkIdSet.add(docId);

      batch.set(doc(db, 'work_logs', docId), {
        id: docId,
        buildingId: b.id,
        buildingCode: clampStr(b.code, MAX_LENGTHS.buildingCode),
        buildingName: clampStr(b.name, MAX_LENGTHS.buildingName),
        logDate: clampStr(row.logDate, MAX_LENGTHS.dateStr) || new Date().toISOString().slice(0, 10),
        shift: row.shift,
        woNumber: clampStr(row.woNumber, MAX_LENGTHS.woNumber),
        location: clampStr(row.location, MAX_LENGTHS.locationZone) || 'General',
        category: clampStr(row.category, MAX_LENGTHS.discipline) || 'General Maintenance',
        priority: row.priority,
        complaint: clampStr(row.complaint, MAX_LENGTHS.complaint) || 'Maintenance work',
        action: clampStr(row.action, MAX_LENGTHS.action),
        materials: clampStr(row.materials, MAX_LENGTHS.materials),
        receivedTime: clampStr(row.receivedTime, MAX_LENGTHS.timeStr),
        startTime: clampStr(row.startTime, MAX_LENGTHS.timeStr),
        finishTime: clampStr(row.finishTime, MAX_LENGTHS.timeStr),
        durationHours: Math.max(0, Math.min(48, Number(row.durationHours) || 0)),
        status: row.status,
        pendingReason: row.status === 'Completed' ? '' : clampStr(row.pendingReason, MAX_LENGTHS.pendingReason),
        remarks: clampStr(row.remarks, MAX_LENGTHS.remarks),
        technicianUid: ctx.uid,
        technicianName: clampStr(row.technicianName || actorName, MAX_LENGTHS.techName),
        technicianEmail: clampStr(cleanEmail, MAX_LENGTHS.email),
        supervisorName: clampStr(row.supervisorName || b.facilityManager || '', MAX_LENGTHS.techName),
        supervisorEmails: b.supervisorEmails,
        buildingMemberEmails: b.memberEmails,
        source: 'portal',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdWorkLogs += 1;
      opsInBatch += 1;
    }

    if (opsInBatch > 0) {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'work_logs');
      }
    }
    completedOps += slice.length;
  }

  // Stage 5: Overtime Logs
  const existingOtIdSet = new Set((ctx.existingOvertimeLogs || []).map((o) => o.id));
  for (let i = 0; i < otRows.length; i += chunkSize) {
    ctx.onProgress?.('Importing overtime entries...', completedOps, totalOps);
    const slice = otRows.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    let opsInBatch = 0;

    for (const row of slice) {
      const b = buildingMap.get(row.buildingCode.toUpperCase());
      if (!b) continue;
      const docId = clampStr(row.id, MAX_LENGTHS.id) || generateSafeId('ot');
      if (existingOtIdSet.has(docId)) {
        skippedDuplicates += 1;
        continue;
      }
      existingOtIdSet.add(docId);
      const matchedTech = existingTechByName.get(row.technicianName.trim().toLowerCase());

      batch.set(doc(db, 'overtime_logs', docId), {
        id: docId,
        buildingId: b.id,
        buildingCode: clampStr(b.code, MAX_LENGTHS.buildingCode),
        buildingName: clampStr(b.name, MAX_LENGTHS.buildingName),
        otDate: clampStr(row.otDate, MAX_LENGTHS.dateStr) || new Date().toISOString().slice(0, 10),
        fromTime: clampStr(row.fromTime, MAX_LENGTHS.timeStr) || '00:00',
        toTime: clampStr(row.toTime, MAX_LENGTHS.timeStr) || '00:00',
        hours: Math.max(0, Math.min(24, Number(row.hours) || 0)),
        otCategoryType: row.otCategoryType,
        workType: clampStr(row.workType, MAX_LENGTHS.workType) || 'Overtime Work',
        location: clampStr(row.location, MAX_LENGTHS.locationZone) || 'Common Area',
        workDescription: clampStr(row.workDescription, MAX_LENGTHS.workDescription) || 'Overtime duty',
        approvalStatus: 'approved',
        reviewNotes: 'Imported from legacy records.',
        technicianUid: ctx.uid,
        technicianName: clampStr(row.technicianName || actorName, MAX_LENGTHS.techName),
        technicianBadgeId: clampStr(matchedTech?.badgeId || '', MAX_LENGTHS.badgeId),
        technicianEmail: clampStr(cleanEmail, MAX_LENGTHS.email),
        supervisorEmails: b.supervisorEmails,
        buildingMemberEmails: b.memberEmails,
        source: 'portal',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdOvertime += 1;
      opsInBatch += 1;
    }

    if (opsInBatch > 0) {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'overtime_logs');
      }
    }
    completedOps += slice.length;
  }

  // Stage 6: Utility Readings
  const existingReadingIdSet = new Set((ctx.existingReadings || []).map((r) => r.id));
  for (let i = 0; i < readingRows.length; i += chunkSize) {
    ctx.onProgress?.('Importing utility meter readings...', completedOps, totalOps);
    const slice = readingRows.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    let opsInBatch = 0;

    for (const row of slice) {
      const b = buildingMap.get(row.buildingCode.toUpperCase());
      if (!b) continue;
      const docId = clampStr(row.id, MAX_LENGTHS.id) || generateSafeId('urd');
      if (existingReadingIdSet.has(docId)) {
        skippedDuplicates += 1;
        continue;
      }
      const matchedMeter =
        meterByBuildingAndNo.get(`${b.id}::${row.meterNo.trim().toUpperCase()}`) ||
        meterByBuildingTypeArea.get(
          `${b.id}::${row.meterType.toLowerCase()}::${row.area.trim().toLowerCase()}`
        );
      if (!matchedMeter) continue;
      existingReadingIdSet.add(docId);

      batch.set(doc(db, 'utility_readings', docId), {
        id: docId,
        buildingId: b.id,
        buildingCode: clampStr(b.code, MAX_LENGTHS.buildingCode),
        meterId: matchedMeter.id,
        meterType: clampStr(matchedMeter.meterType, 40),
        area: clampStr(matchedMeter.area, MAX_LENGTHS.locationZone),
        meterNo: clampStr(matchedMeter.meterNo, MAX_LENGTHS.meterNo),
        accountNo: clampStr(matchedMeter.accountNo, MAX_LENGTHS.accountNo),
        readingDate: clampStr(row.readingDate, MAX_LENGTHS.dateStr) || new Date().toISOString().slice(0, 10),
        readingValue: Math.max(0, Math.min(999999999, Number(row.readingValue) || 0)),
        notes: clampStr(row.notes, 400),
        technicianUid: ctx.uid,
        technicianName: clampStr(row.technicianName || actorName, MAX_LENGTHS.techName),
        technicianEmail: clampStr(cleanEmail, MAX_LENGTHS.email),
        supervisorEmails: b.supervisorEmails,
        buildingMemberEmails: b.memberEmails,
        source: 'portal',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdReadings += 1;
      opsInBatch += 1;
    }

    if (opsInBatch > 0) {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'utility_readings');
      }
    }
    completedOps += slice.length;
  }

  // Stage 7: Tenant Schedules
  const existingScheduleIdSet = new Set((ctx.existingSchedules || []).map((s) => s.id));
  for (let i = 0; i < scheduleRows.length; i += chunkSize) {
    ctx.onProgress?.('Importing tenant schedules...', completedOps, totalOps);
    const slice = scheduleRows.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    let opsInBatch = 0;

    for (const row of slice) {
      const b = buildingMap.get(row.buildingCode.toUpperCase());
      if (!b) continue;
      const docId = clampStr(row.id, MAX_LENGTHS.id) || generateSafeId('sch');
      if (existingScheduleIdSet.has(docId)) {
        skippedDuplicates += 1;
        continue;
      }
      existingScheduleIdSet.add(docId);
      const matchedTech = existingTechByName.get(row.assignedTechName.trim().toLowerCase());

      batch.set(doc(db, 'tenant_schedules', docId), {
        id: docId,
        buildingId: b.id,
        buildingCode: clampStr(b.code, MAX_LENGTHS.buildingCode),
        buildingName: clampStr(b.name, MAX_LENGTHS.buildingName),
        scheduleDate: clampStr(row.scheduleDate, MAX_LENGTHS.dateStr) || new Date().toISOString().slice(0, 10),
        timeSlot: clampStr(row.timeSlot, MAX_LENGTHS.timeSlot),
        unitOrLocation: clampStr(row.unitOrLocation, MAX_LENGTHS.locationZone) || 'Unit',
        tenantName: clampStr(row.tenantName, MAX_LENGTHS.techName),
        category: clampStr(row.category, MAX_LENGTHS.discipline) || 'General Maintenance',
        description: clampStr(row.description, MAX_LENGTHS.workDescription) || 'Scheduled unit maintenance',
        assignedTechUid: clampStr(matchedTech?.authUid || '', MAX_LENGTHS.id),
        assignedTechName: clampStr(row.assignedTechName || actorName, MAX_LENGTHS.techName),
        assignedTechEmail: clampStr(
          matchedTech ? normalizeEmail(matchedTech.authEmail || matchedTech.email) : cleanEmail,
          MAX_LENGTHS.email
        ),
        status: row.status,
        completionNotes: clampStr(row.completionNotes, MAX_LENGTHS.completionNotes),
        createdByUid: ctx.uid,
        createdByName: actorName,
        supervisorEmails: b.supervisorEmails,
        buildingMemberEmails: b.memberEmails,
        source: 'portal',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdSchedules += 1;
      opsInBatch += 1;
    }

    if (opsInBatch > 0) {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'tenant_schedules');
      }
    }
    completedOps += slice.length;
  }

  ctx.onProgress?.('Import complete!', totalOps, totalOps);

  return {
    createdBuildings,
    createdTechnicians,
    createdLogs,
    createdWorkLogs,
    createdOvertime,
    createdMeters,
    createdReadings,
    createdSchedules,
    skippedDuplicates,
  };
}

export async function loadMyAccessGrant(authEmail: string): Promise<{
  role: UserRole;
  status: 'active' | 'inactive';
  name?: string;
  username?: string;
  badgeId?: string;
  trade?: string;
  assignedBuildingIds?: string[];
} | null> {
  const clean = normalizeEmail(authEmail);
  const grantId = emailToGrantId(clean);
  try {
    const snap = await getDoc(doc(db, 'access_grants', grantId));
    if (snap.exists()) {
      const data = snap.data();
      return {
        role: data.role as UserRole,
        status: data.status as 'active' | 'inactive',
        name: data.name,
        username: data.username,
        badgeId: data.badgeId,
        trade: data.trade,
        assignedBuildingIds: data.assignedBuildingIds,
      };
    }
    if (clean === ADMIN_AUTH_EMAIL) {
      return {
        role: 'admin',
        status: 'active',
        name: 'System Admin',
        username: ADMIN_USERNAME,
        badgeId: 'ADMIN',
        trade: 'System Administrator',
      };
    }
    const q = query(collection(db, 'access_grants'), where('authEmail', '==', clean));
    const qSnap = await getDocs(q);
    if (!qSnap.empty) {
      const data = qSnap.docs[0].data();
      return {
        role: data.role as UserRole,
        status: data.status as 'active' | 'inactive',
        name: data.name,
        username: data.username,
        badgeId: data.badgeId,
        trade: data.trade,
        assignedBuildingIds: data.assignedBuildingIds,
      };
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `access_grants/${grantId}`);
  }
}

// ------------------------------------------------------------------
// Unified Field Operations Services (Work Logs, Overtime, Utilities, Tenant Schedules)
// ------------------------------------------------------------------

function isOfflineNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return msg.includes('network') || msg.includes('offline') || msg.includes('unavailable');
}

export async function submitWorkLog(
  params: {
    building: Building;
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
    status: WorkStatus;
    pendingReason: string;
    remarks?: string;
    supervisorName?: string;
  },
  ctx: {
    uid: string;
    name: string;
    email: string;
    isEffectiveOnline: boolean;
  }
): Promise<{ id: string; offlineQueued: boolean }> {
  const id = generateSafeId('wl');
  const cleanEmail = normalizeEmail(ctx.email);
  const timeValidation = validateSingleWorkDuration(
    params.receivedTime,
    params.startTime,
    params.finishTime
  );
  if (!timeValidation.valid) {
    throw new Error(timeValidation.error);
  }
  const durationHours = timeValidation.hours;

  const payload: Omit<WorkLog, 'createdAt' | 'updatedAt'> = {
    id,
    buildingId: params.building.id,
    buildingCode: clampStr(params.building.code, MAX_LENGTHS.buildingCode),
    buildingName: clampStr(params.building.name, MAX_LENGTHS.buildingName),
    logDate: clampStr(params.logDate, MAX_LENGTHS.dateStr) || new Date().toISOString().slice(0, 10),
    shift: params.shift,
    woNumber: clampStr(params.woNumber, MAX_LENGTHS.woNumber),
    location: clampStr(params.location, MAX_LENGTHS.locationZone),
    category: clampStr(params.category, MAX_LENGTHS.discipline) || 'General Maintenance',
    priority: params.priority,
    complaint: clampStr(params.complaint, MAX_LENGTHS.complaint),
    action: clampStr(params.action, MAX_LENGTHS.action),
    materials: clampStr(params.materials, MAX_LENGTHS.materials),
    receivedTime: clampStr(params.receivedTime, MAX_LENGTHS.timeStr),
    startTime: clampStr(params.startTime, MAX_LENGTHS.timeStr),
    finishTime: clampStr(params.finishTime, MAX_LENGTHS.timeStr),
    durationHours,
    status: params.status,
    pendingReason: params.status === 'Completed' ? '' : clampStr(params.pendingReason, MAX_LENGTHS.pendingReason),
    remarks: clampStr(params.remarks || '', MAX_LENGTHS.remarks),
    technicianUid: ctx.uid,
    technicianName: clampStr(ctx.name || cleanEmail.split('@')[0], MAX_LENGTHS.techName),
    technicianEmail: clampStr(cleanEmail, MAX_LENGTHS.email),
    supervisorName: clampStr(params.supervisorName || params.building.facilityManager || '', MAX_LENGTHS.techName),
    supervisorEmails: params.building.supervisorEmails,
    buildingMemberEmails: params.building.memberEmails,
    source: ctx.isEffectiveOnline ? 'portal' : 'offline_sync',
  };

  if (!ctx.isEffectiveOnline) {
    await enqueueOfflineOp({
      queueId: generateSafeId('op'),
      kind: 'work_log',
      collectionName: 'work_logs',
      docId: id,
      payload,
      queuedAtIso: new Date().toISOString(),
      attempts: 0,
    });
    return { id, offlineQueued: true };
  }

  try {
    await setDoc(doc(db, 'work_logs', id), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id, offlineQueued: false };
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      await enqueueOfflineOp({
        queueId: generateSafeId('op'),
        kind: 'work_log',
        collectionName: 'work_logs',
        docId: id,
        payload: { ...payload, source: 'offline_sync' },
        queuedAtIso: new Date().toISOString(),
        attempts: 0,
      });
      return { id, offlineQueued: true };
    }
    handleFirestoreError(error, OperationType.CREATE, `work_logs/${id}`);
  }
}

export async function updateWorkLog(
  existing: WorkLog,
  updates: {
    status: WorkStatus;
    action: string;
    finishTime: string;
    materials: string;
    pendingReason: string;
    logDate?: string;
    shift?: WorkShift;
    woNumber?: string;
    location?: string;
    category?: string;
    priority?: WorkPriority;
    complaint?: string;
    receivedTime?: string;
    startTime?: string;
    remarks?: string;
  },
  actor: { name: string; role: UserRole }
): Promise<void> {
  const startRef = updates.startTime ?? existing.startTime;
  const recvRef = updates.receivedTime ?? existing.receivedTime;
  const finRef = updates.finishTime;
  const timesChanged =
    finRef !== existing.finishTime ||
    startRef !== existing.startTime ||
    recvRef !== existing.receivedTime;
  const timeValidation = validateSingleWorkDuration(recvRef, startRef, finRef);
  if (timesChanged && !timeValidation.valid) {
    throw new Error(timeValidation.error);
  }
  const durationHours = timeValidation.valid
    ? timeValidation.hours
    : computeWorkLogDurationHours(recvRef, startRef, finRef);

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  let nextRemarks = updates.remarks !== undefined ? updates.remarks : existing.remarks || '';
  if (updates.status !== existing.status) {
    const note = `${stamp} ${actor.role === 'supervisor' || actor.role === 'admin' ? 'Supervisor' : actor.name}: ${existing.status} -> ${updates.status}`;
    nextRemarks = clampStr(nextRemarks ? `${nextRemarks} | ${note}` : note, MAX_LENGTHS.remarks);
  } else {
    nextRemarks = clampStr(nextRemarks, MAX_LENGTHS.remarks);
  }

  const cleanPending = updates.status === 'Completed' ? '' : clampStr(updates.pendingReason, MAX_LENGTHS.pendingReason);

  try {
    if (actor.role === 'supervisor' || actor.role === 'admin') {
      await updateDoc(doc(db, 'work_logs', existing.id), {
        logDate: clampStr(updates.logDate ?? existing.logDate, MAX_LENGTHS.dateStr),
        shift: updates.shift ?? existing.shift,
        woNumber: clampStr(updates.woNumber ?? existing.woNumber, MAX_LENGTHS.woNumber),
        location: clampStr(updates.location ?? existing.location, MAX_LENGTHS.locationZone),
        category: clampStr(updates.category ?? existing.category, MAX_LENGTHS.discipline),
        priority: updates.priority ?? existing.priority,
        complaint: clampStr(updates.complaint ?? existing.complaint, MAX_LENGTHS.complaint),
        action: clampStr(updates.action, MAX_LENGTHS.action),
        materials: clampStr(updates.materials, MAX_LENGTHS.materials),
        receivedTime: clampStr(recvRef, MAX_LENGTHS.timeStr),
        startTime: clampStr(startRef, MAX_LENGTHS.timeStr),
        finishTime: clampStr(finRef, MAX_LENGTHS.timeStr),
        durationHours,
        status: updates.status,
        pendingReason: cleanPending,
        remarks: nextRemarks,
        supervisorName: clampStr(actor.name, MAX_LENGTHS.techName),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'work_logs', existing.id), {
        status: updates.status,
        action: clampStr(updates.action, MAX_LENGTHS.action),
        finishTime: clampStr(finRef, MAX_LENGTHS.timeStr),
        durationHours,
        materials: clampStr(updates.materials, MAX_LENGTHS.materials),
        pendingReason: cleanPending,
        remarks: nextRemarks,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `work_logs/${existing.id}`);
  }
}

export async function deleteWorkLog(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'work_logs', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `work_logs/${id}`);
  }
}

export async function submitOvertimeLog(
  params: {
    building: Building;
    otDate: string;
    fromTime: string;
    toTime: string;
    otCategoryType: OvertimeCategoryType;
    workType: string;
    location: string;
    workDescription: string;
  },
  ctx: {
    uid: string;
    name: string;
    badgeId?: string;
    email: string;
    role: UserRole;
    isEffectiveOnline: boolean;
  }
): Promise<{ id: string; offlineQueued: boolean }> {
  const id = generateSafeId('ot');
  const cleanEmail = normalizeEmail(ctx.email);
  const hours = calculateTimeHours(params.fromTime, params.toTime);

  const payload: Omit<OvertimeLog, 'createdAt' | 'updatedAt'> = {
    id,
    buildingId: params.building.id,
    buildingCode: clampStr(params.building.code, MAX_LENGTHS.buildingCode),
    buildingName: clampStr(params.building.name, MAX_LENGTHS.buildingName),
    otDate: clampStr(params.otDate, MAX_LENGTHS.dateStr),
    fromTime: clampStr(params.fromTime, MAX_LENGTHS.timeStr),
    toTime: clampStr(params.toTime, MAX_LENGTHS.timeStr),
    hours,
    otCategoryType: params.otCategoryType,
    workType: clampStr(params.workType, MAX_LENGTHS.workType),
    location: clampStr(params.location, MAX_LENGTHS.locationZone),
    workDescription: clampStr(params.workDescription, MAX_LENGTHS.workDescription),
    approvalStatus: ctx.role === 'supervisor' || ctx.role === 'admin' ? 'approved' : 'pending_approval',
    reviewNotes: ctx.role === 'supervisor' || ctx.role === 'admin' ? 'Logged by supervisor.' : '',
    technicianUid: ctx.uid,
    technicianName: clampStr(ctx.name || cleanEmail.split('@')[0], MAX_LENGTHS.techName),
    technicianBadgeId: clampStr(ctx.badgeId || '', MAX_LENGTHS.badgeId),
    technicianEmail: clampStr(cleanEmail, MAX_LENGTHS.email),
    supervisorEmails: params.building.supervisorEmails,
    buildingMemberEmails: params.building.memberEmails,
    source: ctx.isEffectiveOnline ? 'portal' : 'offline_sync',
  };

  if (!ctx.isEffectiveOnline) {
    await enqueueOfflineOp({
      queueId: generateSafeId('op'),
      kind: 'overtime_log',
      collectionName: 'overtime_logs',
      docId: id,
      payload,
      queuedAtIso: new Date().toISOString(),
      attempts: 0,
    });
    return { id, offlineQueued: true };
  }

  try {
    await setDoc(doc(db, 'overtime_logs', id), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id, offlineQueued: false };
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      await enqueueOfflineOp({
        queueId: generateSafeId('op'),
        kind: 'overtime_log',
        collectionName: 'overtime_logs',
        docId: id,
        payload: { ...payload, source: 'offline_sync' },
        queuedAtIso: new Date().toISOString(),
        attempts: 0,
      });
      return { id, offlineQueued: true };
    }
    handleFirestoreError(error, OperationType.CREATE, `overtime_logs/${id}`);
  }
}

export async function reviewOvertimeLog(
  id: string,
  approvalStatus: 'approved' | 'rejected' | 'pending_approval',
  reviewNotes: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'overtime_logs', id), {
      approvalStatus,
      reviewNotes: clampStr(reviewNotes, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `overtime_logs/${id}`);
  }
}

export async function updateOvertimeLog(
  id: string,
  updates: {
    otDate: string;
    fromTime: string;
    toTime: string;
    otCategoryType: OvertimeCategoryType;
    workType: string;
    location: string;
    workDescription: string;
    approvalStatus: 'pending_approval' | 'approved' | 'rejected';
    reviewNotes: string;
  }
): Promise<void> {
  const hours = calculateTimeHours(updates.fromTime, updates.toTime);
  try {
    await updateDoc(doc(db, 'overtime_logs', id), {
      otDate: clampStr(updates.otDate, MAX_LENGTHS.dateStr),
      fromTime: clampStr(updates.fromTime, MAX_LENGTHS.timeStr),
      toTime: clampStr(updates.toTime, MAX_LENGTHS.timeStr),
      hours,
      otCategoryType: updates.otCategoryType,
      workType: clampStr(updates.workType, MAX_LENGTHS.workType),
      location: clampStr(updates.location, MAX_LENGTHS.locationZone),
      workDescription: clampStr(updates.workDescription, MAX_LENGTHS.workDescription),
      approvalStatus: updates.approvalStatus,
      reviewNotes: clampStr(updates.reviewNotes, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `overtime_logs/${id}`);
  }
}

export async function deleteOvertimeLog(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'overtime_logs', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `overtime_logs/${id}`);
  }
}

export async function saveUtilityMeter(
  input: {
    id?: string;
    building: Building;
    meterType: UtilityMeterType;
    area: string;
    meterNo: string;
    accountNo: string;
    unit?: string;
    status: 'active' | 'inactive';
  },
  ctx: { uid: string; existing?: UtilityMeter | null }
): Promise<string> {
  const id = input.id || generateSafeId('mtr');
  const unit = clampStr(input.unit || DEFAULT_METER_UNITS[input.meterType], MAX_LENGTHS.meterUnit);

  try {
    if (ctx.existing) {
      await updateDoc(doc(db, 'utility_meters', id), {
        meterType: input.meterType,
        area: clampStr(input.area, MAX_LENGTHS.locationZone),
        meterNo: clampStr(input.meterNo, MAX_LENGTHS.meterNo),
        accountNo: clampStr(input.accountNo, MAX_LENGTHS.accountNo),
        unit,
        status: input.status,
        supervisorEmails: input.building.supervisorEmails,
        buildingMemberEmails: input.building.memberEmails,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'utility_meters', id), {
        id,
        buildingId: input.building.id,
        buildingCode: clampStr(input.building.code, MAX_LENGTHS.buildingCode),
        meterType: input.meterType,
        area: clampStr(input.area, MAX_LENGTHS.locationZone),
        meterNo: clampStr(input.meterNo, MAX_LENGTHS.meterNo),
        accountNo: clampStr(input.accountNo, MAX_LENGTHS.accountNo),
        unit,
        status: input.status,
        supervisorEmails: input.building.supervisorEmails,
        buildingMemberEmails: input.building.memberEmails,
        createdByUid: ctx.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(
      error,
      ctx.existing ? OperationType.UPDATE : OperationType.CREATE,
      `utility_meters/${id}`
    );
  }
}

export async function seedDefaultMetersForBuilding(
  building: Building,
  uid: string
): Promise<number> {
  const defaults: { meterType: UtilityMeterType; area: string; meterNo: string; accountNo: string }[] = [
    { meterType: 'Electricity', area: 'Common Area', meterNo: `${building.code}-EL-CMN`, accountNo: 'ACC-ELEC-01' },
    { meterType: 'Electricity', area: 'Chiller / HVAC Plant', meterNo: `${building.code}-EL-HVAC`, accountNo: 'ACC-ELEC-02' },
    { meterType: 'Water', area: 'Domestic Main', meterNo: `${building.code}-WT-MAIN`, accountNo: 'ACC-WTR-01' },
    { meterType: 'Water', area: 'Fire Water Tank', meterNo: `${building.code}-WT-FIRE`, accountNo: 'ACC-WTR-02' },
  ];

  const batch = writeBatch(db);
  for (const d of defaults) {
    const id = generateSafeId('mtr');
    batch.set(doc(db, 'utility_meters', id), {
      id,
      buildingId: building.id,
      buildingCode: clampStr(building.code, MAX_LENGTHS.buildingCode),
      meterType: d.meterType,
      area: d.area,
      meterNo: d.meterNo,
      accountNo: d.accountNo,
      unit: DEFAULT_METER_UNITS[d.meterType],
      status: 'active',
      supervisorEmails: building.supervisorEmails,
      buildingMemberEmails: building.memberEmails,
      createdByUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return defaults.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'utility_meters');
  }
}

export async function deleteUtilityMeter(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'utility_meters', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `utility_meters/${id}`);
  }
}

export async function submitUtilityReading(
  params: {
    building: Building;
    meter: UtilityMeter;
    readingDate: string;
    readingValue: number;
    notes: string;
  },
  ctx: {
    uid: string;
    name: string;
    email: string;
    isEffectiveOnline: boolean;
  }
): Promise<{ id: string; offlineQueued: boolean }> {
  const id = generateSafeId('urd');
  const cleanEmail = normalizeEmail(ctx.email);
  const val = Math.max(0, Math.min(999999999, Number(params.readingValue) || 0));

  const payload: Omit<UtilityReading, 'createdAt' | 'updatedAt'> = {
    id,
    buildingId: params.building.id,
    buildingCode: clampStr(params.building.code, MAX_LENGTHS.buildingCode),
    meterId: params.meter.id,
    meterType: clampStr(params.meter.meterType, 40),
    area: clampStr(params.meter.area, MAX_LENGTHS.locationZone),
    meterNo: clampStr(params.meter.meterNo, MAX_LENGTHS.meterNo),
    accountNo: clampStr(params.meter.accountNo, MAX_LENGTHS.accountNo),
    readingDate: clampStr(params.readingDate, MAX_LENGTHS.dateStr),
    readingValue: val,
    notes: clampStr(params.notes, 400),
    technicianUid: ctx.uid,
    technicianName: clampStr(ctx.name || cleanEmail.split('@')[0], MAX_LENGTHS.techName),
    technicianEmail: clampStr(cleanEmail, MAX_LENGTHS.email),
    supervisorEmails: params.building.supervisorEmails,
    buildingMemberEmails: params.building.memberEmails,
    source: ctx.isEffectiveOnline ? 'portal' : 'offline_sync',
  };

  if (!ctx.isEffectiveOnline) {
    await enqueueOfflineOp({
      queueId: generateSafeId('op'),
      kind: 'utility_reading',
      collectionName: 'utility_readings',
      docId: id,
      payload,
      queuedAtIso: new Date().toISOString(),
      attempts: 0,
    });
    return { id, offlineQueued: true };
  }

  try {
    await setDoc(doc(db, 'utility_readings', id), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id, offlineQueued: false };
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      await enqueueOfflineOp({
        queueId: generateSafeId('op'),
        kind: 'utility_reading',
        collectionName: 'utility_readings',
        docId: id,
        payload: { ...payload, source: 'offline_sync' },
        queuedAtIso: new Date().toISOString(),
        attempts: 0,
      });
      return { id, offlineQueued: true };
    }
    handleFirestoreError(error, OperationType.CREATE, `utility_readings/${id}`);
  }
}

export async function updateUtilityReading(
  id: string,
  updates: {
    readingDate: string;
    readingValue: number;
    notes: string;
  }
): Promise<void> {
  const val = Math.max(0, Math.min(999999999, Number(updates.readingValue) || 0));
  try {
    await updateDoc(doc(db, 'utility_readings', id), {
      readingDate: clampStr(updates.readingDate, MAX_LENGTHS.dateStr),
      readingValue: val,
      notes: clampStr(updates.notes, 400),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `utility_readings/${id}`);
  }
}

export async function deleteUtilityReading(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'utility_readings', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `utility_readings/${id}`);
  }
}

export async function saveTenantSchedule(
  params: {
    id?: string;
    building: Building;
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
  },
  ctx: {
    uid: string;
    name: string;
    email: string;
    role: UserRole;
    isEffectiveOnline: boolean;
    existing?: TenantSchedule | null;
  }
): Promise<{ id: string; offlineQueued: boolean }> {
  const id = params.id || generateSafeId('sch');
  const cleanAssignedEmail = normalizeEmail(params.assignedTechEmail || ctx.email);

  if (ctx.existing) {
    try {
      await updateDoc(doc(db, 'tenant_schedules', id), {
        scheduleDate: clampStr(params.scheduleDate, MAX_LENGTHS.dateStr),
        timeSlot: clampStr(params.timeSlot, MAX_LENGTHS.timeSlot),
        unitOrLocation: clampStr(params.unitOrLocation, MAX_LENGTHS.locationZone),
        tenantName: clampStr(params.tenantName, MAX_LENGTHS.techName),
        category: clampStr(params.category, MAX_LENGTHS.discipline),
        description: clampStr(params.description, MAX_LENGTHS.workDescription),
        assignedTechUid: clampStr(params.assignedTechUid, MAX_LENGTHS.id),
        assignedTechName: clampStr(params.assignedTechName, MAX_LENGTHS.techName),
        assignedTechEmail: clampStr(cleanAssignedEmail, MAX_LENGTHS.email),
        status: params.status,
        completionNotes: clampStr(params.completionNotes, MAX_LENGTHS.completionNotes),
        updatedAt: serverTimestamp(),
      });
      return { id, offlineQueued: false };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tenant_schedules/${id}`);
    }
  }

  const payload: Omit<TenantSchedule, 'createdAt' | 'updatedAt'> = {
    id,
    buildingId: params.building.id,
    buildingCode: clampStr(params.building.code, MAX_LENGTHS.buildingCode),
    buildingName: clampStr(params.building.name, MAX_LENGTHS.buildingName),
    scheduleDate: clampStr(params.scheduleDate, MAX_LENGTHS.dateStr),
    timeSlot: clampStr(params.timeSlot, MAX_LENGTHS.timeSlot),
    unitOrLocation: clampStr(params.unitOrLocation, MAX_LENGTHS.locationZone),
    tenantName: clampStr(params.tenantName, MAX_LENGTHS.techName),
    category: clampStr(params.category, MAX_LENGTHS.discipline),
    description: clampStr(params.description, MAX_LENGTHS.workDescription),
    assignedTechUid: clampStr(params.assignedTechUid, MAX_LENGTHS.id),
    assignedTechName: clampStr(params.assignedTechName, MAX_LENGTHS.techName),
    assignedTechEmail: clampStr(cleanAssignedEmail, MAX_LENGTHS.email),
    status: params.status,
    completionNotes: clampStr(params.completionNotes, MAX_LENGTHS.completionNotes),
    createdByUid: ctx.uid,
    createdByName: clampStr(ctx.name || cleanAssignedEmail.split('@')[0], MAX_LENGTHS.techName),
    supervisorEmails: params.building.supervisorEmails,
    buildingMemberEmails: params.building.memberEmails,
    source: ctx.isEffectiveOnline ? 'portal' : 'offline_sync',
  };

  if (!ctx.isEffectiveOnline) {
    await enqueueOfflineOp({
      queueId: generateSafeId('op'),
      kind: 'tenant_schedule',
      collectionName: 'tenant_schedules',
      docId: id,
      payload,
      queuedAtIso: new Date().toISOString(),
      attempts: 0,
    });
    return { id, offlineQueued: true };
  }

  try {
    await setDoc(doc(db, 'tenant_schedules', id), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id, offlineQueued: false };
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      await enqueueOfflineOp({
        queueId: generateSafeId('op'),
        kind: 'tenant_schedule',
        collectionName: 'tenant_schedules',
        docId: id,
        payload: { ...payload, source: 'offline_sync' },
        queuedAtIso: new Date().toISOString(),
        attempts: 0,
      });
      return { id, offlineQueued: true };
    }
    handleFirestoreError(error, OperationType.CREATE, `tenant_schedules/${id}`);
  }
}

export async function updateTenantScheduleStatus(
  id: string,
  status: TenantScheduleStatus,
  completionNotes: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'tenant_schedules', id), {
      status,
      completionNotes: clampStr(completionNotes, MAX_LENGTHS.completionNotes),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tenant_schedules/${id}`);
  }
}

export async function deleteTenantSchedule(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'tenant_schedules', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `tenant_schedules/${id}`);
  }
}

export async function broadcastMaintenanceNotifications(
  params: {
    buildings: Building[];
    severity: NotificationSeverity;
    category: string;
    title: string;
    message: string;
    locationZone: string;
    expiresAtDate: string;
  },
  ctx: {
    uid: string;
    name: string;
    email: string;
  }
): Promise<string[]> {
  if (params.buildings.length === 0) {
    throw new Error('Select at least one target building team.');
  }

  const cleanEmail = normalizeEmail(ctx.email);
  const createdIds: string[] = [];
  const batch = writeBatch(db);

  for (const building of params.buildings) {
    const id = generateSafeId('ntf');
    createdIds.push(id);

    const supEmails = Array.from(
      new Set([
        ...(building.supervisorEmails || []).map(normalizeEmail),
        cleanEmail,
        ADMIN_AUTH_EMAIL,
      ])
    ).slice(0, 10);

    const memberEmails = Array.from(
      new Set([...(building.memberEmails || []).map(normalizeEmail), cleanEmail])
    ).slice(0, 50);

    const payload: Omit<MaintenanceNotification, 'createdAt' | 'updatedAt'> = {
      id,
      buildingId: building.id,
      buildingCode: clampStr(building.code, MAX_LENGTHS.buildingCode),
      buildingName: clampStr(building.name, MAX_LENGTHS.buildingName),
      severity: params.severity,
      category: clampStr(params.category, MAX_LENGTHS.discipline),
      title: clampStr(params.title, MAX_LENGTHS.title),
      message: clampStr(params.message, MAX_LENGTHS.notificationMessage),
      locationZone: clampStr(params.locationZone, MAX_LENGTHS.locationZone),
      status: 'active',
      acknowledgedByEmails: [],
      createdByUid: ctx.uid,
      createdByName: clampStr(ctx.name || cleanEmail.split('@')[0], MAX_LENGTHS.techName),
      createdByEmail: clampStr(cleanEmail, MAX_LENGTHS.email),
      resolvedByName: '',
      resolvedAtIso: '',
      expiresAtDate: clampStr(params.expiresAtDate, MAX_LENGTHS.dateStr),
      supervisorEmails: supEmails,
      buildingMemberEmails: memberEmails,
    };

    batch.set(doc(db, 'maintenance_notifications', id), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return createdIds;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'maintenance_notifications');
  }
}

export async function updateMaintenanceNotification(
  id: string,
  updates: {
    severity: NotificationSeverity;
    category: string;
    title: string;
    message: string;
    locationZone: string;
    expiresAtDate: string;
  }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'maintenance_notifications', id), {
      severity: updates.severity,
      category: clampStr(updates.category, MAX_LENGTHS.discipline),
      title: clampStr(updates.title, MAX_LENGTHS.title),
      message: clampStr(updates.message, MAX_LENGTHS.notificationMessage),
      locationZone: clampStr(updates.locationZone, MAX_LENGTHS.locationZone),
      expiresAtDate: clampStr(updates.expiresAtDate, MAX_LENGTHS.dateStr),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `maintenance_notifications/${id}`);
  }
}

export async function resolveMaintenanceNotification(
  id: string,
  resolverName: string,
  resolve: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'maintenance_notifications', id), {
      status: resolve ? 'resolved' : 'active',
      resolvedByName: resolve ? clampStr(resolverName, MAX_LENGTHS.techName) : '',
      resolvedAtIso: resolve ? new Date().toISOString() : '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `maintenance_notifications/${id}`);
  }
}

export async function acknowledgeMaintenanceNotification(
  id: string,
  email: string
): Promise<void> {
  const cleanEmail = normalizeEmail(email);
  try {
    await updateDoc(doc(db, 'maintenance_notifications', id), {
      acknowledgedByEmails: arrayUnion(cleanEmail),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `maintenance_notifications/${id}`);
  }
}

export async function deleteMaintenanceNotification(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'maintenance_notifications', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `maintenance_notifications/${id}`);
  }
}

export async function saveAsset(
  input: {
    id?: string;
    building: Building;
    assetTag: string;
    assetName: string;
    discipline: string;
    locationZone: string;
    manufacturerModel: string;
    serialNumber: string;
    ppmFrequency: PpmFrequency;
    status: 'active' | 'inactive';
  },
  ctx: {
    uid: string;
    existing?: Asset | null;
  }
): Promise<string> {
  const id = input.id || generateSafeId('ast');
  const cleanTag = clampStr(input.assetTag, MAX_LENGTHS.assetTag).toUpperCase();
  if (!cleanTag) {
    throw new Error('A unique Asset Tag / ID is required.');
  }

  try {
    if (ctx.existing) {
      await updateDoc(doc(db, 'assets', id), {
        buildingCode: clampStr(input.building.code, MAX_LENGTHS.buildingCode),
        buildingName: clampStr(input.building.name, MAX_LENGTHS.buildingName),
        assetTag: cleanTag,
        assetName: clampStr(input.assetName, MAX_LENGTHS.assetName),
        discipline: clampStr(input.discipline, MAX_LENGTHS.discipline),
        locationZone: clampStr(input.locationZone, MAX_LENGTHS.locationZone),
        manufacturerModel: clampStr(input.manufacturerModel, MAX_LENGTHS.manufacturerModel),
        serialNumber: clampStr(input.serialNumber, MAX_LENGTHS.serialNumber),
        ppmFrequency: input.ppmFrequency,
        status: input.status,
        supervisorEmails: input.building.supervisorEmails,
        buildingMemberEmails: input.building.memberEmails,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'assets', id), {
        id,
        buildingId: input.building.id,
        buildingCode: clampStr(input.building.code, MAX_LENGTHS.buildingCode),
        buildingName: clampStr(input.building.name, MAX_LENGTHS.buildingName),
        assetTag: cleanTag,
        assetName: clampStr(input.assetName, MAX_LENGTHS.assetName),
        discipline: clampStr(input.discipline, MAX_LENGTHS.discipline),
        locationZone: clampStr(input.locationZone, MAX_LENGTHS.locationZone),
        manufacturerModel: clampStr(input.manufacturerModel, MAX_LENGTHS.manufacturerModel),
        serialNumber: clampStr(input.serialNumber, MAX_LENGTHS.serialNumber),
        ppmFrequency: input.ppmFrequency,
        status: input.status,
        supervisorEmails: input.building.supervisorEmails,
        buildingMemberEmails: input.building.memberEmails,
        createdByUid: ctx.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(
      error,
      ctx.existing ? OperationType.UPDATE : OperationType.CREATE,
      `assets/${id}`
    );
  }
}

export async function deleteAsset(assetId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'assets', assetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `assets/${assetId}`);
  }
}

export async function syncAssetsFromLogs(
  params: {
    buildings: Building[];
    logs: MaintenanceLog[];
    assets: Asset[];
  },
  ctx: { uid: string }
): Promise<{ createdCount: number }> {
  const buildingMap = new Map(params.buildings.map((b) => [b.id, b]));
  const existingKeys = new Set<string>();
  for (const a of params.assets) {
    existingKeys.add(`${a.buildingId}::tag::${a.assetTag.trim().toUpperCase()}`);
    existingKeys.add(`${a.buildingId}::name::${a.assetName.trim().toLowerCase()}`);
  }

  const toCreate: Omit<Asset, 'createdAt' | 'updatedAt'>[] = [];
  let autoIdx = 1;

  for (const log of params.logs) {
    const b = buildingMap.get(log.buildingId);
    if (!b) continue;
    const rawTag = clampStr(log.assetTag, MAX_LENGTHS.assetTag).toUpperCase();
    const rawName = clampStr(log.assetName, MAX_LENGTHS.assetName);
    if (!rawName && !rawTag) continue;

    const candidateTag = rawTag || `${b.code}-${sanitizeTagSlug(rawName, autoIdx)}`;
    const tagKey = `${b.id}::tag::${candidateTag}`;
    const nameKey = `${b.id}::name::${rawName.toLowerCase()}`;
    if (existingKeys.has(tagKey) || (rawName && existingKeys.has(nameKey))) continue;

    existingKeys.add(tagKey);
    if (rawName) existingKeys.add(nameKey);
    autoIdx += 1;

    toCreate.push({
      id: generateSafeId('ast'),
      buildingId: b.id,
      buildingCode: clampStr(b.code, MAX_LENGTHS.buildingCode),
      buildingName: clampStr(b.name, MAX_LENGTHS.buildingName),
      assetTag: clampStr(candidateTag, MAX_LENGTHS.assetTag),
      assetName: clampStr(rawName || candidateTag, MAX_LENGTHS.assetName),
      discipline: clampStr(log.discipline || 'General MEP', MAX_LENGTHS.discipline),
      locationZone: clampStr(log.locationZone || '', MAX_LENGTHS.locationZone),
      manufacturerModel: '',
      serialNumber: '',
      ppmFrequency: log.ppmFrequency || 'none',
      status: 'active',
      supervisorEmails: b.supervisorEmails,
      buildingMemberEmails: b.memberEmails,
      createdByUid: ctx.uid,
    });
    if (toCreate.length >= 300) break;
  }

  if (toCreate.length === 0) return { createdCount: 0 };

  try {
    const batch = writeBatch(db);
    for (const item of toCreate) {
      batch.set(doc(db, 'assets', item.id), {
        ...item,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return { createdCount: toCreate.length };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'assets');
  }
}

