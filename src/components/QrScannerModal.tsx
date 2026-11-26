import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  ImageUp,
  QrCode,
  Search,
  VideoOff,
  X,
} from 'lucide-react';
import { ParsedAssetQr, parseAssetQrPayload } from '../lib/qrUtils';
import { Asset, MaintenanceLog } from '../types';

interface QrScannerModalProps {
  assets: Asset[];
  logs: MaintenanceLog[];
  onAssetScanned: (parsed: ParsedAssetQr) => void;
  onClose: () => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  assets,
  logs,
  onAssetScanned,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const knownAssetChoices = useMemo(() => {
    const map = new Map<
      string,
      { assetTag: string; assetName: string; buildingCode: string; assetId?: string }
    >();
    for (const a of assets) {
      const key = `${a.buildingCode}::${a.assetTag.toUpperCase()}`;
      map.set(key, {
        assetTag: a.assetTag,
        assetName: a.assetName,
        buildingCode: a.buildingCode,
        assetId: a.id,
      });
    }
    for (const l of logs) {
      if (!l.assetTag.trim()) continue;
      const key = `${l.buildingCode}::${l.assetTag.trim().toUpperCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          assetTag: l.assetTag.trim(),
          assetName: l.assetName,
          buildingCode: l.buildingCode,
        });
      }
    }
    return Array.from(map.values()).slice(0, 60);
  }, [assets, logs]);

  const filteredChoices = useMemo(() => {
    const q = manualInput.trim().toLowerCase();
    if (!q) return knownAssetChoices.slice(0, 12);
    return knownAssetChoices
      .filter(
        (c) =>
          c.assetTag.toLowerCase().includes(q) ||
          c.assetName.toLowerCase().includes(q) ||
          c.buildingCode.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [knownAssetChoices, manualInput]);

  const stopCamera = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (mode !== 'camera') {
      stopCamera();
      return;
    }

    let cancelled = false;
    setCameraError(null);

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is not available in this browser. Upload a QR photo or enter the Asset ID.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraActive(true);
        }

        const scanFrame = () => {
          if (cancelled) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (width > 0 && height > 0) {
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0, width, height);
                const imgData = ctx.getImageData(0, 0, width, height);
                const code = jsQR(imgData.data, width, height, {
                  inversionAttempts: 'dontInvert',
                });
                if (code?.data) {
                  const parsed = parseAssetQrPayload(code.data);
                  if (parsed.assetTag) {
                    stopCamera();
                    onAssetScanned(parsed);
                    return;
                  }
                }
              }
            }
          }
          rafRef.current = requestAnimationFrame(scanFrame);
        };
        rafRef.current = requestAnimationFrame(scanFrame);
      } catch (err) {
        setCameraError(
          err instanceof Error
            ? `Camera unavailable (${err.message}). Upload a QR image or type the Asset Tag below.`
            : 'Unable to access camera. Upload a QR image or type the Asset Tag below.'
        );
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [mode, onAssetScanned]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);

    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          if (code?.data) {
            const parsed = parseAssetQrPayload(code.data);
            if (parsed.assetTag) {
              stopCamera();
              onAssetScanned(parsed);
              return;
            }
          }
        } else {
          URL.revokeObjectURL(url);
        }
        setUploadError('No valid QR code found in the selected image. Try a clearer crop or enter the tag manually.');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setUploadError('Unable to read image file.');
      };
      img.src = url;
    } catch {
      setUploadError('Failed to decode QR image.');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseAssetQrPayload(manualInput);
    if (!parsed.assetTag) return;
    stopCamera();
    onAssetScanned(parsed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 flex items-center justify-center text-brand-700 dark:text-brand-400">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Scan Asset QR Code
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Filter maintenance logs &amp; inspect the Last PPM Report
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('camera')}
              className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                mode === 'camera'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              Camera / Image Scan
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                mode === 'manual'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              Enter / Pick Asset ID
            </button>
          </div>

          {mode === 'camera' && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-[4/3] flex items-center justify-center">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                />
                <canvas ref={canvasRef} className="hidden" />

                {cameraActive ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-brand-400 rounded-xl shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]" />
                  </div>
                ) : (
                  <div className="p-6 text-center space-y-2">
                    <VideoOff className="w-7 h-7 text-slate-400 mx-auto" />
                    <p className="text-xs text-slate-300 max-w-xs mx-auto">
                      {cameraError || 'Starting rear camera for QR detection...'}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                  <ImageUp className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                  Upload QR Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className="text-xs font-medium text-brand-700 dark:text-brand-400 hover:underline"
                >
                  Or look up Asset Tag manually →
                </button>
              </div>

              {uploadError && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                  {uploadError}
                </div>
              )}
            </div>
          )}

          {mode === 'manual' && (
            <div className="space-y-4">
              <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Enter Asset Tag or paste QR payload (e.g. CH-01)"
                  autoFocus
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
                <button
                  type="submit"
                  disabled={!manualInput.trim()}
                  className="px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-50"
                >
                  Lookup
                </button>
              </form>

              {filteredChoices.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Registered &amp; Logged Assets
                  </p>
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {filteredChoices.map((c) => (
                      <button
                        key={`${c.buildingCode}-${c.assetTag}`}
                        type="button"
                        onClick={() => {
                          stopCamera();
                          onAssetScanned({
                            raw: c.assetTag,
                            assetTag: c.assetTag,
                            buildingCode: c.buildingCode,
                            assetId: c.assetId,
                          });
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {c.assetName}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {c.buildingCode}
                          </p>
                        </div>
                        <span className="font-mono text-xs font-semibold text-brand-700 dark:text-brand-400 shrink-0">
                          {c.assetTag}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
