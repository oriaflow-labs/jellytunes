import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
// ORAIN-0562: prime the synchronous identity cache used by `jellyfinHeaders`
// before the first render fires any fetch. Failures fall back to a temp id
// inside the helper — see `authContext.ts`.
import { primeRenderAuthContext } from './utils/authContext';

void primeRenderAuthContext();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
