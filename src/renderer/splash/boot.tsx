// Spec: 06-1 §1.2 (the renderer's first paint is the Splash view, replaced by the shell when the chat list query returns): the
// splash is its own small root beside the app's (mounted right after it, in the same first paint), so it covers the shell
// and leaves without touching it.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Splash } from './Splash';

const host = document.getElementById('splash');
if (host)
  createRoot(host).render(
    <StrictMode>
      <Splash />
    </StrictMode>,
  );
