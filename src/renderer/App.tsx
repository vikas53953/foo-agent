// Spec: 08-0 §G.10 (no router: `ui.view` decides), 03-shell-1 §3.1.3.4 (the shell frame), 03-shell-2 §3.9.6 (the store
// is filled from app:getBootstrap and kept current by events), 02-3 §F25.2 (one announcer). The chat view (`main`) and
// the details panel (`right`) mount into the shell here.
import { useEffect } from 'react';
import { Announcer } from './a11y/Announcer';
import { Shell } from './shell/Shell';
import { loadBootstrap, startClock, wireEvents } from './store/apply';

export function App() {
  useEffect(() => {
    const off = wireEvents();
    const stop = startClock();
    void loadBootstrap();
    return () => {
      off();
      stop();
    };
  }, []);
  return (
    <>
      <Shell main={null} right={null} />
      <Announcer />
    </>
  );
}
