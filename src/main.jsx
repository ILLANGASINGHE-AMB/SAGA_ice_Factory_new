import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Lazy-loaded page chunks are hashed per Netlify deploy (e.g.
// DashboardPage-BzD9XNKx.js). A tab left open across a redeploy still holds
// the old index.html referencing chunk names the new deploy no longer
// serves, so any React.lazy() import for a route not yet visited in that
// tab 404s with "Failed to fetch dynamically imported module" and the page
// goes blank. Reloading once fetches the current index.html + fresh chunk
// hashes; the session flag stops a real broken deploy from reload-looping.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('saga_reloaded_after_stale_chunk')) return;
  sessionStorage.setItem('saga_reloaded_after_stale_chunk', '1');
  window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
