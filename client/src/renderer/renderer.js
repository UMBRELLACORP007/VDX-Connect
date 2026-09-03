const io = require('socket.io-client');
const SimplePeer = require('simple-peer');
const { ipcRenderer } = require('electron');
const fs = require('fs');

const statusEl = document.getElementById('status');
const peerStatusEl = document.getElementById('peer-status');
const loginOverlayEl = document.getElementById('login-overlay');
const loginFormEl = document.getElementById('login-form');
const loginDeviceIdInput = document.getElementById('login-device-id');
const loginSecretInput = document.getElementById('login-secret');
const loginSubmitBtn = document.getElementById('login-submit');
const loginErrorEl = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-logout');
const latencyBadge = document.getElementById('latency-badge');
const fpsBadge = document.getElementById('fps-badge');
const logEl = document.getElementById('log');
const incomingEl = document.getElementById('incoming');
const incomingTextEl = document.getElementById('incoming-text');
const btnShareScreen = document.getElementById('btn-share-screen');
const btnStopShare = document.getElementById('btn-stop-share');
const remoteVideoLabel = document.getElementById('remote-video-label');
const remoteVideoEl = document.getElementById('remote-video');
const videoPlaceholderEl = document.getElementById('video-placeholder');
const videoStageEl = document.getElementById('video-stage');
const controlHintEl = document.getElementById('control-hint');
const localPreviewWrap = document.getElementById('local-preview-wrap');
const localPreviewEl = document.getElementById('local-preview');
const btnFullscreenView = document.getElementById('btn-fullscreen-view');
const fullscreenOverlay = document.getElementById('fullscreen-overlay');
const fullscreenVideoEl = document.getElementById('fullscreen-video');
const btnExitFullscreen = document.getElementById('btn-exit-fullscreen');
const btnToggleLogs = document.getElementById('btn-toggle-logs');
const btnCloseLogs = document.getElementById('btn-close-logs');
const btnClearLogs = document.getElementById('btn-clear-logs');
const logsPanel = document.getElementById('logs-panel');
const chatLogEl = document.getElementById('chat-log');
const chatInputEl = document.getElementById('chat-input');
const btnChatSend = document.getElementById('btn-chat-send');
const btnClearChat = document.getElementById('btn-clear-chat');
const btnToggleFloatingChat = document.getElementById('btn-toggle-floating-chat');
const floatingChatLogEl = document.getElementById('floating-chat-log');
const floatingChatInputEl = document.getElementById('floating-chat-input');
const btnFloatingChatSend = document.getElementById('btn-floating-chat-send');
const dropzoneEl = document.getElementById('dropzone');
const btnSendFiles = document.getElementById('btn-send-files');
const btnSendFolder = document.getElementById('btn-send-folder');
const transferListEl = document.getElementById('transfer-list');

// ---- Phase 2 additions ----
const qualitySelect = document.getElementById('quality-select');
const qualityBadge = document.getElementById('quality-badge');
const btnSendClipboard = document.getElementById('btn-send-clipboard');
const chkAutoClipboard = document.getElementById('chk-auto-clipboard');
const clipboardStatusEl = document.getElementById('clipboard-status');
const btnRequestScreenshot = document.getElementById('btn-request-screenshot');
const btnToggleActivity = document.getElementById('btn-toggle-activity');
const btnCloseActivity = document.getElementById('btn-close-activity');
const btnRefreshActivity = document.getElementById('btn-refresh-activity');
const activityPanel = document.getElementById('activity-panel');
const activityListEl = document.getElementById('activity-list');

let socket = null;
let peer = null;
let otherDeviceId = null;
let pendingIncomingFrom = null;
let authToken = null;
let localScreenStream = null;
let remoteScreenSize = null; // {width, height} of the peer's REAL screen (for input mapping)
let iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function log(msg) {
  console.log(msg);
  logEl.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

// ---- Logs panel toggle (UI-only; log() behavior above is unchanged) ----
btnToggleLogs.addEventListener('click', () => logsPanel.classList.toggle('open'));
btnCloseLogs.addEventListener('click', () => logsPanel.classList.remove('open'));
btnClearLogs.addEventListener('click', () => { logEl.textContent = ''; });

// ---- Custom titlebar (frame:false in main.js) ----
document.getElementById('btn-win-minimize').addEventListener('click', () => ipcRenderer.send('window:minimize'));
document.getElementById('btn-win-close').addEventListener('click', () => ipcRenderer.send('window:close'));
document.getElementById('btn-win-fullscreen').addEventListener('click', () => ipcRenderer.send('window:toggle-fullscreen'));

// ---- Remote video helpers: keep the "empty/placeholder" state in one place
// so both the normal teardown path and the stop-sharing path reset the same
// way (this is what was missing before — srcObject was cleared on peer
// close, but never on a mid-session "stop sharing").
function showRemoteVideo(stream) {
  remoteVideoEl.srcObject = stream;
  remoteVideoEl.style.display = 'block';
  videoPlaceholderEl.style.display = 'none';
  btnFullscreenView.disabled = false;
  videoStageEl.classList.add('controllable');
  controlHintEl.style.display = 'block';
  setTimeout(() => { controlHintEl.style.display = 'none'; }, 4000);
  startFpsCounter(remoteVideoEl);
  startFpsReporting(); // tell whoever's sharing how smooth it looks on our end, for adaptive quality
}

function clearRemoteVideo() {
  remoteVideoEl.pause();
  remoteVideoEl.srcObject = null;
  remoteVideoEl.style.display = 'none';
  videoPlaceholderEl.style.display = 'block';
  videoPlaceholderEl.textContent = 'No one is sharing their screen yet.';
  btnFullscreenView.disabled = true;
  videoStageEl.classList.remove('controllable', 'focused');
  videoStageEl.blur();
  controlHintEl.style.display = 'none';
  remoteScreenSize = null;
  closeFullscreenOverlay();
  stopFpsCounter();
  stopFpsReporting();
  fpsBadge.style.display = 'none';
}

// Non-identity shared config (server URL, TURN creds, update token) still
// comes from device-config.js — that's infra config, same for every install.
// deviceId/secret are NOT read from here anymore; they come from whatever
// the user types into the login screen on first run (see loginWithSavedOrPrompt below).
let config;
try {
  config = require('../config/device-config.js');
} catch (e) {
  statusEl.textContent = 'Missing device-config.js';
  log('Missing device-config.js — copy device-config.example.js to device-config.js in the same folder and fill in real values.');
  throw e;
}

let currentDeviceId = null; // set once login succeeds, used everywhere config.deviceId used to be

async function loginWithCredentials(deviceId, secret) {
  const res = await fetch(`${config.serverUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, secret }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Login failed (${res.status})`);
  }

  const { token } = await res.json();
  return token;
}

// First-run login screen. Shows a simple overlay asking for Device ID +
// Secret, validates them against the server, and on success saves them via
// the main process (userData, survives updates/reinstalls) so every launch
// after this one skips straight to auto-login.
function showLoginScreen(prefillError) {
  return new Promise((resolve) => {
    loginOverlayEl.style.display = 'flex';
    loginErrorEl.textContent = prefillError || '';
    loginDeviceIdInput.value = '';
    loginSecretInput.value = '';
    loginDeviceIdInput.focus();

    const onSubmit = async (ev) => {
      ev.preventDefault();
      loginErrorEl.textContent = '';
      loginSubmitBtn.disabled = true;
      const deviceId = loginDeviceIdInput.value.trim();
      const secret = loginSecretInput.value;
      try {
        const token = await loginWithCredentials(deviceId, secret);
        await ipcRenderer.invoke('auth:save', { deviceId, secret });
        loginFormEl.removeEventListener('submit', onSubmit);
        loginOverlayEl.style.display = 'none';
        resolve({ token, deviceId });
      } catch (err) {
        loginErrorEl.textContent = err.message;
        loginSubmitBtn.disabled = false;
      }
    };
    loginFormEl.addEventListener('submit', onSubmit);
  });
}

