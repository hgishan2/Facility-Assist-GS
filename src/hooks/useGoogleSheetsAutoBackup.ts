import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearGoogleSheetsAccessToken,
  connectGoogleSheets,
  getGoogleSheetsAccessToken,
} from '../lib/firebase';
import {
  BackupDatasetSnapshot,
  clearBackupConfig,
  computeBackupFingerprint,
  createBackupSpreadsheet,
  GoogleSheetsAuthError,
  GoogleSheetsBackupConfig,
  loadBackupConfig,
  parseSpreadsheetIdInput,
  saveBackupConfig,
  syncAllDataToGoogleSheets,
} from '../lib/googleSheetsBackup';

export interface UseGoogleSheetsAutoBackupArgs {
  enabledForUser: boolean;
  isEffectiveOnline: boolean;
  snapshot: BackupDatasetSnapshot;
  onToast?: (msg: string) => void;
}

export function useGoogleSheetsAutoBackup({
  enabledForUser,
  isEffectiveOnline,
  snapshot,
  onToast,
}: UseGoogleSheetsAutoBackupArgs) {
  const [config, setConfig] = useState<GoogleSheetsBackupConfig>(() => loadBackupConfig());
  const [tokenConnected, setTokenConnected] = useState<boolean>(() =>
    Boolean(getGoogleSheetsAccessToken())
  );
  const [syncing, setSyncing] = useState(false);

  const lastSyncedFingerprintRef = useRef<string>('');
  const syncInFlightRef = useRef(false);

  const fingerprint = useMemo(() => computeBackupFingerprint(snapshot), [snapshot]);

  // Keep tokenConnected in sync when user signs in/out
  useEffect(() => {
    setTokenConnected(Boolean(getGoogleSheetsAccessToken()));
  }, [enabledForUser]);

  const updateConfig = useCallback((next: GoogleSheetsBackupConfig) => {
    saveBackupConfig(next);
    setConfig(next);
  }, []);

  const ensureToken = useCallback(async (): Promise<string> => {
    const existing = getGoogleSheetsAccessToken();
    if (existing) {
      setTokenConnected(true);
      return existing;
    }
    const fresh = await connectGoogleSheets();
    setTokenConnected(true);
    return fresh;
  }, []);

  const executeSync = useCallback(
    async (targetSpreadsheetId: string, token: string, silent = false) => {
      if (syncInFlightRef.current) return null;
      syncInFlightRef.current = true;
      setSyncing(true);
      try {
        const res = await syncAllDataToGoogleSheets(token, targetSpreadsheetId, snapshot);
        lastSyncedFingerprintRef.current = fingerprint;
        const latest = loadBackupConfig();
        const nextCfg: GoogleSheetsBackupConfig = {
          ...latest,
          spreadsheetId: res.spreadsheetId,
          spreadsheetTitle: res.spreadsheetTitle,
          spreadsheetUrl: res.spreadsheetUrl,
          lastSyncedAtIso: res.syncedAtIso,
          lastRowCount: res.totalRows,
          lastError: null,
        };
        updateConfig(nextCfg);
        if (!silent) {
          onToast?.(`Google Sheets backup synced (${res.totalRows} records).`);
        }
        return res;
      } catch (err) {
        if (err instanceof GoogleSheetsAuthError) {
          clearGoogleSheetsAccessToken();
          setTokenConnected(false);
        }
        const msg = err instanceof Error ? err.message : 'Google Sheets backup failed.';
        const latest = loadBackupConfig();
        updateConfig({ ...latest, lastError: msg });
        if (!silent) {
          onToast?.(msg);
        }
        throw err;
      } finally {
        syncInFlightRef.current = false;
        setSyncing(false);
      }
    },
    [snapshot, fingerprint, updateConfig, onToast]
  );

  const connectAndRefreshToken = useCallback(async () => {
    const token = await connectGoogleSheets();
    setTokenConnected(true);
    const latest = loadBackupConfig();
    if (latest.lastError) {
      updateConfig({ ...latest, lastError: null });
    }
    return token;
  }, [updateConfig]);

  const createNewBackupSheet = useCallback(
    async (enableAutoBackup = true) => {
      const token = await ensureToken();
      setSyncing(true);
      try {
        const created = await createBackupSpreadsheet(token);
        const nextCfg: GoogleSheetsBackupConfig = {
          spreadsheetId: created.spreadsheetId,
          spreadsheetTitle: created.spreadsheetTitle,
          spreadsheetUrl: created.spreadsheetUrl,
          autoBackupEnabled: enableAutoBackup,
          lastSyncedAtIso: null,
          lastRowCount: 0,
          lastError: null,
        };
        updateConfig(nextCfg);
        await executeSync(created.spreadsheetId, token, false);
        return created;
      } finally {
        setSyncing(false);
      }
    },
    [ensureToken, updateConfig, executeSync]
  );

  const connectExistingSheet = useCallback(
    async (rawInput: string, enableAutoBackup = true) => {
      const sheetId = parseSpreadsheetIdInput(rawInput);
      if (!sheetId) {
        throw new Error('Please paste a valid Google Spreadsheet URL or ID.');
      }
      const token = await ensureToken();
      const nextCfg: GoogleSheetsBackupConfig = {
        ...loadBackupConfig(),
        spreadsheetId: sheetId,
        spreadsheetTitle: 'Connected Backup Spreadsheet',
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
        autoBackupEnabled: enableAutoBackup,
        lastError: null,
      };
      updateConfig(nextCfg);
      await executeSync(sheetId, token, false);
    },
    [ensureToken, updateConfig, executeSync]
  );

  const syncNow = useCallback(async () => {
    const latest = loadBackupConfig();
    if (!latest.spreadsheetId) {
      throw new Error('No Google Spreadsheet is linked yet.');
    }
    const token = await ensureToken();
    await executeSync(latest.spreadsheetId, token, false);
  }, [ensureToken, executeSync]);

  const toggleAutoBackup = useCallback(
    (enabled: boolean) => {
      const latest = loadBackupConfig();
      updateConfig({ ...latest, autoBackupEnabled: enabled, lastError: null });
    },
    [updateConfig]
  );

  const disconnectBackup = useCallback(() => {
    lastSyncedFingerprintRef.current = '';
    const cleared = clearBackupConfig();
    setConfig(cleared);
    onToast?.('Google Sheets backup disconnected.');
  }, [onToast]);

  // Automatic debounced background backup when data changes and token is in memory
  useEffect(() => {
    if (!enabledForUser || !isEffectiveOnline) return;
    if (!config.autoBackupEnabled || !config.spreadsheetId) return;

    const token = getGoogleSheetsAccessToken();
    setTokenConnected(Boolean(token));
    if (!token) return;

    if (fingerprint === lastSyncedFingerprintRef.current) return;

    const timer = setTimeout(() => {
      executeSync(config.spreadsheetId, token, true).catch(() => {
        // Error already persisted in config.lastError & tokenCleared if 401/403
      });
    }, 3500);

    return () => clearTimeout(timer);
  }, [
    enabledForUser,
    isEffectiveOnline,
    config.autoBackupEnabled,
    config.spreadsheetId,
    fingerprint,
    executeSync,
  ]);

  return {
    config,
    tokenConnected,
    syncing,
    connectAndRefreshToken,
    createNewBackupSheet,
    connectExistingSheet,
    syncNow,
    toggleAutoBackup,
    disconnectBackup,
  };
}

export type UseGoogleSheetsAutoBackupReturn = ReturnType<typeof useGoogleSheetsAutoBackup>;
