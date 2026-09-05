const express = require('express');
const { verifyToken } = require('../middleware/auth');
const ChatMessage = require('../models/ChatMessage');

const router = express.Router();

// GET /chat/history?limit=200
// Requires the same JWT issued at /auth/login. Returns the most recent
// messages between the two devices, oldest first, so the client can just
// append them straight into the chat log on startup.
router.get('/history', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

  try {
    const messages = await ChatMessage.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error('Chat history fetch failed:', err.message);
    return res.status(500).json({ error: 'Could not fetch chat history' });
  }
});

// DELETE /chat/history
// Same auth as above. Wipes all stored chat messages between the two
// devices. Used by the client's "Clear" button — without this, clearing
// only the local UI would just have the old messages reappear on next
// startup once loadChatHistory() re-fetches them from Mongo.
router.delete('/history', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await ChatMessage.deleteMany({});
    return res.json({ ok: true });
  } catch (err) {
    console.error('Chat history clear failed:', err.message);
    return res.status(500).json({ error: 'Could not clear chat history' });
  }
});

module.exports = router;
