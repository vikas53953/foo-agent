// Spec: 05-3 §5.18.1 (handoff marker: a centred `--t-caption` `--fg-2` line, no bubble; helper names are Link buttons in
// `--fg-1` that open that helper's chat), §5.18.3 (names are Tab stops; Narrator reads the line; `thread-marker`
// `data-state="handoff"`, names `thread-marker-link` with `data-index`), 04 §19.3 (a 16px dot in the helper's colour 4px
// before each name), CR-0013 G-M9-04 (M9 renders it from seeded rows; the `helper.handoff` engine is M13).
import { Fragment } from 'react';
import { TID } from '../../shared/testids';
import type { HelperRow, MessageRow } from '../../shared/types';
import { navigate } from '../store/index';
import styles from './Bubble.module.css';
import { handoffParts } from './handoffParts';
import { SystemLine } from './Markers';

export function HandoffMarker({ m, helpers }: { m: MessageRow; helpers: readonly HelperRow[] }) {
  const parts = handoffParts(m.text, helpers);
  if (!parts.some((p) => 'helper' in p)) return <SystemLine m={{ ...m, markerKind: 'handoff' }} />;
  return (
    <div className={`${styles.marker} ${styles.handoff}`} data-testid={TID.threadMarker} data-state="handoff" data-copy="ai">
      {parts.map((p, i) =>
        'text' in p ? (
          <Fragment key={i}>{p.text}</Fragment>
        ) : (
          <Fragment key={i}>
            <span className={styles.handoffDot} style={{ background: `var(${p.helper.colorToken})` }} aria-hidden="true" />
            <button
              type="button"
              className={styles.markerLink}
              data-testid={TID.threadMarkerLink}
              data-index={p.index}
              aria-label={m.text}
              onClick={() => navigate({ kind: 'chat', chatId: p.helper.chatId })}
            >
              {p.helper.name}
            </button>
          </Fragment>
        ),
      )}
    </div>
  );
}
