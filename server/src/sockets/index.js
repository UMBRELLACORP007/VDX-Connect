const { verifyToken } = require('../middleware/auth');
const { getOtherDeviceId } = require('../config/devices');
const SessionLog = require('../models/SessionLog');
const ChatMessage = require('../models/ChatMessage');

// deviceId -> socket.id, tracks who's currently online
const onlineDevices = new Map();

function registerSocketHandlers(io) {
  // Auth every socket connection via JWT before allowing anything else
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const payload = token && verifyToken(token);
    if (!payload) return next(new Error('unauthorized'));
    socket.deviceId = payload.deviceId;
    next();
  });

  io.on('connection', (socket) => {
    const { deviceId } = socket;
    onlineDevices.set(deviceId, socket.id);

    // Tell the other device we're online (if they're connected), and tell
    // ourselves if they're already online — regardless of connect order.
    const otherId = getOtherDeviceId(deviceId);
    const otherSocketId = onlineDevices.get(otherId);
    if (otherSocketId) {
      io.to(otherSocketId).emit('peer:online', { deviceId });
      socket.emit('peer:online', { deviceId: otherId });
    } else {
      socket.emit('peer:offline', { deviceId: otherId });
    }

    // --- Connection request flow ---
    socket.on('connect:request', () => {
      const targetSocketId = onlineDevices.get(otherId);
      if (!targetSocketId) {
        socket.emit('connect:error', { message: 'Peer is offline' });
        return;
      }
      io.to(targetSocketId).emit('connect:incoming', { fromDeviceId: deviceId });
    });

    socket.on('connect:accept', async ({ toDeviceId }) => {
      const targetSocketId = onlineDevices.get(toDeviceId);
      await SessionLog.create({
        requesterId: toDeviceId,
        receiverId: deviceId,
        status: 'accepted',
        startedAt: new Date(),
      });
      if (targetSocketId) {
        io.to(targetSocketId).emit('connect:accepted', { byDeviceId: deviceId });
      }
    });

    socket.on('connect:reject', async ({ toDeviceId, reason }) => {
      const targetSocketId = onlineDevices.get(toDeviceId);
      await SessionLog.create({
        requesterId: toDeviceId,
        receiverId: deviceId,
        status: 'rejected',
        rejectReason: reason || 'No reason given',
      });
      if (targetSocketId) {
        io.to(targetSocketId).emit('connect:rejected', { byDeviceId: deviceId, reason });
      }
    });

    socket.on('session:end', () => {
      const targetSocketId = onlineDevices.get(otherId);
      if (targetSocketId) io.to(targetSocketId).emit('session:ended', { byDeviceId: deviceId });
    });

    // --- WebRTC handshake relay (SDP offer/answer + ICE candidates) ---
    // The server never sees the actual screen/audio/file data, only this
    // small handshake metadata needed to set up the direct P2P link.
    socket.on('webrtc:signal', ({ toDeviceId, signal }) => {
      const targetSocketId = onlineDevices.get(toDeviceId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('webrtc:signal', { fromDeviceId: deviceId, signal });
      }
    });

    // --- Chat (persisted, relayed live) ---
    socket.on('chat:message', async ({ text }) => {
      const msg = await ChatMessage.create({ senderId: deviceId, text, delivered: false });
      const targetSocketId = onlineDevices.get(otherId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('chat:message', {
          id: msg._id,
          senderId: deviceId,
          text,
          createdAt: msg.createdAt,
        });
      }
    });

    socket.on('disconnect', () => {
      // Only remove this deviceId's presence if it still points at THIS
      // socket — otherwise a stale disconnect from an old/reconnecting
      // session could wipe out a newer, valid connection.
      if (onlineDevices.get(deviceId) === socket.id) {
        onlineDevices.delete(deviceId);
        const peerSocketId = onlineDevices.get(otherId);
        if (peerSocketId) io.to(peerSocketId).emit('peer:offline', { deviceId });
      }
    });
  });
}

module.exports = { registerSocketHandlers };
