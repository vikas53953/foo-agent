// Spec: 06-3 §14 C-21 (Money → raising the AI cap; Spend-cap card (AI) "Raise cap"; non-destructive `role="dialog"`,
// Primary right): title "Raise this month's AI cap?", body "Now ₹{1,000}. New cap:" + amount field (`dialog-confirm-field`,
// ₹ prefix, `--t-mono`, empty unless Settings typed a value); minimum the current cap + ₹100, maximum ₹1,00,000 (08-0 §A.2);
// errors "The new cap has to be at least ₹{1,100}." · "The highest AI cap is ₹1,00,000." · "Type an amount in rupees.";
// buttons [ Not now ] [ Raise to ₹{1,500} ] (Primary disabled until the field is valid); writes `money.aiCapPaise` through
// `settings:set` (X-15: a plain confirm dialog, never an inline editor). 06 §0.3 dialog anatomy (ui/Dialog styles; focus
// trapped, Esc / ✕ close, focus returns to the opener). The cap's activity row and the resume are the runner's (T3).
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../shared/copy/t';
import { formatInr } from '../../shared/format';
import { TID } from '../../shared/testids';
import { invoke } from '../ipc/client';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import dialog from '../ui/Dialog.module.css';
import { AI_CAP_STEP_PAISE, checkNewCap } from './jobCards';
import styles from './JobCards.module.css';

export function RaiseCapDialog({ capPaise, onClose, onRaised }: { capPaise: number; onClose: () => void; onRaised?: () => void }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const errorId = useId();
  const opener = useRef<Element | null>(document.activeElement);
  const check = checkNewCap(text, capPaise);

  useEffect(() => {
    field.current?.focus();
    const back = opener.current;
    return () => {
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, []);

  const error = !check.ok && check.error !== 'empty' ? check.error : null;
  const errorText =
    error === 'min'
      ? t('dialog.c_21.error_min', { min: formatInr(capPaise + AI_CAP_STEP_PAISE) })
      : error === 'max'
        ? t('dialog.c_21.error_max')
        : error === 'nan'
          ? t('dialog.c_21.error_nan')
          : null;

  const raise = () => {
    if (!check.ok || saving) return;
    setSaving(true);
    void invoke('settings:set', { path: 'money.aiCapPaise', value: check.paise })
      .then((r) => {
        if (r.ok) {
          onRaised?.();
          onClose();
        }
      })
      .catch(() => undefined)
      .finally(() => setSaving(false));
  };

  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Enter' && e.target === field.current) {
      e.preventDefault();
      raise();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = Array.from(ref.current?.querySelectorAll<HTMLElement>('button, input') ?? []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i === list.length - 1 ? 0 : i + 1;
    e.preventDefault();
    list[next]?.focus();
  };

  return createPortal(
    <div className={dialog.scrim}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={dialog.dialog}
        data-testid={TID.dialogC21}
        onKeyDown={keys}
      >
        <div className={dialog.head}>
          <h2 id={titleId} className={dialog.title}>
            {t('dialog.c_21.title')}
          </h2>
          <IconButton icon="Dismiss" label={t('dialog.common.close')} className={dialog.close} data-testid={TID.dialogClose} onClick={onClose} />
        </div>
        <label className={styles.capField}>
          <span id={bodyId} className={dialog.body}>
            {t('dialog.c_21.body', { cap: formatInr(capPaise) })}
          </span>
          <span className={styles.capInput} data-invalid={error ? 'true' : undefined}>
            <span aria-hidden="true">{t('dialog.c_21.field_prefix')}</span>
            <input
              ref={field}
              inputMode="numeric"
              value={text}
              data-testid={TID.dialogConfirmField}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => setText(e.target.value)}
            />
          </span>
          {errorText && (
            <span id={errorId} className={styles.capError} role="alert">
              {errorText}
            </span>
          )}
        </label>
        <div className={dialog.buttons}>
          <Button variant="secondary" size="md" data-testid={TID.dialogSecondary} onClick={onClose}>
            {t('dialog.c_21.secondary')}
          </Button>
          <Button variant="primary" size="md" data-testid={TID.dialogPrimary} disabled={!check.ok || saving} onClick={raise}>
            {check.ok ? t('dialog.c_21.primary', { amount: formatInr(check.paise) }) : t('dialog.c_21.primary_empty')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
