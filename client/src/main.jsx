import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts — bundled from node_modules at build time via Vite, so
// the packaged Electron app needs zero network access to render its own UI.
// Only the weights actually used in tokens.css/components are imported.
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './styles/tokens.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
