import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ipc } from '../lib/ipc';
import './ConnectionRequestModal.css';

// Replaces the old dialog.showMessageBoxSync (a native Windows popup) with
// our own in-app modal. Main process fires 'window:confirm-close' for BOTH
// the titlebar X button and Alt+F4 (same underlying BrowserWindow 'close'
// event, see main.js), so this one component covers both.
export default function QuitConfirmModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    ipc.onConfirmClose(handler);
    return () => ipc.offConfirmClose(handler);
  }, []);

  const respond = (confirmed) => {
    setOpen(false);
    ipc.respondToClose(confirmed);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="req-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="req-modal glass-panel"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <h3>Quit VDX Connect?</h3>
            <p>Any active screen-share, remote-control, or file transfer will end.</p>
            <div className="req-modal-actions">
              <button className="req-btn req-btn--neutral" onClick={() => respond(false)} autoFocus>
                Cancel
              </button>
              <button className="req-btn req-btn--decline" onClick={() => respond(true)}>
                Quit
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
