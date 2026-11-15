import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/rubik';
import './admin.css';
import { App } from './App';
import { AuthAction } from './AuthAction';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.pathname === '/auth/action' ? <AuthAction /> : <App />}
  </StrictMode>,
);
