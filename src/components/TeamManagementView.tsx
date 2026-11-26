import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import {
  deleteTechnician,
  type Gst1TeamProvisionResult,
  retryProvisionTechnicianLogin,
  saveTechnician,
} from '../lib/dataService';
import {
  ADMIN_AUTH_EMAIL,
  Building,
  GST1_SUPERVISOR_PRESET,
  GST1_TECHNICIANS_PRESET,
  normalizeEmail,
  Technician,
  TRADE_OPTIONS,
  UserRole,
} from '../types';

interface TeamManagementViewProps {
  technicians: Technician[];
  buildings: Building[];
  user: { uid: string; email: string };
  role?: UserRole;
  syncingRecords?: boolean;
  onSyncStaffRecords?: () => void;
  provisioningGst1?: boolean;
  gst1Result?: Gst1TeamProvisionResult | null;
  onProvisionGst1Team?: () => void;
}

function generatePasscode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'FM-';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export const TeamManagementView: React.FC<TeamManagementViewProps> = ({
  technicians,
  buildings,
  user,
  role = 'supervisor',
  syncingRecords = false,
  onSyncStaffRecords,
  provisioningGst1 = false,
  gst1Result = null,
  onProvisionGst1Team,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [badgeId, setBadgeId] = useState('');
  const [trade, setTrade] = useState<string>(TRADE_OPTIONS[0]);
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [assignedBuildingIds, setAssignedBuildingIds] = useState<string[]>([]);
  const [ownerSupervisorEmail, setOwnerSupervisorEmail] = useState(normalizeEmail(user.email));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [providerNeedsEnable, setProviderNeedsEnable] = useState(false);
  const [lastProvisionedCreds, setLastProvisionedCreds] = useState<{
    name: string;
    badgeId: string;
    passcode: string;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  const [activatingTech, setActivatingTech] = useState<Technician | null>(null);
  const [activationPasscode, setActivationPasscode] = useState('');
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [copiedGst1All, setCopiedGst1All] = useState(false);

  const technicianRows = useMemo(
    () => technicians.filter((t) => t.role === 'technician'),
    [technicians]
  );

  const supervisorAccounts = useMemo(
    () => technicians.filter((t) => t.role === 'supervisor'),
    [technicians]
  );

  const openAddModal = () => {
    setEditingTech(null);
    setName('');
    setPasscode(generatePasscode());
    setBadgeId(`TECH-${String(technicianRows.length + 1).padStart(2, '0')}`);
    setTrade(TRADE_OPTIONS[0]);
    setPhone('');
    setStatus('active');
    setOwnerSupervisorEmail(normalizeEmail(user.email));
    setAssignedBuildingIds(buildings.filter((b) => b.status === 'active').map((b) => b.id));
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (tech: Technician) => {
    setEditingTech(tech);
    setName(tech.name);
    setPasscode('');
    setBadgeId(tech.badgeId);
    setTrade(tech.trade);
    setPhone(tech.phone);
    setStatus(tech.status);
    const existingOwner = tech.supervisorEmails.find(
      (e) => normalizeEmail(e) !== ADMIN_AUTH_EMAIL
    );
    setOwnerSupervisorEmail(normalizeEmail(existingOwner || user.email));
    setAssignedBuildingIds(tech.assignedBuildingIds);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const toggleBuildingAssignment = (bId: string) => {
    setAssignedBuildingIds((prev) =>
      prev.includes(bId) ? prev.filter((id) => id !== bId) : [...prev, bId]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !badgeId.trim()) {
      setErrorMsg('Full Name and Badge ID are required.');
      return;
    }
    if (!editingTech && passcode.trim().length < 4) {
      setErrorMsg('Passcode must be at least 4 characters (e.g. Employee Code).');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await saveTechnician(
        {
          id: editingTech?.id,
          name,
          email: editingTech?.email || '',
          authMode: 'badge_passcode',
          passcode: passcode.trim() || undefined,
          badgeId,
          trade,
          phone,
          role: 'technician',
          status,
          assignedBuildingIds,
          ownerSupervisorEmail: role === 'admin' ? ownerSupervisorEmail : undefined,
        },
        {
          uid: user.uid,
          email: user.email,
          role,
          technicians,
          buildings,
          existing: editingTech,
        }
      );

      if (res.authStatus === 'provider_disabled') {
        setProviderNeedsEnable(true);
      } else if (res.authStatus === 'created' && passcode.trim()) {
        setProviderNeedsEnable(false);
        setLastProvisionedCreds({
          name: name.trim(),
          badgeId: badgeId.trim().toUpperCase(),
          passcode: passcode.trim(),
        });
      }
      setModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save technician profile.');
    } finally {
      setSaving(false);
    }
  };

  const openActivationModal = (tech: Technician) => {
    setActivatingTech(tech);
    setActivationPasscode(generatePasscode());
    setActivationError(null);
  };

  const handleConfirmActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activatingTech) return;
    if (activationPasscode.trim().length < 4) {
      setActivationError('Passcode must be at least 4 characters (e.g. Employee Code).');
      return;
    }

    setActivating(true);
    setActivationError(null);
    try {
      const res = await retryProvisionTechnicianLogin(activatingTech, activationPasscode.trim(), {
        uid: user.uid,
        email: user.email,
        role,
        technicians,
        buildings,
      });
      if (res.authStatus === 'provider_disabled') {
        setProviderNeedsEnable(true);
        setActivationError(
          'Email/Password sign-in is still disabled in Firebase Authentication. Enable it first, then click Activate Login again.'
        );
      } else {
        setProviderNeedsEnable(false);
        setLastProvisionedCreds({
          name: activatingTech.name,
          badgeId: activatingTech.badgeId,
          passcode: activationPasscode.trim(),
        });
        setActivatingTech(null);
      }
    } catch (err) {
      setActivationError(err instanceof Error ? err.message : 'Provisioning retry failed.');
    } finally {
      setActivating(false);
    }
  };

  const handleCopyCreds = () => {
    if (!lastProvisionedCreds) return;
    const text = `Facility Assist Technician Login\nURL: ${window.location.origin}\nBadge ID: ${lastProvisionedCreds.badgeId}\nPasscode: ${lastProvisionedCreds.passcode}`;
    navigator.clipboard?.writeText(text);
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 2500);
  };

  const handleCopyGst1All = () => {
    const lines = [
      `Facility Assist — GST1 Staff Credentials (${window.location.origin})`,
      `Supervisor: ${GST1_SUPERVISOR_PRESET.name} | Username: ${GST1_SUPERVISOR_PRESET.username} | Password: ${GST1_SUPERVISOR_PRESET.password}`,
      ...GST1_TECHNICIANS_PRESET.map(
        (t) => `${t.name} (${t.trade}) | Emp Code / Username: ${t.badgeId} | Password: ${t.badgeId}`
      ),
    ];
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopiedGst1All(true);
    setTimeout(() => setCopiedGst1All(false), 2500);
  };

  const handleDelete = async (tech: Technician) => {
    await deleteTechnician(tech, { email: user.email, role, technicians, buildings });
    setConfirmDeleteId(null);
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600';
  const labelClass = 'block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Technician Team &amp; Badge Access
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Provision your field technicians with a Badge ID &amp; Passcode and assign them to your managed buildings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onProvisionGst1Team && (
            <button
              type="button"
              onClick={onProvisionGst1Team}
              disabled={provisioningGst1 || syncingRecords}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/50 text-brand-800 dark:text-brand-200 text-xs font-medium hover:bg-brand-100 dark:hover:bg-brand-900/60 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <UserCheck className={`w-3.5 h-3.5 ${provisioningGst1 ? 'animate-pulse' : ''}`} />
              {provisioningGst1 ? 'Setting up GST1...' : 'Setup GST1 Team & Sort Records'}
            </button>
          )}
          {onSyncStaffRecords && (
            <button
              type="button"
              onClick={onSyncStaffRecords}
              disabled={syncingRecords || provisioningGst1}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingRecords ? 'animate-spin' : ''}`} />
              {syncingRecords ? 'Syncing Records...' : 'Sync Existing Records'}
            </button>
          )}
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 transition-colors whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            Add Technician
          </button>
        </div>
      </div>

      {gst1Result && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-emerald-950 dark:text-emerald-100 space-y-0.5">
              <p className="font-semibold">
                GST1 Team Accounts Ready · {gst1Result.repairSummary.totalUpdated} existing record(s) linked &amp; normalized
                {gst1Result.dedupedProfilesCount > 0
                  ? ` · ${gst1Result.dedupedProfilesCount} duplicate profile(s) merged`
                  : ''}
              </p>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                Each technician logs in with their Employee Code as both Badge ID and Passcode. Name variations (e.g. short names vs full names) are merged onto the same canonical account without duplicating records.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyGst1All}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-xs font-medium text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 whitespace-nowrap"
            >
              {copiedGst1All ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedGst1All ? 'Copied All Logins' : 'Copy All GST1 Logins'}
            </button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px]">
            {gst1Result.accounts.map((acc) => (
              <div
                key={`${acc.role}_${acc.loginId}`}
                className="px-2.5 py-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {acc.role === 'supervisor' ? 'SUP: ' : ''}
                    {acc.name}
                  </p>
                  <p className="font-mono text-slate-600 dark:text-slate-400">
                    ID: <strong>{acc.loginId}</strong> · Pass: <strong>{acc.password}</strong>
                  </p>
                </div>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 shrink-0">
                  {acc.authStatus === 'created'
                    ? 'Created'
                    : acc.authStatus === 'provider_disabled'
                      ? 'Enable Auth'
                      : 'Ready'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {providerNeedsEnable && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-950 dark:text-amber-100 space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="font-semibold">
                One-Time Step Needed: Enable Email/Password Provider in Firebase Console
              </p>
              <p className="text-amber-900 dark:text-amber-200">
                To let technicians sign in with Badge ID + Passcode, enable the <strong>Email/Password</strong> sign-in provider in Firebase Authentication settings, then click <strong>Activate Login</strong> below:
              </p>
              <a
                href="https://console.firebase.google.com/project/gen-lang-client-0370370928/authentication/providers"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-brand-800 dark:text-brand-400 underline pt-1"
              >
                Open Firebase Authentication Providers
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {lastProvisionedCreds && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-emerald-950 dark:text-emerald-100">
            <p className="font-semibold">
              Technician Login Ready — {lastProvisionedCreds.name}
            </p>
            <p className="mt-1 font-mono">
              Badge ID: <strong>{lastProvisionedCreds.badgeId}</strong> · Passcode:{' '}
              <strong>{lastProvisionedCreds.passcode}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCreds}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-xs font-medium text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
            >
              {copiedCreds ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCreds ? 'Copied' : 'Copy Credentials'}
            </button>
            <button
              type="button"
              onClick={() => setLastProvisionedCreds(null)}
              className="p-1 text-emerald-800 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {technicianRows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <UserPlus className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
            No technicians registered yet
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Add your field technicians with a Badge ID and Passcode so they can log PPMs, work orders, meter readings, and scan asset QR codes.
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800"
          >
            <Plus className="w-4 h-4" />
            Add First Technician
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Badge</th>
                  <th className="py-3 px-4">Technician</th>
                  <th className="py-3 px-4">Trade</th>
                  <th className="py-3 px-4">Assigned Buildings</th>
                  <th className="py-3 px-4">Access Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {technicianRows.map((t) => {
                  const assignedCodes = t.assignedBuildingIds
                    .map((id) => buildings.find((b) => b.id === id)?.code)
                    .filter(Boolean);
                  const needsActivation = !t.authUid;

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {t.badgeId}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{t.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <KeyRound className="w-3 h-3 text-brand-700 dark:text-brand-400" />
                            Badge + Passcode {t.phone ? `· ${t.phone}` : ''}
                          </span>
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                        {t.trade}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                        {assignedCodes.length > 0 ? assignedCodes.join(', ') : 'None assigned'}
                      </td>
                      <td className="py-3 px-4">
                        {t.status !== 'active' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <UserX className="w-3.5 h-3.5" />
                            Suspended
                          </span>
                        ) : needsActivation ? (
                          <button
                            type="button"
                            onClick={() => openActivationModal(t)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 whitespace-nowrap"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Activate Login
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <UserCheck className="w-3.5 h-3.5" />
                            Active Login
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {confirmDeleteId === t.id ? (
                          <span className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDelete(t)}
                              className="px-2.5 py-1 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(t)}
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/50"
                              aria-label={`Edit ${t.name}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(t.id)}
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                              aria-label={`Remove ${t.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingTech ? `Edit Technician — ${editingTech.name}` : 'Add Technician to Team'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Full Name *</label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Tariq Al-Mansoor"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Badge ID *</label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={badgeId}
                    onChange={(e) => setBadgeId(e.target.value.toUpperCase())}
                    className={`${inputClass} font-mono uppercase`}
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    {editingTech ? 'New Passcode (optional)' : 'Initial Passcode * (min 4 chars)'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      required={!editingTech}
                      minLength={editingTech ? undefined : 4}
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder={editingTech ? 'Leave blank to keep existing' : 'Emp Code or FM-849210'}
                      className={`${inputClass} font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => setPasscode(generatePasscode())}
                      className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      Generate
                    </button>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Phone Number</label>
                  <input
                    type="tel"
                    maxLength={40}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+971 50 123 4567"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Trade / Specialty</label>
                  <select value={trade} onChange={(e) => setTrade(e.target.value)} className={inputClass}>
                    {TRADE_OPTIONS.filter((tr) => tr !== 'Facility Supervisor').map((tr) => (
                      <option key={tr} value={tr}>
                        {tr}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Login Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                    className={inputClass}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Suspended</option>
                  </select>
                </div>
              </div>

              {role === 'admin' && supervisorAccounts.length > 0 && (
                <div>
                  <label className={labelClass}>Owning Supervisor</label>
                  <select
                    value={ownerSupervisorEmail}
                    onChange={(e) => setOwnerSupervisorEmail(e.target.value)}
                    className={inputClass}
                  >
                    <option value={normalizeEmail(user.email)}>System Admin</option>
                    {supervisorAccounts.map((sup) => {
                      const supEmail = normalizeEmail(sup.authEmail || sup.email);
                      return (
                        <option key={sup.id} value={supEmail}>
                          {sup.name} (@{sup.username || sup.badgeId})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Assigned Buildings ({assignedBuildingIds.length} selected)
                </label>
                <div className="grid sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                  {buildings.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={assignedBuildingIds.includes(b.id)}
                        onChange={() => toggleBuildingAssignment(b.id)}
                        className="rounded border-slate-300 dark:border-slate-600 text-brand-700"
                      />
                      <span className="font-mono font-semibold">{b.code}</span>
                      <span className="truncate">{b.name}</span>
                    </label>
                  ))}
                  {buildings.length === 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Add a building first to assign access.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingTech ? 'Update Technician' : 'Provision Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activatingTech && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Activate Badge Login — {activatingTech.badgeId}
              </h3>
              <button
                type="button"
                onClick={() => setActivatingTech(null)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmActivation} className="p-5 space-y-4">
              {activationError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                  {activationError}
                </div>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Set an initial passcode (minimum 4 characters, e.g. Employee Code) to activate Badge ID sign-in for{' '}
                <strong className="text-slate-900 dark:text-slate-100">{activatingTech.name}</strong>.
              </p>
              <div>
                <label className={labelClass}>Technician Passcode *</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={activationPasscode}
                    onChange={(e) => setActivationPasscode(e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => setActivationPasscode(generatePasscode())}
                    className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Generate
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActivatingTech(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={activating}
                  className="px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60"
                >
                  {activating ? 'Activating...' : 'Activate Login'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
