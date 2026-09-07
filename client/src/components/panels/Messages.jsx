import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelShell } from './PanelShell';
import { useConnection } from '../../state/ConnectionContext';
import { CONNECTED_DEVICE_LABEL } from '../../lib/labels';
import './Messages.css';

export default function Messages() {
  const [draft, setDraft] = useState('');
  const { messages, sendChatMessage, clearChatHistory, status, peerDeviceId } = useConnection();
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  function send() {
    if (!draft.trim()) return;
    sendChatMessage(draft);
    setDraft('');
  }

  // Chat rides the always-on signaling socket (see lib/session.js) — it
  // works even before a WebRTC session is active, same as the vanilla
  // renderer, so it's only gated on the socket being connected at all.
  const canSend = status !== 'idle';

  return (
    <PanelShell
      title="Messages"
      subtitle={peerDeviceId ? `Synced with ${CONNECTED_DEVICE_LABEL}` : 'Synced in real time, saved to history.'}
      toolbar={<button className="messages-clear-btn" onClick={clearChatHistory}>Clear</button>}
    >
      <div className="messages-panel">
        <div className="messages-log" ref={logRef}>
          {messages.length === 0 ? (
            <div className="messages-empty">
              <p>No messages yet</p>
              <span>Say something — it syncs the moment the socket is connected.</span>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`msg-bubble ${m.mine ? 'is-mine' : ''}`}>
                  {m.text}
                  <span className="msg-time">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        <div className="messages-input-row">
          <input
            className="messages-input"
            placeholder={canSend ? 'Message…' : 'Waiting for connection…'}
            value={draft}
            disabled={!canSend}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="messages-send-btn" disabled={!draft.trim() || !canSend} onClick={send}>Send</button>
        </div>
      </div>
    </PanelShell>
  );
}
