const { app, BrowserWindow, ipcMain, desktopCapturer, dialog, shell, screen, Menu, clipboard, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { execSync, spawn } = require('child_process');

// ---------------------------------------------------------------------------
// Always run elevated on Windows. This is what actually lets nut-js's
// SendInput reach elevated windows (Task Manager, anything opened "Run as
// administrator") — Windows UIPI silently drops synthetic input from a
// non-elevated process aimed at a higher-integrity one, no error, it just
// does nothing. `net session` only succeeds if the current process is
// elevated, so it doubles as a free admin check.
//
// Note: this covers running via `npm start` / `electron .` (dev). Once this
// is packaged with electron-builder, also set
// "win": { "requestedExecutionLevel": "requireAdministrator" }
// in the build config — that bakes elevation into the .exe's manifest so
// Windows shows the UAC shield/prompt at launch instead of relaunching.
// Keep both: the manifest covers the packaged .exe, this covers dev runs.
//
// Set VDX_SKIP_ELEVATE=1 in the environment to skip this during local dev
// (avoids a UAC prompt on every single `npm start` while iterating).
// ---------------------------------------------------------------------------
function isElevatedOnWindows() {
  try {
    execSync('net session', { stdio: 'ignore', timeout: 3000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function relaunchElevated(onFailure) {
  const exe = process.execPath;
  // Bug found: passing '.' (from process.argv) as the launch argument relies
  // on Start-Process using the SAME working directory this process has — but
  // it doesn't. Elevated relaunches via -Verb RunAs commonly default their
  // working directory to C:\Windows\System32, so '.' resolved to an empty
  // folder with no app in it, PowerShell still reported success (it DID
  // successfully hand off the elevation request), and the relaunched
  // Electron had nothing to load and exited instantly with no visible
  // window and no error. Use the app's absolute path instead, and pin
  // -WorkingDirectory explicitly so there's no ambiguity either way.
  const appPath = app.getAppPath();

  // CONFIRMED BUG (this is the one that was biting you): PowerShell's exit
  // code from `Start-Process -Verb RunAs` only tells you Windows accepted
  // the elevation *request* — not that the elevated process is actually
  // still alive. If the elevated copy dies for any reason after launch
  // (AV, policy, whatever), PowerShell still reports exit code 0. The old
  // code trusted that blindly and called app.quit() immediately, which is
  // exactly how you can end up with zero windows and no visible error.
  //
  // Fix: have the elevated instance write a marker file the moment its
  // window is actually up, and have THIS process poll for that marker
  // before quitting. If the marker never appears, we know elevation
  // silently failed and we fall back to an unelevated window instead of
  // vanishing.
  const markerPath = path.join(app.getPath('temp'), `vdx-elevate-${process.pid}-${Date.now()}.marker`);
  try { fs.unlinkSync(markerPath); } catch {}

  const esc = (s) => s.replace(/'/g, "''");
  // Start-Process -ArgumentList does NOT auto-quote array elements that
  // contain spaces — it just concatenates them into the child's command
  // line as-is. A path like "E:\VDX Connect\VDX\client" then gets split by
  // Windows on the space, so the child only ever sees "E:\VDX" as arg 1.
  // Fix: wrap each argument in its own embedded double-quotes so the
  // resulting command line is `"E:\VDX Connect\VDX\client" "C:\...\x.marker"`.
  const psCommand = `Start-Process -FilePath '${esc(exe)}' -ArgumentList '"${esc(appPath)}"','"${esc(markerPath)}"' -WorkingDirectory '${esc(appPath)}' -Verb RunAs`;
  console.log('[elevate] not elevated, attempting relaunch via PowerShell...');
  console.log(`[elevate] exe=${exe}`);
  console.log(`[elevate] appPath=${appPath}`);
  console.log(`[elevate] markerPath=${markerPath}`);

  let child;
  try {
    // `detached: true` was wrong here: it puts the PowerShell child into its
    // own process group / detaches it from this process's window station,
    // which is exactly what a UAC elevation request (-Verb RunAs) needs
    // access to in order to show the secure-desktop prompt at all. That's
    // why this silently did nothing when spawned from inside Electron, even
    // though the exact same command worked fine when typed into a console
    // by hand (a console already has that window station wired up).
    // We don't actually need detached — we're already synchronizing via the
    // exit event + marker file, not by detaching and forgetting about it.
    child = spawn('powershell.exe', ['-NoProfile', '-Command', psCommand], { stdio: 'ignore' });
  } catch (err) {
    console.log(`[elevate] spawn threw synchronously: ${err.message}`);
    return onFailure(err);
  }
  child.on('error', (err) => {
    console.log(`[elevate] powershell process error: ${err.message}`);
    onFailure(err);
  });
  child.on('exit', (code) => {
    console.log(`[elevate] powershell exited with code ${code}`);
    if (code !== 0) {
      return onFailure(new Error(`PowerShell relaunch exited with code ${code}`));
    }
    // PowerShell handed off the request successfully — now actually verify
    // the elevated window came up before we quit this one. Poll for up to
    // 8 seconds (UAC prompt + elevated Electron cold start can take a
    // couple seconds; the user also needs time to click "Yes").
    console.log('[elevate] PowerShell exited 0 — waiting for elevated instance to confirm it started...');
    const deadline = Date.now() + 8000;
    const poll = setInterval(() => {
      if (fs.existsSync(markerPath)) {
        clearInterval(poll);
        try { fs.unlinkSync(markerPath); } catch {}
        console.log('[elevate] confirmed: elevated instance is up, exiting this (unelevated) instance');
        app.quit();
      } else if (Date.now() > deadline) {
        clearInterval(poll);
        onFailure(new Error('Elevated instance never confirmed startup within 8s (UAC declined, blocked by policy/AV, or it crashed on launch) — staying unelevated.'));
      }
    }, 200);
  });
}

// If THIS process is the elevated relaunch (i.e. it was started with a
// marker-path argument), write the marker as soon as the window is up so
// the original unelevated instance knows it's safe to quit.
function writeElevationMarkerIfRequested() {
  const markerArg = process.argv.find((a) => a.endsWith('.marker'));
  if (!markerArg) return;
  try {
    fs.writeFileSync(markerArg, 'ok');
    console.log(`[elevate] wrote marker file: ${markerArg}`);
  } catch (err) {
    console.log(`[elevate] failed to write marker file: ${err.message}`);
  }
}

// Electron ships a default app menu (File/Edit/View/Window/Help) with its
// own keyboard accelerators — Ctrl+R reload, Ctrl+W close, Ctrl+Shift+I
// DevTools, Ctrl+Plus/Minus zoom, Alt to focus the menu. With frame:false
// there's no visible menu bar, but those accelerators stayed live and
// intercepted matching keystrokes before they ever reached the renderer's
// keydown listener — no amount of preventDefault() there could stop them.
// That's the likely cause of shortcuts meant for the *remote* machine
// instead silently reloading/closing/zooming the local app.
Menu.setApplicationMenu(null);

// Forces Chromium to only gather ICE candidates on the machine's default
// public-facing network interface. Fixes the "Address not associated with
// the desired network interface" TURN/TCP errors that happen when Windows
// has multiple network adapters active (VPN, virtual adapters, hotspot,
// etc.) confusing WebRTC's interface binding. Must be set before app.ready.
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'default_public_interface_only');
app.commandLine.appendSwitch('enforce-webrtc-ip-permission-check');

// ---------------------------------------------------------------------------
// desktopCapturer.getSources() is main-process-only since Electron 20 — the
// renderer can't call it directly even with nodeIntegration on. Expose via IPC.
// ---------------------------------------------------------------------------
ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  return sources.map((s) => ({ id: s.id, name: s.name }));
});

// Real (unscaled) sizes for every display, in the same order
// desktopCapturer.getSources({types:['screen']}) returns them above.
// Electron doesn't officially document that the two orderings match, but in
// practice both come from the OS's display enumeration order — this is a
// reasonable, commonly-relied-on assumption, not a guaranteed contract.
// Used so a shared non-primary monitor maps remote clicks against ITS real
// resolution instead of always the primary display's.
ipcMain.handle('display:get-all-sizes', () => {
  return screen.getAllDisplays().map((d) => ({
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor),
  }));
});

// Real (unscaled) primary display resolution — used by the *sharing* side to
// tell the controller its true screen size, since the captured video track
// may be downscaled (maxWidth/maxHeight 1920x1080 in the getUserMedia call).
// Mapping controller clicks against the real resolution instead of the
// capture resolution keeps the cursor accurate on higher-res displays.
ipcMain.handle('display:get-primary-size', () => {
  const { size, scaleFactor } = screen.getPrimaryDisplay();
  return { width: Math.round(size.width * scaleFactor), height: Math.round(size.height * scaleFactor) };
});

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    frame: false, // custom titlebar drawn in renderer (Bugs.txt: "remove title bar")
    show: false, // avoid a flash at the default 1100x720 size before we maximize
    // Packaged Windows builds get their taskbar/window icon baked into the
    // .exe by electron-builder (build.win.icon in package.json) — this only
    // matters for `npm start`/dev runs and for Linux, where the window icon
    // isn't otherwise set.
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      // Electron defaults sandbox:true since v20, which disables Node
      // integration in the renderer regardless of the nodeIntegration
      // setting above (sandboxed renderers get no Node APIs without a
      // preload/contextBridge). This app has no preload script and relies
      // on require('electron') directly in the renderer (lib/ipc.js,
      // lib/session.js) — without this line, that require() throws on
      // load and the renderer never gets past module init, showing a
      // blank white screen with the actual error only visible in DevTools.
      sandbox: false,
      // Without this, Chromium throttles rAF/timers on hidden/minimized
      // windows, which is exactly why the local self-preview froze on
      // minimize (Bugs.txt). The screen-capture stream itself keeps
      // producing frames either way, but the <video> element's own paint
      // loop was being paused along with everything else in the page.
      backgroundThrottling: false,
    },
  });

  // Menu.setApplicationMenu(null) above removes the whole menu bar, which
  // also removes Ctrl+Shift+I — that shortcut is normally wired to the
  // "Toggle Developer Tools" menu item, not a global accelerator. globalShortcut
  // gives DevTools access back without needing the menu at all.
  globalShortcut.register('F12', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });

  // React (Vite) build is now the real UI — run `npm run build` in client/
  // before packaging or launching. The old vanilla renderer/index.html is
  // kept on disk as the functional reference until every panel below is
  // confirmed at parity, but Electron no longer loads it.
  mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));

  // "Always open full-screen" (Bugs.txt) meant "fill the screen", not OS
  // exclusive fullscreen — that hid the taskbar like a game/kiosk mode.
  // Maximizing fills the screen the same way Chrome/VS Code do, with the
  // taskbar left visible.
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:state', { fullscreen: false }));
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('window:state', { fullscreen: true }));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('window:state', { fullscreen: false }));
}

