// Core session logic ported from renderer/renderer.js. Behavior preserved:
// same socket events, same control-message protocol over the DataChannel,
// same screen-share capture path. What changed is delivery — instead of
// writing to DOM elements directly, this emits events a React hook
// subscribes to. NOT YET PORTED from the vanilla renderer (tracked
// separately, not silently dropped): remote input capture/injection,
// file transfer, clipboard sync, screenshot request/response, and the
// auto-adaptive quality stepping loop (manual quality presets ARE ported).

import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import { ipc } from './ipc';
import { getConfig } from './auth';

const CONTROL_PREFIX = '__vdx-control__:';
const FILE_CHUNK_MARKER = 0xf1;
const CHUNK_SIZE = 64 * 1024;
const BUFFERED_AMOUNT_HIGH_WATER = 8 * 1024 * 1024; // pause sending past this

export const QUALITY_PRESETS = {
  high:   { label: '1080p / 20fps', maxWidth: 1920, maxHeight: 1080, maxFrameRate: 20, maxBitrate: 4_000_000 },
  medium: { label: '720p / 15fps',  maxWidth: 1280, maxHeight: 720,  maxFrameRate: 15, maxBitrate: 1_800_000 },
  low:    { label: '480p / 10fps',  maxWidth: 854,  maxHeight: 480,  maxFrameRate: 10, maxBitrate: 700_000 },
};

// Tiny pub-sub so this stays framework-agnostic — useSession.js is the only
// thing that knows this is feeding React state.
function createEmitter() {
  const listeners = new Map();
  return {
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return () => listeners.get(event)?.delete(cb);
    },
    emit(event, payload) {
      listeners.get(event)?.forEach((cb) => cb(payload));
    },
  };
}

