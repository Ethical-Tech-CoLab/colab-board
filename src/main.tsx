import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/bebas-neue/latin-400'
import '@fontsource/space-mono/latin-400'
import '@fontsource/space-mono/latin-700'
import './themes.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
      console.error('Offline support could not be registered.', error)
    })
  })
}
