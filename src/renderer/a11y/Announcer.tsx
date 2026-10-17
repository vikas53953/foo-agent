// Spec: 02-3 §F25.2 (the live regions behind `announce()`; test id `app-announcer`).
import { useEffect, useRef } from 'react';
import { TID } from '../../shared/testids';
import { onAnnounce } from './announce';
import styles from './a11y.module.css';

export function Announcer() {
  const polite = useRef<HTMLDivElement>(null);
  const assertive = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      onAnnounce((text, politeness) => {
        const el = politeness === 'assertive' ? assertive.current : polite.current;
        if (!el) return;
        // Clear first so the same text twice is read twice.
        el.textContent = '';
        requestAnimationFrame(() => {
          el.textContent = text;
        });
      }),
    [],
  );
  return (
    <div className={styles.visuallyHidden} data-testid={TID.appAnnouncer}>
      <div ref={polite} role="status" aria-live="polite" />
      <div ref={assertive} role="alert" aria-live="assertive" />
    </div>
  );
}
