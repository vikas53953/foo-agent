// Spec: 06-2 §6.8 "Link WhatsApp" / "Link again" open Dialog md "Link WhatsApp" (`dialog-link-whatsapp`, X-118) holding the
// 05-3 §5.11 WhatsApp QR panel and its states; it closes itself 2 s after "✓ WhatsApp linked". 06 §0.3 dialog anatomy
// (`--dialog-md`, ✕ `dialog-close`, focus trapped and returned to the opener; Esc closes through the ladder, 03-shell-2
// §3.9.4). The dialog has no button row: the panel's own New code / Skip for now are its actions (06-2 names none).
// Closing it before the link finishes cancels the attempt (08-1 §3.2 `whatsapp:linkCancel`).
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import { QrPanel } from '../../cards/connect/QrPanel';
import { useWaLink } from '../../cards/connect/waLink';
import { IconButton } from '../../ui/IconButton';
import dialog from '../../ui/Dialog.module.css';

/** 06-2 §6.8: the dialog closes itself this long after "✓ WhatsApp linked". */
export const LINKED_CLOSE_MS = 2_000;

export function LinkWhatsAppDialog({ onClose }: { onClose: () => void }) {
  const { phase, qr, row, start } = useWaLink(true);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const opener = useRef<Element | null>(document.activeElement);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-testid="${TID.dialogClose}"]`)?.focus();
    const back = opener.current;
    return () => {
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'linked') return;
    const id = setTimeout(onClose, LINKED_CLOSE_MS);
    return () => clearTimeout(id);
  }, [phase, onClose]);

  const trap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const list = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i === list.length - 1 ? 0 : i + 1;
    e.preventDefault();
    list[next]!.focus();
  };

  return createPortal(
    <div className={dialog.scrim}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${dialog.dialog} ${dialog.md}`}
        data-testid={TID.dialogLinkWhatsapp}
        data-phase={phase}
        onKeyDown={trap}
      >
        <div className={dialog.head}>
          <h2 id={titleId} className={dialog.title}>
            {t('dialog.link_whatsapp.title')}
          </h2>
          <IconButton
            icon="Dismiss"
            label={t('dialog.common.close')}
            className={dialog.close}
            data-testid={TID.dialogClose}
            onClick={onClose}
          />
        </div>
        {phase !== 'idle' && (
          <QrPanel phase={phase} png={qr?.png ?? null} account={row?.accountLabel ?? ''} onNewCode={start} onSkip={onClose} />
        )}
      </div>
    </div>,
    document.body,
  );
}