// Tries the saved deviceId/secret first (silent auto-login on every normal
// launch). Falls back to the login screen if nothing's saved yet, or if the
// saved credentials get rejected (e.g. secret rotated server-side).
async function loginWithSavedOrPrompt() {
  const saved = await ipcRenderer.invoke('auth:get-saved');
  if (saved && saved.deviceId && saved.secret) {
    try {
      const token = await loginWithCredentials(saved.deviceId, saved.secret);
      return { token, deviceId: saved.deviceId };
    } catch (err) {
      log(`Saved login rejected (${err.message}) — asking to log in again.`);
      return showLoginScreen(`Saved login no longer works: ${err.message}`);
    }
  }
  return showLoginScreen();
}

btnLogout.addEventListener('click', async () => {
  if (!confirm('Log out? You will need to re-enter the Device ID and Secret next launch.')) return;
  await ipcRenderer.invoke('auth:clear');
  location.reload();
});


// Fetches fresh, short-lived TURN credentials from our own server, which in
// turn asks Twilio for them. Called once at login and re-called before each
// new session, since Twilio tokens expire (typically ~24h, but we don't rely
// on that — we just fetch a new one each time to be safe).
async function fetchTurnCredentials() {
  try {
    const res = await fetch(`${config.serverUrl}/turn/token`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error(`TURN token fetch failed (${res.status})`);
    const { iceServers: twilioIceServers } = await res.json();
    iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      ...twilioIceServers,
    ];
    log(`Fetched ${twilioIceServers.length} TURN/STUN entries from Twilio.`);
  } catch (e) {
    log(`Could not fetch TURN credentials: ${e.message}. Falling back to STUN-only (direct P2P may still work, relay will not).`);
  }
}

// ===========================================================================
// Chat — rides the always-on signaling socket (works even without an active
// WebRTC session) and is persisted server-side, so history survives restarts.
// ===========================================================================
function buildChatMsgEl({ text, createdAt, mine }) {
  const div = document.createElement('div');
  div.className = `chat-msg ${mine ? 'mine' : 'theirs'}`;
  const textSpan = document.createElement('div');
  textSpan.textContent = text;
  const timeSpan = document.createElement('span');
  timeSpan.className = 'chat-time';
  timeSpan.textContent = new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.appendChild(textSpan);
  div.appendChild(timeSpan);
  return div;
}

function renderChatMessage(msg) {
  chatLogEl.appendChild(buildChatMsgEl(msg));
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
  // Mirror into the floating overlay too, so messages are visible without
  // leaving fullscreen — same idea as stream-overlay chat.
  floatingChatLogEl.appendChild(buildChatMsgEl(msg));
  floatingChatLogEl.scrollTop = floatingChatLogEl.scrollHeight;
}

function clearChatUI() {
  chatLogEl.innerHTML = '';
  floatingChatLogEl.innerHTML = '';
}

async function loadChatHistory() {
  try {
    const res = await fetch(`${config.serverUrl}/chat/history`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error(`history fetch failed (${res.status})`);
    const { messages } = await res.json();
    messages.forEach((m) => renderChatMessage({ text: m.text, createdAt: m.createdAt, mine: m.senderId === currentDeviceId }));
  } catch (e) {
    log(`Could not load chat history: ${e.message}`);
  }
}

function sendChatMessage(text) {
  const trimmed = (text ?? chatInputEl.value).trim();
  if (!trimmed || !socket || !socket.connected) return;
  socket.emit('chat:message', { text: trimmed });
  renderChatMessage({ text: trimmed, createdAt: new Date(), mine: true });
  chatInputEl.value = '';
  floatingChatInputEl.value = '';
}

btnChatSend.addEventListener('click', () => sendChatMessage());
chatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

btnFloatingChatSend.addEventListener('click', () => sendChatMessage(floatingChatInputEl.value));
floatingChatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage(floatingChatInputEl.value);
  e.stopPropagation(); // don't let typing here fall through to the remote-input keydown listener
});
floatingChatInputEl.addEventListener('keyup', (e) => e.stopPropagation());

btnToggleFloatingChat.addEventListener('click', () => {
  fullscreenOverlay.classList.toggle('chat-open');
});

