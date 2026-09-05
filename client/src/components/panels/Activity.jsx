import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PanelShell } from './PanelShell';
import { useConnection } from '../../state/ConnectionContext';
import './Activity.css';

// Matches server/src/models/ActivityLog.js's `type` enum exactly — if the
// server enum ever changes, entries with an unmapped type still render
// (falls back to the raw type string) rather than disappearing.
const LABELS = {
  device_online: 'Device came online',
  device_offline: 'Device went offline',
  session_start: 'Session started',
  session_end: 'Session ended',
  file_offer: 'File offer sent',
  file_complete: 'File transfer completed',
  file_cancelled: 'File transfer cancelled',
  file_declined: 'File transfer declined',
  clipboard_sync: 'Clipboard synced',
  screenshot_requested: 'Screenshot requested',
  screenshot_received: 'Screenshot received',
};

function describeMeta(type, meta) {
  if (!meta) return null;
  if (type.startsWith('file_') && meta.name) return meta.name;
  if (type === 'clipboard_sync' && meta.direction) return meta.direction === 'sent' ? 'Sent to peer' : 'Received from peer';
  if (type.startsWith('screenshot_') && meta.name) return meta.name;
  return null;
}

export default function Activity() {
  const { fetchActivityLog } = useConnection();
  const [entries, setEntries] = useState(null); // null = loading

  async function load() {
    setEntries(await fetchActivityLog(150));
  }

  useEffect(() => { load(); }, []);

  return (
    <PanelShell
      title="Activity"
      subtitle="Connection, transfer, and session events — shared history across both devices."
      toolbar={<button className="activity-refresh-btn" onClick={load}>Refresh</button>}
    >
      {entries === null ? (
        <div className="activity-empty">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="activity-empty">No activity recorded yet</div>
      ) : (
        <div className="activity-list">
          {entries.map((e, i) => (
            <motion.div key={e._id || i} className="activity-row" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.01 }}>
              <span className="activity-dot" />
              <div className="activity-row-body">
                <span className="activity-row-label">{LABELS[e.type] || e.type}</span>
                {describeMeta(e.type, e.meta) && <span className="activity-row-meta">{describeMeta(e.type, e.meta)}</span>}
              </div>
              <span className="activity-row-time">{new Date(e.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
            </motion.div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
