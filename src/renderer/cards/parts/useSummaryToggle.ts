// Spec: 05-1 §0.5 summary row (the full card stays available: clicking the summary row, or Enter on it, toggles a read-only
// expanded view of the card as it was at decision time, with the decision line at the bottom).
import { useState, type KeyboardEvent } from 'react';

/** Props that turn a summary row into the toggle for its read-only expanded view; nothing when the row has no such view. */
export function useSummaryToggle(): { open: boolean; rowProps: (enabled: boolean) => Record<string, unknown> } {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);
  const rowProps = (enabled: boolean) =>
    enabled
      ? {
          role: 'button',
          tabIndex: 0,
          'aria-expanded': open,
          onClick: toggle,
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle();
            }
          },
        }
      : {};
  return { open, rowProps };
}