// ---- Custom titlebar controls (needed once frame:false removes the OS one) ----
ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window:close', () => mainWindow && mainWindow.close());
ipcMain.on('window:toggle-fullscreen', () => {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});
ipcMain.handle('window:is-fullscreen', () => (mainWindow ? mainWindow.isFullScreen() : false));

app.whenReady().then(() => {
  console.log('[elevate] app ready, checking elevation status...');
  const alreadyElevated = process.platform === 'win32' ? isElevatedOnWindows() : true;
  const skip = process.env.VDX_SKIP_ELEVATE === '1';
  console.log(`[elevate] platform=${process.platform} alreadyElevated=${alreadyElevated} VDX_SKIP_ELEVATE=${skip}`);

  if (process.platform === 'win32' && !alreadyElevated && !skip) {
    relaunchElevated((err) => {
      console.log(`[elevate] relaunch failed (${err.message}) — opening unelevated window instead.`);
      dialog.showErrorBox(
        'Could not start elevated',
        `VDX Connect could not confirm it started with Administrator rights, so it's opening without them.\n\nRemote control won't be able to reach Task Manager or other elevated windows.\n\nDetails: ${err.message}`
      );
      createWindow();
    });
    // We don't open a window here yet — relaunchElevated's callback (above)
    // opens one ONLY if elevation is confirmed to have failed. If it
    // succeeds, this process quits itself and never needs a window at all.
    return;
  }

  // We're either already elevated, on a non-Windows platform, or this IS
  // the elevated relaunch (has a marker arg) — open normally and, if we
  // were launched as the elevated copy, tell the original instance we're up.
  writeElevationMarkerIfRequested();
  createWindow();
});

