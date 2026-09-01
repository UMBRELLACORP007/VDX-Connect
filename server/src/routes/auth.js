const express = require('express');
const { isAuthorizedDevice } = require('../config/devices');
const { issueToken } = require('../middleware/auth');

const router = express.Router();

// POST /auth/login  { deviceId, secret }
// Both devices have their deviceId+secret hardcoded locally in their own
// client config (not typed by a user, not a public form).
router.post('/login', (req, res) => {
  const { deviceId, secret } = req.body || {};

  if (!deviceId || !secret) {
    return res.status(400).json({ error: 'deviceId and secret are required' });
  }

  if (!isAuthorizedDevice(deviceId, secret)) {
    return res.status(401).json({ error: 'Unauthorized device' });
  }

  const token = issueToken(deviceId);
  return res.json({ token, deviceId });
});

module.exports = router;
