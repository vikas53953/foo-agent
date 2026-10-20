// Spec: 08-1 §1.2.1 (vite input `windows/signin-banner.html`), 02-3 §F29.2 (tokens.css first), 05-3 §5.10.3 / 09 §9.27.3
// (the docked sign-in banner window's page).
import '../styles/tokens.css';
import '../styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { watchMotion } from '../a11y/motion';
import { Announcer } from '../a11y/Announcer';
import { SigninBanner } from './SigninBanner';

watchMotion(window.foo?.platform.animations);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SigninBanner />
    <Announcer />
  </StrictMode>,
);
