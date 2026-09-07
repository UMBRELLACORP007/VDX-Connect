// Small typed wrapper around localStorage for the handful of local,
// per-machine preferences Settings exposes. Deliberately NOT used for
// anything security-sensitive (device id/secret already live in main.js's
// userData via ipc.saveAuth/getSavedAuth/clearAuth) — just UI/behavior
// preferences that are fine to lose if the user clears app data.

const PREFIX = 'vdx:';

function readRaw(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function writeRaw(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    // localStorage can throw in rare sandboxed/quota-exceeded cases — a
    // failed preference save shouldn't crash the app.
  }
}

export const THEMES = [
  { id: 'violet', name: 'Violet Night', swatch: ['#0b0e16', '#7c5cfc'] },
  { id: 'midnight', name: 'Midnight Blue', swatch: ['#070c14', '#3d8bfd'] },
  { id: 'emerald', name: 'Emerald', swatch: ['#08120e', '#2fd680'] },
  { id: 'sunset', name: 'Sunset Amber', swatch: ['#140d08', '#f5a623'] },
  { id: 'graphite', name: 'Graphite', swatch: ['#0c0c0e', '#9aa1b0'] },
  { id: 'light', name: 'Daylight', swatch: ['#f4f5f8', '#5b3df0'] },
];

export const QUALITY_LABELS = {
  auto: 'Auto (adaptive)',
  high: 'High — 1080p / 20fps',
  medium: 'Medium — 720p / 15fps',
  low: 'Low — 480p / 10fps',
};

export const settings = {
  getTheme: () => readRaw('theme', 'violet'),
  setTheme: (id) => writeRaw('theme', id),

  getReduceMotion: () => readRaw('reduceMotion', false),
  setReduceMotion: (v) => writeRaw('reduceMotion', !!v),

  getAutoConnect: () => readRaw('autoConnect', false),
  setAutoConnect: (v) => writeRaw('autoConnect', !!v),

  getDefaultQuality: () => readRaw('defaultQuality', 'auto'),
  setDefaultQuality: (v) => writeRaw('defaultQuality', v),

  getIncludeSystemAudio: () => readRaw('includeSystemAudio', true),
  setIncludeSystemAudio: (v) => writeRaw('includeSystemAudio', !!v),

  getNotifyOnRequest: () => readRaw('notifyOnRequest', true),
  setNotifyOnRequest: (v) => writeRaw('notifyOnRequest', !!v),

  getDefaultSaveDir: () => readRaw('defaultSaveDir', null),
  setDefaultSaveDir: (v) => writeRaw('defaultSaveDir', v),

  resetAll: () => {
    ['theme', 'reduceMotion', 'autoConnect', 'defaultQuality', 'includeSystemAudio', 'notifyOnRequest', 'defaultSaveDir']
      .forEach((k) => writeRaw(k, null));
  },
};
