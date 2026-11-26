import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { deleteSupervisorAccount, saveSupervisorAccount } from '../lib/dataService';
import {
  Building,
  normalizeEmail,
  normalizeUsername,
  Technician,
} from '../types';

interface SupervisorAccountsViewProps {
  technicians: Technician[];
  buildings: Building[];
  user: { uid: string; email: string };
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = 'FA-';
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export const SupervisorAccountsView: React.FC<SupervisorAccountsViewProps> = ({
  technicians,
  buildings,
  user,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSup, setEditingSup] = useState<Technician | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [trade, setTrade] = useState('Facility Supervisor');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [providerNeedsEnable, setProviderNeedsEnable] = useState(false);
  const [lastProvisionedCreds, setLastProvisionedCreds] = useState<{
    name: string;
    username: string;
    password: string;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  const supervisorAccounts = useMemo(
    () => technicians.filter((t) => t.role === 'supervisor'),
    [technicians]
  );

  const openAddModal = () => {
    setEditingSup(null);
    setName('');
    setUsername('');
    setPassword(generatePassword());
    setTrade('Facility Supervisor');
    setPhone('');
    setStatus('active');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (sup: Technician) => {
    setEditingSup(sup);
    setName(sup.name);
    setUsername(sup.username || sup.badgeId.replace(/^SUP-/i, '').toLowerCase());
    setPassword('');
    setTrade(sup.trade || 'Facility Supervisor');
    setPhone(sup.phone || '');
    setStatus(sup.status);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = normalizeUsername(username);
    if (!name.trim() || cleanUser.length < 3) {
      setErrorMsg('Full Name and a Username (at least 3 characters) are required.');
      return;
    }
    if (!editingSup && password.trim().length < 6) {
      setErrorMsg('Initial password must be at least 6 characters.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await saveSupervisorAccount(
        {
          id: editingSup?.id,
          name,
          username: cleanUser,
          password: password.trim() || undefined,
          trade,
          phone,
          status,
        },
        { uid: user.uid, existing: editingSup }
      );

      if (res.authStatus === 'provider_disabled') {
        setProviderNeedsEnable(true);
      } else if (res.authStatus === 'created' && password.trim()) {
        setProviderNeedsEnable(false);
        setLastProvisionedCreds({
          name: name.trim(),
          username: res.username,
          password: password.trim(),
        });
      }
      setModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save supervisor account.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyCreds = () => {
    if (!lastProvisionedCreds) return;
    const text = `Facility Assist Supervisor Login\nURL: ${window.location.origin}\nUsername: ${lastProvisionedCreds.username}\nPassword: ${lastProvisionedCreds.password}`;
    navigator.clipboard?.writeText(text);
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 2500);
  };

  const handleDelete = async (sup: Technician) => {
    await deleteSupervisorAccount(sup);
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
            Supervisor Accounts (Admin Control)
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Create username &amp; password accounts for facility supervisors. Each supervisor independently adds and manages their own buildings and technician team.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 transition-colors whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4" />
          Create Supervisor Account
        </button>
      </div>

      {providerNeedsEnable && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-950 dark:text-amber-100 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <p>
            Email/Password authentication must be enabled in Firebase Console → Authentication → Sign-in method before new supervisor passwords can be provisioned.
          </p>
        </div>
      )}

      {lastProvisionedCreds && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-emerald-950 dark:text-emerald-100">
            <p className="font-semibold">
              Supervisor Account Created — {lastProvisionedCreds.name}
            </p>
            <p className="mt-1 font-mono">
              Username: <strong>{lastProvisionedCreds.username}</strong> · Password:{' '}
              <strong>{lastProvisionedCreds.password}</strong>
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
              className="p-1 text-emerald-800 dark:text-emerald-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {supervisorAccounts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
            No supervisor accounts created yet
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Create supervisor credentials so each site supervisor can sign in with a username &amp; password to set up their own buildings and technician teams.
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800"
          >
            <Plus className="w-4 h-4" />
            Create First Supervisor
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Supervisor</th>
                  <th className="py-3 px-4">Managed Scope</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {supervisorAccounts.map((sup) => {
                  const supEmail = normalizeEmail(sup.authEmail || sup.email);
                  const bCount = buildings.filter((b) =>
                    b.supervisorEmails.map(normalizeEmail).includes(supEmail)
                  ).length;
                  const tCount = technicians.filter(
                    (t) =>
                      t.role === 'technician' &&
                      t.supervisorEmails.map(normalizeEmail).includes(supEmail)
                  ).length;

                  return (
                    <tr
                      key={sup.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-brand-700 dark:text-brand-400 whitespace-nowrap">
                        @{sup.username || sup.badgeId}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{sup.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                          <KeyRound className="w-3 h-3 text-slate-400" />
                          {sup.trade} {sup.phone ? `· ${sup.phone}` : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {bCount} building(s) · {tCount} technician(s)
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {sup.status === 'active' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <UserCheck className="w-3.5 h-3.5" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <UserX className="w-3.5 h-3.5" />
                            Suspended
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {confirmDeleteId === sup.id ? (
                          <span className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDelete(sup)}
                              className="px-2.5 py-1 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs text-slate-500 dark:text-slate-400"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(sup)}
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/50"
                              aria-label={`Edit ${sup.name}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(sup.id)}
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                              aria-label={`Delete ${sup.name}`}
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
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingSup ? `Edit Supervisor — ${editingSup.name}` : 'Create Supervisor Account'}
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

              <div>
                <label className={labelClass}>Supervisor Full Name *</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Kasun Perera"
                  className={inputClass}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Login Username *</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingSup)}
                    maxLength={64}
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                    placeholder="kasun.sup"
                    className={`${inputClass} font-mono lowercase`}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {editingSup ? 'Set New Password (optional)' : 'Initial Password * (min 6 chars)'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      required={!editingSup}
                      minLength={editingSup ? undefined : 6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={editingSup ? 'Leave blank to keep existing' : 'FA-849201'}
                      className={`${inputClass} font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => setPassword(generatePassword())}
                      className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      Generate
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Title / Role Label</label>
                  <input
                    type="text"
                    maxLength={64}
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                    placeholder="Senior Facility Supervisor"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Account Status</label>
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
                  {saving
                    ? 'Saving...'
                    : editingSup
                      ? 'Update Supervisor'
                      : 'Create Supervisor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
