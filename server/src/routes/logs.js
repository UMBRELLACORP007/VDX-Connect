const express = require('express');
const { verifyToken } = require('../middleware/auth');
const ActivityLog = require('../models/ActivityLog');

const router = express.Router();

// GET /logs/activity?limit=100
// Same JWT auth as /chat/history. Returns the most recent activity log
// entries across both devices, newest first (this is a read-only audit
// view, not a live feed, so newest-first is more useful than chat's
// oldest-first ordering).
router.get('/activity', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

  try {
    const entries = await ActivityLog.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ entries });
  } catch (err) {
    console.error('Activity log fetch failed:', err.message);
    return res.status(500).json({ error: 'Could not fetch activity log' });
  }
});

module.exports = router;
