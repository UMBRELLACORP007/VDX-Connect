const express = require('express');
const twilio = require('twilio');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// GET /turn/token
// Requires the same JWT issued at /auth/login (Authorization: Bearer <token>).
// Returns a fresh, short-lived set of TURN/STUN ICE servers from Twilio's
// Network Traversal Service. Twilio's account credentials never leave this
// server — only the resulting temporary token goes to the client.
router.get('/token', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const client = twilio(process.env.TWILIO_API_KEY_SID, process.env.TWILIO_API_KEY_SECRET, {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
    });

    const twilioToken = await client.tokens.create();
    // twilioToken.iceServers is already in the { urls, username, credential }
    // shape RTCPeerConnection/simple-peer expects.
    return res.json({ iceServers: twilioToken.iceServers });
  } catch (err) {
    console.error('Twilio TURN token fetch failed:', err.message);
    return res.status(502).json({ error: 'Could not fetch TURN credentials' });
  }
});

module.exports = router;
