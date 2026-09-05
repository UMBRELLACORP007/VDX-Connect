import { motion, AnimatePresence } from 'framer-motion';
import { useConnection } from '../state/ConnectionContext';
import { useAppUpdate } from '../hooks/useAppUpdate';
import './StatusStrip.css';

const LABEL = {
  idle: 'Connecting to server…',
  offline: 'Waiting for peer device',
  'peer-online': 'Peer online — not connected',
  connecting: 'Establishing connection…',
  'session-active': 'Connected',
  lost: 'Connection lost',
};

function UpdateIndicator({ update }) {
  const { version, state, percent, speed, eta } = update;

  let label = null;
  if (state === 'checking') label = 'Checking for updates…';
  else if (state === 'available') label = 'Update found — starting download…';
  else if (state === 'downloading') {
    label = `Downloading update ${percent != null ? `${percent}%` : ''}`.trim();
  } else if (state === 'downloaded') label = 'Update ready — restarting…';
  else if (state === 'error') label = 'Update check failed';

  return (
    <div className="status-strip-metric status-strip-update">
      {label && (
        <>
          <span className="status-strip-metric-label">{label}</span>
          {state === 'downloading' && (speed || eta) && (
            <span className="status-strip-update-detail">
              {speed || ''}{speed && eta ? ' · ' : ''}{eta ? `ETA ${eta}` : ''}
            </span>
          )}
        </>
      )}
      {version && <span className="status-strip-metric-value">v{version}</span>}
    </div>
  );
}

export default function StatusStrip() {
  const { status, latencyMs, connectionType, peerDeviceId } = useConnection();
  const update = useAppUpdate();

  return (
    <div className="status-strip">
      <div className="status-strip-left">
        <span className="status-strip-label">Session</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={status}
            className="status-strip-value"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            transition={{ duration: 0.15 }}
          >
            {LABEL[status] || status}
            {peerDeviceId && status !== 'session-active' ? ` (${peerDeviceId})` : ''}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="status-strip-metrics">
        {latencyMs != null && (
          <div className="status-strip-metric">
            <span className="status-strip-metric-label">latency</span>
            <span className="status-strip-metric-value">{latencyMs}ms</span>
          </div>
        )}
        {connectionType && (
          <div className="status-strip-metric">
            <span className="status-strip-metric-label">link</span>
            <span className="status-strip-metric-value">{connectionType}</span>
          </div>
        )}
        <UpdateIndicator update={update} />
      </div>
    </div>
  );
}
