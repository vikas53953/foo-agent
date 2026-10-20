// Spec: 09 §9.27.1–§9.27.2 (the live window's own page, `windows/live.html?job={jobId}`), 02-3 §F29.2 (tokens.css first),
// 02 F7 X-150 (data-motion), 08-0 §G.8.
import '../styles/tokens.css';
import '../styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveView } from './LiveView';

document.documentElement.dataset.motion = window.foo?.platform.animations ?? 'full';
const jobId = new URLSearchParams(location.search).get('job') ?? '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LiveView jobId={jobId} />
  </StrictMode>,
);