btnClearChat.addEventListener('click', async () => {
  if (!confirm('Clear all chat history? This removes it for both devices and cannot be undone.')) return;
  try {
    const res = await fetch(`${config.serverUrl}/chat/history`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error(`clear failed (${res.status})`);
    clearChatUI();
  } catch (e) {
    log(`Could not clear chat history: ${e.message}`);
  }
});

function connectSocket(token) {
  socket = io(config.serverUrl, { auth: { token } });

  socket.on('connect', () => {
    statusEl.textContent = `Connected as ${currentDeviceId}`;
    log('Socket connected, authenticated.');
    chatInputEl.disabled = false;
    btnChatSend.disabled = false;
  });

  socket.on('connect_error', (err) => {
    statusEl.textContent = 'Connection failed';
    log(`Socket connect_error: ${err.message}`);
  });

  socket.on('peer:online', ({ deviceId }) => {
    otherDeviceId = deviceId;
    peerStatusEl.textContent = `Peer: ${deviceId} (online)`;
    log(`Peer online: ${deviceId}`);
  });

  socket.on('peer:offline', ({ deviceId }) => {
    peerStatusEl.textContent = `Peer: ${deviceId} (offline)`;
    log(`Peer offline: ${deviceId}`);
    teardownPeerConnection();
  });

  socket.on('connect:incoming', ({ fromDeviceId }) => {
    pendingIncomingFrom = fromDeviceId;
    incomingTextEl.textContent = `Incoming connection request from ${fromDeviceId}`;
    incomingEl.style.display = 'block';
    log(`Incoming connection request from ${fromDeviceId}`);
  });

  socket.on('connect:accepted', ({ byDeviceId }) => {
    log(`${byDeviceId} accepted your request. Starting WebRTC handshake...`);
    startPeerConnection(true); // we are the initiator since we requested
  });

  socket.on('connect:rejected', ({ byDeviceId, reason }) => {
    log(`${byDeviceId} rejected: ${reason}`);
  });

  socket.on('session:ended', ({ byDeviceId }) => {
    log(`Session ended by ${byDeviceId}`);
    teardownPeerConnection();
  });

  socket.on('chat:message', ({ text, createdAt }) => {
    renderChatMessage({ text, createdAt, mine: false });
  });

  // Relayed WebRTC handshake data (SDP/ICE) — server just forwards this blob
  socket.on('webrtc:signal', ({ fromDeviceId, signal }) => {
    log(`Received signal from ${fromDeviceId}: type=${signal.type || 'candidate'}`);
    if (!peer) {
      // We're the receiver side and didn't start a peer yet
      log('No local peer object yet — creating one now.');
      startPeerConnection(false);
    }
    try {
      peer.signal(signal);
    } catch (e) {
      log(`peer.signal() threw: ${e.message}`);
    }
  });
}

// Small control-message helper riding on the existing DataChannel — used for
// every non-file text message: share-started/stopped, latency ping/pong,
// remote-input events, and file-transfer metadata. Prefixed so it never
// collides with the raw binary file-chunk frames (see FILE_CHUNK_MARKER).
const CONTROL_PREFIX = '__vdx-control__:';

function sendControl(type, payload) {
  if (!peer || !peer.connected) return;
  try {
    peer.send(CONTROL_PREFIX + JSON.stringify({ type, ...payload }));
  } catch (e) {
    log(`Could not send control message (${type}): ${e.message}`);
  }
}

// File chunk binary frames are tagged with this first byte so we can tell
// them apart from CONTROL_PREFIX text frames without any parsing.
const FILE_CHUNK_MARKER = 0xf1;

function handleIncomingData(data) {
  // Binary file chunk: [1 byte marker][4 bytes transferId][payload bytes]
  if (data instanceof Uint8Array && data.length >= 5 && data[0] === FILE_CHUNK_MARKER) {
    const transferId = data.readUInt32BE ? data.readUInt32BE(1) : new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(1);
    const payload = data.subarray(5);
    handleIncomingFileChunk(transferId, payload);
    return;
  }

  const text = data.toString();
  if (text.startsWith(CONTROL_PREFIX)) {
    let msg;
    try {
      msg = JSON.parse(text.slice(CONTROL_PREFIX.length));
    } catch (e) {
      return log(`Received malformed control message: ${e.message}`);
    }
    handleControlMessage(msg);
    return;
  }
  log(`Received data: ${text}`);
}

function handleControlMessage(msg) {
  switch (msg.type) {
    case 'share-stopped':
      log('Peer stopped sharing their screen.');
      clearRemoteVideo();
      break;
    case 'share-started':
      log('Peer started sharing their screen.');
      break;
    case 'screen-info':
      remoteScreenSize = { width: msg.width, height: msg.height };
      log(`Peer's real screen size: ${msg.width}x${msg.height} (used for cursor mapping).`);
      break;
    case 'ping':
      sendControl('pong', { t: msg.t });
      break;
    case 'pong':
      updateLatency(Date.now() - msg.t);
      break;
    case 'fps-report':
      peerReportedFps = msg.fps;
      break;
    case 'clipboard-sync':
      onClipboardSyncReceived(msg.text);
      break;
    case 'screenshot-request':
      onScreenshotRequested();
      break;
    // ---- remote input (we are the one sharing our screen; act on it) ----
    case 'mouse-move':
    case 'mouse-down':
    case 'mouse-up':
    case 'mouse-doubleclick':
    case 'mouse-scroll':
    case 'key-down':
    case 'key-up':
      applyRemoteInput(msg);
      break;
    // ---- file transfer metadata ----
    case 'file-offer':
      onFileOffer(msg);
      break;
    case 'file-offer-ack':
      onFileOfferAck(msg);
      break;
    case 'file-complete':
      onFileComplete(msg);
      break;
    case 'file-cancelled':
      onFileCancelledByPeer(msg);
      break;
    case 'file-cancel-request':
      onFileCancelRequest(msg);
      break;
    case 'file-declined':
      onFileDeclined(msg);
      break;
    case 'file-paused':
      setTransferStatusText(msg.transferId, 'Paused by sender');
      break;
    case 'file-resumed':
      setTransferStatusText(msg.transferId, null);
      break;
    default:
      log(`Unknown control message type: ${msg.type}`);
  }
}

function startPeerConnection(isInitiator) {
  peer = new SimplePeer({
    initiator: isInitiator,
    trickle: true,
    config: { iceServers },
  });

  peer.on('signal', (signal) => {
    log(`Sending signal: type=${signal.type || 'candidate'}`);
    socket.emit('webrtc:signal', { toDeviceId: otherDeviceId, signal });
  });

  // Raw ICE/connection state from the underlying RTCPeerConnection — this is
  // the actual source of truth. simple-peer's 'connect' only fires once the
  // datachannel opens, so if ICE is stuck or fails, that event never fires
  // and we'd otherwise have no idea why. This logs every state transition
  // (checking -> connected/failed/disconnected) as it happens.
  peer.on('_connect', () => {}); // no-op, keeps older simple-peer versions happy
  setTimeout(() => {
    try {
      const pc = peer._pc;
      if (!pc) return;
      pc.addEventListener('iceconnectionstatechange', () => {
        log(`ICE connection state: ${pc.iceConnectionState}`);
      });
      pc.addEventListener('icegatheringstatechange', () => {
        log(`ICE gathering state: ${pc.iceGatheringState}`);
      });
      pc.addEventListener('icecandidateerror', (e) => {
        log(`ICE candidate error: url=${e.url} code=${e.errorCode} text=${e.errorText}`);
      });
      pc.addEventListener('connectionstatechange', () => {
        log(`Peer connection state: ${pc.connectionState}`);
      });
    } catch (e) {
      log(`Could not attach ICE diagnostics: ${e.message}`);
    }
  }, 0);

  peer.on('connect', () => {
    log('✅ DataChannel connected to peer.');
    document.getElementById('btn-end').disabled = false;
    btnShareScreen.disabled = false;
    btnSendFiles.disabled = false;
    btnSendFolder.disabled = false;
    logConnectionType();
    startLatencyPing();
  });

  peer.on('stream', (stream) => {
    log('Receiving remote screen share.');
    remoteVideoLabel.textContent = `(${otherDeviceId || 'peer'})`;
    showRemoteVideo(stream);

    // Fallback in case the explicit 'share-stopped' control message doesn't
    // arrive (e.g. the peer connection drops mid-teardown): if every track
    // on the stream we're displaying ends, reset the view too.
    stream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        const anyLive = stream.getTracks().some((t) => t.readyState === 'live');
        if (!anyLive && remoteVideoEl.srcObject === stream) {
          log('Remote stream track ended — clearing remote video.');
          clearRemoteVideo();
        }
      });
    });
  });

  peer.on('data', handleIncomingData);

  peer.on('error', (err) => {
    log(`Peer error: ${err.message} (code=${err.code || 'n/a'})`);
    console.error('Full peer error:', err);
  });

  peer.on('close', () => {
    log('Peer connection closed.');
    stopScreenShare({ notifyPeer: false }); // peer is gone, nothing to notify
    clearRemoteVideo();
    stopLatencyPing();
    btnSendFiles.disabled = true;
    btnSendFolder.disabled = true;
  });
}

// Grabs the primary display as a video MediaStream via Electron's
// desktopCapturer, plus a best-effort desktop-audio capture, and attaches
// both to the existing peer connection. simple-peer/RTCPeerConnection
// renegotiates automatically when a track is added after 'connect'.
async function startScreenShare() {
  if (!peer || !peer.connected) return log('Not connected to a peer yet.');
  try {
    const sources = await ipcRenderer.invoke('get-screen-sources');
    if (!sources.length) return log('No screen sources found.');
    const primary = sources[0];

    // Starting preset: whatever's picked in the dropdown, or 'medium' as a
    // sane starting point for auto mode (adaptive tick will move it from
    // there based on real conditions once ping/fps-report data comes in).
    activePresetName = selectedQualityMode === 'auto' ? 'medium' : selectedQualityMode;
    const initial = QUALITY_PRESETS[activePresetName];

    // Video + desktop audio must be requested in a SINGLE getUserMedia call.
    // Two separate desktop-capture calls (video, then audio) crash the
    // renderer on Windows — Chromium kills it with a "bad IPC message"
    // error rather than rejecting the second call cleanly. This combined
    // form is the supported pattern.
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
          },
        },
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: primary.id,
            maxWidth: initial.maxWidth,
            maxHeight: initial.maxHeight,
            maxFrameRate: initial.maxFrameRate,
          },
        },
      });
      if (stream.getAudioTracks().length) log('Captured desktop audio.');
    } catch (e) {
      // Desktop-audio loopback isn't supported on macOS/Linux, and can fail
      // on some Windows setups too. Fall back to video-only rather than
      // aborting the whole screen share.
      log(`Combined video+audio capture failed (${e.message}) — retrying video only.`);
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: primary.id,
            maxWidth: initial.maxWidth,
            maxHeight: initial.maxHeight,
            maxFrameRate: initial.maxFrameRate,
          },
        },
      });
    }

    localScreenStream = stream;
    localScreenStream.getTracks().forEach((track) => peer.addTrack(track, localScreenStream));

    // Sender only exists after addTrack — set the initial bitrate cap now,
    // and kick off the adaptive loop if the user has quality set to auto.
    await applyQualityPreset(activePresetName);
    if (selectedQualityMode === 'auto') startAdaptiveQuality();

    // Local self-preview (Bugs.txt: used to freeze on minimize — fixed via
    // backgroundThrottling:false in main.js so this <video> keeps painting).
    localPreviewEl.srcObject = localScreenStream;
    localPreviewWrap.style.display = 'block';

    log(`Sharing screen: ${primary.name}`);
    sendControl('share-started', {});

    // Tell the controller our REAL screen resolution (not the possibly
    // downscaled capture) so their clicks land in the right place.
    const realSize = await ipcRenderer.invoke('display:get-primary-size');
    sendControl('screen-info', realSize);

    // We're now the one being controlled — arm input injection.
    ipcRenderer.send('input:set-enabled', true);

    btnShareScreen.style.display = 'none';
    btnStopShare.style.display = 'inline-block';
    btnStopShare.disabled = false;

    // If the user stops sharing via the OS-level "Stop sharing" bar (if
    // shown) or the source track ends for any reason, clean up on our side.
    localScreenStream.getVideoTracks()[0].addEventListener('ended', () => stopScreenShare());
  } catch (e) {
    log(`Screen share failed: ${e.message}`);
  }
}

