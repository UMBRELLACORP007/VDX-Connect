import { useCallback, useEffect, useState } from 'react';
import { attemptAutoLogin, submitLogin as submitLoginLib, logout as logoutLib, fetchIceServers } from '../lib/auth';

// Replaces the vanilla renderer's login-overlay DOM logic with a state
// machine a React component can render conditionally. Same behavior:
// auto-login on saved credentials first, fall back to a login form.
//
//   phase: 'checking' | 'login' | 'authenticated' | 'config-missing'
export function useAuth() {
  const [phase, setPhase] = useState('checking');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState(null); // { token, deviceId }

  useEffect(() => {
    let cancelled = false;
    attemptAutoLogin().then((result) => {
      if (cancelled) return;
      if (result.status === 'authenticated') {
        setSession({ token: result.token, deviceId: result.deviceId });
        setPhase('authenticated');
      } else if (result.status === 'config-missing') {
        setPhase('config-missing');
      } else {
        setError(result.prefillError || null);
        setPhase('login');
      }
    });
    return () => { cancelled = true; };
  }, []);

  const submitLogin = useCallback(async (deviceId, secret) => {
    setSubmitting(true);
    setError(null);
    try {
      const { token, deviceId: id } = await submitLoginLib(deviceId, secret);
      setSession({ token, deviceId: id });
      setPhase('authenticated');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutLib();
    setSession(null);
    setPhase('login');
    setError(null);
  }, []);

  return { phase, error, submitting, session, submitLogin, logout };
}

// Separate hook: TURN/STUN ice servers, fetched once a session exists and
// re-fetchable before each new peer-connection attempt (Twilio tokens
// expire — same rationale as the vanilla renderer, see lib/auth.js).
export function useIceServers(authToken) {
  const [iceServers, setIceServers] = useState(null);
  const [warning, setWarning] = useState(null);

  const refresh = useCallback(async () => {
    if (!authToken) return;
    const result = await fetchIceServers(authToken);
    setIceServers(result.iceServers);
    setWarning(result.error || null);
    return result.iceServers;
  }, [authToken]);

  useEffect(() => { refresh(); }, [refresh]);

  return { iceServers, warning, refresh };
}
