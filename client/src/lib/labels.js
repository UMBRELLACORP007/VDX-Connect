// The peer's real device id (e.g. whatever was configured on the server,
// see server/src/config/devices.js) used to be printed straight into the
// UI in several places. With only ever two authorized devices on this
// deployment, that id carries no useful information for the person looking
// at the screen — it's replaced everywhere informational with this generic
// label instead. (The one exception is the incoming connection-request
// modal, which is a security-relevant prompt where knowing exactly which
// device is asking to connect still matters.)
export const MY_DEVICE_LABEL = 'My Device';
export const CONNECTED_DEVICE_LABEL = 'Connected Device';
