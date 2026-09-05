import { useEffect, useRef, useState } from 'react';
import { ipc } from '../lib/ipc';

// Tracks app version + the update lifecycle (checking -> available ->
// downloading -> downloaded -> restarting) driven by main.js's autoUpdater
// events (see main/main.js, 'update:status'). main.js already does the
// actual checking/downloading/installing — this hook just surfaces that
// state to the UI, plus derives download speed and ETA from the raw
// bytesPerSecond/total/transferred fields since main.js only sends percent.

function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return null;
  const mb = bytesPerSecond / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`;
}

function formatEta(bytesPerSecond, total, transferred) {
  if (!bytesPerSecond || bytesPerSecond <= 0 || !total || !transferred) return null;
  const remainingSeconds = (total - transferred) / bytesPerSecond;
  if (!isFinite(remainingSeconds) || remainingSeconds < 0) return null;
  if (remainingSeconds < 60) return `${Math.ceil(remainingSeconds)}s`;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = Math.round(remainingSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

export function useAppUpdate() {
  const [version, setVersion] = useState(null);
  // state: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error' | null (never checked yet)
  const [status, setStatus] = useState({ state: null });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    ipc.getAppVersion().then((v) => {
      if (mountedRef.current) setVersion(v);
    });

    const unsubscribe = ipc.onUpdateStatus((payload) => {
      if (mountedRef.current) setStatus(payload);
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const speed = status.state === 'downloading' ? formatSpeed(status.bytesPerSecond) : null;
  const eta = status.state === 'downloading' ? formatEta(status.bytesPerSecond, status.total, status.transferred) : null;

  return {
    version,
    state: status.state,
    percent: status.percent ?? null,
    speed,
    eta,
    latestVersion: status.version ?? null,
    errorMessage: status.state === 'error' ? status.message : null,
  };
}
