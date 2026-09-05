import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PanelShell } from './PanelShell';
import { useSystemInfo } from '../../hooks/useSystemInfo';
import { ipc } from '../../lib/ipc';
import './SystemInfo.css';

function fmtBytes(n) {
  if (n == null) return '—';
  const gb = n / (1024 ** 3);
  return `${gb.toFixed(1)} GB`;
}

function fmtUptime(sec) {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function SystemInfo() {
  const { info, gpu } = useSystemInfo();
  const [software, setSoftware] = useState({ apps: [], error: null, loading: true });
  const [search, setSearch] = useState('');

  useEffect(() => { loadSoftware(); }, []);

  async function loadSoftware() {
    setSoftware((s) => ({ ...s, loading: true }));
    const result = await ipc.getInstalledSoftware();
    setSoftware({ ...result, loading: false });
  }

  const cards = [
    { label: 'CPU', value: info?.cpuLoadPercent, suffix: '%', detail: info?.cpuModel },
    { label: 'RAM', value: info?.ramUsedPercent, suffix: '%', detail: info ? `${fmtBytes(info.ramTotalBytes - info.ramFreeBytes)} / ${fmtBytes(info.ramTotalBytes)}` : null },
    { label: 'GPU', value: null, suffix: '', detail: gpu?.gpuName || (gpu?.error ? 'Not available' : null) },
    { label: 'Uptime', value: null, suffix: '', detail: info ? fmtUptime(info.uptimeSec) : null },
    { label: 'Platform', value: null, suffix: '', detail: info ? `${info.platform} (${info.arch})` : null },
    { label: 'Cores', value: null, suffix: '', detail: info ? `${info.cpuCores} logical` : null },
  ];

  const filteredApps = software.apps.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <PanelShell title="System" subtitle="Live hardware metrics for this device.">
      <div className="sysinfo-grid">
        {cards.map((s, i) => (
          <motion.div key={s.label} className="sysinfo-card glass-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.03 }} whileHover={{ y: -2 }}>
            <span className="sysinfo-label">{s.label}</span>
            <span className="sysinfo-value">{s.value != null ? `${s.value}${s.suffix}` : (s.detail ? '' : '—')}</span>
            {s.detail && <span className="sysinfo-detail">{s.detail}</span>}
            {s.value != null && (
              <div className="sysinfo-track"><div className="sysinfo-fill" style={{ width: `${s.value}%` }} /></div>
            )}
          </motion.div>
        ))}
      </div>

      <div className="sysinfo-software glass-panel">
        <div className="sysinfo-software-head">
          <span>Installed Software</span>
          <div className="sysinfo-software-controls">
            <input className="sysinfo-search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="sysinfo-refresh-btn" onClick={loadSoftware}>Refresh</button>
          </div>
        </div>

        {software.loading ? (
          <div className="sysinfo-software-empty">Loading…</div>
        ) : software.error && software.apps.length === 0 ? (
          <div className="sysinfo-software-empty">{software.error}</div>
        ) : filteredApps.length === 0 ? (
          <div className="sysinfo-software-empty">No matching applications</div>
        ) : (
          <div className="sysinfo-software-list">
            {filteredApps.map((a, i) => (
              <div key={`${a.name}-${i}`} className="sysinfo-software-row">
                <span className="sysinfo-software-name">{a.name}</span>
                <span className="sysinfo-software-version">{a.version || '—'}</span>
                <span className="sysinfo-software-publisher">{a.publisher || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  );
}