// Manual "Restart as Administrator" trigger removed per request — the app
// already auto-elevates on every launch (see whenReady above); there's no
// scenario left where the user needs a button to ask for it again.

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ===========================================================================
// Auto-update via electron-updater, checking GitHub Releases on
// UMBRELLACORP007/VDX-Releases (private repo).
//
// Private-repo auth: electron-updater reads the GH_TOKEN environment
// variable to authenticate against the GitHub API. That means whatever
// runs this app needs GH_TOKEN set in its environment — there is no way
// around the app needing *some* credential to read a private repo's
// releases. Use a fine-grained PAT scoped ONLY to this one repo with
// read-only "Contents" access — never a broad classic token — since this
// app will ship to end machines where it could in principle be extracted.
//
// Flow: check on startup -> silently download if available -> once fully
// downloaded, quit and install automatically, relaunching at the new
// version. No user prompt, per request ("checks for update then updates
// and restarts itself to latest build").
// ---------------------------------------------------------------------------
const { autoUpdater } = require('electron-updater');

// electron-updater reads the GH_TOKEN env var to authenticate against the
// private VDX-Releases repo. We don't have per-machine env vars set up, so
// pull it from device-config.js instead (already gitignored, already the
// place this project puts per-machine secrets) and set it into this
// process's own environment before autoUpdater ever makes a request.
try {
  const deviceConfig = require('../config/device-config.js');
  if (deviceConfig.githubUpdateToken && !deviceConfig.githubUpdateToken.startsWith('PASTE_') && !deviceConfig.githubUpdateToken.startsWith('----')) {
    process.env.GH_TOKEN = deviceConfig.githubUpdateToken;
  } else {
    console.log('[update] githubUpdateToken not set in device-config.js — update checks will fail against the private repo');
  }
} catch (err) {
  console.log(`[update] could not load device-config.js for GH_TOKEN: ${err.message}`);
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false; // we call quitAndInstall() explicitly instead

function sendUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', payload);
  }
}

