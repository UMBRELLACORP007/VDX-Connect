import { motion, AnimatePresence } from 'framer-motion';
import { useConnection } from '../state/ConnectionContext';
import './StatusStrip.css';

const LABEL = {
  idle: 'Connecting to server…',
  offline: 'Waiting for peer device',
  'peer-online': 'Peer online — not connected',
  connecting: 'Establishing connection…',
  'session-active': 'Connected',
  lost: 'Connection lost',
};

export default function StatusStrip() {
  const { status, latencyMs, connectionType, peerDeviceId } = useConnection();

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
      </div>
    </div>
  );
}
