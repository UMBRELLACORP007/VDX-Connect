import { useEffect, useState } from 'react';
import AmbientBackground from './components/AmbientBackground';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';
import StatusStrip from './components/StatusStrip';
import ContentArea from './components/ContentArea';
import { LoginGate } from './components/LoginGate';
import ConnectionRequestModal from './components/ConnectionRequestModal';
import { ConnectionProvider, useConnection } from './state/ConnectionContext';
import { PanelNavProvider } from './state/PanelNavContext';
import { AuthActionsProvider } from './state/AuthActionsContext';
import { useTheme } from './hooks/useTheme';
import { settings } from './lib/settingsStore';
import './App.css';

export default function App() {
  // Applies the saved theme / reduce-motion preference to <html> as soon as
  // the app boots, before login even — so the login screen itself picks up
  // the chosen theme too, not just the authenticated shell.
  useTheme();

  return (
    <>
      <AmbientBackground />
      <LoginGate>
        {(auth) => (
          <ConnectionProvider auth={auth.session}>
            <AuthActionsProvider logout={auth.logout}>
              <Shell />
            </AuthActionsProvider>
          </ConnectionProvider>
        )}
      </LoginGate>
    </>
  );
}

function Shell() {
  const [activePanel, setActivePanel] = useState('overview');
  const { incomingRequest, acceptIncoming, rejectIncoming } = useConnection();

  // Settings > Notifications > "Show a desktop notification on incoming
  // connection requests" — fires a native Notification (Electron's
  // renderer has access to the standard web Notification API) each time a
  // new request comes in, so it's noticeable even if the window is
  // minimized or behind other apps.
  useEffect(() => {
    if (!incomingRequest) return;
    if (!settings.getNotifyOnRequest()) return;
    if (typeof Notification === 'undefined') return;

    const fire = () => new Notification('VDX Connect', { body: 'The other device wants to connect.' });
    if (Notification.permission === 'granted') fire();
    else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((perm) => { if (perm === 'granted') fire(); });
    }
  }, [incomingRequest]);

  return (
    <div className="app-shell">
      <Titlebar />
      <div className="app-body">
        <Sidebar activePanel={activePanel} onSelectPanel={setActivePanel} />
        <div className="app-main">
          <StatusStrip />
          <PanelNavProvider onSelectPanel={setActivePanel}>
            <ContentArea activePanel={activePanel} />
          </PanelNavProvider>
        </div>
      </div>
      <ConnectionRequestModal fromDeviceId={incomingRequest} onAccept={acceptIncoming} onDecline={rejectIncoming} />
    </div>
  );
}
