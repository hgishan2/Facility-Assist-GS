import QRCode from 'qrcode';
import type { Asset } from '../types';

export interface ParsedAssetQr {
  raw: string;
  assetTag: string;
  buildingCode?: string;
  assetId?: string;
}

/**
 * Generates a deterministic, compact QR payload for a registered asset.
 * Format: FA-ASSET|<assetTag>|<buildingCode>|<assetId>
 */
export function encodeAssetQrPayload(asset: Pick<Asset, 'id' | 'assetTag' | 'buildingCode'>): string {
  const cleanTag = asset.assetTag.trim().toUpperCase().replace(/\|/g, '-');
  const cleanBld = asset.buildingCode.trim().toUpperCase().replace(/\|/g, '-');
  return `FA-ASSET|${cleanTag}|${cleanBld}|${asset.id}`;
}

/**
 * Parses QR payloads from Facility Assist tags, JSON payloads, query URLs, or plain barcode/tag strings.
 */
export function parseAssetQrPayload(rawText: string): ParsedAssetQr {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { raw: '', assetTag: '' };
  }

  if (trimmed.startsWith('FA-ASSET|')) {
    const parts = trimmed.split('|');
    return {
      raw: trimmed,
      assetTag: (parts[1] || '').trim(),
      buildingCode: (parts[2] || '').trim() || undefined,
      assetId: (parts[3] || '').trim() || undefined,
    };
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed) as {
        assetTag?: string;
        tag?: string;
        id?: string;
        assetId?: string;
        buildingCode?: string;
      };
      const tag = (obj.assetTag || obj.tag || '').trim();
      if (tag) {
        return {
          raw: trimmed,
          assetTag: tag,
          buildingCode: obj.buildingCode?.trim(),
          assetId: (obj.assetId || obj.id)?.trim(),
        };
      }
    } catch {
      // fall through
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const paramTag = url.searchParams.get('assetTag') || url.searchParams.get('tag') || url.searchParams.get('asset');
      if (paramTag) {
        return {
          raw: trimmed,
          assetTag: paramTag.trim(),
          buildingCode: url.searchParams.get('buildingCode')?.trim() || undefined,
          assetId: url.searchParams.get('assetId')?.trim() || undefined,
        };
      }
    } catch {
      // fall through
    }
  }

  return {
    raw: trimmed,
    assetTag: trimmed,
  };
}

export async function generateQrDataUrl(payload: string, size = 320): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

export function sanitizeTagSlug(nameOrTag: string, fallbackIndex = 1): string {
  const cleaned = nameOrTag
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return cleaned || `ASSET-${fallbackIndex}`;
}