autoUpdater.on('checking-for-update', () => {
  console.log('[update] checking for update...');
  sendUpdateStatus({ state: 'checking' });
});
autoUpdater.on('update-available', (info) => {
  console.log(`[update] update available: ${info.version} — downloading...`);
  sendUpdateStatus({ state: 'available', version: info.version });
});
autoUpdater.on('update-not-available', (info) => {
  console.log('[update] already on latest version');
  sendUpdateStatus({ state: 'up-to-date', version: info.version });
});
autoUpdater.on('error', (err) => {
  const msg = err == null ? 'unknown' : (err.message || String(err));
  console.log(`[update] error: ${err == null ? 'unknown' : (err.stack || err.message)}`);
  sendUpdateStatus({ state: 'error', message: msg });
});
autoUpdater.on('download-progress', (p) => {
  console.log(`[update] downloading: ${Math.round(p.percent)}%`);
  sendUpdateStatus({
    state: 'downloading',
    percent: Math.round(p.percent),
    bytesPerSecond: p.bytesPerSecond,
    total: p.total,
    transferred: p.transferred,
  });
});
autoUpdater.on('update-downloaded', (info) => {
  console.log(`[update] update ${info.version} downloaded — installing and restarting now`);
  sendUpdateStatus({ state: 'downloaded', version: info.version });
  // isSilent installs without showing the NSIS UI; isForceRunAfter relaunches
  // the app once the new version is installed.
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 2000); // small delay so UI can show the downloaded state
});

// Renderer can query the running version at any time.
ipcMain.handle('app:version', () => app.getVersion());

function checkForUpdates() {
  // Skip in dev — there's no packaged app / update feed to check against,
  // and electron-updater will just throw noisy errors trying.
  if (!app.isPackaged) {
    console.log('[update] skipping update check — not a packaged build');
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => {
    console.log(`[update] checkForUpdates failed: ${err.message}`);
  });
}

app.whenReady().then(() => {
  // Give the window a moment to actually appear before we start pulling a
  // potentially large update in the background.
  setTimeout(checkForUpdates, 3000);
});

// ===========================================================================
// Remote input injection (mouse + keyboard) — this machine acts on input
// events that arrived over the DataChannel from the *other* device. Runs in
// main (not renderer) since nut-js's native addon needs a stable Node
// context; also keeps injection code in one place we can audit/guard.
//
// Setup note: nut-js ships a native addon (@nut-tree-fork/libnut) built
// against a specific Node ABI. After `npm install`, run
// `npx electron-rebuild` (or `npm rebuild` targeting Electron's Node
// version) or mouse/keyboard calls will throw a module version mismatch.
// ===========================================================================
let nutJsLoadError = null;
let mouse, keyboard, Button, Key;
// TEMPORARILY force the stub path — do not attempt to load the native
// module at all. A try/catch around require() didn't fix the silent
// exit, which means this probably isn't a normal catchable JS error: a
// native addon built for the wrong ABI can crash the process at the OS
// level (access violation / bad DLL load), and no JS try/catch can catch
// that. Skipping the require entirely removes that crash path so the app
// can actually open. Remote input control is OFF until nut-js's native
// build is fixed separately (see the rebuild note above) — that's a real,
// separate fix, not something solved by editing this file again.
const FORCE_NUTJS_STUB = false;
if (FORCE_NUTJS_STUB) {
  nutJsLoadError = new Error('nut-js native module load skipped (FORCE_NUTJS_STUB) — fix the rebuild, then flip this back off');
  console.error('[nut-js]', nutJsLoadError.message);
} else {
  try {
    ({ mouse, keyboard, Button, Key } = require('@nut-tree-fork/nut-js'));
  } catch (err) {
    nutJsLoadError = err;
    console.error('[nut-js] failed to load native module, remote input control will be disabled:', err.message);
  }
}
if (nutJsLoadError) {
  const noop = async () => {};
  mouse = { config: {}, setPosition: noop, pressButton: noop, releaseButton: noop, doubleClick: noop, scrollUp: noop, scrollDown: noop, scrollLeft: noop, scrollRight: noop };
  keyboard = { config: {}, pressKey: noop, releaseKey: noop };
  Button = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
  Key = new Proxy({}, { get: () => undefined }); // any Key.X access is harmless undefined
}

