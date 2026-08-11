import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import PrivacyPolicy from './PrivacyPolicy.tsx';
import './index.css';

const path = window.location.pathname.replace(/\/+$/, '') || '/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {path === '/privacy' ? <PrivacyPolicy /> : <App />}
  </StrictMode>,
);
