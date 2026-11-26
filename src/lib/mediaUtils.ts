import { MAX_LENGTHS } from '../types';

export type ScanFilterMode = 'original' | 'document_bw' | 'crisp_color';

export interface ProcessedMediaResult {
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  fileName: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to decode image file.'));
    img.src = src;
  });
}

export function applyDocumentFilterToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: ScanFilterMode
): void {
  if (mode === 'original') return;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  if (mode === 'document_bw') {
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Adaptive contrast stretch for scanned paper reports
      let v = (lum - 128) * 1.65 + 135;
      if (v > 215) v = 255;
      else if (v < 45) v = 20;
      else v = Math.max(0, Math.min(255, v));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
  } else if (mode === 'crisp_color') {
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const val = (data[i + c] - 128) * 1.25 + 134;
        data[i + c] = Math.max(0, Math.min(255, val));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

export async function processImageDataUrl(
  sourceDataUrl: string,
  options: {
    fileName: string;
    filterMode?: ScanFilterMode;
    rotationDeg?: number;
    maxDimension?: number;
  }
): Promise<ProcessedMediaResult> {
  const img = await loadImage(sourceDataUrl);
  const rotation = ((options.rotationDeg || 0) % 360 + 360) % 360;
  const maxDim = options.maxDimension || 1280;

  let targetW = img.width;
  let targetH = img.height;
  if (targetW > maxDim || targetH > maxDim) {
    const ratio = Math.min(maxDim / targetW, maxDim / targetH);
    targetW = Math.round(targetW * ratio);
    targetH = Math.round(targetH * ratio);
  }

  const swap = rotation === 90 || rotation === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? targetH : targetW;
  canvas.height = swap ? targetW : targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering unavailable.');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
  ctx.restore();

  if (options.filterMode && options.filterMode !== 'original') {
    applyDocumentFilterToCanvas(ctx, canvas.width, canvas.height, options.filterMode);
  }

  // Step down JPEG quality if needed so dataUrl stays comfortably below Firestore 450KB cap
  let quality = 0.78;
  let outputUrl = canvas.toDataURL('image/jpeg', quality);
  while (outputUrl.length > MAX_LENGTHS.dataUrl - 15000 && quality > 0.35) {
    quality -= 0.08;
    outputUrl = canvas.toDataURL('image/jpeg', quality);
  }

  if (outputUrl.length > MAX_LENGTHS.dataUrl) {
    // Downscale once more if image is extremely dense
    const scaleCanvas = document.createElement('canvas');
    scaleCanvas.width = Math.round(canvas.width * 0.7);
    scaleCanvas.height = Math.round(canvas.height * 0.7);
    const sCtx = scaleCanvas.getContext('2d');
    if (sCtx) {
      sCtx.drawImage(canvas, 0, 0, scaleCanvas.width, scaleCanvas.height);
      outputUrl = scaleCanvas.toDataURL('image/jpeg', 0.65);
    }
  }

  if (outputUrl.length > MAX_LENGTHS.dataUrl) {
    throw new Error('Image remains too large after compression. Please use a lower-resolution capture.');
  }

  const baseName = options.fileName.replace(/\.[^.]+$/, '').slice(0, 120) || 'capture';
  return {
    dataUrl: outputUrl,
    mimeType: 'image/jpeg',
    fileName: `${baseName}.jpg`,
  };
}

export async function processUploadedFile(
  file: File,
  options?: { filterMode?: ScanFilterMode; maxDimension?: number }
): Promise<ProcessedMediaResult> {
  if (file.type === 'application/pdf') {
    const dataUrl = await readFileAsDataUrl(file);
    if (dataUrl.length > MAX_LENGTHS.dataUrl) {
      throw new Error(
        'PDF exceeds the 320 KB direct-storage limit. Please compress the PDF or scan/photograph each page using the built-in Document Scanner.'
      );
    }
    return {
      dataUrl,
      mimeType: 'application/pdf',
      fileName: file.name.slice(0, MAX_LENGTHS.fileName),
    };
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Unsupported file type. Please select an image (JPG/PNG/WebP) or PDF.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  return processImageDataUrl(rawDataUrl, {
    fileName: file.name,
    filterMode: options?.filterMode || 'original',
    maxDimension: options?.maxDimension || 1280,
  });
}