// `notifyPeer` defaults to true so the normal "Stop Sharing" click (and the
// OS-level stop) tells the remote side to clear its view. It's set to false
// only when the peer connection itself is already gone (peer close/teardown)
// since there's no one left to notify.
function stopScreenShare({ notifyPeer = true } = {}) {
  if (localScreenStream) {
    if (notifyPeer) sendControl('share-stopped', {});
    localScreenStream.getTracks().forEach((track) => {
      try {
        if (peer) peer.removeTrack(track, localScreenStream);
      } catch (e) {
        // peer may already be destroyed; ignore
      }
      track.stop();
    });
    localScreenStream = null;
  }
  localPreviewEl.srcObject = null;
  localPreviewWrap.style.display = 'none';
  ipcRenderer.send('input:set-enabled', false);
  btnShareScreen.style.display = 'inline-block';
  btnShareScreen.disabled = !(peer && peer.connected);
  btnStopShare.style.display = 'none';
  stopAdaptiveQuality();
  qualityBadge.style.display = 'none';
}

async function logConnectionType() {
  try {
    const pc = peer._pc; // simple-peer exposes the underlying RTCPeerConnection
    const stats = await pc.getStats();
    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        const localId = report.localCandidateId;
        const local = stats.get(localId);
        if (local) {
          const type = local.candidateType; // 'relay' = TURN, 'srflx'/'host' = direct
          log(`🔎 Connection type: ${type === 'relay' ? 'RELAY (via TURN)' : 'DIRECT (P2P via ' + type + ')'}`);
        }
      }
    });
  } catch (e) {
    log(`Could not determine connection type: ${e.message}`);
  }
}

function teardownPeerConnection() {
  stopScreenShare({ notifyPeer: false });
  cancelAllTransfers('Session ended');
  if (peer) {
    peer.destroy();
    peer = null;
  }
  document.getElementById('btn-end').disabled = true;
  btnShareScreen.disabled = true;
  clearRemoteVideo();
  stopLatencyPing();
}

btnShareScreen.addEventListener('click', startScreenShare);
btnStopShare.addEventListener('click', () => stopScreenShare());

document.getElementById('btn-request').addEventListener('click', () => {
  if (!otherDeviceId) return log('Peer not online yet.');
  socket.emit('connect:request');
  log('Connection request sent.');
});

document.getElementById('btn-accept').addEventListener('click', () => {
  socket.emit('connect:accept', { toDeviceId: pendingIncomingFrom });
  otherDeviceId = pendingIncomingFrom;
  incomingEl.style.display = 'none';
  startPeerConnection(false); // receiver waits for offer
});

document.getElementById('btn-reject').addEventListener('click', () => {
  const reason = prompt('Reason for rejecting?') || 'No reason given';
  socket.emit('connect:reject', { toDeviceId: pendingIncomingFrom, reason });
  incomingEl.style.display = 'none';
});

document.getElementById('btn-end').addEventListener('click', () => {
  socket.emit('session:end');
  teardownPeerConnection();
});

// ===========================================================================
// Connection quality — latency (P2P ping/pong over the DataChannel) and FPS
// (actual painted frames on the <video> element, not just the sender's
// encode rate).
// ===========================================================================
let latencyTimer = null;

function startLatencyPing() {
  stopLatencyPing();
  latencyTimer = setInterval(() => sendControl('ping', { t: Date.now() }), 2000);
  latencyBadge.style.display = 'inline-flex';
}

function stopLatencyPing() {
  if (latencyTimer) clearInterval(latencyTimer);
  latencyTimer = null;
  latencyBadge.style.display = 'none';
}

function updateLatency(ms) {
  lastLatencyMs = ms;
  latencyBadge.textContent = `${ms} ms`;
  latencyBadge.className = 'badge ' + (ms < 100 ? 'good' : ms < 300 ? 'warn' : 'bad');
}

let fpsRvfcHandle = null;
let fpsFrameCount = 0;
let fpsWindowStart = 0;
let lastMeasuredFps = null; // most recent fps reading, used to report back to the sharer for adaptive quality

function startFpsCounter(videoEl) {
  stopFpsCounter();
  if (!videoEl.requestVideoFrameCallback) return; // unsupported fallback: just skip the badge
  fpsBadge.style.display = 'inline-flex';
  fpsFrameCount = 0;
  fpsWindowStart = performance.now();
  const tick = () => {
    fpsFrameCount += 1;
    const elapsed = performance.now() - fpsWindowStart;
    if (elapsed >= 1000) {
      const fps = Math.round((fpsFrameCount * 1000) / elapsed);
      lastMeasuredFps = fps;
      fpsBadge.textContent = `${fps} fps`;
      fpsBadge.className = 'badge ' + (fps >= 12 ? 'good' : fps >= 6 ? 'warn' : 'bad');
      fpsFrameCount = 0;
      fpsWindowStart = performance.now();
    }
    fpsRvfcHandle = videoEl.requestVideoFrameCallback(tick);
  };
  fpsRvfcHandle = videoEl.requestVideoFrameCallback(tick);
}

function stopFpsCounter() {
  if (fpsRvfcHandle && remoteVideoEl.cancelVideoFrameCallback) {
    remoteVideoEl.cancelVideoFrameCallback(fpsRvfcHandle);
  }
  fpsRvfcHandle = null;
  lastMeasuredFps = null;
}

// ===========================================================================
// Adjustable / adaptive stream quality. Three fixed presets plus "auto",
// which adapts based on two signals: our own measured round-trip latency
// (ping/pong, already computed above) and the VIEWER's measured playback fps
// (reported back to us — the sharer — via a small 'fps-report' control
// message every few seconds, since fps as experienced by the person actually
// watching is what matters, not our local encode rate).
// ===========================================================================
const QUALITY_PRESETS = {
  high:   { label: '1080p / 20fps', maxWidth: 1920, maxHeight: 1080, maxFrameRate: 20, maxBitrate: 4_000_000 },
  medium: { label: '720p / 15fps',  maxWidth: 1280, maxHeight: 720,  maxFrameRate: 15, maxBitrate: 1_800_000 },
  low:    { label: '480p / 10fps',  maxWidth: 854,  maxHeight: 480,  maxFrameRate: 10, maxBitrate: 700_000 },
};
const QUALITY_ORDER = ['low', 'medium', 'high']; // low -> high, used for step up/down

let selectedQualityMode = 'auto'; // what the user picked in the dropdown: 'auto' | 'high' | 'medium' | 'low'
let activePresetName = 'medium'; // the preset actually applied right now (meaningful even in auto mode)

function updateQualityBadge() {
  const preset = QUALITY_PRESETS[activePresetName];
  qualityBadge.style.display = localScreenStream ? 'inline-flex' : 'none';
  qualityBadge.textContent = selectedQualityMode === 'auto' ? `auto (${preset.label})` : preset.label;
}

// Applies a preset to the currently-live capture: renegotiates resolution
// via applyConstraints on the video track (gets a fresh capture at the new
// size) and updates the RTCRtpSender's encoding bitrate cap. Safe to call
// whether or not we're currently sharing — it's a no-op if we're not.
async function applyQualityPreset(name) {
  const preset = QUALITY_PRESETS[name];
  if (!preset) return;
  activePresetName = name;
  updateQualityBadge();

  if (!localScreenStream || !peer || !peer._pc) return;

  const track = localScreenStream.getVideoTracks()[0];
  if (track) {
    try {
      await track.applyConstraints({
        width: { max: preset.maxWidth },
        height: { max: preset.maxHeight },
        frameRate: { max: preset.maxFrameRate },
      });
    } catch (e) {
      log(`Could not apply quality constraints (${name}): ${e.message}`);
    }
  }

  try {
    const sender = peer._pc.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (sender) {
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = preset.maxBitrate;
      await sender.setParameters(params);
    }
  } catch (e) {
    log(`Could not set encoder bitrate (${name}): ${e.message}`);
  }

  log(`Quality set to ${name} (${preset.label}).`);
}

