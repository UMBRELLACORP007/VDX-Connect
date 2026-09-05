import { motion } from 'framer-motion';
import { IconMinus, IconExpand, IconClose } from './icons';
import { useConnection } from '../state/ConnectionContext';
import { ipc } from '../lib/ipc';
import './Titlebar.css';

const STATUS_LABEL = {
  idle: 'Connecting…',
  offline: 'Peer offline',
  'peer-online': 'Peer online',
  connecting: 'Connecting…',
  'session-active': 'Session active',
  lost: 'Connection lost',
};

export default function Titlebar() {
  const { status } = useConnection();

  return (
    <div className="titlebar" style={{ WebkitAppRegion: 'drag' }}>
      <div className="titlebar-left">
        <span className="titlebar-mark">VDX</span>
        <span className="titlebar-name">Connect</span>
      </div>

      <motion.span
        key={status}
        className={`titlebar-pill titlebar-pill--${status}`}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <span className="titlebar-dot" />
        <span className="titlebar-pill-text">{STATUS_LABEL[status]}</span>
      </motion.span>

      <div className="titlebar-right" style={{ WebkitAppRegion: 'no-drag' }}>
        <button className="win-btn" aria-label="Minimize" onClick={() => ipc.minimizeWindow()}><IconMinus width={14} height={14} /></button>
        <button className="win-btn" aria-label="Maximize" onClick={() => ipc.toggleFullscreen()}><IconExpand width={14} height={14} /></button>
        <button className="win-btn win-btn--close" aria-label="Close" onClick={() => ipc.closeWindow()}><IconClose width={14} height={14} /></button>
      </div>
    </div>
  );
}
