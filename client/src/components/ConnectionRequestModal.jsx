import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ConnectionRequestModal.css';

export default function ConnectionRequestModal({ fromDeviceId, onAccept, onDecline }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <AnimatePresence>
      {fromDeviceId && (
        <motion.div className="req-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="req-modal glass-panel"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {!declining ? (
              <>
                <h3>Connection Request</h3>
                <p><strong>{fromDeviceId}</strong> wants to connect to your device.</p>
                <div className="req-modal-actions">
                  <button className="req-btn req-btn--accept" onClick={onAccept}>Accept</button>
                  <button className="req-btn req-btn--decline" onClick={() => setDeclining(true)}>Decline</button>
                </div>
              </>
            ) : (
              <>
                <h3>Decline connection</h3>
                <input
                  className="req-reason-input"
                  placeholder="Reason (optional)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  autoFocus
                />
                <div className="req-modal-actions">
                  <button className="req-btn req-btn--decline" onClick={() => { onDecline(reason); setDeclining(false); setReason(''); }}>
                    Send decline
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
