import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PanelShell } from './PanelShell';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { useTheme } from '../../hooks/useTheme';
import { useConnection } from '../../state/ConnectionContext';
import { useAuthActions } from '../../state/AuthActionsContext';
import { ipc } from '../../lib/ipc';
import { getConfig } from '../../lib/auth';
import { settings, THEMES, QUALITY_LABELS } from '../../lib/settingsStore';
import { MY_DEVICE_LABEL, CONNECTED_DEVICE_LABEL } from '../../lib/labels';
import './Settings.css';

const SECTIONS = ['Appearance', 'Connection', 'Remote Control', 'File Transfer', 'Audio', 'Video', 'Notifications', 'Security', 'Devices', 'Advanced', 'Logs', 'About'];

function Toggle({ checked, onChange, label, note }) {
  return (
    <label className="settings-toggle-row">
      <div>
        <div className="settings-toggle-label">{label}</div>
        {note && <div className="settings-row-note">{note}</div>}
      </div>
      <button
        type="button"
        className={`settings-switch ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <span className="settings-switch-knob" />
      </button>
    </label>
  );
}

function Row({ label, value, note }) {
  return (
    <div className="settings-info-row">
      <span className="settings-info-label">{label}</span>
      <span className="settings-info-value">{value}</span>
      {note && <span className="settings-row-note">{note}</span>}
    </div>
  );
}

// ---- Appearance ----
function AppearanceSection() {
  const { theme, setTheme, reduceMotion, setReduceMotion } = useTheme();
  return (
    <div className="settings-section">
      <h4 className="settings-subhead">Theme</h4>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`theme-swatch-btn ${theme === t.id ? 'is-active' : ''}`}
            onClick={() => setTheme(t.id)}
          >
            <span className="theme-swatch-preview" style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }} />
            <span className="theme-swatch-name">{t.name}</span>
          </button>
        ))}
      </div>

      <h4 className="settings-subhead settings-subhead--spaced">Motion</h4>
      <Toggle
        checked={reduceMotion}
        onChange={setReduceMotion}
        label="Reduce motion"
        note="Turns off animation and transition effects across the app, regardless of your OS setting."
      />
    </div>
  );
}

// ---- Connection ----
function ConnectionSection() {
  const { connectionType, latencyMs, status, myDeviceId } = useConnection();
  const [autoConnect, setAutoConnectState] = useState(settings.getAutoConnect());
  const [copied, setCopied] = useState(false);
  const config = getConfig();

  function copyId() {
    navigator.clipboard?.writeText(myDeviceId || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="settings-section">
      <h4 className="settings-subhead">This device</h4>
      <Row label="Device ID" value={myDeviceId || '—'} />
      <button className="settings-btn" onClick={copyId}>{copied ? 'Copied' : 'Copy Device ID'}</button>

      <h4 className="settings-subhead settings-subhead--spaced">Server</h4>
      <Row label="Server URL" value={config?.serverUrl || 'Not configured'} note="Set once in device-config.js — same on every install." />

      <h4 className="settings-subhead settings-subhead--spaced">Live link</h4>
      <Row label="Status" value={status} />
      <Row label="Link type" value={connectionType || '—'} note="DIRECT is a peer-to-peer path; RELAY means traffic is going through the TURN relay (Twilio) because a direct path couldn't be found." />
      <Row label="Latency" value={latencyMs != null ? `${latencyMs}ms` : '—'} />

      <h4 className="settings-subhead settings-subhead--spaced">Behavior</h4>
      <Toggle
        checked={autoConnect}
        onChange={(v) => { settings.setAutoConnect(v); setAutoConnectState(v); }}
        label="Auto-connect when the other device comes online"
        note="Skips the manual Connect button on the Overview tab."
      />
    </div>
  );
}

// ---- Remote Control ----
function RemoteControlSection() {
  const [nutStatus, setNutStatus] = useState(null);

  useEffect(() => { ipc.getNutJsStatus().then(setNutStatus).catch(() => setNutStatus({ available: false, error: 'Could not check status' })); }, []);

  return (
    <div className="settings-section">
      <h4 className="settings-subhead">Remote input</h4>
      <Row
        label="Mouse/keyboard injection"
        value={nutStatus == null ? 'Checking…' : (nutStatus.available ? 'Available' : 'Unavailable')}
        note={nutStatus?.error ? nutStatus.error : 'Controls whether the other device can move your mouse and type on your keyboard while sharing your screen. Requires the native input module to have loaded successfully on this machine.'}
      />
    </div>
  );
}

// ---- File Transfer ----
function FileTransferSection() {
  const [dir, setDir] = useState(settings.getDefaultSaveDir());

  async function choose() {
    const picked = await ipc.chooseSaveDir('Default save folder');
    if (picked) { settings.setDefaultSaveDir(picked); setDir(picked); }
  }
  function clear() {
    settings.setDefaultSaveDir(null);
    setDir(null);
  }

  return (
    <div className="settings-section">
      <h4 className="settings-subhead">Incoming files</h4>
      <Row label="Default save folder" value={dir || 'Ask each time'} note="When set, incoming file offers save here automatically instead of prompting for a folder every time." />
      <div className="settings-btn-row">
        <button className="settings-btn" onClick={choose}>Choose folder…</button>
        {dir && <button className="settings-btn settings-btn--ghost" onClick={clear}>Ask each time instead</button>}
      </div>

      <h4 className="settings-subhead settings-subhead--spaced">Transfer</h4>
      <Row label="Chunk size" value="64 KB" note="Fixed — how much of a file is sent per DataChannel message." />
      <Row label="Backpressure limit" value="8 MB" note="Sending pauses automatically past this much buffered, unsent data, so large files don't stall input or balloon memory." />
    </div>
  );
}

// ---- Audio ----
function AudioSection() {
  const [includeAudio, setIncludeAudio] = useState(settings.getIncludeSystemAudio());
  return (
    <div className="settings-section">
      <h4 className="settings-subhead">Screen sharing</h4>
      <Toggle
        checked={includeAudio}
        onChange={(v) => { settings.setIncludeSystemAudio(v); setIncludeAudio(v); }}
        label="Include system audio when sharing your screen"
        note="Takes effect the next time you start sharing — won't change audio on a share that's already running. If your OS blocks desktop-audio capture, video-only capture is used automatically either way."
      />
    </div>
  );
}

// ---- Video ----
function VideoSection() {
  const [quality, setQualityState] = useState(settings.getDefaultQuality());
  const { fps, status, connectionType } = useConnection();

  return (
    <div className="settings-section">
      <h4 className="settings-subhead">Default streaming quality</h4>
      <select
        className="settings-select"
        value={quality}
        onChange={(e) => { settings.setDefaultQuality(e.target.value); setQualityState(e.target.value); }}
      >
        {Object.entries(QUALITY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <p className="settings-row-note">Used the next time you start a screen share. You can still change quality live from the Remote tab's toolbar.</p>

      {status === 'session-active' && (
        <>
          <h4 className="settings-subhead settings-subhead--spaced">Live</h4>
          <Row label="Reported peer FPS" value={fps != null ? `${fps} fps` : '—'} />
          <Row label="Link type" value={connectionType || '—'} />
        </>
      )}
    </div>
  );
}

// ---- Notifications ----
function NotificationsSection() {
  const [notify, setNotify] = useState(settings.getNotifyOnRequest());
  return (
    <div className="settings-section">
      <h4 className="settings-subhead">Connection requests</h4>
      <Toggle
        checked={notify}
        onChange={(v) => { settings.setNotifyOnRequest(v); setNotify(v); }}
        label="Show a desktop notification on incoming connection requests"
        note="Useful if the app window is minimized or behind other windows when the other device asks to connect."
      />
    </div>
  );
}

// ---- Security ----
function SecuritySection() {
  const { myDeviceId } = useConnection();
  const { logout } = useAuthActions();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="settings-section">
      <h4 className="settings-subhead">Signed in</h4>
      <Row label="Device ID" value={myDeviceId || '—'} />
      <p className="settings-row-note">
        This deployment has exactly two authorized devices — there's no public registration, and pairing
        is configured server-side.
      </p>

      <h4 className="settings-subhead settings-subhead--spaced">Session</h4>
      {!confirming ? (
        <button className="settings-btn settings-btn--danger" onClick={() => setConfirming(true)}>Log Out</button>
      ) : (
        <div className="settings-confirm-row">
          <span>Clear the saved login on this device and return to the sign-in screen?</span>
          <div className="settings-btn-row">
            <button className="settings-btn settings-btn--danger" onClick={logout}>Yes, log out</button>
            <button className="settings-btn settings-btn--ghost" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Devices ----
function DevicesSection() {
  const { myDeviceId, peerDeviceId, status, peerSystemInfo } = useConnection();
  const online = status !== 'offline' && status !== 'idle';

  return (
    <div className="settings-section">
      <h4 className="settings-subhead">{MY_DEVICE_LABEL}</h4>
      <Row label="Device ID" value={myDeviceId || '—'} />
      <Row label="Status" value="Online" />

      <h4 className="settings-subhead settings-subhead--spaced">{CONNECTED_DEVICE_LABEL}</h4>
      <Row label="Status" value={online ? 'Online' : 'Offline'} />
      <Row label="Platform" value={peerSystemInfo?.info ? `${peerSystemInfo.info.platform} (${peerSystemInfo.info.arch})` : '—'} note={!peerSystemInfo ? 'Only known once a session is active — see the System tab.' : undefined} />
      <p className="settings-row-note">{peerDeviceId ? '' : 'No device paired with this connection yet.'}</p>
    </div>
  );
}

// ---- Advanced ----
function AdvancedSection() {
  const [resetDone, setResetDone] = useState(false);
  const versions = typeof process !== 'undefined' ? process.versions : {};

  function resetAll() {
    settings.resetAll();
    setResetDone(true);
    setTimeout(() => window.location.reload(), 400);
  }

  return (
    <div className="settings-section">
      <h4 className="settings-subhead">Runtime</h4>
      <Row label="Electron" value={versions?.electron || '—'} />
      <Row label="Chromium" value={versions?.chrome || '—'} />
      <Row label="Node" value={versions?.node || '—'} />

      <h4 className="settings-subhead settings-subhead--spaced">Reset</h4>
      <button className="settings-btn settings-btn--danger" onClick={resetAll}>
        {resetDone ? 'Restarting…' : 'Reset local settings'}
      </button>
      <p className="settings-row-note">
        Clears theme, quality, and other preferences on this tab set (not your saved login) and reloads the app.
      </p>
    </div>
  );
}

// ---- Logs ----
function LogsSection() {
  const { logs, status, connectionType, peerDeviceId } = useConnection();
  const reversed = [...logs].reverse();

  return (
    <div className="settings-section settings-section--logs">
      <div className="logs-summary">
        <Row label="Other device" value={peerDeviceId ? 'Connected/paired' : 'Not seen yet'} />
        <Row label="Session" value={status} />
        <Row label="Link" value={connectionType || '—'} note="DIRECT = peer-to-peer, RELAY = routed through Twilio TURN." />
      </div>
      <h4 className="settings-subhead settings-subhead--spaced">Session log</h4>
      {reversed.length === 0 ? (
        <p className="settings-row-note">Nothing logged yet this session.</p>
      ) : (
        <div className="logs-list">
          {reversed.map((entry, i) => (
            <div key={i} className="logs-row">
              <span className="logs-row-time">{new Date(entry.t).toLocaleTimeString()}</span>
              <span className="logs-row-msg">{entry.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- About (unchanged) ----
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

const SECTION_COMPONENTS = {
  Appearance: AppearanceSection,
  Connection: ConnectionSection,
  'Remote Control': RemoteControlSection,
  'File Transfer': FileTransferSection,
  Audio: AudioSection,
  Video: VideoSection,
  Notifications: NotificationsSection,
  Security: SecuritySection,
  Devices: DevicesSection,
  Advanced: AdvancedSection,
  Logs: LogsSection,
  About: AboutSection,
};

export default function Settings() {
  const [active, setActive] = useState('Appearance');
  const Active = SECTION_COMPONENTS[active];

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
          <Active />
        </div>
      </div>
    </PanelShell>
  );
}
