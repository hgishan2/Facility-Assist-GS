import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Plus } from 'lucide-react';
import { buildActivePpmSchedules, formatDueDeltaLabel } from '../lib/ppmSchedule';
import { ENTRY_TYPE_LABELS, FREQUENCY_LABELS, MaintenanceLog } from '../types';
import type { LogPrefillTemplate } from './LogFormModal';

interface PpmScheduleViewProps {
  logs: MaintenanceLog[];
  onLogNextCycle: (prefill: LogPrefillTemplate) => void;
  onSelectLog: (log: MaintenanceLog) => void;
}

export const PpmScheduleView: React.FC<PpmScheduleViewProps> = ({
  logs,
  onLogNextCycle,
  onSelectLog,
}) => {
  const [filter, setFilter] = useState<'all' | 'next_14' | 'overdue' | 'upcoming'>('all');

  const schedules = useMemo(() => buildActivePpmSchedules(logs), [logs]);

  const overdueCount = schedules.filter((s) => s.urgency === 'overdue').length;
  const dueSoonCount = schedules.filter((s) => s.urgency === 'due_soon').length;

  const filteredSchedules = schedules.filter((s) => {
    if (filter === 'overdue') return s.urgency === 'overdue';
    if (filter === 'next_14') return s.urgency === 'overdue' || s.urgency === 'due_soon';
    if (filter === 'upcoming') return s.urgency === 'upcoming';
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Recurring PPM Schedule
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Automatically calculated next due dates from logged PPM frequencies, highlighting schedules due within the next 14 days.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
          {[
            { id: 'all', label: `All (${schedules.length})` },
            { id: 'next_14', label: `Due <= 14 Days (${overdueCount + dueSoonCount})` },
            { id: 'overdue', label: `Overdue (${overdueCount})` },
            { id: 'upcoming', label: 'Later (>14d)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as typeof filter)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredSchedules.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <CalendarClock className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
            No PPM schedules in this view
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Log an In-House or AMC Contractor PPM report with a recurring frequency (Weekly, Monthly, Quarterly, Semi-Annual, Annual) to automatically generate upcoming due dates.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Next Due</th>
                  <th className="py-3 px-4">Building &amp; Asset</th>
                  <th className="py-3 px-4">PPM Type &amp; Frequency</th>
                  <th className="py-3 px-4">Last Completed</th>
                  <th className="py-3 px-4">Schedule Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {filteredSchedules.map((item) => {
                  const l = item.latestLog;
                  return (
                    <tr
                      key={item.scheduleKey}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {item.nextDueDate}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {l.buildingCode}
                          </span>
                          {' · '}
                          <span>{l.assetTag || l.discipline}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => onSelectLog(l)}
                          className="font-medium text-slate-900 dark:text-slate-100 hover:text-brand-700 dark:hover:text-brand-400 text-left"
                        >
                          {l.assetName}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                        <p className="font-medium">{FREQUENCY_LABELS[l.ppmFrequency]}</p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {ENTRY_TYPE_LABELS[l.entryType]}
                          {l.amcContractor ? ` · ${l.amcContractor}` : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {l.completedDate}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.urgency === 'overdue' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {formatDueDeltaLabel(item.daysUntilDue)}
                          </span>
                        ) : item.urgency === 'due_soon' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                            <Clock className="w-3.5 h-3.5" />
                            {formatDueDeltaLabel(item.daysUntilDue)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {formatDueDeltaLabel(item.daysUntilDue)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            onLogNextCycle({
                              buildingId: l.buildingId,
                              entryType: l.entryType,
                              discipline: l.discipline,
                              assetName: l.assetName,
                              assetTag: l.assetTag,
                              locationZone: l.locationZone,
                              ppmFrequency: l.ppmFrequency,
                              amcContractor: l.amcContractor,
                              scheduledDate: item.nextDueDate,
                              title: `${FREQUENCY_LABELS[l.ppmFrequency]} PPM — ${l.assetName}`,
                            })
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                          <Plus className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                          Log PPM
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
