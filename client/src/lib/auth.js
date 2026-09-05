// Extracted 1:1 from renderer/renderer.js (loginWithCredentials,
// loginWithSavedOrPrompt, fetchTurnCredentials, config load).
//
// Behavior is unchanged from the vanilla renderer:
//   - device-config.js supplies serverUrl / TURN fallback info (infra config,
//     same on every install — NOT the user's identity).
//   - deviceId/secret are NOT read from device-config.js. They come from the
//     user (login form) or from what main.js persisted to userData on a
//     previous successful login (see ipc.getSavedAuth / ipc.saveAuth).
//   - TURN credentials are re-fetched from our own server (which asks
//     Twilio) once per login rather than trusted to a long-lived cache,
//     because Twilio tokens expire and we don't want to guess when.
//
// This module has no DOM/React dependency on purpose — it's pure logic the
// useAuth hook (and later peer-connection code) can call.

import { ipc } from './ipc';

let config;
try {
  // eslint-disable-next-line global-require
  config = require('../config/device-config.js');
} catch (e) {
  // Surfaced by useAuth as a hard error state — same as the vanilla renderer
  // showing "Missing device-config.js" in the status bar.
  config = null;
}

export function getConfig() {
  return config;
}

export async function loginWithCredentials(deviceId, secret) {
  if (!config) throw new Error('Missing device-config.js');
  const res = await fetch(`${config.serverUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, secret }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Login failed (${res.status})`);
  }

  const { token } = await res.json();
  return token;
}

// Tries saved deviceId/secret first (silent auto-login). Returns a result
// object describing what the UI should do next — the vanilla version did
// this by mutating the DOM directly (showLoginScreen); here it's just data,
// so useAuth decides what to render.
//
//   { status: 'authenticated', token, deviceId }
//   { status: 'needs-login', prefillError?: string }
//   { status: 'config-missing' }
export async function attemptAutoLogin() {
  if (!config) return { status: 'config-missing' };

  const saved = await ipc.getSavedAuth();
  if (saved && saved.deviceId && saved.secret) {
    try {
      const token = await loginWithCredentials(saved.deviceId, saved.secret);
      return { status: 'authenticated', token, deviceId: saved.deviceId };
    } catch (err) {
      return { status: 'needs-login', prefillError: `Saved login no longer works: ${err.message}` };
    }
  }
  return { status: 'needs-login' };
}

export async function submitLogin(deviceId, secret) {
  const token = await loginWithCredentials(deviceId, secret);
  await ipc.saveAuth(deviceId, secret);
  return { token, deviceId };
}

export async function logout() {
  await ipc.clearAuth();
}

// Fetches fresh TURN credentials for the given auth token. Always includes
// the public Google STUN servers as a floor, same as the vanilla renderer,
// so direct P2P still has a shot even if the TURN fetch fails.
const STUN_ONLY = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export async function fetchIceServers(authToken) {
  if (!config) return { iceServers: STUN_ONLY, error: 'Missing device-config.js' };
  try {
    const res = await fetch(`${config.serverUrl}/turn/token`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error(`TURN token fetch failed (${res.status})`);
    const { iceServers: twilioIceServers } = await res.json();
    return { iceServers: [...STUN_ONLY, ...twilioIceServers], count: twilioIceServers.length };
  } catch (e) {
    return { iceServers: STUN_ONLY, error: e.message };
  }
}