qualitySelect.addEventListener('change', () => {
  selectedQualityMode = qualitySelect.value;
  if (selectedQualityMode === 'auto') {
    log('Quality set to auto — will adapt to connection conditions.');
    updateQualityBadge();
  } else {
    applyQualityPreset(selectedQualityMode);
  }
});

// ---- Adaptive loop (sharer side only — runs while we're the one sharing) ----
let adaptiveTimer = null;
let lastLatencyMs = null;
let peerReportedFps = null;
let consecutiveBad = 0;
let consecutiveGood = 0;
let lastQualityChangeAt = 0;
const ADAPTIVE_MIN_CHANGE_INTERVAL_MS = 15000; // don't oscillate — wait at least this long between auto changes

function startAdaptiveQuality() {
  stopAdaptiveQuality();
  consecutiveBad = 0;
  consecutiveGood = 0;
  adaptiveTimer = setInterval(adaptiveTick, 4000);
}

function stopAdaptiveQuality() {
  if (adaptiveTimer) clearInterval(adaptiveTimer);
  adaptiveTimer = null;
  peerReportedFps = null;
}

function adaptiveTick() {
  if (selectedQualityMode !== 'auto' || !localScreenStream) return;
  if (lastLatencyMs == null && peerReportedFps == null) return; // no signal yet

  const bad = (lastLatencyMs != null && lastLatencyMs > 350) || (peerReportedFps != null && peerReportedFps < 8);
  const good = (lastLatencyMs == null || lastLatencyMs < 150) && (peerReportedFps == null || peerReportedFps >= 18);

  if (bad) {
    consecutiveBad += 1;
    consecutiveGood = 0;
  } else if (good) {
    consecutiveGood += 1;
    consecutiveBad = 0;
  } else {
    consecutiveBad = 0;
    consecutiveGood = 0;
  }

  const sinceLastChange = Date.now() - lastQualityChangeAt;
  const idx = QUALITY_ORDER.indexOf(activePresetName);

  if (bad && consecutiveBad >= 2 && idx > 0 && sinceLastChange > 3000) {
    lastQualityChangeAt = Date.now();
    log(`Adaptive quality: stepping down (latency=${lastLatencyMs}ms, peer fps=${peerReportedFps}).`);
    applyQualityPreset(QUALITY_ORDER[idx - 1]);
  } else if (good && consecutiveGood >= 2 && idx < QUALITY_ORDER.length - 1 && sinceLastChange > ADAPTIVE_MIN_CHANGE_INTERVAL_MS) {
    lastQualityChangeAt = Date.now();
    log(`Adaptive quality: stepping up (latency=${lastLatencyMs}ms, peer fps=${peerReportedFps}).`);
    applyQualityPreset(QUALITY_ORDER[idx + 1]);
  }
}

// ---- Viewer side: report our measured fps back to whoever is sharing ----
let fpsReportTimer = null;
function startFpsReporting() {
  stopFpsReporting();
  fpsReportTimer = setInterval(() => {
    if (lastMeasuredFps != null) sendControl('fps-report', { fps: lastMeasuredFps });
  }, 3000);
}
function stopFpsReporting() {
  if (fpsReportTimer) clearInterval(fpsReportTimer);
  fpsReportTimer = null;
}

// ===========================================================================
// Remote control — mouse + keyboard. The video-stage element must be
// focused (click into it) before it captures input, so normal use of the
// app (chat, buttons) isn't swallowed by a global key listener.
// ===========================================================================
function activeVideoEl() {
  return fullscreenOverlay.classList.contains('open') ? fullscreenVideoEl : remoteVideoEl;
}

// Maps a click/move position within the displayed (letterboxed) video area
// to a 0..1 fraction of the actual video content, accounting for
// object-fit: contain letterboxing.
function mapToRemoteFraction(clientX, clientY, videoEl) {
  const rect = videoEl.getBoundingClientRect();
  const vw = videoEl.videoWidth || rect.width;
  const vh = videoEl.videoHeight || rect.height;
  const videoAspect = vw / vh;
  const boxAspect = rect.width / rect.height;

  let displayW, displayH, offsetX, offsetY;
  if (videoAspect > boxAspect) {
    displayW = rect.width;
    displayH = rect.width / videoAspect;
    offsetX = 0;
    offsetY = (rect.height - displayH) / 2;
  } else {
    displayH = rect.height;
    displayW = rect.height * videoAspect;
    offsetY = 0;
    offsetX = (rect.width - displayW) / 2;
  }

  const x = (clientX - rect.left - offsetX) / displayW;
  const y = (clientY - rect.top - offsetY) / displayH;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

function toRemotePixels(clientX, clientY, videoEl) {
  if (!remoteScreenSize) return null;
  const frac = mapToRemoteFraction(clientX, clientY, videoEl);
  return { x: frac.x * remoteScreenSize.width, y: frac.y * remoteScreenSize.height };
}

let lastMouseMoveSent = 0;
const MOUSE_MOVE_THROTTLE_MS = 33; // ~30/sec, plenty for cursor tracking

let controlEngaged = false; // are we actively forwarding input right now?

function isControlActive() {
  return controlEngaged;
}

function engageControl() {
  controlEngaged = true;
  videoStageEl.classList.add('focused');
}

function disengageControl() {
  if (!controlEngaged) return;
  controlEngaged = false;
  videoStageEl.classList.remove('focused');
  releaseAllHeldKeys();
}

function wireInputCapture(el) {
  el.addEventListener('mousemove', (e) => {
    if (!isControlActive() || !remoteVideoEl.srcObject) return;
    const now = performance.now();
    if (now - lastMouseMoveSent < MOUSE_MOVE_THROTTLE_MS) return;
    lastMouseMoveSent = now;
    const pos = toRemotePixels(e.clientX, e.clientY, el);
    if (pos) sendControl('mouse-move', pos);
  });

  el.addEventListener('mousedown', (e) => {
    if (!isControlActive() || !remoteVideoEl.srcObject) return;
    e.preventDefault();
    const pos = toRemotePixels(e.clientX, e.clientY, el) || {};
    sendControl('mouse-down', { button: e.button, ...pos });
  });

  el.addEventListener('mouseup', (e) => {
    if (!isControlActive() || !remoteVideoEl.srcObject) return;
    e.preventDefault();
    const pos = toRemotePixels(e.clientX, e.clientY, el) || {};
    sendControl('mouse-up', { button: e.button, ...pos });
  });

  // Double-click never made it to the remote side before: nothing here ever
  // sent it, so two real clicks went over the DataChannel as two separate
  // mousedown/mouseup pairs and network jitter almost always pushed them
  // outside Windows' double-click timing window, so the remote OS never
  // saw a "double-click" at all. Send it as its own explicit event instead.
  el.addEventListener('dblclick', (e) => {
    if (!isControlActive() || !remoteVideoEl.srcObject) return;
    e.preventDefault();
    sendControl('mouse-doubleclick', { button: e.button });
  });

  el.addEventListener('wheel', (e) => {
    if (!isControlActive() || !remoteVideoEl.srcObject) return;
    e.preventDefault();
    sendControl('mouse-scroll', { deltaX: e.deltaX, deltaY: e.deltaY });
  }, { passive: false });

  el.addEventListener('contextmenu', (e) => {
    if (isControlActive()) e.preventDefault(); // right-click already relayed via mousedown/up
  });
}

wireInputCapture(videoStageEl);
wireInputCapture(fullscreenVideoEl);

videoStageEl.addEventListener('click', () => {
  videoStageEl.focus();
  engageControl();
});
videoStageEl.addEventListener('blur', disengageControl);

const heldKeys = new Set(); // codes we've told the remote side are "down", so we can force-release them

function releaseAllHeldKeys() {
  for (const code of heldKeys) {
    sendControl('key-up', { code });
  }
  heldKeys.clear();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (controlEngaged || fullscreenOverlay.classList.contains('open'))) {
    e.preventDefault();
    // First Escape while actively controlling: drop control only, stay in
    // fullscreen (so you can keep watching without your next keystrokes
    // going to the remote machine). Second Escape, now that control is
    // already dropped: actually exit fullscreen. Previously one press did
    // both at once, so you could never let go of control without also
    // losing the fullscreen view.
    if (controlEngaged) {
      disengageControl();
    } else {
      closeFullscreenOverlay();
    }
    return;
  }
  if (!isControlActive() || !remoteVideoEl.srcObject) return;
  // preventDefault BEFORE the repeat check: otherwise a key held down long
  // enough to start repeating stops being prevented locally, and Chromium's
  // own handling for that key (Tab shifting focus, arrows scrolling, etc.)
  // can run and steal focus away from the video element mid-hold. When that
  // happens control silently drops (blur -> disengageControl), so the
  // matching keyup below never fires and the remote machine never hears
  // "key released" — leaving a key/modifier stuck down over there, which is
  // what breaks typing after a while.
  e.preventDefault();
  if (e.repeat) return; // let the remote OS handle key-repeat once held
  heldKeys.add(e.code);
  sendControl('key-down', { code: e.code });
});

