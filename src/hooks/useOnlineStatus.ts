import { useEffect, useState } from 'react';

const FIELD_OFFLINE_KEY = 'siteledger_manual_offline_mode';

export function useOnlineStatus() {
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [manualOffline, setManualOffline] = useState<boolean>(() => {
    try {
      return localStorage.getItem(FIELD_OFFLINE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleManualOffline = (next?: boolean) => {
    setManualOffline((prev) => {
      const value = typeof next === 'boolean' ? next : !prev;
      try {
        localStorage.setItem(FIELD_OFFLINE_KEY, String(value));
      } catch {
        // Ignore storage errors
      }
      return value;
    });
  };

  return {
    browserOnline,
    manualOffline,
    isEffectiveOnline: browserOnline && !manualOffline,
    toggleManualOffline,
  };
}
