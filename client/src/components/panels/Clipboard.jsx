import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PanelShell } from './PanelShell';
import { useConnection } from '../../state/ConnectionContext';
import { ipc } from '../../lib/ipc';
import './Clipboard.css';

export default function ClipboardPanel() {
  const { status, incomingClipboard, pushClipboard } = useConnection();
  const [localText, setLocalText] = useState('');
  const [sentAt, setSentAt] = useState(null);
  const connected = status === 'session-active';

  useEffect(() => {
    ipc.readClipboard().then(setLocalText).catch(() => {});
  }, []);

  async function refreshLocal() {
    setLocalText(await ipc.readClipboard());
  }

  function send() {
    pushClipboard(localText);
    setSentAt(Date.now());
  }

  function acceptIncoming() {
    if (incomingClipboard) ipc.writeClipboard(incomingClipboard.text);
  }

  return (
    <PanelShell title="Clipboard" subtitle="Push your clipboard to the peer, or accept what they send.">
      <div className="clip-grid">
        <div className="clip-col glass-panel">
          <div className="clip-col-head">
            <span>My clipboard</span>
            <button className="clip-refresh-btn" onClick={refreshLocal}>Refresh</button>
          </div>
          <div className="clip-preview">{localText || <span className="clip-empty">Clipboard is empty</span>}</div>
          <button className="clip-send-btn" disabled={!connected || !localText} onClick={send}>
            {sentAt ? 'Sent ✓' : 'Send to peer'}
          </button>
        </div>

        <div className="clip-col glass-panel">
          <div className="clip-col-head"><span>Received</span></div>
          {incomingClipboard ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="clip-preview">
              {incomingClipboard.text}
            </motion.div>
          ) : (
            <div className="clip-preview"><span className="clip-empty">Nothing received this session</span></div>
          )}
          <button className="clip-send-btn" disabled={!incomingClipboard} onClick={acceptIncoming}>
            Copy to my clipboard
          </button>
        </div>
      </div>
    </PanelShell>
  );
}
