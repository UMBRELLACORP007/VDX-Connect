import { useState } from 'react';
import { motion } from 'framer-motion';
import { PanelShell } from './PanelShell';
import './Settings.css';

const SECTIONS = ['Appearance', 'Connection', 'Remote Control', 'File Transfer', 'Audio', 'Video', 'Notifications', 'Security', 'Devices', 'Advanced'];

export default function Settings() {
  const [active, setActive] = useState('Appearance');

  return (
    <PanelShell title="Settings">
      <div className="settings-layout">
        <div className="settings-tabs">
          {SECTIONS.map((s) => (
            <button key={s} className={`settings-tab ${active === s ? 'is-active' : ''}`} onClick={() => setActive(s)}>
              {active === s && <motion.span layoutId="settings-tab-indicator" className="settings-tab-indicator" />}
              {s}
            </button>
          ))}
        </div>
        <div className="settings-content glass-panel">
          <h3>{active}</h3>
          <p className="settings-placeholder">Settings for {active.toLowerCase()} go here, wired to real persisted config.</p>
        </div>
      </div>
    </PanelShell>
  );
}
