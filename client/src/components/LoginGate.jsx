import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import './LoginGate.css';

export function LoginGate({ children }) {
  const auth = useAuth();

  if (auth.phase === 'checking') {
    return (
      <div className="login-gate-screen">
        <span className="login-gate-spinner" />
      </div>
    );
  }

  if (auth.phase === 'config-missing') {
    return (
      <div className="login-gate-screen">
        <div className="login-gate-card glass-panel">
          <h2>Missing device-config.js</h2>
          <p>Copy device-config.example.js to device-config.js in src/config and fill in real values.</p>
        </div>
      </div>
    );
  }

  if (auth.phase === 'login') {
    return (
      <div className="login-gate-screen">
        <LoginForm auth={auth} />
      </div>
    );
  }

  // authenticated — hand the whole auth object down (not just .session) so
  // a "Log Out" control deeper in the tree (Settings > Security) can call
  // auth.logout() without a second, parallel auth wiring path.
  return children(auth);
}

function LoginForm({ auth }) {
  const [deviceId, setDeviceId] = useState('');
  const [secret, setSecret] = useState('');

  function onSubmit(e) {
    e.preventDefault();
    auth.submitLogin(deviceId, secret);
  }

  return (
    <motion.form
      className="login-gate-card glass-panel"
      onSubmit={onSubmit}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <img src="./brand/logo-badge.png" alt="VDX Connect" className="login-gate-logo" draggable={false} />
      <p className="login-gate-subtitle">Sign in with your Device ID and Secret.</p>

      <label className="login-gate-label">Device ID</label>
      <input className="login-gate-input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} autoFocus />

      <label className="login-gate-label">Secret</label>
      <input className="login-gate-input" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />

      {auth.error && <div className="login-gate-error">{auth.error}</div>}

      <button className="login-gate-submit" type="submit" disabled={auth.submitting}>
        {auth.submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </motion.form>
  );
}
