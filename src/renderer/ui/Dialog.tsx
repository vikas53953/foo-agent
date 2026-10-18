// Spec: 06 §0.3 Dialog anatomy (`--dialog-sm` 400, `--r-lg`, `--bg-raised`, `--shadow-28`, padding 24; title
// `--t-subtitle`, ✕ 36px icon button 12px inset; body `--t-body`; buttons `--btn-h` 40, gap 8, right-aligned; destructive
// order `[Destructive] [Cancel]` with Cancel focused, `role="alertdialog"`; non-destructive `[Secondary] [Primary]` with Primary
// focused; focus trapped; focus returns to the opener; ids `dialog-close` / `dialog-primary` / `dialog-secondary`), 03-shell-2
// §3.9.4 (Esc closes the dialog through the ladder: closeDialog); 06 §0.1 sizes sm 400 / md 520 / lg 720, max height window
// − 64 with the body scrolling and title and footer fixed, a confirm on top of a Dialog at --z-confirm (M13, CR-0017).
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Button } from './Button';
import { cx } from './cx';
import { IconButton } from './IconButton';
import styles from './Dialog.module.css';

export interface DialogProps {
  tid: keyof typeof TID;
  title: string;
  /** The first body paragraph (read by Narrator as the description). */
  body?: string;
  /** Dialog content under the body paragraph (forms, lists); it scrolls when the dialog is taller than the window − 64. */
  children?: ReactNode;
  primary: string;
  secondary: string;
  destructive?: boolean;
  /** 06 §0.1 widths: sm 400 (default), md 520, lg 720. */
  size?: 'sm' | 'md' | 'lg';
  /** A confirm on top of another Dialog (06 §0.1): drawn at --z-confirm. */
  onTop?: boolean;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  /** Cancel, ✕ and Esc. */
  onClose: () => void;
}

export function Dialog({
  tid,
  title,
  body,
  children,
  primary,
  secondary,
  destructive,
  size = 'sm',
  onTop,
  primaryDisabled,
  onPrimary,
  onClose,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const opener = useRef<Element | null>(document.activeElement);

  useEffect(() => {
    const el = ref.current;
    const focusAt = destructive ? TID.dialogSecondary : TID.dialogPrimary;
    el?.querySelector<HTMLElement>(`[data-testid="${focusAt}"]`)?.focus();
    const back = opener.current;
    return () => {
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, [destructive]);

  const trap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const list = Array.from(ref.current?.querySelectorAll<HTMLElement>('button') ?? []);
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i === list.length - 1 ? 0 : i + 1;
    e.preventDefault();
    list[next]!.focus();
  };

  const primaryButton = (
    <Button
      variant={destructive ? 'destructive' : 'primary'}
      size="md"
      data-testid={TID.dialogPrimary}
      disabled={primaryDisabled}
      onClick={onPrimary}
    >
      {primary}
    </Button>
  );
  const secondaryButton = (
    <Button variant="secondary" size="md" data-testid={TID.dialogSecondary} onClick={onClose}>
      {secondary}
    </Button>
  );

  return createPortal(
    <div className={cx(styles.scrim, onTop && styles.onTop)}>
      <div
        ref={ref}
        role={destructive ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className={cx(styles.dialog, styles[size])}
        data-testid={TID[tid]}
        onKeyDown={trap}
      >
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <IconButton
            icon="Dismiss"
            label={t('dialog.common.close')}
            className={styles.close}
            data-testid={TID.dialogClose}
            onClick={onClose}
          />
        </div>
        <div className={styles.scroll}>
          {body && (
            <p id={bodyId} className={styles.body}>
              {body}
            </p>
          )}
          {children}
        </div>
        <div className={styles.buttons}>
          {destructive ? (
            <>
              {primaryButton}
              {secondaryButton}
            </>
          ) : (
            <>
              {secondaryButton}
              {primaryButton}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
