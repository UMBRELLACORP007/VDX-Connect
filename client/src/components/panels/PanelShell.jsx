import { motion } from 'framer-motion';
import './PanelShell.css';

export function PanelShell({ title, subtitle, toolbar, children }) {
  return (
    <motion.div
      className="panel-shell"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="panel-shell-head">
        <div>
          <h2 className="panel-shell-title">{title}</h2>
          {subtitle && <p className="panel-shell-subtitle">{subtitle}</p>}
        </div>
        {toolbar && <div className="panel-shell-toolbar">{toolbar}</div>}
      </div>
      <div className="panel-shell-body">{children}</div>
    </motion.div>
  );
}

export function EmptyState({ title, body }) {
  return (
    <div className="panel-empty glass-panel">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