document.addEventListener('keyup', (e) => {
  if (!isControlActive() || !remoteVideoEl.srcObject) return;
  e.preventDefault();
  heldKeys.delete(e.code);
  sendControl('key-up', { code: e.code });
});

// We're the side being controlled — translate an incoming control message
// into an IPC call to main.js, which does the actual nut-js injection.
function applyRemoteInput(msg) {
  switch (msg.type) {
    case 'mouse-move':
      ipcRenderer.send('input:mouse-move', { x: msg.x, y: msg.y });
      break;
    case 'mouse-down':
      ipcRenderer.send('input:mouse-button', { button: msg.button, action: 'down', x: msg.x, y: msg.y });
      break;
    case 'mouse-up':
      ipcRenderer.send('input:mouse-button', { button: msg.button, action: 'up', x: msg.x, y: msg.y });
      break;
    case 'mouse-doubleclick':
      ipcRenderer.send('input:mouse-doubleclick', { button: msg.button });
      break;
    case 'mouse-scroll':
      ipcRenderer.send('input:mouse-scroll', { deltaX: msg.deltaX, deltaY: msg.deltaY });
      break;
    case 'key-down':
      ipcRenderer.send('input:key', { code: msg.code, action: 'down' });
      break;
    case 'key-up':
      ipcRenderer.send('input:key', { code: msg.code, action: 'up' });
      break;
  }
}

// ---- Fullscreen remote view ----
function openFullscreenOverlay() {
  if (!remoteVideoEl.srcObject) return;
  fullscreenVideoEl.srcObject = remoteVideoEl.srcObject;
  fullscreenOverlay.classList.add('open');
  fullscreenVideoEl.focus();
  engageControl();
  startFpsCounter(fullscreenVideoEl);
}

function closeFullscreenOverlay() {
  if (!fullscreenOverlay.classList.contains('open')) return;
  disengageControl();
  fullscreenOverlay.classList.remove('open');
  fullscreenVideoEl.srcObject = null;
  if (remoteVideoEl.srcObject) startFpsCounter(remoteVideoEl);
}

btnFullscreenView.addEventListener('click', openFullscreenOverlay);
btnExitFullscreen.addEventListener('click', closeFullscreenOverlay);

// ===========================================================================
// File transfer — chunked over the DataChannel. Metadata rides CONTROL_PREFIX
// JSON messages; raw bytes ride binary frames tagged with FILE_CHUNK_MARKER.
// Actual disk I/O happens in main.js via IPC (see fs:* handlers there).
// ===========================================================================
const CHUNK_SIZE = 64 * 1024;
const BUFFERED_AMOUNT_HIGH_WATER = 8 * 1024 * 1024; // pause sending past this
let nextTransferId = 1;
const transfersOut = new Map(); // transferId -> { absPath, relPath, size, paused, cancelled }
const transfersIn = new Map(); // transferId -> { relPath, size, bytesReceived, destPath }

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function createTransferItem(transferId, name, direction) {
  const item = document.createElement('div');
  item.className = 'transfer-item';
  item.id = `transfer-${transferId}`;
  item.innerHTML = `
    <div class="t-top">
      <span class="t-name" title="${name}">${direction === 'out' ? '⬆ ' : '⬇ '}${name}</span>
    </div>
    <div class="t-bar-track"><div class="t-bar-fill"></div></div>
    <div class="t-meta"><span class="t-status">Starting…</span></div>
    <div class="t-actions"></div>
  `;
  transferListEl.prepend(item);
  return item;
}

function updateTransferProgress(transferId, bytesDone, size) {
  const item = document.getElementById(`transfer-${transferId}`);
  if (!item) return;
  const pct = size ? Math.min(100, Math.round((bytesDone / size) * 100)) : 0;
  item.querySelector('.t-bar-fill').style.width = `${pct}%`;
  item.querySelector('.t-status').textContent = `${fmtBytes(bytesDone)} / ${fmtBytes(size)} (${pct}%)`;
}

function setTransferStatusText(transferId, text) {
  const item = document.getElementById(`transfer-${transferId}`);
  if (!item) return;
  if (text) item.querySelector('.t-status').dataset.override = text;
  else delete item.querySelector('.t-status').dataset.override;
  if (text) item.querySelector('.t-status').textContent = text;
}

function markTransferDone(transferId, extraText) {
  const item = document.getElementById(`transfer-${transferId}`);
  if (!item) return;
  item.classList.add('done');
  item.querySelector('.t-bar-fill').style.width = '100%';
  if (extraText) item.querySelector('.t-status').textContent = extraText;
  item.querySelector('.t-actions').innerHTML = '';
}

function markTransferError(transferId, text) {
  const item = document.getElementById(`transfer-${transferId}`);
  if (!item) return;
  item.classList.add('error');
  item.querySelector('.t-status').textContent = text;
  item.querySelector('.t-actions').innerHTML = '';
}