mouse.config.mouseSpeed = 3000; // near-instant moves; we're mirroring a live cursor, not animating one
keyboard.config.autoDelayMs = 0;

const BUTTON_MAP = { 0: Button.LEFT, 1: Button.MIDDLE, 2: Button.RIGHT };

// Maps a browser KeyboardEvent.code to a nut-js Key. Covers the common
// MVP set (letters, digits, function keys, navigation, modifiers, basic
// punctuation). Anything not in this table is safely ignored rather than
// throwing, so an odd/media key on the controller's keyboard doesn't kill
// the whole input channel.
const CODE_TO_KEY = {
  Escape: Key.Escape, Tab: Key.Tab, CapsLock: Key.CapsLock, Space: Key.Space,
  Backspace: Key.Backspace, Enter: Key.Enter, NumpadEnter: Key.Enter, Delete: Key.Delete,
  Insert: Key.Insert, Home: Key.Home, End: Key.End, PageUp: Key.PageUp, PageDown: Key.PageDown,
  ArrowUp: Key.Up, ArrowDown: Key.Down, ArrowLeft: Key.Left, ArrowRight: Key.Right,
  ShiftLeft: Key.LeftShift, ShiftRight: Key.RightShift,
  ControlLeft: Key.LeftControl, ControlRight: Key.RightControl,
  AltLeft: Key.LeftAlt, AltRight: Key.RightAlt,
  MetaLeft: Key.LeftSuper, MetaRight: Key.RightSuper,
  ContextMenu: Key.Menu, PrintScreen: Key.Print, ScrollLock: Key.ScrollLock, Pause: Key.Pause,
  Backquote: Key.Grave, Minus: Key.Minus, Equal: Key.Equal,
  BracketLeft: Key.LeftBracket, BracketRight: Key.RightBracket, Backslash: Key.Backslash,
  Semicolon: Key.Semicolon, Quote: Key.Quote, Comma: Key.Comma, Period: Key.Period, Slash: Key.Slash,
  Digit0: Key.Num0, Digit1: Key.Num1, Digit2: Key.Num2, Digit3: Key.Num3, Digit4: Key.Num4,
  Digit5: Key.Num5, Digit6: Key.Num6, Digit7: Key.Num7, Digit8: Key.Num8, Digit9: Key.Num9,
  Numpad0: Key.NumPad0, Numpad1: Key.NumPad1, Numpad2: Key.NumPad2, Numpad3: Key.NumPad3,
  Numpad4: Key.NumPad4, Numpad5: Key.NumPad5, Numpad6: Key.NumPad6, Numpad7: Key.NumPad7,
  Numpad8: Key.NumPad8, Numpad9: Key.NumPad9, NumpadAdd: Key.Add, NumpadSubtract: Key.Subtract,
  NumpadMultiply: Key.Multiply, NumpadDivide: Key.Divide, NumpadDecimal: Key.Decimal,
  NumLock: Key.NumLock,
};
for (let i = 1; i <= 24; i++) CODE_TO_KEY[`F${i}`] = Key[`F${i}`];
for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') CODE_TO_KEY[`Key${c}`] = Key[c];

let injectionEnabled = false; // flips true only while an active, granted control session exists
ipcMain.on('input:set-enabled', (e, enabled) => {
  injectionEnabled = !!enabled;
});
ipcMain.handle('input:nut-js-status', () => ({
  available: !nutJsLoadError,
  error: nutJsLoadError ? nutJsLoadError.message : null,
}));

ipcMain.on('input:mouse-move', (e, { x, y }) => {
  if (!injectionEnabled) return;
  mouse.setPosition({ x: Math.round(x), y: Math.round(y) }).catch(() => {});
});

ipcMain.on('input:mouse-button', (e, { button, action, x, y }) => {
  if (!injectionEnabled) return;
  const btn = BUTTON_MAP[button];
  if (btn === undefined) return;
  const move = (typeof x === 'number' && typeof y === 'number')
    ? mouse.setPosition({ x: Math.round(x), y: Math.round(y) })
    : Promise.resolve();
  move
    .then(() => (action === 'down' ? mouse.pressButton(btn) : mouse.releaseButton(btn)))
    .catch(() => {});
});

ipcMain.on('input:mouse-doubleclick', (e, { button }) => {
  if (!injectionEnabled) return;
  const btn = BUTTON_MAP[button] ?? Button.LEFT;
  mouse.doubleClick(btn).catch(() => {});
});

