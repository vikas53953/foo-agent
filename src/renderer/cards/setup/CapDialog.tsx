// Spec: 06-1 §2.2 note line, key: Link "Change cap" → Dialog sm "Monthly AI cap" (the confirm `dialog-c-21`, X-118): ₹ field
// (default 1,000, minimum 100), [ Cancel ] [ Save cap ]; under 100 the field error "The lowest cap is ₹100."; writes
// `money.aiCapPaise` (≥ 10000 paise, 08-0 §A.2) through `settings:set`. 06 §0.3 dialog anatomy (focus trapped, Esc / ✕ close,
// focus returns to the opener) as RaiseCapDialog draws it.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../../shared/copy/t';
import { formatInr, parseInr } from '../../../shared/format';
import { TID } from '../../../shared/testids';
import { invoke } from '../../ipc/client';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import dialog from '../../ui/Dialog.module.css';
import cap from '../JobCards.module.css';

/** 08-0 §A.2: the lowest AI cap. */
export const MIN_AI_CAP_PAISE = 10_000;

export function CapDialog({ capPaise, onClose }: { capPaise: number; onClose: () => void }) {
  const [text, setText] = useState(formatInr(capPaise).replace(/^₹/, ''));
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const errorId = useId();
  const opener = useRef<Element | null>(document.activeElement);
  const paise = parseInr(text);
  const tooLow = paise !== null && paise < MIN_AI_CAP_PAISE;
  const valid = paise !== null && !tooLow;

  useEffect(() => {
    field.current?.select();
    const back = opener.current;
    return () => {
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, []);

  const save = () => {
    if (!valid || saving) return;
    setSaving(true);
    void invoke('settings:set', { path: 'money.aiCapPaise', value: paise })
      .then((r) => r.ok && onClose())
      .catch(() => undefined)
      .finally(() => setSaving(false));
  };

  const keys = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Enter' && e.target === field.current) {
      e.preventDefault();
      save();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([aria-disabled="true"]), input:not(:disabled)') ?? [],
    );
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
        className={dialog.dialog}
        data-testid={TID.dialogC21}
        onKeyDown={keys}
      >
        <div className={dialog.head}>
          <h2 id={titleId} className={dialog.title}>
            {t('setup.ai_finder.cap.title')}
          </h2>
          <IconButton
            icon="Dismiss"
            label={t('dialog.common.close')}
            className={dialog.close}
            data-testid={TID.dialogClose}
            onClick={onClose}
          />
        </div>
        <label className={cap.capField}>
          <span className={cap.capInput} data-invalid={tooLow ? 'true' : undefined}>
            <span aria-hidden="true">{t('dialog.c_21.field_prefix')}</span>
            <input
              ref={field}
              inputMode="numeric"
              value={text}
              aria-label={t('setup.ai_finder.cap.title')}
              data-testid={TID.dialogConfirmField}
              aria-invalid={tooLow || undefined}
              aria-describedby={tooLow ? errorId : undefined}
              onChange={(e) => setText(e.target.value)}
            />
          </span>
          {tooLow && (
            <span id={errorId} className={cap.capError} role="alert">
              {t('setup.ai_finder.cap.error_min')}
            </span>
          )}
        </label>
        <div className={dialog.buttons}>
          <Button variant="secondary" size="md" data-testid={TID.dialogSecondary} onClick={onClose}>
            {t('setup.ai_finder.cap.cancel')}
          </Button>
          <Button variant="primary" size="md" data-testid={TID.dialogPrimary} disabled={!valid || saving} onClick={save}>
            {t('setup.ai_finder.cap.save')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
