import { AnimatePresence, motion } from 'framer-motion';
import Overview from './panels/Overview';
import Remote from './panels/Remote';
import Files from './panels/Files';
import Messages from './panels/Messages';
import Calls from './panels/Calls';
import SystemInfo from './panels/SystemInfo';
import Settings from './panels/Settings';
import Activity from './panels/Activity';
import ClipboardPanel from './panels/Clipboard';
import Screenshot from './panels/Screenshot';
import './ContentArea.css';

const PANELS = {
  overview: Overview,
  remote: Remote,
  files: Files,
  messages: Messages,
  calls: Calls,
  system: SystemInfo,
  settings: Settings,
  activity: Activity,
  clipboard: ClipboardPanel,
  screenshot: Screenshot,
};

export default function ContentArea({ activePanel }) {
  const Panel = PANELS[activePanel] || Overview;

  return (
    <div className="content-area">
      <AnimatePresence mode="wait">
        <motion.div
          key={activePanel}
          className="content-panel-scroll"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <Panel />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
