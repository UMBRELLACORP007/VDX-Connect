import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConnection } from '../../state/ConnectionContext';
import { usePanelNav } from '../../state/PanelNavContext';
import { useInputCapture } from '../../hooks/useInputCapture';
import { useScreenRecording } from '../../hooks/useScreenRecording';
import { ipc } from '../../lib/ipc';
import { settings } from '../../lib/settingsStore';
import './Remote.css';

const TOOLS = ['Screen Share', 'Files', 'Screenshot', 'Quality'];
// Recording/Monitors/More aren't wired to real functionality yet (recording,
// multi-monitor aren't ported) — shown disabled rather than silently
// removed, so the gap is visible instead of hidden. Clipboard/Files/
// Screenshot ARE real now, reached via the sidebar (see usePanelNav below).
const UNWIRED_TOOLS = ['More'];

export default function Remote() {
  const {
    status, latencyMs, fps, connectionType, remoteStream, localStream, sharing,
    startScreenShare, stopScreenShare, setQuality, sendControl, remoteScreenSize, reportMeasuredFps,
  } = useConnection();
  const goToPanel = usePanelNav();
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [screenSources, setScreenSources] = useState(null); // null = not opened yet
  const [pickerOpen, setPickerOpen] = useState(false);
  const localVideoRef = useRef(null);
  const connected = status === 'session-active';

  async function openMonitorPicker() {
    setPickerOpen((open) => !open);
    if (!screenSources) setScreenSources(await ipc.getScreenSources());
  }

  const { videoRef: remoteVideoRef, engaged } = useInputCapture({
    sendControl,
    remoteScreenSize,
    active: connected && !!remoteStream,
  });
  const { recording, lastSavedPath, start: startRecording, stop: stopRecording } = useScreenRecording();

  function toggleRecording() {
    if (recording) { stopRecording(); return; }
    const streamToRecord = remoteStream || localStream;
    if (streamToRecord) startRecording(streamToRecord);
  }

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream || null;
  }, [remoteStream, remoteVideoRef]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream || null;
  }, [localStream]);

  // Real FPS measurement (viewer side) — uses the standard
  // getVideoPlaybackQuality API to count frames actually rendered over a
  // 1s window, then reports it back to the sharer via reportMeasuredFps
  // (which session.js batches and sends as a 'fps-report' control message
  // every 3s — see lib/session.js). No fake/interpolated numbers.
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || !remoteStream) return undefined;
    let lastFrames = 0;
    let lastTime = performance.now();
    const interval = setInterval(() => {
      if (!el.getVideoPlaybackQuality) return;
      const quality = el.getVideoPlaybackQuality();
      const now = performance.now();
      const elapsedSec = (now - lastTime) / 1000;
      const framesDelta = quality.totalVideoFrames - lastFrames;
      if (elapsedSec > 0) reportMeasuredFps(Math.round(framesDelta / elapsedSec));
      lastFrames = quality.totalVideoFrames;
      lastTime = now;
    }, 1000);
    return () => clearInterval(interval);
  }, [remoteStream, remoteVideoRef, reportMeasuredFps]);

  return (
    <motion.div
      className="remote-panel"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      onMouseMove={() => setToolbarVisible(true)}
    >
      <div className="remote-stage">
        {!connected ? (
          <div className="remote-placeholder glass-panel">
            <h3>No active session</h3>
            <p>Connect from Overview first, then share a screen to see it here.</p>
          </div>
        ) : remoteStream ? (
          <>
            <video ref={remoteVideoRef} className={`remote-video ${engaged ? 'is-engaged' : ''}`} autoPlay playsInline />
            {!engaged && (
              <div className="remote-engage-hint">Click the screen to take control · Esc to release</div>
            )}
          </>
        ) : (
          <div className="remote-placeholder glass-panel">
            <h3>{sharing ? 'Sharing your screen' : 'No one is sharing a screen yet'}</h3>
            <p>{sharing ? "The peer sees your screen now — this side shows your local preview below." : 'Share your screen, or wait for the peer to share theirs.'}</p>
            {!sharing && <button className="remote-share-btn" onClick={startScreenShare}>Share my screen</button>}
          </div>
        )}

        {sharing && (
          <video ref={localVideoRef} className="remote-local-preview" autoPlay playsInline muted />
        )}

        <AnimatePresence>
          {lastSavedPath && !recording && (
            <motion.div key={lastSavedPath} className="remote-saved-toast glass-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              Recording saved
              <button onClick={() => ipc.revealFile(lastSavedPath)}>Show in folder</button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {connected && (
            <motion.div className="remote-hud" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <span className="remote-hud-dot" />
              <span>CONNECTED</span>
              {latencyMs != null && <span className="remote-hud-metric">{latencyMs} ms</span>}
              {connectionType && <span className="remote-hud-metric">{connectionType}</span>}
              {fps != null && <span className="remote-hud-metric">{fps} fps</span>}
              {engaged && <span className="remote-hud-metric remote-hud-metric--active">CONTROLLING</span>}
              {recording && <span className="remote-hud-metric remote-hud-metric--recording">● REC</span>}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {connected && toolbarVisible && (
            <motion.div
              className="remote-toolbar glass-panel"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <button className="remote-tool-btn" onClick={sharing ? stopScreenShare : startScreenShare}>
                {sharing ? 'Stop Sharing' : 'Share Screen'}
              </button>
              <div className="remote-monitor-picker-wrap">
                <button className="remote-tool-btn" onClick={openMonitorPicker}>Monitors</button>
                <AnimatePresence>
                  {pickerOpen && (
                    <motion.div className="remote-monitor-dropdown glass-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                      {screenSources == null ? (
                        <span className="remote-monitor-loading">Loading monitors…</span>
                      ) : (
                        screenSources.map((s) => (
                          <button key={s.id} className="remote-monitor-option" onClick={() => { startScreenShare(s.id); setPickerOpen(false); }}>
                            {s.name}
                          </button>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <select className="remote-tool-select" onChange={(e) => setQuality(e.target.value)} defaultValue={settings.getDefaultQuality()}>
                <option value="auto">Auto quality</option>
                <option value="high">High (1080p)</option>
                <option value="medium">Medium (720p)</option>
                <option value="low">Low (480p)</option>
              </select>
              <button className="remote-tool-btn" onClick={() => goToPanel('files')}>Files</button>
              <button className="remote-tool-btn" onClick={() => goToPanel('screenshot')}>Screenshot</button>
              <button className="remote-tool-btn" onClick={() => goToPanel('clipboard')}>Clipboard</button>
              <button className={`remote-tool-btn ${recording ? 'is-recording' : ''}`} onClick={toggleRecording} disabled={!remoteStream && !localStream}>
                {recording ? '● Stop Recording' : 'Record'}
              </button>
              {UNWIRED_TOOLS.map((tool) => (
                <button key={tool} className="remote-tool-btn is-disabled" title="Not wired to real functionality yet" disabled>
                  {tool}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
