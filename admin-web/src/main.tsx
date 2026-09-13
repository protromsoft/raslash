import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AccountDeletionRequest from './AccountDeletionRequest.tsx';
import App from './App.tsx';
import ChildSafetyStandards from './ChildSafetyStandards.tsx';
import PrivacyPolicy from './PrivacyPolicy.tsx';
import './index.css';

const path = window.location.pathname.replace(/\/+$/, '') || '/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {path === '/privacy' ? (
      <PrivacyPolicy />
    ) : path === '/child-safety' ? (
      <ChildSafetyStandards />
    ) : path === '/delete-account' || path === '/account-deletion' ? (
      <AccountDeletionRequest />
    ) : (
      <App />
    )}
  </StrictMode>,
);
