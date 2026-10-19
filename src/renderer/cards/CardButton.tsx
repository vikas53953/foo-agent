// Spec: 05-1 §0.3 buttons inside cards (Primary / Secondary 40 tall pills via `--btn-h`; Link buttons `--t-small` `--accent`
// with a 40px hit area; order Primary, Secondary, links; disabled = `aria-disabled`), §0.5 Submitting (16px spinner ring in
// place of the icon, the "-ing" label when the card names one; every other button disabled).
import type { ReactNode } from 'react';
import { TID } from '../../shared/testids';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import styles from './Card.module.css';

export function CardButton({
  tid,
  kind,
  busy,
  busyLabel,
  disabled,
  label,
  index,
  onClick,
  children,
}: {
  tid: keyof typeof TID;
  kind: 'primary' | 'secondary' | 'link';
  /** This button's action is in flight. */
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  /** The full meaning for Narrator (05-1 §0.7), when it says more than the visible words. */
  label?: string;
  /** M5: `data-index` for a row of same-id buttons (e.g. `card-approval-held-option` 0–1). */
  index?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  const body = busy ? (
    <>
      <Spinner size={16} />
      {busyLabel ?? children}
    </>
  ) : (
    children
  );
  if (kind === 'link')
    return (
      <button
        type="button"
        className={styles.link}
        data-testid={TID[tid]}
        data-index={index}
        aria-label={label}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
      >
        {body}
      </button>
    );
  return (
    <Button
      variant={kind}
      size="md"
      className={styles.button}
      data-testid={TID[tid]}
      data-index={index}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {body}
    </Button>
  );
}
