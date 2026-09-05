import { motion } from 'framer-motion';
import {
  IconMonitor, IconExpand, IconFiles, IconChat, IconCamera, IconActivity, IconSettings, IconLink,
} from './icons';
import { useConnection } from '../state/ConnectionContext';
import './Sidebar.css';

const NAV = [
  { id: 'overview', label: 'Overview', icon: IconLink },
  { id: 'remote', label: 'Remote', icon: IconMonitor },
  { id: 'files', label: 'Files', icon: IconFiles },
  { id: 'messages', label: 'Messages', icon: IconChat },
  { id: 'calls', label: 'Calls', icon: IconCamera },
  { id: 'system', label: 'System', icon: IconActivity },
  { id: 'settings', label: 'Settings', icon: IconSettings },
];

export default function Sidebar({ activePanel, onSelectPanel }) {
  const { status } = useConnection();
  const statusColor = status === 'session-active' ? 'var(--ok-500)' : status === 'peer-online' ? 'var(--amber-500)' : 'var(--text-faint)';

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <img src="./brand/logo-badge.png" alt="VDX Connect" className="sidebar-brand-logo" draggable={false} />
      </div>

      <nav className="sidebar-nav">
        {NAV.map((item) => {
          const active = activePanel === item.id;
          return (
            <button
              key={item.id}
              className={`sidebar-nav-item ${active ? 'is-active' : ''}`}
              onClick={() => onSelectPanel(item.id)}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active-indicator"
                  className="sidebar-active-indicator"
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <span className="sidebar-nav-icon">
                <item.icon />
              </span>
              <span className="sidebar-nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-footer">
        <span className="sidebar-status-dot" style={{ background: statusColor, boxShadow: `0 0 8px 1px ${statusColor}` }} />
        <span className="sidebar-status-text">
          {status === 'session-active' ? 'Connected' : status === 'peer-online' ? 'Peer online' : 'Offline'}
        </span>
      </div>
    </div>
  );
}
