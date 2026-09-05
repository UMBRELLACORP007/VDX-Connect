import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vite adds crossorigin to the entry <script type="module"> and <link
// rel="stylesheet"> tags by default. That's fine over http(s), but under
// Electron's file:// protocol it makes Chromium treat the load as a CORS
// request against an origin-less scheme — which fails with
// net::ERR_FILE_NOT_FOUND even though the file is right there on disk.
// This strips the attribute from the final built HTML only (dev server
// behavior is untouched).
function stripCrossoriginForFileProtocol() {
  return {
    name: 'strip-crossorigin-for-file-protocol',
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(="[^"]*")?/g, '')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), stripCrossoriginForFileProtocol()],
  // Electron loads dist/index.html via file://, not http://. Vite's default
  // base of '/' produces absolute asset paths (/assets/index-xxx.js) that
  // resolve to the filesystem root under file:// and 404. Relative paths
  // fix that without needing a dev server in the packaged app.
  base: './',
  build: {
    rollupOptions: {
      // 'electron' isn't an npm package to bundle — nodeIntegration: true
      // (see main.js webPreferences) means Electron injects require()
      // directly into the renderer's global scope at runtime. Bundling it
      // would break; externalizing leaves the require('electron') calls in
      // lib/ipc.js untouched so they resolve against Electron's own module.
      external: ['electron'],
    },
  },
})
