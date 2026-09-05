import { AnimatePresence, motion } from 'framer-motion';
import { PanelShell } from './PanelShell';
import { useConnection } from '../../state/ConnectionContext';
import './Screenshot.css';

export default function Screenshot() {
  const { status, screenshotNotices, requestScreenshot } = useConnection();
  const connected = status === 'session-active';

  return (
    <PanelShell title="Screenshot" subtitle="Request a snapshot of the peer's screen without starting a full share.">
      <button className="shot-request-btn" disabled={!connected} onClick={requestScreenshot}>
        Request screenshot from peer
      </button>

      <div className="shot-list">
        {screenshotNotices.length === 0 ? (
          <div className="shot-empty">No screenshot requested yet</div>
        ) : (
          <AnimatePresence initial={false}>
            {[...screenshotNotices].reverse().map((s) => (
              <motion.div key={s.at} className="shot-row glass-panel" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                <span>Received {s.name}</span>
                <span className="shot-row-time">{new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </PanelShell>
  );
}
