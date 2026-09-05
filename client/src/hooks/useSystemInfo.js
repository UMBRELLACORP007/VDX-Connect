import { useEffect, useState } from 'react';
import { ipc } from '../lib/ipc';

const POLL_MS = 2000;

export function useSystemInfo() {
  const [info, setInfo] = useState(null);
  const [gpu, setGpu] = useState(null);

  useEffect(() => {
    let cancelled = false;
    ipc.getGpuInfo().then((g) => { if (!cancelled) setGpu(g); }).catch(() => {});

    async function poll() {
      try {
        const result = await ipc.getSystemInfo();
        if (!cancelled) setInfo(result);
      } catch (e) {
        // leave info as-is (or null) rather than showing a stale/fake value
      }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  return { info, gpu };
}
