import React, { useMemo, useState } from 'react';
import { Building2, X } from 'lucide-react';
import { saveBuilding } from '../lib/dataService';
import { ADMIN_AUTH_EMAIL, Building, normalizeEmail, Technician, UserRole } from '../types';
import { SpellCheckInput } from './SpellCheckField';

interface BuildingSetupModalProps {
  existing?: Building | null;
  isInitialOnboarding?: boolean;
  uid: string;
  email: string;
  role?: UserRole;
  technicians: Technician[];
  onClose?: () => void;
  onSaved?: (buildingId: string) => void;
}

export const BuildingSetupModal: React.FC<BuildingSetupModalProps> = ({
  existing,
  isInitialOnboarding = false,
  uid,
  email,
  role = 'supervisor',
  technicians,
  onClose,
  onSaved,
}) => {
  const supervisorAccounts = useMemo(
    () => technicians.filter((t) => t.role === 'supervisor' && t.status === 'active'),
    [technicians]
  );

  const initialOwnerEmail = useMemo(() => {
    if (!existing) return role === 'admin' ? ADMIN_AUTH_EMAIL : normalizeEmail(email);
    const nonAdmin = existing.supervisorEmails.find(
      (e) => normalizeEmail(e) !== ADMIN_AUTH_EMAIL
    );
    return nonAdmin ? normalizeEmail(nonAdmin) : ADMIN_AUTH_EMAIL;
  }, [existing, role, email]);

  const [code, setCode] = useState(existing?.code || '');
  const [name, setName] = useState(existing?.name || '');
  const [address, setAddress] = useState(existing?.address || '');
  const [floorsCount, setFloorsCount] = useState(String(existing?.floorsCount || 10));
  const [facilityManager, setFacilityManager] = useState(existing?.facilityManager || '');
  const [amcText, setAmcText] = useState(existing?.amcContractors.join(', ') || '');
  const [status, setStatus] = useState<'active' | 'inactive'>(existing?.status || 'active');
  const [ownerSupervisorEmail, setOwnerSupervisorEmail] = useState(initialOwnerEmail);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setErrorMsg('Building Code and Building Name are required.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const amcContractors = amcText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const id = await saveBuilding(
        {
          id: existing?.id,
          code,
          name,
          address,
          floorsCount: Number(floorsCount) || 1,
          facilityManager,
          amcContractors,
          status,
          ownerSupervisorEmail: role === 'admin' ? ownerSupervisorEmail : undefined,
        },
        { uid, email, role, technicians, existing }
      );
      onSaved?.(id);
      onClose?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save building.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600';

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Building Code *
          </label>
          <input
            type="text"
            required
            maxLength={24}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="BLD-01"
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Building Name *
          </label>
          <SpellCheckInput
            required
            maxLength={120}
            value={name}
            onValueChange={setName}
            placeholder="North Corporate Tower"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Site Address / Campus Location
          </label>
          <SpellCheckInput
            maxLength={240}
            value={address}
            onValueChange={setAddress}
            placeholder="120 Harbor Plaza, Sector B"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Total Floors
          </label>
          <input
            type="number"
            min={1}
            max={200}
            value={floorsCount}
            onChange={(e) => setFloorsCount(e.target.value)}
            className={`${inputClass} tabular-nums`}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Facility Manager Name
          </label>
          <SpellCheckInput
            maxLength={120}
            value={facilityManager}
            onValueChange={setFacilityManager}
            placeholder="e.g. Sarah Jenkins"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Operational Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
            className={inputClass}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive / Archived</option>
          </select>
        </div>
      </div>

      {role === 'admin' && (
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Assigned Owning Supervisor
          </label>
          <select
            value={ownerSupervisorEmail}
            onChange={(e) => setOwnerSupervisorEmail(e.target.value)}
            className={inputClass}
          >
            <option value={ADMIN_AUTH_EMAIL}>System Admin Only (Unassigned)</option>
            {supervisorAccounts.map((sup) => {
              const supEmail = normalizeEmail(sup.authEmail || sup.email);
              return (
                <option key={sup.id} value={supEmail}>
                  {sup.name} (@{sup.username || sup.badgeId})
                </option>
              );
            })}
          </select>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Only the assigned supervisor and Admin can view or manage this building.
          </p>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          AMC Contractors (comma-separated)
        </label>
        <SpellCheckInput
          showToggle
          value={amcText}
          onValueChange={setAmcText}
          placeholder="e.g. CoolAir HVAC LLC, Otis Elevators, ShieldFire Systems"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Pre-populates contractor dropdowns when logging AMC PPM reports for this building.
        </p>
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60 transition-colors"
        >
          {saving
            ? 'Saving...'
            : existing
              ? 'Save Building Changes'
              : isInitialOnboarding
                ? 'Add First Building & Continue'
                : 'Add Building'}
        </button>
      </div>
    </form>
  );

  if (isInitialOnboarding) {
    return (
      <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8">
        <div className="flex items-start gap-3 pb-5 border-b border-slate-200 dark:border-slate-800 mb-5">
          <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 flex items-center justify-center text-brand-700 dark:text-brand-400 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {role === 'admin' ? 'Initial Portfolio Building Setup' : 'Add Your First Building'}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Configure the first building your maintenance team oversees. You can add more buildings, register QR asset tags, or build your team right after.
            </p>
          </div>
        </div>
        {formContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-brand-700 dark:text-brand-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {existing ? `Edit Building — ${existing.code}` : 'Add New Building'}
            </h3>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="p-6">{formContent}</div>
      </div>
    </div>
  );
};
