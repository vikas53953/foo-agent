// Spec: 06 §0.3 Dialog anatomy (`--dialog-sm` 400, `--r-lg`, `--bg-raised`, `--shadow-28`, padding 24; title
// `--t-subtitle`, ✕ 36px icon button 12px inset; body `--t-body`; buttons `--btn-h` 40, gap 8, right-aligned; destructive
// order `[Destructive] [Cancel]` with Cancel focused, `role="alertdialog"`; non-destructive `[Secondary] [Primary]` with Primary
// focused; focus trapped; focus returns to the opener; ids `dialog-close` / `dialog-primary` / `dialog-secondary`), 03-shell-2
// §3.9.4 (Esc closes the dialog through the ladder: closeDialog). M6 T6: `--dialog-md` 520, extra body content (06-3 §14
// typed confirm field, the X-118 unreadable-lines list) and a Primary that stays disabled until the field matches.
// P1 T3 (CR-0021 pick 5, AT-303): the dialog lands 0.92 → 1 with `--ease-spring`; while any dialog is open the root
// carries `data-dialog-open` so the shell behind steps back (Shell.module.css).
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Button } from './Button';
import { IconButton } from './IconButton';
import styles from './Dialog.module.css';

let openDialogs = 0;

export interface DialogProps {
  tid: keyof typeof TID;
  title: string;
  body?: string;
  primary: string;
  /** Absent: one button (an information sheet such as 06-3 §19). */
  secondary?: string;
  destructive?: boolean;
  size?: 'sm' | 'md' | 'lg';
  primaryDisabled?: boolean;
  /** Shown after the body (a typed-confirm field, a list). */
  children?: ReactNode;
  onPrimary: () => void;
  /** Cancel, ✕ and Esc. */
  onClose: () => void;
}

export function Dialog({
  tid,
  title,
  body,
  primary,
  secondary,
  destructive,
  size = 'sm',
  primaryDisabled,
  children,
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

  useEffect(() => {
    openDialogs += 1;
    document.documentElement.dataset.dialogOpen = '';
    return () => {
      openDialogs -= 1;
      if (openDialogs === 0) delete document.documentElement.dataset.dialogOpen;
    };
  }, []);

  const trap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const list = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea') ?? []);
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
  const secondaryButton = secondary ? (
    <Button variant="secondary" size="md" data-testid={TID.dialogSecondary} onClick={onClose}>
      {secondary}
    </Button>
  ) : null;

  return createPortal(
    <div className={styles.scrim}>
      <div
        ref={ref}
        role={destructive ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className={size === 'sm' ? styles.dialog : `${styles.dialog} ${styles[size]}`}
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
        {body && (
          <p id={bodyId} className={styles.body}>
            {body}
          </p>
        )}
        {children}
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
