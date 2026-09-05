// Single point of contact with Electron's ipcRenderer.
//
// nodeIntegration is true / contextIsolation is false for this app (see
// main/main.js webPreferences), so `require('electron')` works directly in
// the renderer — same as the old vanilla renderer.js. No preload/contextBridge
// exists, so this file is the closest thing to one: every IPC channel name
// used anywhere in the app is listed here, once, so a typo'd channel string
// fails at a single call site instead of silently inside a component.
//
// This is a 1:1 mapping of the channels found in main/main.js — no new
// channels invented, none renamed.

const { ipcRenderer } = require('electron');

export const ipc = {
  // --- window controls ---
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  toggleFullscreen: () => ipcRenderer.send('window:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),

  // --- app ---
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // --- screen capture ---
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  getPrimaryDisplaySize: () => ipcRenderer.invoke('display:get-primary-size'),
  getAllDisplaySizes: () => ipcRenderer.invoke('display:get-all-sizes'),

  // --- remote input (mouse/keyboard control of THIS machine, driven by peer) ---
  setInputEnabled: (enabled) => ipcRenderer.send('input:set-enabled', enabled),
  getNutJsStatus: () => ipcRenderer.invoke('input:nut-js-status'),
  mouseMove: (x, y) => ipcRenderer.send('input:mouse-move', { x, y }),
  mouseButton: (button, action, x, y) => ipcRenderer.send('input:mouse-button', { button, action, x, y }),
  mouseDoubleClick: (button) => ipcRenderer.send('input:mouse-doubleclick', { button }),
  mouseScroll: (deltaX, deltaY) => ipcRenderer.send('input:mouse-scroll', { deltaX, deltaY }),
  key: (code, action) => ipcRenderer.send('input:key', { code, action }),

  // --- file system: sending ---
  pickFiles: () => ipcRenderer.invoke('fs:pick-files'),
  pickFolder: () => ipcRenderer.invoke('fs:pick-folder'),
  walkFolder: (folderAbs) => ipcRenderer.invoke('fs:walk-folder', { folderAbs }),
  openRead: (transferId, filePath) => ipcRenderer.invoke('fs:open-read', { transferId, filePath }),
  readChunk: (transferId) => ipcRenderer.invoke('fs:read-chunk', { transferId }),
  closeRead: (transferId) => ipcRenderer.invoke('fs:close-read', { transferId }),

  // --- file system: receiving ---
  chooseSaveDir: (suggestedName) => ipcRenderer.invoke('fs:choose-save-dir', { suggestedName }),
  openWrite: (transferId, relPath, destRoot) => ipcRenderer.invoke('fs:open-write', { transferId, relPath, destRoot }),
  writeChunk: (transferId, data) => ipcRenderer.invoke('fs:write-chunk', { transferId, data }),
  closeWrite: (transferId) => ipcRenderer.invoke('fs:close-write', { transferId }),
  cancelWrite: (transferId) => ipcRenderer.invoke('fs:cancel-write', { transferId }),
  revealFile: (filePath) => ipcRenderer.send('fs:reveal', { filePath }),
  getScreenshotsDir: () => ipcRenderer.invoke('fs:get-screenshots-dir'),

  // --- saved login (device id / secret persisted in userData) ---
  getSavedAuth: () => ipcRenderer.invoke('auth:get-saved'),
  saveAuth: (deviceId, secret) => ipcRenderer.invoke('auth:save', { deviceId, secret }),
  clearAuth: () => ipcRenderer.invoke('auth:clear'),

  // --- clipboard ---
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.send('clipboard:write', text),

  // --- screenshot ---
  captureScreenshotToTemp: () => ipcRenderer.invoke('screenshot:capture-to-temp'),

  // --- recording ---
  saveRecording: (buffer, suggestedName) => ipcRenderer.invoke('recording:save', { buffer, suggestedName }),

  // --- system info (newly added — didn't exist in this project before) ---
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  getGpuInfo: () => ipcRenderer.invoke('system:get-gpu-info'),
  getInstalledSoftware: () => ipcRenderer.invoke('system:get-installed-software'),

  // --- subscriptions (return an unsubscribe fn — always clean these up in useEffect) ---
  onUpdateStatus: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },
};
