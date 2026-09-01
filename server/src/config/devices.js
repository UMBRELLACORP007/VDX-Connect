// Exactly two authorized devices. No public registration, ever.
// Secrets come from env, not from this file, so they never end up in git.

require('dotenv').config();

const AUTHORIZED_DEVICES = {
  [process.env.DEVICE_A_ID]: {
    id: process.env.DEVICE_A_ID,
    secret: process.env.DEVICE_A_SECRET,
    label: 'Device A',
  },
  [process.env.DEVICE_B_ID]: {
    id: process.env.DEVICE_B_ID,
    secret: process.env.DEVICE_B_SECRET,
    label: 'Device B',
  },
};

function isAuthorizedDevice(deviceId, secret) {
  const device = AUTHORIZED_DEVICES[deviceId];
  if (!device) return false;
  return device.secret === secret;
}

function getOtherDeviceId(deviceId) {
  const ids = Object.keys(AUTHORIZED_DEVICES);
  return ids.find((id) => id !== deviceId);
}

module.exports = { AUTHORIZED_DEVICES, isAuthorizedDevice, getOtherDeviceId };
