import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'

// No-ops safely with no DSN set — nothing breaks locally or before
// VITE_SENTRY_DSN is added to Vercel's env vars, this just silently
// doesn't report anything until it's configured.
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [Sentry.browserTracingIntegration()],
  // Light performance sampling — this is a small internal-tools app, not
  // high-traffic, so no need to sample down further than this.
  tracesSampleRate: 0.1,
})

function ErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
        <h1 className="text-lg font-bold text-slate-800 mb-2">Something went wrong</h1>
        <p className="text-sm text-slate-500 mb-6">
          This has been reported. Try reloading the page — if it keeps happening, reach out via Help.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
