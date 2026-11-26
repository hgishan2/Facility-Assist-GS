import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, FileUp, RotateCw, ScanLine, Upload, X } from 'lucide-react';
import { processImageDataUrl, processUploadedFile, ScanFilterMode } from '../lib/mediaUtils';
import { AttachmentKind, generateSafeId, PendingAttachmentDraft } from '../types';

interface ScannerModalProps {
  kind: AttachmentKind;
  onAttach: (draft: PendingAttachmentDraft) => void;
  onClose: () => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({ kind, onAttach, onClose }) => {
  const isScanMode = kind === 'amc_scan';
  const [sourceMode, setSourceMode] = useState<'camera' | 'upload'>('camera');
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState(
    kind === 'amc_scan' ? 'amc_report_scan.jpg' : `${kind}_${Date.now()}.jpg`
  );
  const [mimeType, setMimeType] = useState<'image/jpeg' | 'image/png' | 'application/pdf'>('image/jpeg');
  const [filterMode, setFilterMode] = useState<ScanFilterMode>(isScanMode ? 'document_bw' : 'original');
  const [rotationDeg, setRotationDeg] = useState(0);
  const [caption, setCaption] = useState('');
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreamActive(false);
  };

  useEffect(() => {
    if (sourceMode === 'camera' && !rawImageUrl && !previewDataUrl) {
      let cancelled = false;
      setCameraError(null);
      navigator.mediaDevices
        ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1600 }, height: { ideal: 1200 } } })
        .then((stream) => {
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setStreamActive(true);
        })
        .catch(() => {
          if (!cancelled) {
            setCameraError('Camera unavailable or permission denied. Switch to File Upload to select a photo or PDF.');
            setStreamActive(false);
          }
        });

      return () => {
        cancelled = true;
        stopCamera();
      };
    } else {
      stopCamera();
    }
  }, [sourceMode, rawImageUrl, previewDataUrl]);

  useEffect(() => {
    if (!rawImageUrl) return;
    let active = true;
    setProcessing(true);
    setErrorMsg(null);
    processImageDataUrl(rawImageUrl, {
      fileName,
      filterMode,
      rotationDeg,
      maxDimension: isScanMode ? 1400 : 1200,
    })
      .then((res) => {
        if (active) {
          setPreviewDataUrl(res.dataUrl);
          setMimeType('image/jpeg');
        }
      })
      .catch((err) => {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to process image.');
        }
      })
      .finally(() => {
        if (active) setProcessing(false);
      });

    return () => {
      active = false;
    };
  }, [rawImageUrl, filterMode, rotationDeg, fileName, isScanMode]);

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
    setRawImageUrl(dataUrl);
    setRotationDeg(0);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setProcessing(true);
    try {
      if (file.type === 'application/pdf') {
        const res = await processUploadedFile(file);
        setRawImageUrl(null);
        setPreviewDataUrl(res.dataUrl);
        setMimeType('application/pdf');
        setFileName(res.fileName);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          setFileName(file.name);
          setRotationDeg(0);
          setRawImageUrl(String(reader.result || ''));
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load file.');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirm = () => {
    if (!previewDataUrl) return;
    onAttach({
      id: generateSafeId('att'),
      kind,
      fileName,
      mimeType,
      dataUrl: previewDataUrl,
      caption: caption.trim(),
    });
    onClose();
  };

  const titleMap: Record<AttachmentKind, string> = {
    before_photo: 'Capture Before-Work Photo',
    after_photo: 'Capture After-Work Photo',
    amc_scan: 'Scan AMC Contractor Report',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            {isScanMode ? (
              <ScanLine className="w-5 h-5 text-brand-700 dark:text-brand-400" />
            ) : (
              <Camera className="w-5 h-5 text-brand-700 dark:text-brand-400" />
            )}
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {titleMap[kind]}
            </h3>
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
          {!rawImageUrl && !previewDataUrl && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setSourceMode('camera')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  sourceMode === 'camera'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                Camera Capture
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('upload')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  sourceMode === 'upload'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload File {isScanMode ? '(Image / PDF)' : '(Image)'}
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Active Camera Viewfinder */}
          {sourceMode === 'camera' && !rawImageUrl && !previewDataUrl && (
            <div className="space-y-3">
              {cameraError ? (
                <div className="p-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-center space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => setSourceMode('upload')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Choose Image or Document
                  </button>
                </div>
              ) : (
                <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-200 dark:border-slate-700 aspect-[4/3]">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {isScanMode && (
                    <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-brand-400/80 rounded-lg" />
                  )}
                </div>
              )}
              {streamActive && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleCaptureFrame}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    {isScanMode ? 'Scan Document Page' : 'Capture Photo'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* File Upload Dropzone */}
          {sourceMode === 'upload' && !rawImageUrl && !previewDataUrl && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-10 text-center hover:border-brand-600 hover:bg-brand-50/30 dark:hover:bg-brand-950/30 transition-colors cursor-pointer"
            >
              <FileUp className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                Click to select {isScanMode ? 'a scanned photo or PDF report' : 'a work photo'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Images are automatically compressed and stored offline-ready. {isScanMode ? 'PDFs up to 320 KB.' : ''}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={isScanMode ? 'image/*,application/pdf' : 'image/*'}
                onChange={handleFileSelected}
                className="hidden"
              />
            </div>
          )}

          {/* Preview & Scan Enhancement Controls */}
          {previewDataUrl && (
            <div className="space-y-4">
              {mimeType === 'application/pdf' ? (
                <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{fileName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      PDF Report ready to attach
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewDataUrl(null);
                      setRawImageUrl(null);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      {(['original', 'crisp_color', 'document_bw'] as ScanFilterMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setFilterMode(mode)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            filterMode === mode
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {mode === 'original'
                            ? 'Original'
                            : mode === 'crisp_color'
                              ? 'Crisp Color'
                              : 'B&W Scan'}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRotationDeg((r) => (r + 90) % 360)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        Rotate 90°
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRawImageUrl(null);
                          setPreviewDataUrl(null);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        Retake
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 overflow-hidden max-h-[340px] flex items-center justify-center">
                    <img
                      src={previewDataUrl}
                      alt="Processed capture preview"
                      className="max-h-[340px] w-auto object-contain"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Caption / Page Label (Optional)
                </label>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={200}
                  placeholder={
                    isScanMode
                      ? 'e.g. Signed AMC Chiller Service Sheet Page 1'
                      : 'e.g. Corroded valve assembly before replacement'
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={handleConfirm}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" />
                  {processing ? 'Processing...' : 'Attach to Log'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
