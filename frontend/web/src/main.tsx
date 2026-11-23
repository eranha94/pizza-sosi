import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/rubik';
import './styles.css';
import { App } from './App';
import { watchForUpdates } from './lib/updates';

// Tells /boot-fallback.js the app started, so it doesn't load the classic build as well.
(window as Window & { __pizzaBooted?: boolean }).__pizzaBooted = true;
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD) watchForUpdates();
