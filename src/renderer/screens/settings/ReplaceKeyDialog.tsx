// Spec: 06-2 §6.1 "Replace key" → Dialog sm `dialog-replace-key` (X-118) holding the 05 Secret box field for that key name:
// title "Replace your {OpenAI} key", lead "Paste the new key below. The old one is removed when the new one works.";
// [ Cancel ] [ Save securely ]; the new key is tested with the J2 one-word test (08-2 §6.6). 05-2 §5.8.5 (one IPC call
// carries the value; the field is cleared after the write; never logged). 06 §0.3 dialog anatomy as CapDialog draws it.
// CR-0020 (b): the old key is replaced when the new one is saved, not kept until it passes; a failed test leaves the
// dialog open with the failed line so the user can paste again.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AI_MAKER } from '../../../shared/aiNames';
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import type { KeyProviderId } from '../../../shared/types';
import { announce } from '../../a11y/announce';
import { SecretField } from '../../cards/SecretBox';
import { invoke } from '../../ipc/client';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import dialog from '../../ui/Dialog.module.css';
import box from '../../cards/SecretBox.module.css';

const FIELD = { key: 'value', label: '', masked: true } as const;

export function ReplaceKeyDialog({ providerId, onClose }: { providerId: KeyProviderId; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const leadId = useId();
  const opener = useRef<Element | null>(document.activeElement);
  const alive = useRef(true);
  const title = t('dialog.replace_key.title', { maker: AI_MAKER[providerId] });

  useEffect(() => {
    const back = opener.current;
    return () => {
      alive.current = false;
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, []);

  const save = () => {
    if (busy || value.trim() === '') return;
    setBusy(true);
    setFailed(false);
    void invoke('secret:save', { kind: 'ai_key', name: providerId, fields: { value: value.trim() } })
      .then(async (r) => {
        if (!alive.current) return;
        if (!r.ok) return setFailed(true);
        setValue('');
        setShown(false);
        const v = await invoke('ai:verify', { providerId });
        if (!alive.current) return;
        if (v.ok && v.value.ok) {
          announce(t('cards.secret.saved_announce'));
          onClose();
        } else setFailed(true);
      })
      .catch(() => alive.current && setFailed(true))
      .finally(() => alive.current && setBusy(false));
  };

  const keys = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
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
        aria-describedby={leadId}
        className={dialog.dialog}
        data-testid={TID.dialogReplaceKey}
        onKeyDown={keys}
      >
        <div className={dialog.head}>
          <h2 id={titleId} className={dialog.title}>
            {title}
          </h2>
          <IconButton
            icon="Dismiss"
            label={t('dialog.common.close')}
            className={dialog.close}
            data-testid={TID.dialogClose}
            onClick={onClose}
          />
        </div>
        <p id={leadId} className={dialog.body}>
          {t('dialog.replace_key.lead')}
        </p>
        <div className={box.fields}>
          <SecretField
            field={FIELD}
            kind="ai_key"
            index={0}
            title={t('dialog.replace_key.field_label')}
            value={value}
            shown={shown}
            readOnly={busy}
            autoFocus
            onChange={(v) => {
              setValue(v);
              setFailed(false);
            }}
            onEnter={save}
            onToggleEye={() => setShown((s) => !s)}
          />
          {failed && (
            <span className={box.error} role="alert">
              {t('dialog.replace_key.failed')}
            </span>
          )}
        </div>
        <div className={dialog.buttons}>
          <Button variant="secondary" size="md" data-testid={TID.dialogSecondary} onClick={onClose}>
            {t('dialog.replace_key.secondary')}
          </Button>
          <Button variant="primary" size="md" data-testid={TID.dialogPrimary} disabled={busy || value.trim() === ''} onClick={save}>
            {t('dialog.replace_key.primary')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
