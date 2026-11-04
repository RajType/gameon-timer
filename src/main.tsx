import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled locally (woff2, variable weight) — works fully offline inside Tauri.
import '@fontsource-variable/vazirmatn'
import './index.css'
import App from './App'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