export function createSession({ token, deviceId }) {
  const config = getConfig();
  const bus = createEmitter();

  let socket = null;
  let peer = null;
  let otherDeviceId = null;
  let pendingIncomingFrom = null;
  let iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  let localScreenStream = null;
  let latencyTimer = null;
  let selectedQualityMode = 'auto';
  let activePresetName = 'medium';
  let remoteScreenSize = null;

  function log(msg) {
    bus.emit('log', msg);
  }

  // ---- ICE servers (Twilio TURN token from our own server) ----
  async function refreshIceServers() {
    try {
      const res = await fetch(`${config.serverUrl}/turn/token`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`TURN token fetch failed (${res.status})`);
      const { iceServers: twilioIceServers } = await res.json();
      iceServers = [...iceServers, ...twilioIceServers];
      log(`Fetched ${twilioIceServers.length} TURN/STUN entries.`);
    } catch (e) {
      log(`Could not fetch TURN credentials: ${e.message}. STUN-only fallback.`);
    }
  }

  // ---- Chat ----
  async function loadChatHistory() {
    try {
      const res = await fetch(`${config.serverUrl}/chat/history`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`history fetch failed (${res.status})`);
      const { messages } = await res.json();
      messages.forEach((m) => bus.emit('chat:message', { text: m.text, createdAt: m.createdAt, mine: m.senderId === deviceId }));
    } catch (e) {
      log(`Could not load chat history: ${e.message}`);
    }
  }

  function sendChatMessage(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || !socket || !socket.connected) return false;
    socket.emit('chat:message', { text: trimmed });
    bus.emit('chat:message', { text: trimmed, createdAt: new Date(), mine: true });
    return true;
  }

  async function clearChatHistory() {
    const res = await fetch(`${config.serverUrl}/chat/history`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`clear failed (${res.status})`);
    bus.emit('chat:cleared');
  }

  // ---- Control-message protocol over the DataChannel ----
  function sendControl(type, payload = {}) {
    if (!peer || !peer.connected) return;
    try {
      peer.send(CONTROL_PREFIX + JSON.stringify({ type, ...payload }));
    } catch (e) {
      log(`Could not send control message (${type}): ${e.message}`);
    }
  }

  function handleIncomingData(data) {
    if ((data instanceof Uint8Array || Buffer.isBuffer(data)) && data.length >= 5 && data[0] === FILE_CHUNK_MARKER) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const transferId = buf.readUInt32BE(1);
      const payload = buf.subarray(5);
      handleIncomingFileChunk(transferId, payload);
      return;
    }
    const text = data.toString();
    if (text.startsWith(CONTROL_PREFIX)) {
      let msg;
      try {
        msg = JSON.parse(text.slice(CONTROL_PREFIX.length));
      } catch (e) {
        return log(`Malformed control message: ${e.message}`);
      }
      handleControlMessage(msg);
      return;
    }
    log(`Received data: ${text}`);
  }

  function handleControlMessage(msg) {
    switch (msg.type) {
      case 'share-stopped':
        bus.emit('remote-stream:cleared');
        break;
      case 'share-started':
        log('Peer started sharing their screen.');
        break;
      case 'screen-info':
        remoteScreenSize = { width: msg.width, height: msg.height };
        bus.emit('remote-screen-size', remoteScreenSize);
        break;
      case 'ping':
        sendControl('pong', { t: msg.t });
        break;
      case 'pong':
        bus.emit('latency', Date.now() - msg.t);
        break;
      case 'fps-report':
        bus.emit('peer-fps', msg.fps);
        break;
      case 'screenshot-request':
        onScreenshotRequested();
        break;
      case 'clipboard-sync':
        bus.emit('clipboard:incoming', msg.text);
        socket?.emit('activity:log', { type: 'clipboard_sync', meta: { direction: 'received', length: (msg.text || '').length } });
        break;
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
        bus.emit('transfer:peer-paused', msg);
        break;
      case 'file-resumed':
        bus.emit('transfer:peer-resumed', msg);
        break;

      // We're the side being controlled — inject via IPC into main.js,
      // which does the actual nut-js call. Ported 1:1 from renderer.js's
      // applyRemoteInput.
      case 'mouse-move':
        ipc.mouseMove(msg.x, msg.y);
        break;
      case 'mouse-down':
        ipc.mouseButton(msg.button, 'down', msg.x, msg.y);
        break;
      case 'mouse-up':
        ipc.mouseButton(msg.button, 'up', msg.x, msg.y);
        break;
      case 'mouse-doubleclick':
        ipc.mouseDoubleClick(msg.button);
        break;
      case 'mouse-scroll':
        ipc.mouseScroll(msg.deltaX, msg.deltaY);
        break;
      case 'key-down':
        ipc.key(msg.code, 'down');
        break;
      case 'key-up':
        ipc.key(msg.code, 'up');
        break;
      default:
        log(`Unknown control message type: ${msg.type}`);
    }
  }

  // ---- Peer connection lifecycle ----
  // ---- File transfer — ported 1:1 from renderer.js. Metadata rides
  // CONTROL_PREFIX JSON messages; raw bytes ride binary frames tagged with
  // FILE_CHUNK_MARKER + a 4-byte transferId. Disk I/O happens in main.js via
  // the fs:* IPC handlers (see lib/ipc.js). Every transfer emits
  // 'transfer:*' events so the Files panel can render a live list instead of
  // this module touching the DOM directly. ----
  let nextTransferId = 1;
  const transfersOut = new Map(); // transferId -> { absPath, relPath, size, paused, cancelled }
  const transfersIn = new Map();  // transferId -> { relPath, size, bytesReceived, destPath }
  const incomingBatches = new Map(); // batchId -> { status, destRoot, label, total, queue, isScreenshot }

  function makeBatchId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async function sendSingleFile(absPath, relPath, size, batch) {
    if (!peer || !peer.connected) return log('Not connected — cannot send file.');
    const transferId = nextTransferId++;
    transfersOut.set(transferId, { absPath, relPath, size, paused: false, cancelled: false });
    bus.emit('transfer:new', { transferId, name: relPath, size, direction: 'out' });
    sendControl('file-offer', {
      transferId, name: relPath, size,
      batchId: batch?.id, batchLabel: batch?.label ?? relPath, batchTotal: batch?.total ?? 1,
      isScreenshot: !!batch?.isScreenshot,
    });
    socket?.emit('activity:log', { type: 'file_offer', meta: { name: relPath, size, isScreenshot: !!batch?.isScreenshot } });
    // Sending actually starts once the receiver accepts AND acks
    // (onFileOfferAck below), so its write stream is guaranteed open first.
  }

  function sendFiles(files) {
    if (!files?.length) return;
    const batch = { id: makeBatchId(), label: files.length === 1 ? files[0].relPath : `${files.length} files`, total: files.length };
    files.forEach((f) => sendSingleFile(f.absPath, f.relPath, f.size, batch));
  }

  async function onFileOfferAck({ transferId }) {
    const t = transfersOut.get(transferId);
    if (!t) return;
    bus.emit('transfer:sending', { transferId });
    try {
      await ipc.openRead(transferId, t.absPath);
      let bytesSent = 0;
      while (true) {
        if (t.cancelled) { await ipc.closeRead(transferId); return; }
        if (t.paused) { await new Promise((r) => setTimeout(r, 200)); continue; }
        const { data, eof } = await ipc.readChunk(transferId);
        if (eof) break;

        // Backpressure: don't flood the DataChannel faster than it can
        // drain, or large files will balloon memory / stall input events.
        const channel = peer._channel;
        while (channel && channel.bufferedAmount > BUFFERED_AMOUNT_HIGH_WATER) {
          await new Promise((r) => setTimeout(r, 50));
        }

        const header = Buffer.alloc(5);
        header.writeUInt8(FILE_CHUNK_MARKER, 0);
        header.writeUInt32BE(transferId, 1);
        peer.send(Buffer.concat([header, Buffer.from(data)]));

        bytesSent += data.length;
        bus.emit('transfer:progress', { transferId, bytesDone: bytesSent, size: t.size });
      }
      await ipc.closeRead(transferId);
      sendControl('file-complete', { transferId });
      bus.emit('transfer:done', { transferId, extra: 'Sent' });
      transfersOut.delete(transferId);
      socket?.emit('activity:log', { type: 'file_complete', meta: { name: t.relPath, size: t.size } });
    } catch (e) {
      log(`File send failed (${t.relPath}): ${e.message}`);
      bus.emit('transfer:error', { transferId, message: e.message });
      transfersOut.delete(transferId);
    }
  }

  function pauseTransfer(transferId, paused) {
    const t = transfersOut.get(transferId);
    if (!t) return;
    t.paused = paused;
    sendControl(paused ? 'file-paused' : 'file-resumed', { transferId });
  }

  function cancelOutgoingTransfer(transferId) {
    const t = transfersOut.get(transferId);
    if (!t) return;
    t.cancelled = true;
    sendControl('file-cancelled', { transferId });
    bus.emit('transfer:error', { transferId, message: 'Cancelled' });
    socket?.emit('activity:log', { type: 'file_cancelled', meta: { name: t.relPath } });
  }

  function cancelIncomingTransfer(transferId) {
    sendControl('file-cancel-request', { transferId });
    ipc.cancelWrite(transferId);
    transfersIn.delete(transferId);
    bus.emit('transfer:error', { transferId, message: 'Cancelled' });
  }

  async function startReceivingFile({ transferId, name, size }, destRoot) {
    try {
      const { destPath } = await ipc.openWrite(transferId, name, destRoot);
      transfersIn.set(transferId, { relPath: name, size, bytesReceived: 0, destPath });
      bus.emit('transfer:new', { transferId, name, size, direction: 'in' });
      sendControl('file-offer-ack', { transferId });
    } catch (e) {
      log(`Could not accept incoming file (${name}): ${e.message}`);
    }
  }

  // Respond to an incoming batch prompt — called by the Files panel after
  // the user picks Accept (with a save folder) or Decline.
  async function respondToIncomingBatch(batchId, accept) {
    const b = incomingBatches.get(batchId);
    if (!b) return;
    if (!accept) {
      b.status = 'declined';
      for (const offer of b.queue) sendControl('file-declined', { transferId: offer.transferId });
      b.queue = [];
      bus.emit('transfer:batch-resolved', { batchId });
      return;
    }
    const destRoot = await ipc.chooseSaveDir(b.label);
    if (!destRoot) return respondToIncomingBatch(batchId, false); // backing out of the folder picker == decline
    b.status = 'accepted';
    b.destRoot = destRoot;
    bus.emit('transfer:batch-resolved', { batchId });
    for (const offer of b.queue) startReceivingFile(offer, destRoot);
    b.queue = [];
  }

  async function onFileOffer({ transferId, name, size, batchId, batchLabel, batchTotal, isScreenshot }) {
    const id = batchId || `single-${transferId}`;
    let b = incomingBatches.get(id);
    if (!b) {
      b = { status: 'pending', destRoot: null, label: batchLabel || name, total: batchTotal || 1, queue: [], isScreenshot: !!isScreenshot };
      incomingBatches.set(id, b);

      // Screenshots skip the accept/decline prompt — the local user already
      // caused this by requesting it. Straight into a dedicated folder.
      if (b.isScreenshot) {
        b.status = 'accepted';
        b.destRoot = await ipc.getScreenshotsDir();
        startReceivingFile({ transferId, name, size }, b.destRoot);
        bus.emit('screenshot:received', { name, size });
        socket?.emit('activity:log', { type: 'screenshot_received', meta: { name, size } });
        return;
      }

      b.queue.push({ transferId, name, size });
      bus.emit('transfer:incoming-batch', { batchId: id, label: b.label, total: b.total });
      return;
    }
    if (b.isScreenshot && b.status === 'accepted') { startReceivingFile({ transferId, name, size }, b.destRoot); return; }
    if (b.status === 'pending') { b.queue.push({ transferId, name, size }); return; }
    if (b.status === 'declined') { sendControl('file-declined', { transferId }); return; }
    startReceivingFile({ transferId, name, size }, b.destRoot); // already accepted — start straight away
  }

  function onFileDeclined({ transferId }) {
    const t = transfersOut.get(transferId);
    if (!t) return;
    bus.emit('transfer:error', { transferId, message: 'Declined by recipient' });
    transfersOut.delete(transferId);
    socket?.emit('activity:log', { type: 'file_declined', meta: { name: t.relPath } });
  }

  async function handleIncomingFileChunk(transferId, payload) {
    const t = transfersIn.get(transferId);
    if (!t) return; // unknown/cancelled transfer — drop silently, same as vanilla renderer
    try {
      await ipc.writeChunk(transferId, payload);
      t.bytesReceived += payload.length;
      bus.emit('transfer:progress', { transferId, bytesDone: t.bytesReceived, size: t.size });
    } catch (e) {
      log(`Write failed for incoming file ${t.relPath}: ${e.message}`);
      bus.emit('transfer:error', { transferId, message: e.message });
      transfersIn.delete(transferId);
    }
  }

  async function onFileComplete({ transferId }) {
    const t = transfersIn.get(transferId);
    if (!t) return;
    const res = await ipc.closeWrite(transferId);
    bus.emit('transfer:done', { transferId, extra: 'Received', destPath: res?.destPath });
    transfersIn.delete(transferId);
    socket?.emit('activity:log', { type: 'file_complete', meta: { name: t.relPath, size: t.size } });
  }

  async function onFileCancelledByPeer({ transferId }) {
    const t = transfersIn.get(transferId);
    if (!t) return;
    await ipc.cancelWrite(transferId);
    transfersIn.delete(transferId);
    bus.emit('transfer:error', { transferId, message: 'Cancelled by sender' });
    socket?.emit('activity:log', { type: 'file_cancelled', meta: { name: t.relPath } });
  }

  function onFileCancelRequest({ transferId }) {
    const t = transfersOut.get(transferId);
    if (!t) return;
    t.cancelled = true;
    bus.emit('transfer:error', { transferId, message: 'Cancelled by receiver' });
  }

  function cancelAllTransfers(reason) {
    transfersOut.forEach((t, id) => { t.cancelled = true; bus.emit('transfer:error', { transferId: id, message: reason }); });
    transfersIn.forEach((t, id) => { ipc.cancelWrite(id); bus.emit('transfer:error', { transferId: id, message: reason }); });
    transfersIn.clear();
    incomingBatches.clear();
  }

  // ---- Screenshot request (sender side: someone else asked us for one) ----
  async function onScreenshotRequested() {
    try {
      const { absPath, relPath, size } = await ipc.captureScreenshotToTemp();
      const batch = { id: makeBatchId(), label: relPath, total: 1, isScreenshot: true };
      sendSingleFile(absPath, relPath, size, batch);
    } catch (e) {
      log(`Screenshot capture failed: ${e.message}`);
    }
  }

  function requestScreenshot() {
    if (!peer || !peer.connected) return log('Not connected — cannot request a screenshot.');
    sendControl('screenshot-request', {});
    socket?.emit('activity:log', { type: 'screenshot_requested', meta: {} });
    log('Requested a screenshot from the peer.');
  }

  function startPeerConnection(isInitiator) {
    peer = new SimplePeer({ initiator: isInitiator, trickle: true, config: { iceServers } });

    peer.on('signal', (signal) => {
      socket.emit('webrtc:signal', { toDeviceId: otherDeviceId, signal });
    });

    peer.on('connect', () => {
      log('DataChannel connected to peer.');
      bus.emit('session:connected');
      logConnectionType();
      startLatencyPing();
    });

    peer.on('stream', (stream) => {
      bus.emit('remote-stream', stream);
      startFpsReporting();
    });

    peer.on('data', handleIncomingData);

    peer.on('error', (err) => log(`Peer error: ${err.message}`));

    peer.on('close', () => {
      log('Peer connection closed.');
      stopScreenShare({ notifyPeer: false });
      cancelAllTransfers('Connection closed');
      stopLatencyPing();
      stopFpsReporting();
      bus.emit('session:closed');
    });
  }

  async function logConnectionType() {
    try {
      const pc = peer._pc;
      const stats = await pc.getStats();
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const local = stats.get(report.localCandidateId);
          if (local) bus.emit('connection-type', local.candidateType === 'relay' ? 'RELAY' : 'DIRECT');
        }
      });
    } catch (e) {
      log(`Could not determine connection type: ${e.message}`);
    }
  }

  function teardownPeerConnection() {
    stopScreenShare({ notifyPeer: false });
    if (peer) { peer.destroy(); peer = null; }
    stopLatencyPing();
    stopFpsReporting();
    bus.emit('remote-stream:cleared');
  }

  // ---- Screen share (sender side) ----
  async function startScreenShare(sourceId) {
    if (!peer || !peer.connected) return log('Not connected to a peer yet.');
    try {
      const sources = await ipc.getScreenSources();
      if (!sources.length) return log('No screen sources found.');
      const chosen = sources.find((s) => s.id === sourceId) || sources[0];
      const preset = QUALITY_PRESETS[selectedQualityMode === 'auto' ? 'medium' : selectedQualityMode];

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop' } },
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: chosen.id, maxWidth: preset.maxWidth, maxHeight: preset.maxHeight, maxFrameRate: preset.maxFrameRate } },
        });
      } catch (e) {
        log(`Combined video+audio capture failed (${e.message}) — retrying video only.`);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: chosen.id, maxWidth: preset.maxWidth, maxHeight: preset.maxHeight, maxFrameRate: preset.maxFrameRate } },
        });
      }

      localScreenStream = stream;
      localScreenStream.getTracks().forEach((track) => peer.addTrack(track, localScreenStream));
      bus.emit('local-stream', stream);

      sendControl('share-started');
      const sourceIndex = sources.findIndex((s) => s.id === chosen.id);
      let realSize;
      try {
        const allSizes = await ipc.getAllDisplaySizes();
        realSize = allSizes[sourceIndex] || await ipc.getPrimaryDisplaySize();
      } catch (e) {
        realSize = await ipc.getPrimaryDisplaySize();
      }
      sendControl('screen-info', realSize);
      ipc.setInputEnabled(true);
      bus.emit('sharing:source', { sourceId: chosen.id, name: chosen.name });

      localScreenStream.getVideoTracks()[0].addEventListener('ended', () => stopScreenShare());
      bus.emit('sharing:started');
    } catch (e) {
      log(`Screen share failed: ${e.message}`);
    }
  }

  function stopScreenShare({ notifyPeer = true } = {}) {
    if (localScreenStream) {
      if (notifyPeer) sendControl('share-stopped');
      localScreenStream.getTracks().forEach((track) => {
        try { if (peer) peer.removeTrack(track, localScreenStream); } catch (e) { /* peer may be gone */ }
        track.stop();
      });
      localScreenStream = null;
      bus.emit('local-stream:cleared');
    }
    ipc.setInputEnabled(false);
    bus.emit('sharing:stopped');
  }

  async function setQuality(name) {
    selectedQualityMode = name;
    if (name === 'auto') { bus.emit('quality', { mode: 'auto', preset: activePresetName }); return; }
    await applyQualityPreset(name);
  }

  async function applyQualityPreset(name) {
    const preset = QUALITY_PRESETS[name];
    if (!preset) return;
    activePresetName = name;
    bus.emit('quality', { mode: selectedQualityMode, preset: name });
    if (!localScreenStream || !peer || !peer._pc) return;
    const track = localScreenStream.getVideoTracks()[0];
    if (track) {
      try { await track.applyConstraints({ width: { max: preset.maxWidth }, height: { max: preset.maxHeight }, frameRate: { max: preset.maxFrameRate } }); }
      catch (e) { log(`Could not apply quality constraints: ${e.message}`); }
    }
    try {
      const sender = peer._pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        const params = sender.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = preset.maxBitrate;
        await sender.setParameters(params);
      }
    } catch (e) { log(`Could not set encoder bitrate: ${e.message}`); }
  }

  // ---- Latency ping (runs once DataChannel is connected) ----
  function startLatencyPing() {
    stopLatencyPing();
    latencyTimer = setInterval(() => sendControl('ping', { t: Date.now() }), 2000);
  }
  function stopLatencyPing() {
    if (latencyTimer) clearInterval(latencyTimer);
    latencyTimer = null;
  }

  // ---- FPS reporting (viewer side reports playback smoothness back to sharer) ----
  let lastMeasuredFps = null;
  let fpsReportTimer = null;
  function reportMeasuredFps(fps) {
    lastMeasuredFps = fps;
  }
  function startFpsReporting() {
    stopFpsReporting();
    fpsReportTimer = setInterval(() => { if (lastMeasuredFps != null) sendControl('fps-report', { fps: lastMeasuredFps }); }, 3000);
  }
  function stopFpsReporting() {
    if (fpsReportTimer) clearInterval(fpsReportTimer);
    fpsReportTimer = null;
  }

  // ---- Socket / signaling ----
  async function connect() {
    await refreshIceServers();
    socket = io(config.serverUrl, { auth: { token } });

    socket.on('connect', () => { log('Socket connected, authenticated.'); bus.emit('socket:connected'); loadChatHistory(); });
    socket.on('connect_error', (err) => { log(`Socket connect_error: ${err.message}`); bus.emit('socket:error', err.message); });

    socket.on('peer:online', ({ deviceId: id }) => { otherDeviceId = id; bus.emit('peer:online', id); });
    socket.on('peer:offline', ({ deviceId: id }) => { bus.emit('peer:offline', id); teardownPeerConnection(); });

    socket.on('connect:incoming', ({ fromDeviceId }) => { pendingIncomingFrom = fromDeviceId; bus.emit('connect:incoming', fromDeviceId); });
    socket.on('connect:accepted', ({ byDeviceId }) => { log(`${byDeviceId} accepted — starting WebRTC handshake.`); startPeerConnection(true); });
    socket.on('connect:rejected', ({ byDeviceId, reason }) => bus.emit('connect:rejected', { byDeviceId, reason }));
    socket.on('session:ended', () => teardownPeerConnection());
    socket.on('chat:message', ({ text, createdAt }) => bus.emit('chat:message', { text, createdAt, mine: false }));

    socket.on('webrtc:signal', ({ fromDeviceId, signal }) => {
      if (!peer) startPeerConnection(false);
      try { peer.signal(signal); } catch (e) { log(`peer.signal() threw: ${e.message}`); }
    });
  }

  function requestConnection() {
    if (!otherDeviceId) return log('Peer not online yet.');
    socket.emit('connect:request');
  }
  function acceptIncoming() {
    socket.emit('connect:accept', { toDeviceId: pendingIncomingFrom });
    otherDeviceId = pendingIncomingFrom;
    startPeerConnection(false);
  }
  function rejectIncoming(reason) {
    socket.emit('connect:reject', { toDeviceId: pendingIncomingFrom, reason: reason || 'No reason given' });
  }
  function endSession() {
    socket.emit('session:end');
    teardownPeerConnection();
  }

  function pushClipboard(text) {
    sendControl('clipboard-sync', { text });
    socket?.emit('activity:log', { type: 'clipboard_sync', meta: { direction: 'sent', length: text.length } });
  }

  async function fetchActivityLog(limit = 150) {
    try {
      const res = await fetch(`${config.serverUrl}/logs/activity?limit=${limit}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`activity fetch failed (${res.status})`);
      const { entries } = await res.json();
      return entries;
    } catch (e) {
      log(`Could not load activity log: ${e.message}`);
      return [];
    }
  }

  function disconnect() {
    teardownPeerConnection();
    socket?.disconnect();
  }

  return {
    on: bus.on,
    connect,
    disconnect,
    requestConnection,
    acceptIncoming,
    rejectIncoming,
    endSession,
    sendChatMessage,
    clearChatHistory,
    startScreenShare,
    stopScreenShare,
    setQuality,
    reportMeasuredFps,
    sendControl,
    pushClipboard,
    sendFiles,
    respondToIncomingBatch,
    pauseTransfer,
    cancelOutgoingTransfer,
    cancelIncomingTransfer,
    requestScreenshot,
    fetchActivityLog,
  };
}