function setOutActions(transferId) {
  const item = document.getElementById(`transfer-${transferId}`);
  if (!item) return;
  const actions = item.querySelector('.t-actions');
  actions.innerHTML = '';

  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'small';
  pauseBtn.textContent = 'Pause';
  pauseBtn.onclick = () => {
    const t = transfersOut.get(transferId);
    if (!t) return;
    t.paused = !t.paused;
    pauseBtn.textContent = t.paused ? 'Resume' : 'Pause';
    sendControl(t.paused ? 'file-paused' : 'file-resumed', { transferId });
    if (!t.paused) setTransferStatusText(transferId, null);
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'small danger';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => {
    const t = transfersOut.get(transferId);
    if (!t) return;
    t.cancelled = true;
    sendControl('file-cancelled', { transferId });
    markTransferError(transferId, 'Cancelled');
    item.querySelector('.t-actions').innerHTML = '';
    socket.emit('activity:log', { type: 'file_cancelled', meta: { name: t.relPath } });
  };

  actions.appendChild(pauseBtn);
  actions.appendChild(cancelBtn);
}

function makeBatchId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function sendSingleFile(absPath, relPath, size, batch) {
  if (!peer || !peer.connected) return log('Not connected — cannot send file.');
  const transferId = nextTransferId++;
  transfersOut.set(transferId, { absPath, relPath, size, paused: false, cancelled: false });
  createTransferItem(transferId, relPath, 'out');
  sendControl('file-offer', {
    transferId,
    name: relPath,
    size,
    batchId: batch?.id,
    batchLabel: batch?.label ?? relPath,
    batchTotal: batch?.total ?? 1,
    isScreenshot: !!batch?.isScreenshot,
  });
  socket.emit('activity:log', { type: 'file_offer', meta: { name: relPath, size, isScreenshot: !!batch?.isScreenshot } });
  // Sending actually starts once the receiver accepts AND acks
  // (onFileOfferAck), so its write stream is guaranteed open first.
}

async function onFileOfferAck({ transferId }) {
  const t = transfersOut.get(transferId);
  if (!t) return;
  setOutActions(transferId); // buttons belong on screen WHILE sending, not after
  try {
    await ipcRenderer.invoke('fs:open-read', { transferId, filePath: t.absPath });
    let bytesSent = 0;
    while (true) {
      if (t.cancelled) {
        await ipcRenderer.invoke('fs:close-read', { transferId });
        return;
      }
      if (t.paused) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      const { data, eof } = await ipcRenderer.invoke('fs:read-chunk', { transferId });
      if (eof) break;

      // Backpressure: don't flood the DataChannel faster than it can drain,
      // or large files will balloon memory / stall input events.
      const channel = peer._channel;
      while (channel && channel.bufferedAmount > BUFFERED_AMOUNT_HIGH_WATER) {
        await new Promise((r) => setTimeout(r, 50));
      }

      const header = Buffer.alloc(5);
      header.writeUInt8(FILE_CHUNK_MARKER, 0);
      header.writeUInt32BE(transferId, 1);
      peer.send(Buffer.concat([header, data]));

      bytesSent += data.length;
      updateTransferProgress(transferId, bytesSent, t.size);
    }
    await ipcRenderer.invoke('fs:close-read', { transferId });
    sendControl('file-complete', { transferId });
    markTransferDone(transferId, 'Sent');
    transfersOut.delete(transferId);
    socket.emit('activity:log', { type: 'file_complete', meta: { name: t.relPath, size: t.size } });
  } catch (e) {
    log(`File send failed (${t.relPath}): ${e.message}`);
    markTransferError(transferId, `Error: ${e.message}`);
    transfersOut.delete(transferId);
  }
}

// batchId -> { status: 'pending'|'accepted'|'declined', destRoot, label, total, queue: [{transferId,name,size}] }
const incomingBatches = new Map();

function renderIncomingPrompt(batchId) {
  const b = incomingBatches.get(batchId);
  if (!b) return;
  const el = document.createElement('div');
  el.className = 'transfer-item incoming-prompt';
  el.id = `batch-${batchId}`;
  el.innerHTML = `
    <div class="t-top"><span class="t-name">Incoming: ${b.label} (${b.total} file${b.total === 1 ? '' : 's'})</span></div>
    <div class="t-meta"><span class="t-status">Waiting for you to accept or decline…</span></div>
    <div class="t-actions"></div>
  `;
  const actions = el.querySelector('.t-actions');
  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'small';
  acceptBtn.textContent = 'Accept…';
  acceptBtn.onclick = () => acceptIncomingBatch(batchId, el);
  const declineBtn = document.createElement('button');
  declineBtn.className = 'small danger';
  declineBtn.textContent = 'Decline';
  declineBtn.onclick = () => declineIncomingBatch(batchId, el);
  actions.appendChild(acceptBtn);
  actions.appendChild(declineBtn);
  transferListEl.prepend(el);
}

async function acceptIncomingBatch(batchId, promptEl) {
  const b = incomingBatches.get(batchId);
  if (!b) return;
  const destRoot = await ipcRenderer.invoke('fs:choose-save-dir', { suggestedName: b.label });
  if (!destRoot) {
    // Cancelling "where do I save this" is treated as declining — we're not
    // going to silently pick a folder for you after you back out of that.
    return declineIncomingBatch(batchId, promptEl);
  }
  b.status = 'accepted';
  b.destRoot = destRoot;
  promptEl.remove();
  for (const offer of b.queue) startReceivingFile(offer, destRoot);
  b.queue = [];
}

function declineIncomingBatch(batchId, promptEl) {
  const b = incomingBatches.get(batchId);
  if (!b) return;
  b.status = 'declined';
  for (const offer of b.queue) sendControl('file-declined', { transferId: offer.transferId });
  b.queue = [];
  promptEl.remove();
}

async function startReceivingFile({ transferId, name, size }, destRoot) {
  try {
    const { destPath } = await ipcRenderer.invoke('fs:open-write', { transferId, relPath: name, destRoot });
    transfersIn.set(transferId, { relPath: name, size, bytesReceived: 0, destPath });
    createTransferItem(transferId, name, 'in');
    const item = document.getElementById(`transfer-${transferId}`);
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'small danger';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
      sendControl('file-cancel-request', { transferId });
      ipcRenderer.invoke('fs:cancel-write', { transferId });
      transfersIn.delete(transferId);
      markTransferError(transferId, 'Cancelled');
    };
    item.querySelector('.t-actions').appendChild(cancelBtn);
    sendControl('file-offer-ack', { transferId });
  } catch (e) {
    log(`Could not accept incoming file (${name}): ${e.message}`);
  }
}

async function onFileOffer({ transferId, name, size, batchId, batchLabel, batchTotal, isScreenshot }) {
  // Older/mismatched peers without batching still work: fall back to a
  // one-file-one-batch id so each offer gets its own prompt.
  const id = batchId || `single-${transferId}`;
  let b = incomingBatches.get(id);
  if (!b) {
    b = { status: 'pending', destRoot: null, label: batchLabel || name, total: batchTotal || 1, queue: [], isScreenshot: !!isScreenshot };
    incomingBatches.set(id, b);

    // Screenshots skip the accept/decline prompt entirely — the local user
    // already caused this by clicking "Request Screenshot", so asking them
    // to accept their own request would just be friction. Saves straight
    // into a dedicated Screenshots subfolder under the normal downloads root.
    if (b.isScreenshot) {
      b.status = 'accepted';
      b.destRoot = await ipcRenderer.invoke('fs:get-screenshots-dir');
      startReceivingFile({ transferId, name, size }, b.destRoot);
      socket.emit('activity:log', { type: 'screenshot_received', meta: { name, size } });
      return;
    }

    b.queue.push({ transferId, name, size });
    renderIncomingPrompt(id);
    return;
  }
  if (b.isScreenshot && b.status === 'accepted') {
    startReceivingFile({ transferId, name, size }, b.destRoot);
    return;
  }
  if (b.status === 'pending') {
    b.queue.push({ transferId, name, size });
    return;
  }
  if (b.status === 'declined') {
    sendControl('file-declined', { transferId });
    return;
  }
  // already accepted — start straight away with the folder we already picked
  startReceivingFile({ transferId, name, size }, b.destRoot);
}

function onFileDeclined({ transferId }) {
  const t = transfersOut.get(transferId);
  if (!t) return;
  markTransferError(transferId, 'Declined by recipient');
  transfersOut.delete(transferId);
  socket.emit('activity:log', { type: 'file_declined', meta: { name: t.relPath } });
}

async function handleIncomingFileChunk(transferId, payload) {
  const t = transfersIn.get(transferId);
  if (!t) return; // unknown/cancelled transfer — drop silently
  try {
    await ipcRenderer.invoke('fs:write-chunk', { transferId, data: payload });
    t.bytesReceived += payload.length;
    updateTransferProgress(transferId, t.bytesReceived, t.size);
  } catch (e) {
    log(`Write failed for incoming file ${t.relPath}: ${e.message}`);
    markTransferError(transferId, `Error: ${e.message}`);
    transfersIn.delete(transferId);
  }
}

async function onFileComplete({ transferId }) {
  const t = transfersIn.get(transferId);
  if (!t) return;
  const res = await ipcRenderer.invoke('fs:close-write', { transferId });
  const item = document.getElementById(`transfer-${transferId}`);
  if (item && res) {
    const revealBtn = document.createElement('button');
    revealBtn.className = 'small';
    revealBtn.textContent = 'Show in folder';
    revealBtn.onclick = () => ipcRenderer.send('fs:reveal', { filePath: res.destPath });
    markTransferDone(transferId, 'Received');
    item.querySelector('.t-actions').appendChild(revealBtn);
  }
  transfersIn.delete(transferId);
  socket.emit('activity:log', { type: 'file_complete', meta: { name: t.relPath, size: t.size } });
}

async function onFileCancelledByPeer({ transferId }) {
  const t = transfersIn.get(transferId);
  if (!t) return;
  await ipcRenderer.invoke('fs:cancel-write', { transferId });
  transfersIn.delete(transferId);
  markTransferError(transferId, 'Cancelled by sender');
  socket.emit('activity:log', { type: 'file_cancelled', meta: { name: t.relPath } });
}

function onFileCancelRequest({ transferId }) {
  const t = transfersOut.get(transferId);
  if (!t) return;
  t.cancelled = true;
  markTransferError(transferId, 'Cancelled by receiver');
}

function cancelAllTransfers(reason) {
  transfersOut.forEach((t, id) => { t.cancelled = true; markTransferError(id, reason); });
  transfersIn.forEach((t, id) => {
    ipcRenderer.invoke('fs:cancel-write', { transferId: id });
    markTransferError(id, reason);
  });
  transfersIn.clear();
  incomingBatches.forEach((b, id) => {
    const el = document.getElementById(`batch-${id}`);
    if (el) el.remove();
  });
  incomingBatches.clear();
}

