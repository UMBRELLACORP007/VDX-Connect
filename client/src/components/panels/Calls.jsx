import { useState } from 'react';
import { motion } from 'framer-motion';
import { PanelShell, EmptyState } from './PanelShell';
import './Calls.css';

export default function Calls() {
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  if (!inCall) {
    return (
      <PanelShell title="Calls" subtitle="Voice and video, direct or relayed through the same connection.">
        <EmptyState title="No active call" body="Start a call once you're connected — this panel will fill with the live video and floating controls." />
        <div className="calls-start-row">
          <button className="calls-start-btn" onClick={() => setInCall(true)}>Start call (preview)</button>
        </div>
      </PanelShell>
    );
  }

  return (
    <motion.div className="call-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {camOff ? (
        <div className="call-avatar-wrap">
          <div className="call-avatar">V</div>
          <span>Camera off</span>
        </div>
      ) : (
        <div className="call-video-placeholder">Video not wired yet — real remote stream renders here.</div>
      )}

      <div className="call-hud glass-panel">
        <span>Vedika's Device</span>
        <span className="call-duration">00:14</span>
      </div>

      <div className="call-controls glass-panel">
        <button className={`call-ctrl ${muted ? 'is-off' : ''}`} onClick={() => setMuted((m) => !m)}>{muted ? 'Unmute' : 'Mute'}</button>
        <button className={`call-ctrl ${camOff ? 'is-off' : ''}`} onClick={() => setCamOff((c) => !c)}>{camOff ? 'Camera on' : 'Camera off'}</button>
        <button className="call-ctrl">Speaker</button>
        <button className="call-ctrl call-ctrl--end" onClick={() => setInCall(false)}>End</button>
      </div>
    </motion.div>
  );
}
