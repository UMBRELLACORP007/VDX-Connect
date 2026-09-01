const io = require('socket.io-client');
const SimplePeer = require('simple-peer');
const { ipcRenderer } = require('electron');

const statusEl = document.getElementById('status');
const peerStatusEl = document.getElementById('peer-status');
const logEl = document.getElementById('log');
const incomingEl = document.getElementById('incoming');
const incomingTextEl = document.getElementById('incoming-text');
const btnShareScreen = document.getElementById('btn-share-screen');
const btnStopShare = document.getElementById('btn-stop-share');
const remoteVideoLabel = document.getElementById('remote-video-label');
const remoteVideoEl = document.getElementById('remote-video');
const videoPlaceholderEl = document.getElementById('video-placeholder');
const btnToggleLogs = document.getElementById('btn-toggle-logs');
const btnCloseLogs = document.getElementById('btn-close-logs');
const btnClearLogs = document.getElementById('btn-clear-logs');
const logsPanel = document.getElementById('logs-panel');

let socket = null;
let peer = null;
let otherDeviceId = null;
let pendingIncomingFrom = null;
let authToken = null;
let localScreenStream = null;
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

// ---- Remote video helpers: keep the "empty/placeholder" state in one place
// so both the normal teardown path and the stop-sharing path reset the same
// way (this is what was missing before — srcObject was cleared on peer
// close, but never on a mid-session "stop sharing").
function showRemoteVideo(stream) {
  remoteVideoEl.srcObject = stream;
  remoteVideoEl.style.display = 'block';
  videoPlaceholderEl.style.display = 'none';
}

function clearRemoteVideo() {
  remoteVideoEl.pause();
  remoteVideoEl.srcObject = null;
  remoteVideoEl.style.display = 'none';
  videoPlaceholderEl.style.display = 'block';
  videoPlaceholderEl.textContent = 'No one is sharing their screen yet.';
}

// Copy device-config.example.js -> device-config.js and fill in real values
// on each machine before running.
let config;
try {
  config = require('../config/device-config.js');
} catch (e) {
  statusEl.textContent = 'Missing device-config.js';
  log('Missing device-config.js — copy device-config.example.js to device-config.js in the same folder and fill in real values.');
  throw e;
}

async function login() {
  const res = await fetch(`${config.serverUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: config.deviceId, secret: config.secret }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Login failed (${res.status})`);
  }

  const { token } = await res.json();
  return token;
}

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

function connectSocket(token) {
  socket = io(config.serverUrl, { auth: { token } });

  socket.on('connect', () => {
    statusEl.textContent = `Connected as ${config.deviceId}`;
    log('Socket connected, authenticated.');
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

// Small control-message helper riding on the existing DataChannel — used to
// tell the remote side "sharing just stopped" so it can reset its video
// element instead of freezing on the last frame. Prefixed so it never
// collides with plain-text chat data sent elsewhere.
const CONTROL_PREFIX = '__vdx-control__:';

function sendControl(type, payload) {
  if (!peer || !peer.connected) return;
  try {
    peer.send(CONTROL_PREFIX + JSON.stringify({ type, ...payload }));
  } catch (e) {
    log(`Could not send control message (${type}): ${e.message}`);
  }
}

function handleIncomingData(data) {
  const text = data.toString();
  if (text.startsWith(CONTROL_PREFIX)) {
    let msg;
    try {
      msg = JSON.parse(text.slice(CONTROL_PREFIX.length));
    } catch (e) {
      return log(`Received malformed control message: ${e.message}`);
    }
    if (msg.type === 'share-stopped') {
      log('Peer stopped sharing their screen.');
      clearRemoteVideo();
    } else if (msg.type === 'share-started') {
      log('Peer started sharing their screen.');
    }
    return;
  }
  log(`Received data: ${text}`);
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
    logConnectionType();
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
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 15,
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
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 15,
          },
        },
      });
    }

    localScreenStream = stream;
    localScreenStream.getTracks().forEach((track) => peer.addTrack(track, localScreenStream));

    log(`Sharing screen: ${primary.name}`);
    sendControl('share-started', {});
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
  btnShareScreen.style.display = 'inline-block';
  btnShareScreen.disabled = !(peer && peer.connected);
  btnStopShare.style.display = 'none';
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
  if (peer) {
    peer.destroy();
    peer = null;
  }
  document.getElementById('btn-end').disabled = true;
  btnShareScreen.disabled = true;
  clearRemoteVideo();
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

(async function init() {
  try {
    const token = await login();
    authToken = token;
    log('Login successful.');
    await fetchTurnCredentials();
    connectSocket(token);
  } catch (err) {
    statusEl.textContent = 'Login failed';
    log(`Login error: ${err.message}`);
  }
})();
