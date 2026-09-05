import { createContext, useContext } from 'react';
import { useSession } from '../hooks/useSession';

// Real session state now (was a 3-state stub). `auth` is { token, deviceId }
// from useAuth — this context does nothing until a real login has happened.
const ConnectionContext = createContext(null);

export function ConnectionProvider({ auth, children }) {
  const session = useSession(auth);
  return (
    <ConnectionContext.Provider value={session}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection must be used inside ConnectionProvider');
  return ctx;
}
