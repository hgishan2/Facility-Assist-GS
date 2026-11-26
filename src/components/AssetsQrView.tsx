import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSearch,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteAsset,
  saveAsset,
  syncAssetsFromLogs,
} from '../lib/dataService';
import { encodeAssetQrPayload, generateQrDataUrl } from '../lib/qrUtils';
import {
  Asset,
  Building,
  DISCIPLINE_OPTIONS,
  FREQUENCY_LABELS,
  MaintenanceLog,
  PpmFrequency,
} from '../types';
import { SpellCheckInput } from './SpellCheckField';

interface AssetsQrViewProps {
  assets: Asset[];
  buildings: Building[];
  logs: MaintenanceLog[];
  user: { uid: string };
  onInspectAssetLogs: (asset: Asset) => void;
  onToast: (msg: string) => void;
}

export const AssetQrPreviewModal: React.FC<{
  asset: {
    id: string;
    assetTag: string;
    assetName: string;
    buildingCode: string;
    buildingName: string;
    locationZone?: string;
    discipline?: string;
  };
  onClose: () => void;
  onInspectLogs?: () => void;
}> = ({ asset, onClose, onInspectLogs }) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const payload = encodeAssetQrPayload(asset);

  useEffect(() => {
    let active = true;
    generateQrDataUrl(payload, 360)
      .then((url) => {
        if (active) setQrUrl(url);
      })
      .catch(() => {
        if (active) setQrUrl('');
      });
    return () => {
      active = false;
    };
  }, [payload]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto print:bg-white print:p-0">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto print:border-0 print:shadow-none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 print:hidden">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-brand-700 dark:text-brand-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Asset QR Label — {asset.assetTag}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center space-y-4">
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
            {qrUrl ? (
              <img
                src={qrUrl}
                alt={`QR Code for ${asset.assetTag}`}
                className="w-52 h-52 object-contain"
              />
            ) : (
              <div className="w-52 h-52 flex items-center justify-center text-xs text-slate-400">
                Generating QR...
              </div>
            )}
          </div>

          <div className="space-y-1">
            <p className="font-mono text-sm font-bold text-brand-700 dark:text-brand-400">
              {asset.assetTag}
            </p>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {asset.assetName}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {asset.buildingCode} · {asset.buildingName}
              {asset.locationZone ? ` · ${asset.locationZone}` : ''}
            </p>
            {asset.discipline && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{asset.discipline}</p>
            )}
          </div>

          <div className="w-full flex flex-wrap items-center justify-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 print:hidden">
            {qrUrl && (
              <a
                href={qrUrl}
                download={`QR_${asset.buildingCode}_${asset.assetTag}.png`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800"
              >
                <Download className="w-3.5 h-3.5" />
                Download PNG
              </a>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Label
            </button>
            {onInspectLogs && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onInspectLogs();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <FileSearch className="w-3.5 h-3.5" />
                View Logs
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const AssetsQrView: React.FC<AssetsQrViewProps> = ({
  assets,
  buildings,
  logs,
  user,
  onInspectAssetLogs,
  onToast,
}) => {
  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [qrPreviewAsset, setQrPreviewAsset] = useState<Asset | null>(null);
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);
  const [batchQrUrls, setBatchQrUrls] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [syncingFromLogs, setSyncingFromLogs] = useState(false);

  const [buildingId, setBuildingId] = useState(buildings[0]?.id || '');
  const [assetTag, setAssetTag] = useState('');
  const [assetName, setAssetName] = useState('');
  const [discipline, setDiscipline] = useState<string>(DISCIPLINE_OPTIONS[0]);
  const [locationZone, setLocationZone] = useState('');
  const [manufacturerModel, setManufacturerModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [ppmFrequency, setPpmFrequency] = useState<PpmFrequency>('quarterly');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (buildingFilter !== 'all' && a.buildingId !== buildingFilter) return false;
      if (!q) return true;
      return (
        a.assetTag.toLowerCase().includes(q) ||
        a.assetName.toLowerCase().includes(q) ||
        a.buildingCode.toLowerCase().includes(q) ||
        a.locationZone.toLowerCase().includes(q) ||
        a.discipline.toLowerCase().includes(q)
      );
    });
  }, [assets, search, buildingFilter]);

  const lastPpmByAssetKey = useMemo(() => {
    const map = new Map<string, MaintenanceLog>();
    for (const l of logs) {
      if (l.entryType !== 'ppm_inhouse' && l.entryType !== 'ppm_amc') continue;
      if (!l.assetTag.trim()) continue;
      const key = `${l.buildingId}::${l.assetTag.trim().toUpperCase()}`;
      const existing = map.get(key);
      if (!existing || l.completedDate > existing.completedDate) {
        map.set(key, l);
      }
    }
    return map;
  }, [logs]);

  const openAddModal = () => {
    setEditingAsset(null);
    const defaultBld =
      buildings.find((b) => b.id === buildingFilter) ||
      buildings.find((b) => b.status === 'active') ||
      buildings[0];
    setBuildingId(defaultBld?.id || '');
    setAssetTag(
      defaultBld ? `${defaultBld.code}-AST-${String(assets.length + 1).padStart(3, '0')}` : ''
    );
    setAssetName('');
    setDiscipline(DISCIPLINE_OPTIONS[0]);
    setLocationZone('');
    setManufacturerModel('');
    setSerialNumber('');
    setPpmFrequency('quarterly');
    setStatus('active');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (asset: Asset) => {
    setEditingAsset(asset);
    setBuildingId(asset.buildingId);
    setAssetTag(asset.assetTag);
    setAssetName(asset.assetName);
    setDiscipline(asset.discipline);
    setLocationZone(asset.locationZone);
    setManufacturerModel(asset.manufacturerModel);
    setSerialNumber(asset.serialNumber);
    setPpmFrequency(asset.ppmFrequency);
    setStatus(asset.status);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const bld = buildings.find((b) => b.id === buildingId);
    if (!bld) {
      setErrorMsg('Please select a valid building.');
      return;
    }
    if (!assetTag.trim() || !assetName.trim()) {
      setErrorMsg('Asset Tag ID and Asset Name are required.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveAsset(
        {
          id: editingAsset?.id,
          building: bld,
          assetTag: assetTag.trim().toUpperCase(),
          assetName: assetName.trim(),
          discipline,
          locationZone,
          manufacturerModel,
          serialNumber,
          ppmFrequency,
          status,
        },
        { uid: user.uid, existing: editingAsset }
      );
      setModalOpen(false);
      onToast(editingAsset ? 'Asset & QR tag updated.' : 'Asset registered & QR code ready.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save asset.');
    } finally {
      setSaving(false);
    }
  };

  const handleImportFromLogs = async () => {
    setSyncingFromLogs(true);
    try {
      const res = await syncAssetsFromLogs(
        { buildings, logs, assets },
        { uid: user.uid }
      );
      if (res.createdCount === 0) {
        onToast('All assets from maintenance logs are already registered.');
      } else {
        onToast(`Imported ${res.createdCount} asset(s) from maintenance logs for QR tagging.`);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to import assets from logs.');
    } finally {
      setSyncingFromLogs(false);
    }
  };

  const openBatchPrint = async () => {
    setBatchPrintOpen(true);
    const urls: Record<string, string> = {};
    await Promise.all(
      filteredAssets.slice(0, 60).map(async (a) => {
        urls[a.id] = await generateQrDataUrl(encodeAssetQrPayload(a), 240);
      })
    );
    setBatchQrUrls(urls);
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600';
  const labelClass = 'block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Asset Registry &amp; QR Code Labels
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Register physical equipment with unique identifiers and generate printable QR codes for instant field lookup.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={syncingFromLogs || logs.length === 0}
            onClick={handleImportFromLogs}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingFromLogs ? 'animate-spin' : ''}`} />
            {syncingFromLogs ? 'Importing...' : 'Import from Logs'}
          </button>

          {filteredAssets.length > 0 && (
            <button
              type="button"
              onClick={openBatchPrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Printer className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
              Print QR Sheet ({Math.min(filteredAssets.length, 60)})
            </button>
          )}

          <button
            type="button"
            disabled={buildings.length === 0}
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add Asset &amp; Generate QR
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <select
          value={buildingFilter}
          onChange={(e) => setBuildingFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950"
        >
          <option value="all">All Buildings ({assets.length})</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} — {b.name}
            </option>
          ))}
        </select>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Asset Tag, name, zone..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
      </div>

      {filteredAssets.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
          <QrCode className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No assets registered yet
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Add equipment with unique Asset Tags to generate QR codes, or import existing equipment tags from your Maintenance Register.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {logs.length > 0 && (
              <button
                type="button"
                onClick={handleImportFromLogs}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Import from Existing Logs
              </button>
            )}
            <button
              type="button"
              disabled={buildings.length === 0}
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Register First Asset
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Asset Tag</th>
                  <th className="py-3 px-4">Equipment &amp; Location</th>
                  <th className="py-3 px-4">Discipline / PPM</th>
                  <th className="py-3 px-4">Last PPM Report</th>
                  <th className="py-3 px-4 text-right">QR &amp; Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {filteredAssets.map((a) => {
                  const lastPpm = lastPpmByAssetKey.get(
                    `${a.buildingId}::${a.assetTag.trim().toUpperCase()}`
                  );
                  return (
                    <tr
                      key={a.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-brand-700 dark:text-brand-400">
                          {a.assetTag}
                        </span>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {a.buildingCode}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {a.assetName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {a.locationZone || 'General Area'}
                          {a.manufacturerModel ? ` · ${a.manufacturerModel}` : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                        <p>{a.discipline}</p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {FREQUENCY_LABELS[a.ppmFrequency]}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {lastPpm ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 font-mono text-emerald-700 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {lastPpm.completedDate}
                            </span>
                            {lastPpm.nextDueDate && (
                              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                Next due {lastPpm.nextDueDate}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">No PPM logged</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {confirmDeleteId === a.id ? (
                          <span className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteAsset(a.id);
                                setConfirmDeleteId(null);
                              }}
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
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setQrPreviewAsset(a)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 text-xs font-medium text-brand-700 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/60"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              QR Label
                            </button>
                            <button
                              type="button"
                              onClick={() => onInspectAssetLogs(a)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <FileSearch className="w-3.5 h-3.5" />
                              Logs
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(a)}
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/50"
                              aria-label={`Edit ${a.assetName}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(a.id)}
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                              aria-label={`Delete ${a.assetName}`}
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

      {/* Add / Edit Asset Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingAsset ? `Edit Asset — ${editingAsset.assetTag}` : 'Register Asset & QR Identifier'}
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

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Building *</label>
                  <select
                    required
                    disabled={Boolean(editingAsset)}
                    value={buildingId}
                    onChange={(e) => setBuildingId(e.target.value)}
                    className={inputClass}
                  >
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Unique Asset Tag ID *</label>
                  <input
                    type="text"
                    required
                    maxLength={64}
                    value={assetTag}
                    onChange={(e) => setAssetTag(e.target.value.toUpperCase())}
                    placeholder="CH-01"
                    className={`${inputClass} font-mono uppercase`}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Asset / Equipment Name *</label>
                <SpellCheckInput
                  required
                  maxLength={140}
                  value={assetName}
                  onValueChange={setAssetName}
                  placeholder="e.g. Chiller Plant #1 — York YVAA"
                  className={inputClass}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Discipline *</label>
                  <select
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                    className={inputClass}
                  >
                    {DISCIPLINE_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Location / Zone</label>
                  <SpellCheckInput
                    maxLength={120}
                    value={locationZone}
                    onValueChange={setLocationZone}
                    placeholder="Roof Mechanical Deck / B1 Plant"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Make / Model</label>
                  <input
                    type="text"
                    maxLength={140}
                    value={manufacturerModel}
                    onChange={(e) => setManufacturerModel(e.target.value)}
                    placeholder="e.g. York YVAA0320"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Serial Number</label>
                  <input
                    type="text"
                    maxLength={80}
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="SN-8834201"
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Standard PPM Frequency</label>
                  <select
                    value={ppmFrequency}
                    onChange={(e) => setPpmFrequency(e.target.value as PpmFrequency)}
                    className={inputClass}
                  >
                    {(Object.keys(FREQUENCY_LABELS) as PpmFrequency[]).map((freq) => (
                      <option key={freq} value={freq}>
                        {FREQUENCY_LABELS[freq]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Asset Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                    className={inputClass}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Decommissioned / Inactive</option>
                  </select>
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
                  {saving ? 'Saving...' : editingAsset ? 'Update Asset' : 'Save & Generate QR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {qrPreviewAsset && (
        <AssetQrPreviewModal
          asset={qrPreviewAsset}
          onClose={() => setQrPreviewAsset(null)}
          onInspectLogs={() => onInspectAssetLogs(qrPreviewAsset)}
        />
      )}

      {batchPrintOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 p-4 overflow-y-auto print:bg-white print:p-0 print:static">
          <div className="max-w-5xl mx-auto bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden print:border-0">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 print:hidden">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Printable Asset QR Label Sheet
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Print directly or save as PDF to affix labels onto building equipment.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setBatchPrintOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 bg-white text-slate-900">
              {filteredAssets.slice(0, 60).map((a) => (
                <div
                  key={a.id}
                  className="border border-slate-300 rounded-lg p-3 flex flex-col items-center text-center break-inside-avoid"
                >
                  {batchQrUrls[a.id] ? (
                    <img
                      src={batchQrUrls[a.id]}
                      alt={a.assetTag}
                      className="w-28 h-28 object-contain"
                    />
                  ) : (
                    <div className="w-28 h-28 flex items-center justify-center text-[11px] text-slate-400">
                      Loading...
                    </div>
                  )}
                  <p className="mt-1 font-mono text-xs font-bold text-slate-900">{a.assetTag}</p>
                  <p className="text-[11px] font-semibold text-slate-800 line-clamp-1">
                    {a.assetName}
                  </p>
                  <p className="text-[10px] text-slate-500 line-clamp-1">
                    {a.buildingCode} {a.locationZone ? `· ${a.locationZone}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