ipcMain.on('input:mouse-scroll', (e, { deltaX, deltaY }) => {
  if (!injectionEnabled) return;
  const steps = (n) => Math.max(1, Math.min(20, Math.round(Math.abs(n) / 40)));
  if (deltaY) (deltaY > 0 ? mouse.scrollDown(steps(deltaY)) : mouse.scrollUp(steps(deltaY))).catch(() => {});
  if (deltaX) (deltaX > 0 ? mouse.scrollRight(steps(deltaX)) : mouse.scrollLeft(steps(deltaX))).catch(() => {});
});

ipcMain.on('input:key', (e, { code, action }) => {
  if (!injectionEnabled) return;
  const key = CODE_TO_KEY[code];
  if (key === undefined) return;
  (action === 'down' ? keyboard.pressKey(key) : keyboard.releaseKey(key)).catch(() => {});
});

// ===========================================================================
// File transfer — chunked read (send side) / write (receive side) over IPC,
// keyed by a per-transfer id the renderer generates. Actual bytes travel
// renderer -> renderer via the WebRTC DataChannel; this is just the local
// disk I/O on each end.
// ===========================================================================
const CHUNK_SIZE = 64 * 1024;
const openReads = new Map(); // transferId -> fd
const openWrites = new Map(); // transferId -> { stream, destPath }

ipcMain.handle('fs:pick-files', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] });
  if (res.canceled) return [];
  return Promise.all(res.filePaths.map(async (p) => {
    const st = await fsp.stat(p);
    return { absPath: p, relPath: path.basename(p), size: st.size };
  }));
});

async function walkDir(rootAbs, rootLabel, out) {
  const entries = await fsp.readdir(rootAbs, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(rootAbs, entry.name);
    const rel = path.join(rootLabel, entry.name);
    if (entry.isDirectory()) {
      await walkDir(abs, rel, out);
    } else if (entry.isFile()) {
      const st = await fsp.stat(abs);
      out.push({ absPath: abs, relPath: rel, size: st.size });
    }
  }
}

async function walkFolder(folderAbs) {
  const folderName = path.basename(folderAbs);
  const files = [];
  await walkDir(folderAbs, folderName, files);
  return { folderName, files };
}

ipcMain.handle('fs:pick-folder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths.length) return null;
  return walkFolder(res.filePaths[0]);
});

// Used when a folder is dropped directly onto the drop zone (drag-drop gives
// us the absolute path already, so no dialog needed).
ipcMain.handle('fs:walk-folder', async (e, { folderAbs }) => walkFolder(folderAbs));

// --- read side (sender) ---
ipcMain.handle('fs:open-read', async (e, { transferId, filePath }) => {
  const fd = await fsp.open(filePath, 'r');
  openReads.set(transferId, fd);
  return true;
});

ipcMain.handle('fs:read-chunk', async (e, { transferId }) => {
  const fd = openReads.get(transferId);
  if (!fd) throw new Error('No open read handle for transfer');
  const buf = Buffer.alloc(CHUNK_SIZE);
  const { bytesRead } = await fd.read(buf, 0, CHUNK_SIZE, null);
  return { data: buf.subarray(0, bytesRead), eof: bytesRead === 0 };
});

ipcMain.handle('fs:close-read', async (e, { transferId }) => {
  const fd = openReads.get(transferId);
  if (fd) {
    await fd.close().catch(() => {});
    openReads.delete(transferId);
  }
  return true;
});

// --- write side (receiver) ---
function defaultDestRoot() {
  return path.join(app.getPath('downloads'), 'VDX Connect Received');
}

// Screenshots (both the copy saved on the machine being captured, and the
// copy the requester receives) always go to Pictures/VDX on both systems,
// regardless of where regular file transfers land.
function screenshotsDir() {
  return path.join(app.getPath('pictures'), 'VDX');
}

ipcMain.handle('fs:get-screenshots-dir', () => screenshotsDir());

// ===========================================================================
// Saved login (deviceId + secret) — first-run login screen types these in
// once, we persist them in userData (NOT the install folder, so they
// survive app updates and reinstalls), and every launch after that
// auto-logs-in silently using the saved values. "Logout" just deletes this
// file so the login screen shows again next launch.
// ===========================================================================
const AUTH_FILE = path.join(app.getPath('userData'), 'saved-login.json');

