const mongoose = require('mongoose');

// General-purpose activity log — separate from SessionLog (which only covers
// the accept/reject moment of a connection request). This covers everything
// else worth an audit trail: presence changes, session start/end, and
// file-transfer lifecycle events. File-transfer bytes/metadata never touch
// the server (P2P by design), so the client self-reports these as thin
// {type, meta} events purely for the activity log — no file content included.
const activityLogSchema = new mongoose.Schema({
  deviceId: { type: String, required: true }, // which device reported this event
  type: {
    type: String,
    required: true,
    enum: [
      'device_online',
      'device_offline',
      'session_start',
      'session_end',
      'file_offer',
      'file_complete',
      'file_cancelled',
      'file_declined',
      'clipboard_sync',
      'screenshot_requested',
      'screenshot_received',
    ],
  },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

activityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
