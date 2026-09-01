const mongoose = require('mongoose');

const sessionLogSchema = new mongoose.Schema({
  requesterId: { type: String, required: true },
  receiverId: { type: String, required: true },
  status: { type: String, enum: ['accepted', 'rejected'], required: true },
  rejectReason: { type: String, default: null },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('SessionLog', sessionLogSchema);
