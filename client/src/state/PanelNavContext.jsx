import { createContext, useContext } from 'react';

// Lets any panel (e.g. Remote's toolbar "Clipboard"/"Screenshot" buttons)
// switch the active sidebar panel without prop-drilling setActivePanel
// through every component.
const PanelNavContext = createContext(() => {});

export function PanelNavProvider({ onSelectPanel, children }) {
  return <PanelNavContext.Provider value={onSelectPanel}>{children}</PanelNavContext.Provider>;
}

export function usePanelNav() {
  return useContext(PanelNavContext);
}
