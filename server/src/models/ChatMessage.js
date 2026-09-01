const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  text: { type: String, required: true },
  delivered: { type: Boolean, default: false },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
