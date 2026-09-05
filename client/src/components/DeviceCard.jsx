import { motion } from 'framer-motion';
import './DeviceCard.css';

// metrics: { cpu, ram, gpu, netMs, os, gpuName, ip, battery } — all optional.
// Any field left undefined renders as "—", never a fake number. This card
// has no built-in mock data source; whoever wires system-info IPC just
// passes real values in.
export default function DeviceCard({ name, online, metrics = {}, isLocal = false }) {
  const { cpu, ram, gpu, netMs, os, gpuName, battery } = metrics;

  return (
    <motion.div
      className="device-card glass-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: '0 24px 60px -16px rgba(124,92,252,0.25)' }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="device-card-head">
        <div className="device-card-title">
          <span className={`device-dot ${online ? 'is-online' : ''}`} />
          <span className="device-name">{name}</span>
          {isLocal && <span className="device-tag">This device</span>}
        </div>
        <span className={`device-status ${online ? 'is-online' : 'is-offline'}`}>
          {online ? 'Online' : 'Offline'}
        </span>
      </div>

      {os && <div className="device-os">{os}</div>}

      <div className="device-metrics">
        <Metric label="CPU" value={cpu} suffix="%" />
        <Metric label="RAM" value={ram} suffix="%" />
        <Metric label="GPU" value={gpu} suffix="%" />
        <Metric label="Latency" value={netMs} suffix="ms" bar={false} />
      </div>

      <div className="device-foot">
        <span className="device-foot-item">{gpuName || 'GPU — not reported'}</span>
        {battery != null && <span className="device-foot-item">{battery}% battery</span>}
      </div>
    </motion.div>
  );
}

function Metric({ label, value, suffix, bar = true }) {
  const hasValue = value != null;
  return (
    <div className="metric">
      <div className="metric-row">
        <span className="metric-label">{label}</span>
        <span className="metric-value">{hasValue ? `${value}${suffix}` : '—'}</span>
      </div>
      {bar && (
        <div className="metric-track">
          <motion.div
            className="metric-fill"
            initial={{ width: 0 }}
            animate={{ width: hasValue ? `${Math.min(value, 100)}%` : '0%' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      )}
    </div>
  );
}
