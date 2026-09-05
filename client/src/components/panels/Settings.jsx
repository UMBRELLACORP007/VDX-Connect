import { useState } from 'react';
import { motion } from 'framer-motion';
import { PanelShell } from './PanelShell';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import './Settings.css';

const SECTIONS = ['Appearance', 'Connection', 'Remote Control', 'File Transfer', 'Audio', 'Video', 'Notifications', 'Security', 'Devices', 'Advanced', 'About'];

function AboutSection() {
  const { version, state, percent, speed, eta, errorMessage } = useAppUpdate();

  let statusLine = 'Up to date.';
  if (state === 'checking') statusLine = 'Checking for updates…';
  else if (state === 'available') statusLine = 'Update found — starting download…';
  else if (state === 'downloading') statusLine = 'Downloading update…';
  else if (state === 'downloaded') statusLine = 'Update downloaded — restarting shortly to finish installing.';
  else if (state === 'error') statusLine = `Update check failed${errorMessage ? `: ${errorMessage}` : '.'}`;
  else if (state === null) statusLine = 'Checking for updates on startup.';

  return (
    <div className="about-section">
      <div className="about-version-row">
        <span className="about-label">Version</span>
        <span className="about-version-value">{version ? `v${version}` : '—'}</span>
      </div>

      <p className="settings-placeholder about-status-line">{statusLine}</p>

      {state === 'downloading' && (
        <div className="about-progress-wrap">
          <div className="about-progress-track">
            <div className="about-progress-fill" style={{ width: `${percent ?? 0}%` }} />
          </div>
          <div className="about-progress-meta">
            <span>{percent != null ? `${percent}%` : ''}</span>
            <span>{speed || ''}{speed && eta ? ' · ' : ''}{eta ? `ETA ${eta}` : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}

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
          {active === 'About' ? (
            <AboutSection />
          ) : (
            <p className="settings-placeholder">Settings for {active.toLowerCase()} go here, wired to real persisted config.</p>
          )}
        </div>
      </div>
    </PanelShell>
  );
}
