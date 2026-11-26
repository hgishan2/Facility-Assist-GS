import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  BarChart3,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  FileText,
  Gauge,
  HardHat,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { AssetsQrView } from './components/AssetsQrView';
import { AuthGate } from './components/AuthGate';
import { BuildingSetupModal } from './components/BuildingSetupModal';
import { BuildingsView } from './components/BuildingsView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExcelHubView } from './components/ExcelHubView';
import { LogDetailModal } from './components/LogDetailModal';
import { LogFormModal, type LogPrefillTemplate } from './components/LogFormModal';
import { MaintenanceLogsView } from './components/MaintenanceLogsView';
import { isActiveNotification, NotificationBanner } from './components/NotificationBanner';
import { NotificationBroadcastModal, NotificationsView } from './components/NotificationsView';
import { OperationsDashboardView } from './components/OperationsDashboardView';
import { OvertimeView } from './components/OvertimeView';
import { PpmScheduleView } from './components/PpmScheduleView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { QrScannerModal } from './components/QrScannerModal';
import { SupervisorAccountsView } from './components/SupervisorAccountsView';
import { SupervisorDashboardView } from './components/SupervisorDashboardView';
import { TeamManagementView } from './components/TeamManagementView';
import { TechnicianPortalView } from './components/TechnicianPortalView';
import { TenantSchedulesView } from './components/TenantSchedulesView';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { UtilityMetersView } from './components/UtilityMetersView';
import { WorkLogsView } from './components/WorkLogsView';
import { useGoogleSheetsAutoBackup } from './hooks/useGoogleSheetsAutoBackup';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { ThemeProvider } from './hooks/useTheme';
import { flushOfflineQueue, loadMyAccessGrant } from './lib/dataService';
import {
  auth,
  clearGoogleSheetsAccessToken,
  db,
  handleFirestoreError,
  OperationType,
  signOutUser,
  testConnection,
} from './lib/firebase';
import { getOfflineOpsQueue, getOfflineQueue } from './lib/offlineQueue';
import { buildActivePpmSchedules } from './lib/ppmSchedule';
import type { ParsedAssetQr } from './lib/qrUtils';
import {
  ADMIN_AUTH_EMAIL,
  Asset,
  Building,
  EntryType,
  MaintenanceLog,
  MaintenanceNotification,
  normalizeEmail,
  OfflineOpItem,
  OfflineQueueItem,
  OvertimeLog,
  Technician,
  TenantSchedule,
  UserRole,
  UtilityMeter,
  UtilityReading,
  WorkLog,
} from './types';

type SupervisorTab =
  | 'overview'
  | 'notifications'
  | 'ops_analytics'
  | 'work_logs'
  | 'overtime'
  | 'utility_meters'
  | 'tenant_schedules'
  | 'approvals'
  | 'schedules'
  | 'logs'
  | 'assets_qr'
  | 'buildings'
  | 'team'
  | 'supervisors'
  | 'excel'
  | 'field_portal';

type TechTab =
  | 'field_portal'
  | 'notifications'
  | 'work_logs'
  | 'overtime'
  | 'utility_meters'
  | 'tenant_schedules'
  | 'schedules'
  | 'building_logs';

interface AccessProfile {
  role: UserRole;
  status: 'active' | 'inactive';
  name: string;
  badgeId?: string;
  trade?: string;
}