ipcMain.handle('auth:get-saved', async () => {
  try {
    const raw = await fsp.readFile(AUTH_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null; // no saved login yet, or file corrupt — treat as logged out
  }
});

ipcMain.handle('auth:save', async (e, { deviceId, secret }) => {
  await fsp.mkdir(path.dirname(AUTH_FILE), { recursive: true });
  await fsp.writeFile(AUTH_FILE, JSON.stringify({ deviceId, secret }), 'utf8');
  return true;
});

ipcMain.handle('auth:clear', async () => {
  try {
    await fsp.unlink(AUTH_FILE);
  } catch {}
  return true;
});

ipcMain.handle('fs:choose-save-dir', async (e, { suggestedName } = {}) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: suggestedName ? `Choose where to save "${suggestedName}"` : 'Choose where to save',
    defaultPath: defaultDestRoot(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle('fs:open-write', async (e, { transferId, relPath, destRoot }) => {
  // relPath may include folder separators (e.g. "MyFolder/sub/file.txt") for
  // whole-folder transfers — recreate that structure under the dest root.
  const safeRel = relPath.replace(/\.\.(\/|\\)/g, ''); // basic traversal guard
  const destPath = path.join(destRoot || defaultDestRoot(), safeRel);
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const stream = fs.createWriteStream(destPath);
  openWrites.set(transferId, { stream, destPath });
  return { destPath };
});

ipcMain.handle('fs:write-chunk', async (e, { transferId, data }) => {
  const entry = openWrites.get(transferId);
  if (!entry) throw new Error('No open write handle for transfer');
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const ok = entry.stream.write(buf);
  if (!ok) {
    await new Promise((resolve) => entry.stream.once('drain', resolve));
  }
  return true;
});

ipcMain.handle('fs:close-write', async (e, { transferId }) => {
  const entry = openWrites.get(transferId);
  if (!entry) return null;
  await new Promise((resolve) => entry.stream.end(resolve));
  openWrites.delete(transferId);
  return { destPath: entry.destPath };
});

ipcMain.handle('fs:cancel-write', async (e, { transferId }) => {
  const entry = openWrites.get(transferId);
  if (!entry) return true;
  entry.stream.destroy();
  openWrites.delete(transferId);
  await fsp.unlink(entry.destPath).catch(() => {});
  return true;
});

ipcMain.on('fs:reveal', (e, { filePath }) => {
  shell.showItemInFolder(filePath);
});

// ===========================================================================
// Clipboard sync — text only (Phase 2 scope). Reading/writing the OS
// clipboard is main-process API in Electron; the renderer just relays the
// text over the DataChannel and calls these two handlers on either end.
// ===========================================================================
ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.on('clipboard:write', (e, text) => {
  if (typeof text === 'string') clipboard.writeText(text);
});

// ===========================================================================
// Remote screenshot — captures the primary display at full (unscaled)
// resolution and writes it to a temp PNG file, then hands back the path so
// the renderer can send it through the exact same chunked file-transfer
// pipeline already used for normal file sends (see fs:open-read etc above).
// No multi-monitor picker here — single/primary display only, matching the
// rest of this build's single-monitor scope.
// ===========================================================================
ipcMain.handle('screenshot:capture-to-temp', async () => {
  const { size, scaleFactor } = screen.getPrimaryDisplay();
  const width = Math.round(size.width * scaleFactor);
  const height = Math.round(size.height * scaleFactor);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });
  if (!sources.length) throw new Error('No screen source available for screenshot');

  const png = sources[0].thumbnail.toPNG();
  const fileName = `vdx-screenshot-${Date.now()}.png`;

  // Transfer pipeline reads from this temp path (fs:open-read expects a
  // plain file path it can stream in chunks over the DataChannel).
  const tempPath = path.join(app.getPath('temp'), fileName);
  await fsp.writeFile(tempPath, png);

  // Also persist a permanent copy on THIS machine — the one being
  // captured — so both sides end up with the screenshot, not just the
  // requester. Best-effort: a failure here shouldn't block sending the
  // screenshot to the peer.
  try {
    await fsp.mkdir(screenshotsDir(), { recursive: true });
    await fsp.writeFile(path.join(screenshotsDir(), fileName), png);
  } catch (err) {
    console.log(`[screenshot] failed to save local copy to Pictures/VDX: ${err.message}`);
  }

  return { absPath: tempPath, relPath: fileName, size: png.length };
});

// ===========================================================================
// System information — did not exist anywhere in this project before (not
// in this file, not in the old vanilla renderer). Built from scratch here
// using only Node's built-in os module and Electron's own GPU info API, so
// no new native dependency is introduced. CPU load is computed as a delta
// between two os.cpus() samples 200ms apart (a single snapshot of
// cpus()[i].times is cumulative since boot and useless as an instant
// "percent busy" figure on its own).
// ---------------------------------------------------------------------------
const os = require('os');

function sampleCpuTimes() {
  return os.cpus().map((c) => ({ ...c.times, total: c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq }));
}

function cpuLoadPercentBetween(a, b) {
  let idleDelta = 0;
  let totalDelta = 0;
  for (let i = 0; i < a.length; i++) {
    idleDelta += b[i].idle - a[i].idle;
    totalDelta += b[i].total - a[i].total;
  }
  if (totalDelta <= 0) return 0;
  return Math.round((1 - idleDelta / totalDelta) * 100);
}

ipcMain.handle('system:get-info', async () => {
  const before = sampleCpuTimes();
  await new Promise((r) => setTimeout(r, 200));
  const after = sampleCpuTimes();

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const cpus = os.cpus();

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptimeSec: Math.round(os.uptime()),
    cpuModel: cpus[0]?.model?.trim() || 'Unknown CPU',
    cpuCores: cpus.length,
    cpuLoadPercent: cpuLoadPercentBetween(before, after),
    ramTotalBytes: totalMem,
    ramFreeBytes: freeMem,
    ramUsedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    // Battery, per-GPU utilization %, and disk usage aren't available from
    // Node/Electron built-ins without an additional native dependency —
    // left out rather than faked. GPU model name (not usage %) is available
    // separately via system:get-gpu-info below.
  };
});

