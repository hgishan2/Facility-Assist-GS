import React, { useState } from 'react';
import { Building2, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { deleteBuilding } from '../lib/dataService';
import {
  ADMIN_AUTH_EMAIL,
  Building,
  MaintenanceLog,
  normalizeEmail,
  Technician,
  UserRole,
} from '../types';
import { BuildingSetupModal } from './BuildingSetupModal';

interface BuildingsViewProps {
  buildings: Building[];
  logs: MaintenanceLog[];
  technicians: Technician[];
  user: { uid: string; email: string };
  role?: UserRole;
}

export const BuildingsView: React.FC<BuildingsViewProps> = ({
  buildings,
  logs,
  technicians,
  user,
  role = 'supervisor',
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const supervisorsByEmail = new Map(
    technicians
      .filter((t) => t.role === 'supervisor')
      .map((t) => [normalizeEmail(t.authEmail || t.email), t])
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {role === 'admin'
              ? 'All Portfolio Buildings & Supervisors'
              : 'My Managed Buildings & AMC Contractors'}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {role === 'admin'
              ? 'Admin portfolio oversight across every supervisor account, managed property, and approved AMC contractor.'
              : 'Configure the buildings assigned to your team and register their approved AMC contractors.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingBuilding(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Add Building
        </button>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {buildings.map((b) => {
          const bLogs = logs.filter((l) => l.buildingId === b.id);
          const pending = bLogs.filter((l) => l.approvalStatus === 'pending_approval').length;
          const approved = bLogs.filter((l) => l.approvalStatus === 'approved').length;
          const ownerEmail = b.supervisorEmails.find(
            (e) => normalizeEmail(e) !== ADMIN_AUTH_EMAIL
          );
          const ownerSup = ownerEmail ? supervisorsByEmail.get(normalizeEmail(ownerEmail)) : undefined;

          return (
            <div
              key={b.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono font-semibold text-brand-700 dark:text-brand-400">
                          {b.code}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{b.floorsCount} floors</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            b.status === 'active'
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          {b.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {b.name}
                      </h3>
                    </div>
                  </div>
                </div>

                {b.address && (
                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">{b.address}</p>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {role === 'admin' && (
                    <p className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400 shrink-0" />
                      <span className="text-slate-500 dark:text-slate-400">Supervisor:</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {ownerSup
                          ? `${ownerSup.name} (@${ownerSup.username || ownerSup.badgeId})`
                          : ownerEmail || 'System Admin'}
                      </span>
                    </p>
                  )}
                  <p>
                    <span className="text-slate-500 dark:text-slate-400">Facility Manager:</span>{' '}
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {b.facilityManager || 'Not assigned'}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500 dark:text-slate-400">AMC Vendors:</span>{' '}
                    <span className="text-slate-800 dark:text-slate-200">
                      {b.amcContractors.length > 0 ? b.amcContractors.join(', ') : 'None listed'}
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 tabular-nums text-slate-600 dark:text-slate-400">
                  <span>
                    <strong className="text-slate-900 dark:text-slate-100">{approved}</strong> approved
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    <strong className="text-amber-700 dark:text-amber-400">{pending}</strong> pending
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {confirmDeleteId === b.id ? (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteBuilding(b.id);
                          setConfirmDeleteId(null);
                        }}
                        className="px-2.5 py-1 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBuilding(b);
                          setModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/50"
                        aria-label={`Edit ${b.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(b.id)}
                        className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                        aria-label={`Delete ${b.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <BuildingSetupModal
          existing={editingBuilding}
          uid={user.uid}
          email={user.email}
          role={role}
          technicians={technicians}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
};
