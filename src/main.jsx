import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Clean up/remove local IndexedDB database data as requested
try {
  if (typeof window !== 'undefined' && window.indexedDB) {
    window.indexedDB.deleteDatabase('SagaciousIceFactory');
  }
} catch (err) {
  console.warn("Could not delete old IndexedDB database:", err);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
