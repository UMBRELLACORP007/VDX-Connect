import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PanelShell } from './PanelShell';
import { useSystemInfo } from '../../hooks/useSystemInfo';
import { useConnection } from '../../state/ConnectionContext';
import { formatGpuInfo } from '../../lib/gpuFormat';
import { MY_DEVICE_LABEL, CONNECTED_DEVICE_LABEL } from '../../lib/labels';
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

function buildCards(info, gpu) {
  return [
    { label: 'CPU', value: info?.cpuLoadPercent, suffix: '%', detail: info?.cpuModel },
    { label: 'RAM', value: info?.ramUsedPercent, suffix: '%', detail: info ? `${fmtBytes(info.ramTotalBytes - info.ramFreeBytes)} / ${fmtBytes(info.ramTotalBytes)}` : null },
    { label: 'GPU', value: null, suffix: '', detail: formatGpuInfo(gpu) || (gpu ? 'Not available' : null) },
    { label: 'Uptime', value: null, suffix: '', detail: info ? fmtUptime(info.uptimeSec) : null },
    { label: 'Platform', value: null, suffix: '', detail: info ? `${info.platform} (${info.arch})` : null },
    { label: 'Cores', value: null, suffix: '', detail: info ? `${info.cpuCores} logical` : null },
  ];
}

function MetricGrid({ cards }) {
  return (
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
  );
}

function SoftwareList({ apps, loading, error, search, setSearch, onRefresh, disabledReason }) {
  const filteredApps = (apps || []).filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="sysinfo-software glass-panel">
      <div className="sysinfo-software-head">
        <span>Installed Software</span>
        <div className="sysinfo-software-controls">
          <input className="sysinfo-search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} disabled={!!disabledReason} />
          <button className="sysinfo-refresh-btn" onClick={onRefresh} disabled={!!disabledReason}>Refresh</button>
        </div>
      </div>

      {disabledReason ? (
        <div className="sysinfo-software-empty">{disabledReason}</div>
      ) : loading ? (
        <div className="sysinfo-software-empty">Loading…</div>
      ) : error && (apps || []).length === 0 ? (
        <div className="sysinfo-software-empty">{error}</div>
      ) : (apps || []).length === 0 ? (
        <div className="sysinfo-software-empty">No installed applications found.</div>
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
  );
}

export default function SystemInfo() {
  const { info, gpu } = useSystemInfo();
  const { status, peerSystemInfo, peerSoftware, requestPeerSoftware } = useConnection();
  const [device, setDevice] = useState('mine'); // 'mine' | 'peer'
  const [mySoftware, setMySoftware] = useState({ apps: [], error: null, loading: true });
  const [mySearch, setMySearch] = useState('');
  const [peerSearch, setPeerSearch] = useState('');

  const sessionActive = status === 'session-active';

  useEffect(() => { loadMySoftware(); }, []);

  async function loadMySoftware() {
    setMySoftware((s) => ({ ...s, loading: true }));
    const result = await ipc.getInstalledSoftware();
    setMySoftware({ ...result, loading: false });
  }

  const myCards = buildCards(info, gpu);
  const peerCards = buildCards(peerSystemInfo?.info, peerSystemInfo?.gpu);

  return (
    <PanelShell
      title="System"
      subtitle="Live hardware metrics — this device, and the connected device once a session is active."
      toolbar={(
        <div className="sysinfo-device-tabs">
          <button className={`sysinfo-device-tab ${device === 'mine' ? 'is-active' : ''}`} onClick={() => setDevice('mine')}>
            {MY_DEVICE_LABEL}
          </button>
          <button className={`sysinfo-device-tab ${device === 'peer' ? 'is-active' : ''}`} onClick={() => setDevice('peer')}>
            <span className={`sysinfo-device-dot ${peerSystemInfo ? 'is-online' : ''}`} />
            {CONNECTED_DEVICE_LABEL}
          </button>
        </div>
      )}
    >
      {device === 'mine' ? (
        <>
          <MetricGrid cards={myCards} />
          <SoftwareList
            apps={mySoftware.apps}
            loading={mySoftware.loading}
            error={mySoftware.error}
            search={mySearch}
            setSearch={setMySearch}
            onRefresh={loadMySoftware}
          />
        </>
      ) : (
        <>
          {!sessionActive && (
            <div className="sysinfo-peer-notice glass-panel">
              Connect to the other device to see its live system info and installed software here.
            </div>
          )}
          <MetricGrid cards={peerCards} />
          <SoftwareList
            apps={peerSoftware.apps}
            loading={peerSoftware.loading}
            error={peerSoftware.error}
            search={peerSearch}
            setSearch={setPeerSearch}
            onRefresh={requestPeerSoftware}
            disabledReason={sessionActive ? null : 'Connect to a device to load its installed software.'}
          />
        </>
      )}
    </PanelShell>
  );
}
