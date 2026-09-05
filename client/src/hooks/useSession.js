import { useEffect, useRef, useState, useCallback } from 'react';
import { createSession } from '../lib/session';

// Real states now, up from the 3-state stub: 'idle' (no peer relation yet,
// socket connecting) -> 'offline' (peer not online) -> 'peer-online' ->
// 'connecting' (request sent/accepted, WebRTC handshaking) -> 'session-active'
// -> 'lost' (peer/session dropped unexpectedly).
export function useSession(auth) {
  const sessionRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [peerDeviceId, setPeerDeviceId] = useState(null);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [fps, setFps] = useState(null);
  const [connectionType, setConnectionType] = useState(null);
  const [remoteScreenSize, setRemoteScreenSize] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [rejectedReason, setRejectedReason] = useState(null);
  const [incomingClipboard, setIncomingClipboard] = useState(null);
  // transfers: { [transferId]: { name, size, direction, bytesDone, status: 'active'|'done'|'error', message?, destPath? } }
  const [transfers, setTransfers] = useState({});
  // incomingBatches: { [batchId]: { label, total } } — pending accept/decline prompts
  const [incomingBatches, setIncomingBatches] = useState({});
  const [screenshotNotices, setScreenshotNotices] = useState([]);

  useEffect(() => {
    if (!auth?.token || !auth?.deviceId) return;
    const session = createSession({ token: auth.token, deviceId: auth.deviceId });
    sessionRef.current = session;

    const offs = [
      session.on('log', (msg) => setLogs((l) => [...l.slice(-199), { t: Date.now(), msg }])),
      session.on('socket:connected', () => setStatus('offline')),
      session.on('socket:error', () => setStatus('idle')),
      session.on('peer:online', (id) => { setPeerDeviceId(id); setStatus('peer-online'); }),
      session.on('peer:offline', () => { setStatus('offline'); setPeerDeviceId(null); }),
      session.on('connect:incoming', (fromDeviceId) => setIncomingRequest(fromDeviceId)),
      session.on('connect:rejected', ({ reason }) => setRejectedReason(reason)),
      session.on('session:connected', () => { setStatus('session-active'); setIncomingRequest(null); }),
      session.on('session:closed', () => { setStatus(peerDeviceId ? 'peer-online' : 'offline'); setSharing(false); }),
      session.on('connection-type', setConnectionType),
      session.on('remote-screen-size', setRemoteScreenSize),
      session.on('latency', setLatencyMs),
      session.on('peer-fps', setFps),
      session.on('remote-stream', setRemoteStream),
      session.on('remote-stream:cleared', () => setRemoteStream(null)),
      session.on('local-stream', setLocalStream),
      session.on('local-stream:cleared', () => setLocalStream(null)),
      session.on('sharing:started', () => setSharing(true)),
      session.on('sharing:stopped', () => setSharing(false)),
      session.on('chat:message', (m) => setMessages((prev) => [...prev, { ...m, id: `${m.createdAt}-${prev.length}` }])),
      session.on('chat:cleared', () => setMessages([])),
      session.on('clipboard:incoming', (text) => setIncomingClipboard({ text, at: Date.now() })),

      // ---- file transfer ----
      session.on('transfer:new', ({ transferId, name, size, direction }) =>
        setTransfers((t) => ({ ...t, [transferId]: { name, size, direction, bytesDone: 0, status: 'active' } }))),
      session.on('transfer:sending', ({ transferId }) =>
        setTransfers((t) => (t[transferId] ? { ...t, [transferId]: { ...t[transferId], status: 'active' } } : t))),
      session.on('transfer:progress', ({ transferId, bytesDone, size }) =>
        setTransfers((t) => (t[transferId] ? { ...t, [transferId]: { ...t[transferId], bytesDone, size } } : t))),
      session.on('transfer:done', ({ transferId, extra, destPath }) =>
        setTransfers((t) => (t[transferId] ? { ...t, [transferId]: { ...t[transferId], status: 'done', message: extra, destPath, bytesDone: t[transferId].size } } : t))),
      session.on('transfer:error', ({ transferId, message }) =>
        setTransfers((t) => (t[transferId] ? { ...t, [transferId]: { ...t[transferId], status: 'error', message } } : t))),
      session.on('transfer:incoming-batch', ({ batchId, label, total }) =>
        setIncomingBatches((b) => ({ ...b, [batchId]: { label, total } }))),
      session.on('transfer:batch-resolved', ({ batchId }) =>
        setIncomingBatches((b) => { const next = { ...b }; delete next[batchId]; return next; })),
      session.on('screenshot:received', ({ name, size }) =>
        setScreenshotNotices((n) => [...n.slice(-19), { name, size, at: Date.now() }])),
    ];

    session.connect();

    return () => {
      offs.forEach((off) => off());
      session.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, auth?.deviceId]);

  const requestConnection = useCallback(() => { setStatus('connecting'); sessionRef.current?.requestConnection(); }, []);
  const acceptIncoming = useCallback(() => { setStatus('connecting'); sessionRef.current?.acceptIncoming(); setIncomingRequest(null); }, []);
  const rejectIncoming = useCallback((reason) => { sessionRef.current?.rejectIncoming(reason); setIncomingRequest(null); }, []);
  const endSession = useCallback(() => sessionRef.current?.endSession(), []);
  const sendChatMessage = useCallback((text) => sessionRef.current?.sendChatMessage(text), []);
  const clearChatHistory = useCallback(() => sessionRef.current?.clearChatHistory(), []);
  const startScreenShare = useCallback(() => sessionRef.current?.startScreenShare(), []);
  const stopScreenShare = useCallback(() => sessionRef.current?.stopScreenShare(), []);
  const setQuality = useCallback((name) => sessionRef.current?.setQuality(name), []);
  const sendControl = useCallback((type, payload) => sessionRef.current?.sendControl(type, payload), []);
  const reportMeasuredFps = useCallback((n) => sessionRef.current?.reportMeasuredFps(n), []);
  const pushClipboard = useCallback((text) => sessionRef.current?.pushClipboard(text), []);
  const sendFiles = useCallback((files) => sessionRef.current?.sendFiles(files), []);
  const respondToIncomingBatch = useCallback((batchId, accept) => sessionRef.current?.respondToIncomingBatch(batchId, accept), []);
  const pauseTransfer = useCallback((id, paused) => sessionRef.current?.pauseTransfer(id, paused), []);
  const cancelOutgoingTransfer = useCallback((id) => sessionRef.current?.cancelOutgoingTransfer(id), []);
  const cancelIncomingTransfer = useCallback((id) => sessionRef.current?.cancelIncomingTransfer(id), []);
  const requestScreenshot = useCallback(() => sessionRef.current?.requestScreenshot(), []);
  const fetchActivityLog = useCallback((limit) => sessionRef.current?.fetchActivityLog(limit) ?? Promise.resolve([]), []);

  return {
    status, peerDeviceId, incomingRequest, rejectedReason,
    latencyMs, fps, connectionType, remoteScreenSize,
    remoteStream, localStream, sharing,
    messages, logs, incomingClipboard,
    transfers, incomingBatches, screenshotNotices,
    requestConnection, acceptIncoming, rejectIncoming, endSession,
    sendChatMessage, clearChatHistory,
    startScreenShare, stopScreenShare, setQuality, sendControl, reportMeasuredFps,
    pushClipboard,
    sendFiles, respondToIncomingBatch, pauseTransfer, cancelOutgoingTransfer, cancelIncomingTransfer,
    requestScreenshot, fetchActivityLog,
  };
}
