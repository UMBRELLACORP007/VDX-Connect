import { useState } from 'react';
import AmbientBackground from './components/AmbientBackground';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';
import StatusStrip from './components/StatusStrip';
import ContentArea from './components/ContentArea';
import { LoginGate } from './components/LoginGate';
import ConnectionRequestModal from './components/ConnectionRequestModal';
import { ConnectionProvider, useConnection } from './state/ConnectionContext';
import { PanelNavProvider } from './state/PanelNavContext';
import './App.css';

export default function App() {
  return (
    <>
      <AmbientBackground />
      <LoginGate>
        {(session) => (
          <ConnectionProvider auth={session}>
            <Shell />
          </ConnectionProvider>
        )}
      </LoginGate>
    </>
  );
}

function Shell() {
  const [activePanel, setActivePanel] = useState('overview');
  const { incomingRequest, acceptIncoming, rejectIncoming } = useConnection();

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
