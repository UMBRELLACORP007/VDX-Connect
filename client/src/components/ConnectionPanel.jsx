import { motion, AnimatePresence } from 'framer-motion';
import './ConnectionPanel.css';

export default function ConnectionPanel({ status, latencyMs, fps, connectionType, onConnect }) {
  return (
    <div className="conn-panel glass-panel">
      <AnimatePresence mode="wait">
        {status === 'idle' && (
          <motion.div key="idle" className="conn-panel-row" {...fade}>
            <span className="conn-spinner" />
            <span>Connecting to server…</span>
          </motion.div>
        )}

        {status === 'lost' && (
          <motion.div key="lost" className="conn-panel-row" {...fade}>
            <span className="conn-panel-hint" style={{ color: 'var(--danger-500)' }}>Connection lost</span>
          </motion.div>
        )}

        {status === 'offline' && (
          <motion.div key="offline" className="conn-panel-row" {...fade}>
            <span className="conn-panel-hint">Peer isn't reachable yet</span>
          </motion.div>
        )}

        {status === 'peer-online' && (
          <motion.button key="connect" className="conn-btn" onClick={onConnect} {...fade}>
            <span className="conn-btn-dot" />
            Connect
          </motion.button>
        )}

        {status === 'connecting' && (
          <motion.div key="connecting" className="conn-panel-row" {...fade}>
            <span className="conn-spinner" />
            <span>Connecting…</span>
          </motion.div>
        )}

        {status === 'session-active' && (
          <motion.div key="connected" className="conn-panel-row conn-panel-row--stats" {...fade}>
            <span className="conn-live-dot" />
            <span className="conn-stat">Connected</span>
            {latencyMs != null && <span className="conn-stat conn-stat--mono">{latencyMs}ms</span>}
            {fps != null && <span className="conn-stat conn-stat--mono">{fps} fps</span>}
            {connectionType && (
              <span className={`conn-type-badge conn-type-badge--${connectionType.toLowerCase()}`}>
                {connectionType}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
};