ipcMain.handle('system:get-gpu-info', async () => {
  try {
    const info = await app.getGPUInfo('basic');
    const device = info?.gpuDevice?.[0];
    return { gpuName: device ? `${device.vendorId ? `0x${device.vendorId.toString(16)} / ` : ''}${device.deviceId ? `0x${device.deviceId.toString(16)}` : 'Unknown device'}` : null, raw: info };
  } catch (err) {
    return { gpuName: null, error: err.message };
  }
});

// ===========================================================================
// Installed software (Windows only — this app ships requireAdministrator
// NSIS on Windows, see package.json build config, so registry access is the
// natural source here). Reads the standard Uninstall registry keys via
// `reg query`, same approach Windows' own "Apps & Features" panel is built
// on. NOT runtime-tested against a real Windows registry in this repo's dev
// environment — the registry-query/parsing logic below is written to the
// documented `reg query` output format, but flagging it as unverified since
// I can't run reg.exe here to confirm the parser against a real machine.
// ---------------------------------------------------------------------------
const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

function parseRegQueryOutput(output) {
  // `reg query <key> /s` prints one blank-line-separated block per
  // sub-key, each block starting with the key path then one
  // "    ValueName    REG_TYPE    Value" line per value.
  const blocks = output.split(/\r?\n\r?\n/).map((b) => b.trim()).filter(Boolean);
  const apps = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    if (lines.length < 2) continue;
    const values = {};
    for (const line of lines.slice(1)) {
      const m = line.match(/^\s{4}(\S+)\s+(REG_\w+)\s+(.*)$/);
      if (m) values[m[1]] = m[3].trim();
    }
    if (values.DisplayName) {
      apps.push({
        name: values.DisplayName,
        version: values.DisplayVersion || null,
        publisher: values.Publisher || null,
        location: values.InstallLocation || null,
        installDate: values.InstallDate || null, // YYYYMMDD per registry convention, formatted client-side
      });
    }
  }
  return apps;
}

ipcMain.handle('system:get-installed-software', async () => {
  if (process.platform !== 'win32') {
    return { apps: [], error: 'Installed-software listing is only implemented for Windows (registry-based).' };
  }
  const apps = [];
  const errors = [];
  for (const key of UNINSTALL_KEYS) {
    try {
      const output = execSync(`reg query "${key}" /s`, { encoding: 'utf16le', maxBuffer: 1024 * 1024 * 32 });
      apps.push(...parseRegQueryOutput(output));
    } catch (err) {
      // A missing key (e.g. no WOW6432Node on a 32-bit machine) is normal,
      // not an error worth surfacing — reg.exe exits non-zero either way,
      // so only keep genuinely useful messages.
      if (!/unable to find/i.test(err.message)) errors.push(err.message);
    }
  }
  // De-dupe by name+version — the same app can legitimately appear under
  // more than one of the three keys above.
  const seen = new Set();
  const deduped = apps.filter((a) => {
    const k = `${a.name}::${a.version}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { apps: deduped, error: errors.length ? errors.join('; ') : null };
});

// ===========================================================================
// Screen recording save — recording itself happens in the renderer via the
// browser's built-in MediaRecorder API against the same stream already
// shown in the Remote panel (no new capture path needed, reuses whatever
// getUserMedia/RTCPeerConnection track is already flowing). This handler
// just persists the resulting WebM bytes to disk, same dialog pattern as
// fs:pick-files/fs:choose-save-dir above.
// ---------------------------------------------------------------------------
ipcMain.handle('recording:save', async (event, { buffer, suggestedName }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: suggestedName || `VDX-recording-${Date.now()}.webm`,
    filters: [{ name: 'WebM video', extensions: ['webm'] }],
  });
  if (res.canceled || !res.filePath) return { saved: false };
  await fsp.writeFile(res.filePath, Buffer.from(buffer));
  return { saved: true, path: res.filePath };
});
