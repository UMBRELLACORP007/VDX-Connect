const jwt = require('jsonwebtoken');

function issueToken(deviceId) {
  return jwt.sign({ deviceId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = { issueToken, verifyToken };
