import { motion } from 'framer-motion';
import ConnectionVisualizer from '../ConnectionVisualizer';
import ConnectionPanel from '../ConnectionPanel';
import DeviceCard from '../DeviceCard';
import { useConnection } from '../../state/ConnectionContext';
import { useSystemInfo } from '../../hooks/useSystemInfo';
import './Overview.css';

export default function Overview() {
  const { status, latencyMs, connectionType, peerDeviceId, requestConnection, endSession } = useConnection();
  const { info, gpu } = useSystemInfo();

  const myMetrics = info ? {
    cpu: info.cpuLoadPercent,
    ram: info.ramUsedPercent,
    os: `${info.platform} ${info.arch}`,
    gpuName: gpu?.gpuName,
  } : {};

  return (
    <motion.div
      className="overview-panel"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="overview-stage glass-panel">
        <ConnectionVisualizer status={status} myDeviceName="My Device" peerDeviceName={peerDeviceId || 'Peer Device'} />
        <ConnectionPanel
          status={status}
          latencyMs={latencyMs}
          connectionType={connectionType}
          onConnect={requestConnection}
        />
        {status === 'session-active' && (
          <button className="overview-end-btn" onClick={endSession}>End session</button>
        )}
      </div>

      <div className="overview-cards">
        <DeviceCard name="My Device" online isLocal metrics={{ ...myMetrics, netMs: latencyMs }} />
        <DeviceCard name={peerDeviceId || 'Peer Device'} online={status !== 'offline' && status !== 'idle'} metrics={{}} />
      </div>

      <p className="overview-note">
        My Device's CPU/RAM/GPU come from this machine's own OS — real numbers, polled every 2s. The peer's
        card stays empty: there's no protocol in this app yet to sync a peer's system stats over the
        connection, so nothing is invented for it.
      </p>
    </motion.div>
  );
}
