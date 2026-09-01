const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');

// Forces Chromium to only gather ICE candidates on the machine's default
// public-facing network interface. Fixes the "Address not associated with
// the desired network interface" TURN/TCP errors that happen when Windows
// has multiple network adapters active (VPN, virtual adapters, hotspot,
// etc.) confusing WebRTC's interface binding. Must be set before app.ready.
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'default_public_interface_only');
app.commandLine.appendSwitch('enforce-webrtc-ip-permission-check');

// desktopCapturer.getSources() is main-process-only since Electron 20 —
// the renderer can't call it directly even with nodeIntegration on. Expose
// it via IPC instead.
ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  return sources.map((s) => ({ id: s.id, name: s.name }));
});

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    // nodeIntegration is on here because this app only ever loads our own
    // local files, never remote/untrusted web content — the usual reason to
    // keep it off (arbitrary web pages getting Node access) doesn't apply.
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