function WorkspaceApp() {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessProfile, setAccessProfile] = useState<AccessProfile | null>(null);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [overtimeLogs, setOvertimeLogs] = useState<OvertimeLog[]>([]);
  const [utilityMeters, setUtilityMeters] = useState<UtilityMeter[]>([]);
  const [utilityReadings, setUtilityReadings] = useState<UtilityReading[]>([]);
  const [tenantSchedules, setTenantSchedules] = useState<TenantSchedule[]>([]);
  const [notifications, setNotifications] = useState<MaintenanceNotification[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
  const [supervisorTab, setSupervisorTab] = useState<SupervisorTab>('overview');
  const [techTab, setTechTab] = useState<TechTab>('field_portal');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logModalDefaultType, setLogModalDefaultType] = useState<EntryType>('ppm_inhouse');
  const [logPrefill, setLogPrefill] = useState<LogPrefillTemplate | null>(null);
  const [resubmitLog, setResubmitLog] = useState<MaintenanceLog | null>(null);
  const [supervisorEditLog, setSupervisorEditLog] = useState<MaintenanceLog | null>(null);
  const [selectedLog, setSelectedLog] = useState<MaintenanceLog | null>(null);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [scannedAssetFilter, setScannedAssetFilter] = useState<ParsedAssetQr | null>(null);

  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>([]);
  const [offlineOpsQueue, setOfflineOpsQueue] = useState<OfflineOpItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { browserOnline, manualOffline, isEffectiveOnline, toggleManualOffline } = useOnlineStatus();

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 4500);
  }, []);

  const refreshOfflineQueue = useCallback(async () => {
    const [items, ops] = await Promise.all([getOfflineQueue(), getOfflineOpsQueue()]);
    setOfflineQueue(items);
    setOfflineOpsQueue(ops);
  }, []);

  useEffect(() => {
    testConnection();
    refreshOfflineQueue();
  }, [refreshOfflineQueue]);

  const resolveAccess = useCallback(async (user: User | null) => {
    if (!user || !user.email) {
      setAccessProfile(null);
      setAccessLoading(false);
      return;
    }
    setAccessLoading(true);
    try {
      const grant = await loadMyAccessGrant(user.email);
      if (!grant) {
        setAccessProfile(null);
      } else {
        setAccessProfile({
          role: grant.role,
          status: grant.status,
          name: grant.name || user.displayName || user.email.split('@')[0],
          badgeId: grant.badgeId,
          trade: grant.trade,
        });
      }
    } catch {
      setAccessProfile(null);
    } finally {
      setAccessLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        clearGoogleSheetsAccessToken();
      }
      setAuthUser(user);
      setAuthReady(true);
      resolveAccess(user);
    });
    return () => unsub();
  }, [resolveAccess]);

  useEffect(() => {
    if (!authReady || !authUser?.email || !accessProfile || accessProfile.status !== 'active') {
      setBuildings([]);
      setAssets([]);
      setTechnicians([]);
      setLogs([]);
      setWorkLogs([]);
      setOvertimeLogs([]);
      setUtilityMeters([]);
      setUtilityReadings([]);
      setTenantSchedules([]);
      setNotifications([]);
      setDataLoaded(false);
      return;
    }

    const cleanEmail = normalizeEmail(authUser.email);
    const isAdminUser = accessProfile.role === 'admin' || cleanEmail === ADMIN_AUTH_EMAIL;
    const isSupOrAdmin = accessProfile.role === 'supervisor' || isAdminUser;

    const scopeQuery = (collName: string) =>
      isAdminUser
        ? collection(db, collName)
        : isSupOrAdmin
          ? query(collection(db, collName), where('supervisorEmails', 'array-contains', cleanEmail))
          : query(collection(db, collName), where('buildingMemberEmails', 'array-contains', cleanEmail));

    const buildingsQ = isAdminUser
      ? collection(db, 'buildings')
      : isSupOrAdmin
        ? query(collection(db, 'buildings'), where('supervisorEmails', 'array-contains', cleanEmail))
        : query(collection(db, 'buildings'), where('memberEmails', 'array-contains', cleanEmail));

    const unsubBuildings = onSnapshot(
      buildingsQ,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Building)
          .sort((a, b) => a.code.localeCompare(b.code));
        setBuildings(list);
        setDataLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'buildings')
    );

    const unsubAssets = onSnapshot(
      scopeQuery('assets'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Asset)
          .sort((a, b) => `${a.buildingCode}|${a.assetTag}`.localeCompare(`${b.buildingCode}|${b.assetTag}`));
        setAssets(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'assets')
    );

    let unsubTechs = () => {};
    if (isSupOrAdmin) {
      const techsQ = isAdminUser
        ? collection(db, 'technicians')
        : query(collection(db, 'technicians'), where('supervisorEmails', 'array-contains', cleanEmail));

      unsubTechs = onSnapshot(
        techsQ,
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as Technician)
            .sort((a, b) => a.name.localeCompare(b.name));
          setTechnicians(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'technicians')
      );
    }

    const unsubLogs = onSnapshot(
      scopeQuery('maintenance_logs'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as MaintenanceLog)
          .sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''));
        setLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'maintenance_logs')
    );

    const unsubWorkLogs = onSnapshot(
      scopeQuery('work_logs'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as WorkLog)
          .sort((a, b) => (b.logDate || '').localeCompare(a.logDate || ''));
        setWorkLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'work_logs')
    );

    // Overtime logs contain employee OT hours: technicians may only list their own UID per Firestore rules
    const otQuery = isAdminUser
      ? collection(db, 'overtime_logs')
      : isSupOrAdmin
        ? query(collection(db, 'overtime_logs'), where('supervisorEmails', 'array-contains', cleanEmail))
        : query(collection(db, 'overtime_logs'), where('technicianUid', '==', authUser.uid));

    const unsubOvertime = onSnapshot(
      otQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as OvertimeLog)
          .sort((a, b) => (b.otDate || '').localeCompare(a.otDate || ''));
        setOvertimeLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'overtime_logs')
    );

    const unsubMeters = onSnapshot(
      scopeQuery('utility_meters'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as UtilityMeter)
          .sort((a, b) => `${a.buildingCode}|${a.meterType}|${a.area}`.localeCompare(`${b.buildingCode}|${b.meterType}|${b.area}`));
        setUtilityMeters(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'utility_meters')
    );

    const unsubReadings = onSnapshot(
      scopeQuery('utility_readings'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as UtilityReading)
          .sort((a, b) => (b.readingDate || '').localeCompare(a.readingDate || ''));
        setUtilityReadings(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'utility_readings')
    );

    const unsubSchedules = onSnapshot(
      scopeQuery('tenant_schedules'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as TenantSchedule)
          .sort((a, b) => (a.scheduleDate || '').localeCompare(b.scheduleDate || ''));
        setTenantSchedules(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tenant_schedules')
    );

    const unsubNotifications = onSnapshot(
      scopeQuery('maintenance_notifications'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as MaintenanceNotification);
        setNotifications(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'maintenance_notifications')
    );

    return () => {
      unsubBuildings();
      unsubAssets();
      unsubTechs();
      unsubLogs();
      unsubWorkLogs();
      unsubOvertime();
      unsubMeters();
      unsubReadings();
      unsubSchedules();
      unsubNotifications();
    };
  }, [authReady, authUser, accessProfile]);

  const handleSyncOfflineQueue = useCallback(async () => {
    if (!authUser?.email || !isEffectiveOnline || syncing) return;
    const [queue, ops] = await Promise.all([getOfflineQueue(), getOfflineOpsQueue()]);
    if (queue.length === 0 && ops.length === 0) return;

    setSyncing(true);
    try {
      const res = await flushOfflineQueue({ uid: authUser.uid, email: authUser.email });
      await refreshOfflineQueue();
      if (res.syncedCount > 0) {
        showToast(`Synced ${res.syncedCount} offline report(s) automatically.`);
      }
    } finally {
      setSyncing(false);
    }
  }, [authUser, isEffectiveOnline, syncing, refreshOfflineQueue, showToast]);

  const totalOfflineQueued = offlineQueue.length + offlineOpsQueue.length;

  useEffect(() => {
    if (isEffectiveOnline && authUser && accessProfile?.status === 'active' && totalOfflineQueued > 0) {
      handleSyncOfflineQueue();
    }
  }, [isEffectiveOnline, authUser, accessProfile, totalOfflineQueued, handleSyncOfflineQueue]);

  const googleBackupSnapshot = useMemo(
    () => ({
      buildings,
      assets,
      logs,
      workLogs,
      overtimeLogs,
      utilityMeters,
      utilityReadings,
      tenantSchedules,
      notifications,
      syncedByLabel: accessProfile
        ? `${accessProfile.name} (${authUser?.email || ''})`
        : authUser?.email || 'Supervisor',
    }),
    [
      buildings,
      assets,
      logs,
      workLogs,
      overtimeLogs,
      utilityMeters,
      utilityReadings,
      tenantSchedules,
      notifications,
      accessProfile,
      authUser?.email,
    ]
  );

  const googleBackup = useGoogleSheetsAutoBackup({
    enabledForUser: Boolean(
      authUser &&
        accessProfile?.status === 'active' &&
        (accessProfile.role === 'supervisor' || accessProfile.role === 'admin')
    ),
    isEffectiveOnline,
    snapshot: googleBackupSnapshot,
    onToast: showToast,
  });

  const scopedBuildings = useMemo(() => {
    if (selectedBuildingId === 'all') return buildings;
    return buildings.filter((b) => b.id === selectedBuildingId);
  }, [buildings, selectedBuildingId]);

  const scopedAssets = useMemo(() => {
    if (selectedBuildingId === 'all') return assets;
    return assets.filter((a) => a.buildingId === selectedBuildingId);
  }, [assets, selectedBuildingId]);

  const scopedLogs = useMemo(() => {
    if (selectedBuildingId === 'all') return logs;
    return logs.filter((l) => l.buildingId === selectedBuildingId);
  }, [logs, selectedBuildingId]);

  const scopedWorkLogs = useMemo(() => {
    if (selectedBuildingId === 'all') return workLogs;
    return workLogs.filter((w) => w.buildingId === selectedBuildingId);
  }, [workLogs, selectedBuildingId]);

  const scopedOvertimeLogs = useMemo(() => {
    if (selectedBuildingId === 'all') return overtimeLogs;
    return overtimeLogs.filter((o) => o.buildingId === selectedBuildingId);
  }, [overtimeLogs, selectedBuildingId]);

  const scopedMeters = useMemo(() => {
    if (selectedBuildingId === 'all') return utilityMeters;
    return utilityMeters.filter((m) => m.buildingId === selectedBuildingId);
  }, [utilityMeters, selectedBuildingId]);

  const scopedReadings = useMemo(() => {
    if (selectedBuildingId === 'all') return utilityReadings;
    return utilityReadings.filter((r) => r.buildingId === selectedBuildingId);
  }, [utilityReadings, selectedBuildingId]);

  const scopedSchedules = useMemo(() => {
    if (selectedBuildingId === 'all') return tenantSchedules;
    return tenantSchedules.filter((s) => s.buildingId === selectedBuildingId);
  }, [tenantSchedules, selectedBuildingId]);

  const scopedNotifications = useMemo(() => {
    if (selectedBuildingId === 'all') return notifications;
    return notifications.filter((n) => n.buildingId === selectedBuildingId);
  }, [notifications, selectedBuildingId]);

  const activeNotificationsCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return scopedNotifications.filter((n) => isActiveNotification(n, today)).length;
  }, [scopedNotifications]);

  const mySubmittedLogs = useMemo(() => {
    if (!authUser) return [];
    return scopedLogs.filter((l) => l.submittedByUid === authUser.uid);
  }, [scopedLogs, authUser]);

  const pendingApprovalsCount = useMemo(
    () => scopedLogs.filter((l) => l.approvalStatus === 'pending_approval').length,
    [scopedLogs]
  );

  const openWorkLogsCount = useMemo(
    () => scopedWorkLogs.filter((w) => w.status !== 'Completed').length,
    [scopedWorkLogs]
  );

  const pendingOvertimeCount = useMemo(
    () => scopedOvertimeLogs.filter((o) => o.approvalStatus === 'pending_approval').length,
    [scopedOvertimeLogs]
  );

  const todaySchedulesCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return scopedSchedules.filter((s) => s.scheduleDate === today).length;
  }, [scopedSchedules]);

  const dueSoonPpmCount = useMemo(
    () =>
      buildActivePpmSchedules(scopedLogs).filter(
        (s) => s.urgency === 'overdue' || s.urgency === 'due_soon'
      ).length,
    [scopedLogs]
  );

  if (!authReady || accessLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-brand-700 dark:border-brand-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Loading Facility Assist workspace...
          </p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <AuthGate mode="signin" />;
  }

  if (!accessProfile || accessProfile.status !== 'active') {
    return (
      <AuthGate
        mode="unauthorized"
        userEmail={authUser.email}
        inactive={accessProfile?.status === 'inactive'}
        onRetryAccess={() => resolveAccess(authUser)}
      />
    );
  }

  const isAdmin =
    accessProfile.role === 'admin' ||
    normalizeEmail(authUser.email || '') === ADMIN_AUTH_EMAIL;
  const isSupervisor = accessProfile.role === 'supervisor' || isAdmin;

  const openNewLogModal = (defaultType: EntryType = 'ppm_inhouse', prefill?: LogPrefillTemplate) => {
    setSupervisorEditLog(null);
    setResubmitLog(null);
    setLogPrefill(prefill || null);
    setLogModalDefaultType(defaultType);
    setLogModalOpen(true);
  };

  const supervisorNavItems: { id: SupervisorTab; label: string; icon: React.ReactNode; badge?: number; badgeTone?: 'red' | 'amber' }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'notifications',
      label: 'Urgent Alerts',
      icon: <Megaphone className="w-4 h-4" />,
      badge: activeNotificationsCount > 0 ? activeNotificationsCount : undefined,
      badgeTone: 'red',
    },
    { id: 'ops_analytics', label: 'Operations Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    {
      id: 'work_logs',
      label: 'Work Logs',
      icon: <FileText className="w-4 h-4" />,
      badge: openWorkLogsCount > 0 ? openWorkLogsCount : undefined,
    },
    {
      id: 'overtime',
      label: 'Overtime',
      icon: <Clock className="w-4 h-4" />,
      badge: pendingOvertimeCount > 0 ? pendingOvertimeCount : undefined,
    },
    { id: 'utility_meters', label: 'Utility Meters', icon: <Gauge className="w-4 h-4" /> },
    {
      id: 'tenant_schedules',
      label: 'Tenant Schedules',
      icon: <CalendarCheck2 className="w-4 h-4" />,
      badge: todaySchedulesCount > 0 ? todaySchedulesCount : undefined,
    },
    {
      id: 'schedules',
      label: 'PPM Schedule',
      icon: <CalendarClock className="w-4 h-4" />,
      badge: dueSoonPpmCount > 0 ? dueSoonPpmCount : undefined,
    },
    {
      id: 'approvals',
      label: 'Approval Queue',
      icon: <ClipboardCheck className="w-4 h-4" />,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
    },
    { id: 'logs', label: 'Maintenance Register', icon: <ListChecks className="w-4 h-4" /> },
    { id: 'assets_qr', label: 'Asset QR Labels', icon: <QrCode className="w-4 h-4" /> },
    { id: 'buildings', label: 'Buildings', icon: <Building2 className="w-4 h-4" /> },
    { id: 'team', label: 'Team & Access', icon: <Users className="w-4 h-4" /> },
    ...(isAdmin
      ? [{ id: 'supervisors' as SupervisorTab, label: 'Supervisor Accounts', icon: <ShieldCheck className="w-4 h-4" /> }]
      : []),
    { id: 'excel', label: 'Reports & Backup', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'field_portal', label: 'Technician Portal', icon: <HardHat className="w-4 h-4" /> },
  ];

  const techNavItems: { id: TechTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'field_portal', label: 'Field Portal', icon: <HardHat className="w-4 h-4" /> },
    {
      id: 'notifications',
      label: 'Urgent Alerts',
      icon: <Megaphone className="w-4 h-4" />,
      badge: activeNotificationsCount > 0 ? activeNotificationsCount : undefined,
    },
    { id: 'work_logs', label: 'Work Log', icon: <FileText className="w-4 h-4" /> },
    { id: 'overtime', label: 'Overtime', icon: <Clock className="w-4 h-4" /> },
    { id: 'utility_meters', label: 'Utility Meters', icon: <Gauge className="w-4 h-4" /> },
    { id: 'tenant_schedules', label: 'Tenant Schedules', icon: <CalendarCheck2 className="w-4 h-4" /> },
    { id: 'schedules', label: 'PPM Schedule', icon: <CalendarClock className="w-4 h-4" /> },
    { id: 'building_logs', label: 'Building Register', icon: <ListChecks className="w-4 h-4" /> },
  ];

  const currentTabTitle = isSupervisor
    ? supervisorNavItems.find((i) => i.id === supervisorTab)?.label || 'Overview'
    : techNavItems.find((i) => i.id === techTab)?.label || 'Field Portal';

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between bg-sidebar-bg text-slate-100 border-r border-sidebar-border overflow-y-auto">
      <div>
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-700 flex items-center justify-center text-white transition-colors">
              <Building2 className="w-4 h-4" />
            </div>
            <span className="font-display text-base font-bold tracking-tight text-white">
              Facility Assist
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1 rounded text-slate-400 hover:text-white"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-3 space-y-1">
          {isSupervisor
            ? supervisorNavItems.map((item) => {
                const active = supervisorTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSupervisorTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-brand-700 text-white'
                        : 'text-slate-300 hover:bg-sidebar-surface hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      {item.icon}
                      {item.label}
                    </span>
                    {item.badge !== undefined && (
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold tabular-nums ${
                          item.badgeTone === 'red'
                            ? 'bg-red-600 text-white'
                            : 'bg-amber-500 text-slate-950'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })
            : techNavItems.map((item) => {
                const active = techTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTechTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-brand-700 text-white'
                        : 'text-slate-300 hover:bg-sidebar-surface hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      {item.icon}
                      {item.label}
                    </span>
                    {item.badge !== undefined && (
                      <span className="px-1.5 py-0.5 rounded bg-red-600 text-white font-mono text-[11px] font-semibold tabular-nums">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
        </nav>
      </div>

      <div className="p-4 border-t border-sidebar-border space-y-3">
        <ThemeSwitcher variant="sidebar" />

        <div className="p-3 rounded-lg bg-sidebar-surface/80 border border-sidebar-border space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-slate-200">
              {isEffectiveOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  Online Sync Active
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  {!browserOnline ? 'No Signal (Offline)' : 'Field Offline Mode'}
                </>
              )}
            </span>
            {totalOfflineQueued > 0 && (
              <span className="font-mono text-[11px] text-amber-300 tabular-nums">
                {totalOfflineQueued} queued
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleManualOffline()}
              className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium border transition-colors ${
                manualOffline
                  ? 'bg-amber-600 border-amber-500 text-white'
                  : 'bg-sidebar-bg border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {manualOffline ? 'Go Online & Sync' : 'Work Offline'}
            </button>
            {totalOfflineQueued > 0 && isEffectiveOnline && (
              <button
                type="button"
                onClick={handleSyncOfflineQueue}
                disabled={syncing}
                className="p-1.5 rounded bg-brand-700 text-white hover:bg-brand-600"
                title="Sync Offline Queue"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">{accessProfile.name}</p>
            <p className="text-[11px] text-slate-400 truncate">
              {isAdmin
                ? 'Portfolio Admin · admin'
                : isSupervisor
                  ? `Supervisor · ${(authUser.email || '').replace('@siteledger.internal', '')}`
                  : `Technician · ${accessProfile.badgeId || 'Field'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOutUser()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-sidebar-surface shrink-0"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <div className="pt-2.5 border-t border-sidebar-border/80 flex items-center gap-2 text-[11px] text-slate-400">
          <span className="w-5 h-5 rounded bg-sidebar-surface border border-sidebar-border text-brand-400 font-mono text-[10px] font-semibold flex items-center justify-center shrink-0">
            IM
          </span>
          <span className="truncate">Developed by Ishan Madhushanka</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex transition-colors">
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 h-full">{sidebarContent}</div>
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 bg-slate-950/60"
          />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 h-16 flex items-center justify-between gap-4 sticky top-0 z-30 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
                {isAdmin ? 'Admin' : isSupervisor ? 'Supervisor' : 'Technician'}
              </span>
              <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentTabTitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setQrScannerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
              title="Scan Asset QR Code"
            >
              <QrCode className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
              <span className="hidden sm:inline">Scan QR</span>
            </button>

            {buildings.length > 0 && (
              <select
                value={selectedBuildingId}
                onChange={(e) => setSelectedBuildingId(e.target.value)}
                aria-label="Filter by Building"
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 max-w-[180px] sm:max-w-[240px]"
              >
                <option value="all">All Buildings ({buildings.length})</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            )}

            <PWAInstallButton />
          </div>
        </header>

        {!isEffectiveOnline && (
          <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800 px-4 sm:px-8 py-2 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <span className="flex items-center gap-2 font-medium">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              {!browserOnline
                ? 'Offline Mode — Cached building data active. New submissions will auto-sync when online.'
                : 'Field Offline Mode Active — Submissions are queued locally until you resume sync.'}
            </span>
            {browserOnline && manualOffline && (
              <button
                type="button"
                onClick={() => toggleManualOffline(false)}
                className="font-semibold underline hover:text-amber-950 dark:hover:text-amber-100 whitespace-nowrap"
              >
                Resume Sync
              </button>
            )}
          </div>
        )}

        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 dark:bg-slate-800 border border-slate-700 text-white text-xs font-medium shadow-lg">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          {((isSupervisor &&
            supervisorTab !== 'overview' &&
            supervisorTab !== 'field_portal' &&
            supervisorTab !== 'notifications') ||
            (!isSupervisor && techTab !== 'field_portal' && techTab !== 'notifications')) && (
            <NotificationBanner
              compactMode={true}
              notifications={scopedNotifications}
              userEmail={authUser.email || ''}
              userName={accessProfile.name}
              isSupervisor={isSupervisor}
              onOpenNotifications={() =>
                isSupervisor ? setSupervisorTab('notifications') : setTechTab('notifications')
              }
              onToast={showToast}
            />
          )}

          {isSupervisor &&
          dataLoaded &&
          buildings.length === 0 &&
          supervisorTab !== 'excel' &&
          supervisorTab !== 'supervisors' ? (
            <div className="space-y-6 py-4">
              <BuildingSetupModal
                isInitialOnboarding
                uid={authUser.uid}
                email={authUser.email || ''}
                role={accessProfile.role}
                technicians={technicians}
                onSaved={() => showToast('First building configured!')}
              />
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
                <button
                  type="button"
                  onClick={() => setSupervisorTab('excel')}
                  className="font-medium text-brand-700 dark:text-brand-400 hover:underline"
                >
                  Or import buildings &amp; logs in bulk using the Excel template
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setSupervisorTab('supervisors')}
                    className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    Or create Supervisor Accounts first
                  </button>
                )}
              </div>
            </div>
          ) : isSupervisor ? (
            <>
              {supervisorTab === 'overview' && (
                <SupervisorDashboardView
                  buildings={buildings}
                  logs={scopedLogs}
                  technicians={technicians}
                  workLogs={scopedWorkLogs}
                  overtimeLogs={scopedOvertimeLogs}
                  utilityMeters={scopedMeters}
                  utilityReadings={scopedReadings}
                  tenantSchedules={scopedSchedules}
                  notifications={scopedNotifications}
                  userEmail={authUser.email || ''}
                  userName={accessProfile.name}
                  isAdmin={isAdmin}
                  assetsCount={scopedAssets.length}
                  onSelectLog={setSelectedLog}
                  onNavigate={setSupervisorTab}
                  onCreateNew={openNewLogModal}
                  onBroadcastAlert={() => setBroadcastModalOpen(true)}
                  onOpenQrScanner={() => setQrScannerOpen(true)}
                  onToast={showToast}
                />
              )}

              {supervisorTab === 'notifications' && (
                <NotificationsView
                  buildings={buildings}
                  notifications={scopedNotifications}
                  technicians={technicians}
                  selectedBuildingId={selectedBuildingId}
                  user={{
                    uid: authUser.uid,
                    name: accessProfile.name,
                    email: authUser.email || '',
                    role: accessProfile.role,
                  }}
                  onToast={showToast}
                />
              )}

              {supervisorTab === 'ops_analytics' && (
                <OperationsDashboardView
                  buildings={scopedBuildings}
                  workLogs={scopedWorkLogs}
                  maintenanceLogs={scopedLogs}
                  overtimeLogs={scopedOvertimeLogs}
                  utilityMeters={scopedMeters}
                  utilityReadings={scopedReadings}
                  tenantSchedules={scopedSchedules}
                  technicians={technicians}
                  user={{ name: accessProfile.name, email: authUser.email || '' }}
                />
              )}

              {supervisorTab === 'work_logs' && (
                <WorkLogsView
                  buildings={scopedBuildings}
                  workLogs={scopedWorkLogs}
                  technicians={technicians}
                  user={{
                    uid: authUser.uid,
                    name: accessProfile.name,
                    email: authUser.email || '',
                    role: accessProfile.role,
                  }}
                  isEffectiveOnline={isEffectiveOnline}
                  onToast={(msg) => {
                    refreshOfflineQueue();
                    showToast(msg);
                  }}
                />
              )}

              {supervisorTab === 'overtime' && (
                <OvertimeView
                  buildings={scopedBuildings}
                  overtimeLogs={scopedOvertimeLogs}
                  technicians={technicians}
                  user={{
                    uid: authUser.uid,
                    name: accessProfile.name,
                    badgeId: accessProfile.badgeId,
                    email: authUser.email || '',
                    role: accessProfile.role,
                  }}
                  isEffectiveOnline={isEffectiveOnline}
                  onToast={(msg) => {
                    refreshOfflineQueue();
                    showToast(msg);
                  }}
                />
              )}

              {supervisorTab === 'utility_meters' && (
                <UtilityMetersView
                  buildings={scopedBuildings}
                  utilityMeters={scopedMeters}
                  utilityReadings={scopedReadings}
                  user={{
                    uid: authUser.uid,
                    name: accessProfile.name,
                    email: authUser.email || '',
                    role: accessProfile.role,
                  }}
                  isEffectiveOnline={isEffectiveOnline}
                  onToast={(msg) => {
                    refreshOfflineQueue();
                    showToast(msg);
                  }}
                />
              )}

              {supervisorTab === 'tenant_schedules' && (
                <TenantSchedulesView
                  buildings={scopedBuildings}
                  schedules={scopedSchedules}
                  technicians={technicians}
                  user={{
                    uid: authUser.uid,
                    name: accessProfile.name,
                    email: authUser.email || '',
                    role: accessProfile.role,
                  }}
                  isEffectiveOnline={isEffectiveOnline}
                  onToast={(msg) => {
                    refreshOfflineQueue();
                    showToast(msg);
                  }}
                />
              )}

              {supervisorTab === 'schedules' && (
                <PpmScheduleView
                  logs={scopedLogs}
                  onLogNextCycle={(prefill) =>
                    openNewLogModal(prefill.entryType || 'ppm_inhouse', prefill)
                  }
                  onSelectLog={setSelectedLog}
                />
              )}

              {supervisorTab === 'approvals' && (
                <MaintenanceLogsView
                  key="approvals-view"
                  logs={scopedLogs}
                  assets={scopedAssets}
                  offlineQueue={offlineQueue}
                  initialApprovalFilter="pending_approval"
                  onSelectLog={setSelectedLog}
                  onCreateNew={openNewLogModal}
                  onOpenQrScanner={() => setQrScannerOpen(true)}
                />
              )}

              {supervisorTab === 'logs' && (
                <MaintenanceLogsView
                  key="all-logs-view"
                  logs={scopedLogs}
                  assets={scopedAssets}
                  offlineQueue={offlineQueue}
                  initialApprovalFilter="all"
                  scannedAssetFilter={scannedAssetFilter}
                  onSelectLog={setSelectedLog}
                  onCreateNew={openNewLogModal}
                  onOpenQrScanner={() => setQrScannerOpen(true)}
                  onClearAssetFilter={() => setScannedAssetFilter(null)}
                />
              )}

              {supervisorTab === 'assets_qr' && (
                <AssetsQrView
                  assets={scopedAssets}
                  buildings={buildings}
                  logs={logs}
                  user={{ uid: authUser.uid }}
                  onInspectAssetLogs={(asset) => {
                    setScannedAssetFilter({
                      raw: asset.assetTag,
                      assetId: asset.id,
                      assetTag: asset.assetTag,
                      buildingCode: asset.buildingCode,
                    });
                    setSupervisorTab('logs');
                  }}
                  onToast={showToast}
                />
              )}

              {supervisorTab === 'buildings' && (
                <BuildingsView
                  buildings={buildings}
                  logs={logs}
                  technicians={technicians}
                  user={{ uid: authUser.uid, email: authUser.email || '' }}
                  role={accessProfile.role}
                />
              )}

              {supervisorTab === 'team' && (
                <TeamManagementView
                  technicians={technicians}
                  buildings={buildings}
                  user={{ uid: authUser.uid, email: authUser.email || '' }}
                  role={accessProfile.role}
                />
              )}

              {supervisorTab === 'supervisors' && isAdmin && (
                <SupervisorAccountsView
                  technicians={technicians}
                  buildings={buildings}
                  user={{ uid: authUser.uid, email: authUser.email || '' }}
                />
              )}

              {supervisorTab === 'excel' && (
                <ExcelHubView
                  buildings={buildings}
                  assets={assets}
                  technicians={technicians}
                  logs={logs}
                  workLogs={workLogs}
                  overtimeLogs={overtimeLogs}
                  utilityMeters={utilityMeters}
                  utilityReadings={utilityReadings}
                  tenantSchedules={tenantSchedules}
                  user={{
                    uid: authUser.uid,
                    name: accessProfile.name,
                    email: authUser.email || '',
                    role: accessProfile.role,
                  }}
                  googleBackup={googleBackup}
                  onImportComplete={(res) => {
                    const totalImported =
                      res.createdBuildings +
                      res.createdTechnicians +
                      res.createdLogs +
                      res.createdWorkLogs +
                      res.createdOvertime +
                      res.createdMeters +
                      res.createdReadings +
                      res.createdSchedules;
                    showToast(
                      `Database populated with ${totalImported.toLocaleString()} records (${res.createdWorkLogs} work logs, ${res.createdReadings} readings, ${res.createdOvertime} overtime, ${res.createdSchedules} schedules).`
                    );
                  }}
                />
              )}

              {supervisorTab === 'field_portal' && (
                <TechnicianPortalView
                  buildings={buildings}
                  myLogs={mySubmittedLogs}
                  notifications={scopedNotifications}
                  offlineQueue={offlineQueue}
                  offlineOpsCount={offlineOpsQueue.length}
                  openWorkLogsCount={openWorkLogsCount}
                  todaySchedulesCount={todaySchedulesCount}
                  isEffectiveOnline={isEffectiveOnline}
                  syncing={syncing}
                  user={{
                    name: accessProfile.name,
                    email: authUser.email || '',
                    badgeId: accessProfile.badgeId || (isAdmin ? 'ADMIN' : 'SUP'),
                    trade: accessProfile.trade || (isAdmin ? 'Portfolio Admin' : 'Facility Supervisor'),
                  }}
                  onCreateNew={openNewLogModal}
                  onSelectLog={setSelectedLog}
                  onSyncNow={handleSyncOfflineQueue}
                  onOpenModule={(t) => setSupervisorTab(t)}
                  onOpenNotifications={() => setSupervisorTab('notifications')}
                  onOpenQrScanner={() => setQrScannerOpen(true)}
                  onToast={showToast}
                />
              )}
            </>
          ) : (
            <>
              {techTab === 'field_portal' && (
                <TechnicianPortalView
                  buildings={buildings}
                  myLogs={mySubmittedLogs}
                  notifications={scopedNotifications}
                  offlineQueue={offlineQueue}
                  offlineOpsCount={offlineOpsQueue.length}
                  openWorkLogsCount={openWorkLogsCount}
                  todaySchedulesCount={todaySchedulesCount}
                  isEffectiveOnline={isEffectiveOnline}
                  syncing={syncing}
                  user={{
                    name: accessProfile.name,
                    email: authUser.email || '',
                    badgeId: accessProfile.badgeId,
                    trade: accessProfile.trade,
                  }}
                  onCreateNew={openNewLogModal}
                  onSelectLog={setSelectedLog}
                  onSyncNow={handleSyncOfflineQueue}
                  onOpenModule={(t) => setTechTab(t)}
                  onOpenNotifications={() => setTechTab('notifications')}
                  onOpenQrScanner={() => setQrScannerOpen(true)}
                  onToast={showToast}
                />
              )}

              {techTab === 'notifications' && (
                <NotificationsView
                  buildings={buildings}
                  notifications={scopedNotifications}
                  technicians={technicians}
                  selectedBuildingId={selectedBuildingId}
                  user={{
                    uid: authUser.uid,
                    name: accessProfile.name,
                    email: authUser.email || '',
                    role: accessProfile.role,
                  }}
                  onToast={showToast}
                />
              )}

              {techTab === 'work_logs' && (
                <WorkLogsView
                  buildings={scopedBuildings}
                  workLogs={scopedWorkLogs}
                  technicians={technicians}
                  user={{
                    uid: authUser.uid,
                    name: accessProfile.name,
                    email: authUser.email || '',
                    role: accessProfile.role,
                  }}
                  isEffectiveOnline={isEffectiveOnline}
                  onToast={(msg) => {
                    refreshOfflineQueue();
                    showToast(msg);
                  }}
                />
              )}

              {techTab === 'overtime' && (
                <OvertimeView
                  buildings={scopedBuildings}
                  overtimeLogs={scopedOvertimeLogs}
                  technicians={technicians}
                  user={{
                    uid: authUser.uid,
                    name: accessProfile.name,
                    badgeId: accessProfile.badgeId,
                    email: authUser.email || '',
                    role: accessProfile.role,
                  }}
                  isEffectiveOnline={isEffectiveOnline}
                  onToast={(msg) => {
                    refreshOfflineQueue();
                    showToast(msg);
                  }}
                />
              )}

              {techTab === 'utility_meters' && (
                <UtilityMetersView
                  buildings={scopedBuildings}
                  utilityMeters={scopedMeters}
                  utilityReadings={scopedReadings}
                  user={{
                    uid: authUser.uid,
                    name: accessProfile.name,
                    email: authUser.email || '',
                    role: accessProfile.role,
                  }}
                  isEffectiveOnline={isEffectiveOnline}
                  onToast={(msg) => {
                    refreshOfflineQueue();
                    showToast(msg);
                  }}
                />
              )}

              {techTab === 'tenant_schedules' && (
                <TenantSchedulesView
                  buildings={scopedBuildings}
                  schedules={scopedSchedules}
                  technicians={technicians}
                  user={{
                    uid: authUser.uid,
                    name: accessProfile.name,
                    email: authUser.email || '',
                    role: accessProfile.role,
                  }}
                  isEffectiveOnline={isEffectiveOnline}
                  onToast={(msg) => {
                    refreshOfflineQueue();
                    showToast(msg);
                  }}
                />
              )}

              {techTab === 'schedules' && (
                <PpmScheduleView
                  logs={scopedLogs}
                  onLogNextCycle={(prefill) =>
                    openNewLogModal(prefill.entryType || 'ppm_inhouse', prefill)
                  }
                  onSelectLog={setSelectedLog}
                />
              )}

              {techTab === 'building_logs' && (
                <MaintenanceLogsView
                  key="tech-building-logs"
                  logs={scopedLogs}
                  assets={scopedAssets}
                  offlineQueue={offlineQueue}
                  scannedAssetFilter={scannedAssetFilter}
                  onSelectLog={setSelectedLog}
                  onCreateNew={openNewLogModal}
                  onOpenQrScanner={() => setQrScannerOpen(true)}
                  onClearAssetFilter={() => setScannedAssetFilter(null)}
                />
              )}
            </>
          )}
        </main>
      </div>

      {logModalOpen && buildings.length > 0 && (
        <LogFormModal
          buildings={buildings}
          defaultBuildingId={selectedBuildingId}
          defaultEntryType={logModalDefaultType}
          prefillTemplate={logPrefill}
          resubmitLog={resubmitLog}
          supervisorEditLog={supervisorEditLog}
          user={{
            uid: authUser.uid,
            name: accessProfile.name,
            email: authUser.email || '',
            role: accessProfile.role,
          }}
          isEffectiveOnline={isEffectiveOnline}
          onClose={() => {
            setLogModalOpen(false);
            setResubmitLog(null);
            setSupervisorEditLog(null);
            setLogPrefill(null);
          }}
          onSubmitted={(res) => {
            refreshOfflineQueue();
            showToast(
              res.offlineQueued
                ? 'Saved to Offline Queue. Will auto-sync when online.'
                : res.isSupervisorEdit
                  ? 'Maintenance record updated.'
                  : accessProfile.role === 'technician'
                    ? 'Submitted for Supervisor approval.'
                    : 'Maintenance log saved.'
            );
          }}
        />
      )}

      {selectedLog && (
        <LogDetailModal
          log={selectedLog}
          user={{
            uid: authUser.uid,
            name: accessProfile.name,
            role: accessProfile.role,
          }}
          onClose={() => setSelectedLog(null)}
          onResubmitRequested={(logToEdit) => {
            setSelectedLog(null);
            setSupervisorEditLog(null);
            setLogPrefill(null);
            setResubmitLog(logToEdit);
            setLogModalOpen(true);
          }}
          onSupervisorEditRequested={(logToEdit) => {
            setSelectedLog(null);
            setResubmitLog(null);
            setLogPrefill(null);
            setSupervisorEditLog(logToEdit);
            setLogModalOpen(true);
          }}
        />
      )}

      {broadcastModalOpen && isSupervisor && (
        <NotificationBroadcastModal
          buildings={buildings}
          defaultBuildingId={selectedBuildingId}
          user={{
            uid: authUser.uid,
            name: accessProfile.name,
            email: authUser.email || '',
          }}
          onClose={() => setBroadcastModalOpen(false)}
          onSaved={showToast}
        />
      )}

      {qrScannerOpen && (
        <QrScannerModal
          assets={assets}
          logs={logs}
          onAssetScanned={(parsed) => {
            setScannedAssetFilter(parsed);
            setQrScannerOpen(false);
            if (isSupervisor) {
              setSupervisorTab('logs');
            } else {
              setTechTab('building_logs');
            }
            showToast(`Filtered logs for Asset ${parsed.assetTag}`);
          }}
          onClose={() => setQrScannerOpen(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <WorkspaceApp />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
