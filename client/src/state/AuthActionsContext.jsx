import { createContext, useContext } from 'react';

const AuthActionsContext = createContext(null);

export function AuthActionsProvider({ logout, children }) {
  return (
    <AuthActionsContext.Provider value={{ logout }}>
      {children}
    </AuthActionsContext.Provider>
  );
}

export function useAuthActions() {
  const ctx = useContext(AuthActionsContext);
  if (!ctx) throw new Error('useAuthActions must be used inside AuthActionsProvider');
  return ctx;
}
