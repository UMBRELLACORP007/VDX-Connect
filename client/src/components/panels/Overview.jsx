import { motion } from 'framer-motion';
import ConnectionVisualizer from '../ConnectionVisualizer';
import ConnectionPanel from '../ConnectionPanel';
import DeviceCard from '../DeviceCard';
import { useConnection } from '../../state/ConnectionContext';
import { useSystemInfo } from '../../hooks/useSystemInfo';
import { formatGpuInfo } from '../../lib/gpuFormat';
import { MY_DEVICE_LABEL, CONNECTED_DEVICE_LABEL } from '../../lib/labels';
import './Overview.css';

export default function Overview() {
  const { status, latencyMs, connectionType, peerDeviceId, requestConnection, endSession } = useConnection();
  const { info, gpu } = useSystemInfo();

  const myMetrics = info ? {
    cpu: info.cpuLoadPercent,
    ram: info.ramUsedPercent,
    os: `${info.platform} ${info.arch}`,
    gpuName: formatGpuInfo(gpu),
  } : {};

  return (
    <motion.div
      className="overview-panel"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="overview-stage glass-panel">
        <ConnectionVisualizer status={status} myDeviceName={MY_DEVICE_LABEL} peerDeviceName={peerDeviceId ? CONNECTED_DEVICE_LABEL : 'Peer Device'} />
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
        <DeviceCard name={MY_DEVICE_LABEL} online isLocal metrics={{ ...myMetrics, netMs: latencyMs }} />
        <DeviceCard name={peerDeviceId ? CONNECTED_DEVICE_LABEL : 'Peer Device'} online={status !== 'offline' && status !== 'idle'} metrics={{}} />
      </div>

      <p className="overview-note">
        My Device's CPU/RAM/GPU come from this machine's own OS — real numbers, polled every 2s. Once a
        session is active, the Connected Device's own live stats and installed software are synced over
        the connection too — see the System tab for both side by side.
      </p>
    </motion.div>
  );
}
