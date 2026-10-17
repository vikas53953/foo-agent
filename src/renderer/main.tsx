// Spec: 02-3 §F29.2 (tokens.css imported once, first), 02 F7 X-150 (data-motion), 08-0 §G.10.
import './styles/tokens.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

document.documentElement.dataset.motion = window.foo?.platform.animations ?? 'full';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