// ===========================================================================
// Clipboard sync — text only. Manual "Push" button always available while
// connected; optional auto-sync polls the local clipboard and pushes on
// change. Guards against echo loops (receiving text and immediately
// re-sending it back) by tracking the last value we applied locally.
// ===========================================================================
let lastLocalClipboardValue = null; // last value WE read locally (sent or just polled)
let lastAppliedRemoteValue = null; // last value we wrote locally because the peer sent it
let clipboardPollTimer = null;

function setClipboardStatus(text) {
  clipboardStatusEl.textContent = text;
}

async function pushLocalClipboard(auto = false) {
  if (!peer || !peer.connected) {
    if (!auto) setClipboardStatus('Not connected.');
    return;
  }
  try {
    const text = await ipcRenderer.invoke('clipboard:read');
    if (!text) {
      if (!auto) setClipboardStatus('Local clipboard is empty.');
      return;
    }
    if (text === lastLocalClipboardValue && auto) return; // nothing changed, don't spam
    if (text === lastAppliedRemoteValue) return; // this is exactly what the peer just sent us — don't echo it back
    lastLocalClipboardValue = text;
    sendControl('clipboard-sync', { text });
    socket.emit('activity:log', { type: 'clipboard_sync', meta: { direction: 'sent', length: text.length } });
    setClipboardStatus(auto ? `Auto-synced ${text.length} chars.` : `Sent ${text.length} chars.`);
  } catch (e) {
    setClipboardStatus(`Clipboard read failed: ${e.message}`);
  }
}

function onClipboardSyncReceived(text) {
  if (typeof text !== 'string') return;
  lastAppliedRemoteValue = text;
  lastLocalClipboardValue = text; // so auto-sync doesn't immediately bounce it back
  ipcRenderer.send('clipboard:write', text);
  socket.emit('activity:log', { type: 'clipboard_sync', meta: { direction: 'received', length: text.length } });
  setClipboardStatus(`Received ${text.length} chars from peer.`);
  log(`Clipboard synced from peer (${text.length} chars).`);
}

btnSendClipboard.addEventListener('click', () => pushLocalClipboard(false));

chkAutoClipboard.addEventListener('change', () => {
  if (chkAutoClipboard.checked) {
    clipboardPollTimer = setInterval(() => pushLocalClipboard(true), 1500);
    setClipboardStatus('Auto-sync on.');
  } else {
    if (clipboardPollTimer) clearInterval(clipboardPollTimer);
    clipboardPollTimer = null;
    setClipboardStatus('Auto-sync off.');
  }
});

// ===========================================================================
// Remote screenshot — request the peer's primary display as a PNG. Reuses
// the existing chunked file-transfer pipeline end-to-end (see sendSingleFile
// / onFileOffer below): the only difference is an isScreenshot flag on the
// offer that makes the receiving side auto-accept into a dedicated
// "Screenshots" folder instead of showing the normal accept/decline prompt.
// ===========================================================================
btnRequestScreenshot.addEventListener('click', () => {
  if (!peer || !peer.connected) return log('Not connected — cannot request a screenshot.');
  sendControl('screenshot-request', {});
  socket.emit('activity:log', { type: 'screenshot_requested', meta: {} });
  log('Requested a screenshot from the peer.');
});

async function onScreenshotRequested() {
  try {
    const { absPath, relPath, size } = await ipcRenderer.invoke('screenshot:capture-to-temp');
    const batch = { id: makeBatchId(), label: relPath, total: 1, isScreenshot: true };
    sendSingleFile(absPath, relPath, size, batch);
  } catch (e) {
    log(`Screenshot capture failed: ${e.message}`);
  }
}

// ---- File picking + drag-drop ----
btnSendFiles.addEventListener('click', async () => {
  const files = await ipcRenderer.invoke('fs:pick-files');
  if (!files.length) return;
  const batch = {
    id: makeBatchId(),
    label: files.length === 1 ? files[0].relPath : `${files.length} files`,
    total: files.length,
  };
  files.forEach((f) => sendSingleFile(f.absPath, f.relPath, f.size, batch));
});

btnSendFolder.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('fs:pick-folder');
  if (!result) return;
  const batch = { id: makeBatchId(), label: result.folderName, total: result.files.length };
  result.files.forEach((f) => sendSingleFile(f.absPath, f.relPath, f.size, batch));
});

['dragenter', 'dragover'].forEach((evt) => {
  dropzoneEl.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzoneEl.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  dropzoneEl.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzoneEl.classList.remove('dragover');
  });
});

dropzoneEl.addEventListener('drop', async (e) => {
  if (!peer || !peer.connected) return log('Not connected — cannot send files.');
  const items = Array.from(e.dataTransfer.files);
  for (const file of items) {
    if (!file.path) continue;
    try {
      const stat = fs.statSync(file.path);
      if (stat.isDirectory()) {
        const result = await ipcRenderer.invoke('fs:walk-folder', { folderAbs: file.path });
        const batch = { id: makeBatchId(), label: result.folderName, total: result.files.length };
        result.files.forEach((f) => sendSingleFile(f.absPath, f.relPath, f.size, batch));
      } else {
        sendSingleFile(file.path, file.name, stat.size, { id: makeBatchId(), label: file.name, total: 1 });
      }
    } catch (e2) {
      log(`Could not read dropped item ${file.path}: ${e2.message}`);
    }
  }
});

// ===========================================================================
// Activity log viewer — read-only panel, fetched from the server on demand
// (not a live feed). Covers presence, session start/end, and file-transfer /
// clipboard / screenshot events reported by either device.
// ===========================================================================
const ACTIVITY_LABELS = {
  device_online: 'Device came online',
  device_offline: 'Device went offline',
  session_start: 'Session started',
  session_end: 'Session ended',
  file_offer: 'File offer sent',
  file_complete: 'File transfer completed',
  file_cancelled: 'File transfer cancelled',
  file_declined: 'File transfer declined',
  clipboard_sync: 'Clipboard synced',
  screenshot_requested: 'Screenshot requested',
  screenshot_received: 'Screenshot received',
};

function renderActivityEntry(entry) {
  const div = document.createElement('div');
  div.className = 'transfer-item';
  const label = ACTIVITY_LABELS[entry.type] || entry.type;
  const when = new Date(entry.createdAt).toLocaleString();
  const metaBits = Object.entries(entry.meta || {})
    .filter(([k]) => k !== 'withDeviceId')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  div.innerHTML = `
    <div class="t-top"><span class="t-name">${label}</span></div>
    <div class="t-meta">${entry.deviceId} &middot; ${when}${metaBits ? ' &middot; ' + metaBits : ''}</div>
  `;
  return div;
}

async function loadActivityLog() {
  activityListEl.innerHTML = '<div class="t-meta">Loading…</div>';
  try {
    const res = await fetch(`${config.serverUrl}/logs/activity?limit=150`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error(`fetch failed (${res.status})`);
    const { entries } = await res.json();
    activityListEl.innerHTML = '';
    if (!entries.length) {
      activityListEl.innerHTML = '<div class="t-meta">No activity yet.</div>';
      return;
    }
    entries.forEach((entry) => activityListEl.appendChild(renderActivityEntry(entry)));
  } catch (e) {
    activityListEl.innerHTML = `<div class="t-meta">Could not load activity log: ${e.message}</div>`;
  }
}

btnToggleActivity.addEventListener('click', () => {
  activityPanel.classList.add('open');
  loadActivityLog();
});
btnCloseActivity.addEventListener('click', () => activityPanel.classList.remove('open'));
btnRefreshActivity.addEventListener('click', loadActivityLog);

(async function init() {
  try {
    const { token, deviceId } = await loginWithSavedOrPrompt();
    authToken = token;
    currentDeviceId = deviceId;
    log('Login successful.');
    await fetchTurnCredentials();
    connectSocket(token);
    await loadChatHistory();
  } catch (err) {
    statusEl.textContent = 'Login failed';
    log(`Login error: ${err.message}`);
  }
})();
