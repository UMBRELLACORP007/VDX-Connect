import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelShell } from './PanelShell';
import { useConnection } from '../../state/ConnectionContext';
import { ipc } from '../../lib/ipc';
import './Files.css';

function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Files() {
  const {
    status, peerDeviceId, transfers, incomingBatches,
    sendFiles, respondToIncomingBatch, pauseTransfer, cancelOutgoingTransfer, cancelIncomingTransfer,
  } = useConnection();
  const [dragOver, setDragOver] = useState(false);
  const connected = status === 'session-active';

  async function pickAndSend() {
    const files = await ipc.pickFiles();
    if (files?.length) sendFiles(files);
  }

  // Electron's nodeIntegration exposes the real filesystem path on dropped
  // File objects (file.path) — same mechanism the vanilla renderer relied
  // on implicitly via its own drag handlers.
  async function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (!dropped.length) return;
    const files = dropped.map((f) => ({ absPath: f.path, relPath: f.name, size: f.size }));
    sendFiles(files);
  }

  const transferList = Object.entries(transfers).sort((a, b) => Number(b[0]) - Number(a[0]));
  const batchList = Object.entries(incomingBatches);

  return (
    <PanelShell title="Files" subtitle={peerDeviceId ? `Send to / receive from ${peerDeviceId}` : 'Connect to a peer to send files.'}>
      <div className="files-split">
        <motion.div
          className={`files-side glass-panel ${dragOver ? 'is-dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <span className="files-side-label">My Device</span>
          <div className="files-dropzone" onClick={pickAndSend} role="button" tabIndex={0}>
            {connected ? 'Drop files here, or click to pick' : 'Connect first to send files'}
          </div>
        </motion.div>

        <div className="files-flow"><FlowArrow /></div>

        <div className="files-side glass-panel">
          <span className="files-side-label">{peerDeviceId || 'Peer Device'}</span>
          <div className="files-dropzone files-dropzone--muted">Incoming files appear below</div>
        </div>
      </div>

      <AnimatePresence>
        {batchList.map(([batchId, b]) => (
          <motion.div key={batchId} className="files-batch-prompt glass-panel" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <span>Incoming: <strong>{b.label}</strong> ({b.total} file{b.total === 1 ? '' : 's'})</span>
            <div className="files-batch-actions">
              <button className="files-btn files-btn--accept" onClick={() => respondToIncomingBatch(batchId, true)}>Accept…</button>
              <button className="files-btn files-btn--decline" onClick={() => respondToIncomingBatch(batchId, false)}>Decline</button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="files-transfer-list">
        {transferList.length === 0 ? (
          <div className="files-empty">No transfers yet</div>
        ) : (
          <AnimatePresence initial={false}>
            {transferList.map(([id, t]) => (
              <motion.div key={id} className="transfer-row glass-panel" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="transfer-row-top">
                  <span className="transfer-row-name">{t.direction === 'out' ? '⬆' : '⬇'} {t.name}</span>
                  <span className="transfer-row-size">{fmtBytes(t.bytesDone)} / {fmtBytes(t.size)}</span>
                </div>
                <div className="transfer-bar-track">
                  <motion.div
                    className={`transfer-bar-fill ${t.status}`}
                    animate={{ width: t.size ? `${Math.min(100, (t.bytesDone / t.size) * 100)}%` : '0%' }}
                    transition={{ duration: 0.15 }}
                  />
                </div>
                <div className="transfer-row-bottom">
                  <span className={`transfer-row-status transfer-row-status--${t.status}`}>{t.message || (t.status === 'active' ? 'Transferring…' : t.status)}</span>
                  <div className="transfer-row-actions">
                    {t.status === 'active' && t.direction === 'out' && (
                      <button className="transfer-action-btn" onClick={() => cancelOutgoingTransfer(id)}>Cancel</button>
                    )}
                    {t.status === 'active' && t.direction === 'in' && (
                      <button className="transfer-action-btn" onClick={() => cancelIncomingTransfer(id)}>Cancel</button>
                    )}
                    {t.status === 'done' && t.destPath && (
                      <button className="transfer-action-btn" onClick={() => ipc.revealFile(t.destPath)}>Show in folder</button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </PanelShell>
  );
}

function FlowArrow() {
  return (
    <svg width="40" height="24" viewBox="0 0 40 24">
      <path d="M2 12h32M26 4l8 8-8 8" stroke="var(--text-faint)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
