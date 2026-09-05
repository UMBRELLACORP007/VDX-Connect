import { motion, AnimatePresence } from 'framer-motion';
import './ConnectionVisualizer.css';

// status -> visual state, mapped from the SAME status values ConnectionContext
// already uses ('offline' | 'peer-online' | 'session-active'), plus two
// states ('connecting' | 'lost') that the real socket/peer hook (still to be
// wired) will add. No new fake states invented — this renders whatever the
// app's real status is, including ones that don't have wiring yet.
const STATE_META = {
  offline: { label: 'Offline', particle: false, pulse: false, color: 'var(--text-faint)' },
  connecting: { label: 'Connecting', particle: true, pulse: false, color: 'var(--amber-500)' },
  'peer-online': { label: 'Waiting for approval', particle: false, pulse: true, color: 'var(--amber-500)' },
  'session-active': { label: 'Connected', particle: true, pulse: false, color: 'var(--ok-500)' },
  lost: { label: 'Connection lost', particle: false, pulse: false, color: 'var(--danger-500)', broken: true },
};

export default function ConnectionVisualizer({ status, myDeviceName = 'My Device', peerDeviceName = 'Peer Device' }) {
  const meta = STATE_META[status] || STATE_META.offline;

  return (
    <div className="conn-viz">
      <div className="conn-viz-node">
        <NodeGlyph label={myDeviceName} online tone={meta.color} />
      </div>

      <div className="conn-viz-link">
        <svg viewBox="0 0 300 40" className={`conn-viz-svg ${meta.broken ? 'is-broken' : ''}`}>
          <line x1="0" y1="20" x2="300" y2="20" stroke="var(--border-strong)" strokeWidth="1.5" />
          {!meta.broken && (
            <motion.line
              x1="0" y1="20" x2="300" y2="20"
              stroke={meta.color}
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={meta.pulse
                ? { pathLength: [0, 1], opacity: [0, 0.9, 0] }
                : { pathLength: 1, opacity: status === 'offline' ? 0.15 : 0.9 }}
              transition={meta.pulse
                ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.5 }}
            />
          )}

          <AnimatePresence>
            {meta.particle && Array.from({ length: 3 }).map((_, i) => (
              <motion.circle
                key={i}
                cy="20" r="2.6"
                fill={meta.color}
                initial={{ cx: 0, opacity: 0 }}
                animate={{ cx: [0, 300], opacity: [0, 1, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.5, ease: 'linear' }}
                style={{ filter: `drop-shadow(0 0 4px ${meta.color})` }}
              />
            ))}
          </AnimatePresence>
        </svg>

        <motion.span
          key={meta.label}
          className="conn-viz-badge"
          style={{ color: meta.color, borderColor: meta.color }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {meta.label}
        </motion.span>
      </div>

      <div className="conn-viz-node">
        <NodeGlyph label={peerDeviceName} online={status !== 'offline'} tone={meta.color} />
      </div>
    </div>
  );
}

function NodeGlyph({ label, online, tone }) {
  return (
    <div className="conn-node-glyph">
      <div className={`conn-node-ring ${online ? 'is-online' : ''}`} style={{ '--ring-color': tone }}>
        <div className="conn-node-core" />
      </div>
      <span className="conn-node-label">{label}</span>
    </div>
  );
}
