import React, { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ClipboardList,
  ScanLine,
  Wrench,
  X,
} from 'lucide-react';
import { EntryType } from '../types';

interface QuickWorkEntrySectionProps {
  disabled?: boolean;
  heading?: string;
  onCreateNew: (defaultType: EntryType) => void;
}

type CategoryGroup = 'ppm' | 'corrective' | null;

export const QuickWorkEntrySection: React.FC<QuickWorkEntrySectionProps> = ({
  disabled = false,
  heading,
  onCreateNew,
}) => {
  const [activeGroup, setActiveGroup] = useState<CategoryGroup>(null);

  const toggleGroup = (group: Exclude<CategoryGroup, null>) => {
    if (disabled) return;
    setActiveGroup((prev) => (prev === group ? null : group));
  };

  const handleSelectType = (type: EntryType) => {
    setActiveGroup(null);
    onCreateNew(type);
  };

  return (
    <div className="space-y-3">
      {heading && (
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {heading}
        </h2>
      )}

      {/* Primary 2-Item Selector */}
      <div className="grid sm:grid-cols-2 gap-4">
        <button
          type="button"
          disabled={disabled}
          onClick={() => toggleGroup('ppm')}
          aria-expanded={activeGroup === 'ppm'}
          className={`text-left rounded-xl p-4 border transition-colors disabled:opacity-50 ${
            activeGroup === 'ppm'
              ? 'bg-brand-50/70 dark:bg-brand-950/30 border-brand-600 dark:border-brand-500'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-brand-600 dark:hover:border-brand-500'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 flex items-center justify-center text-brand-700 dark:text-brand-400 shrink-0">
              <ClipboardList className="w-4 h-4" />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 dark:text-brand-400">
              In-House / AMC
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  activeGroup === 'ppm' ? 'rotate-180' : ''
                }`}
              />
            </span>
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            PPM Reports
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Select to log In-House PPM checklists or AMC Contractor service reports
          </p>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => toggleGroup('corrective')}
          aria-expanded={activeGroup === 'corrective'}
          className={`text-left rounded-xl p-4 border transition-colors disabled:opacity-50 ${
            activeGroup === 'corrective'
              ? 'bg-brand-50/70 dark:bg-brand-950/30 border-brand-600 dark:border-brand-500'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-brand-600 dark:hover:border-brand-500'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
              <Wrench className="w-4 h-4" />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              Repair / Upgradation
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  activeGroup === 'corrective' ? 'rotate-180' : ''
                }`}
              />
            </span>
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Repair &amp; Upgradation Works
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Select to log corrective repair works or building system upgradations
          </p>
        </button>
      </div>

      {/* Secondary Option Menu */}
      {activeGroup === 'ppm' && (
        <div className="bg-white dark:bg-slate-900 border border-brand-200 dark:border-brand-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Choose PPM Report Type
            </p>
            <button
              type="button"
              onClick={() => setActiveGroup(null)}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Close PPM options"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleSelectType('ppm_inhouse')}
              className="text-left flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:border-brand-600 dark:hover:border-brand-500 hover:bg-white dark:hover:bg-slate-800 transition-colors"
            >
              <ClipboardList className="w-5 h-5 text-brand-700 dark:text-brand-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  In-House PPM
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Team preventive maintenance checklist, frequency &amp; before/after photos
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectType('ppm_amc')}
              className="text-left flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:border-brand-600 dark:hover:border-brand-500 hover:bg-white dark:hover:bg-slate-800 transition-colors"
            >
              <ScanLine className="w-5 h-5 text-brand-700 dark:text-brand-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  AMC Contractor PPM
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Log contractor visit, scan &amp; attach vendor service report sheet
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {activeGroup === 'corrective' && (
        <div className="bg-white dark:bg-slate-900 border border-brand-200 dark:border-brand-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Choose Corrective / Improvement Type
            </p>
            <button
              type="button"
              onClick={() => setActiveGroup(null)}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Close repair and upgradation options"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleSelectType('repair')}
              className="text-left flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:border-brand-600 dark:hover:border-brand-500 hover:bg-white dark:hover:bg-slate-800 transition-colors"
            >
              <Wrench className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Repair Work
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Log fault fix, breakdown resolution &amp; before/after photos
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectType('upgradation')}
              className="text-left flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:border-brand-600 dark:hover:border-brand-500 hover:bg-white dark:hover:bg-slate-800 transition-colors"
            >
              <Camera className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Upgradation Work
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Document system retrofit, equipment replacement or building upgrade
                </p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
