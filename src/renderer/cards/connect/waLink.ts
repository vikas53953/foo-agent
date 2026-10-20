// Spec: 05-3 §5.11.2 WhatsApp states (QR shown: a new code about every 20 s; 60 s after "Show QR code" the panel expires →
// "This code expired." [ New code ]; WhatsApp linked; WhatsApp failed 3× → WA_LINK_FAILED), 08-3 §16.4.4 (the engine owns the
// 60 s timer and the failed-link count; it reports them as the whatsapp `connections` row going `disconnected`, the third
// with `last_error_kind = 'WA_LINK_FAILED'`), 08-1 §3.2 `whatsapp:linkStart` / `linkCancel`, §3.3 `whatsapp:qr`.
// The panel's phase comes from the row and the newest code, never from the renderer's clock (a test clock moves main's).
import { useEffect, useRef, useState } from 'react';
import type { ConnectionRow } from '../../../shared/types';
import { invoke } from '../../ipc/client';
import { update, useStore } from '../../store/index';
import { selectWaQr, selectWhatsAppRow } from '../../store/connections';

export type WaLinkPhase = 'idle' | 'waiting' | 'qr' | 'expired' | 'linked' | 'failed';

export interface WaLinkInput {
  /** "Show QR code" / the dialog asked for a link in this view. */
  started: boolean;
  /** The row went `connecting` after that ask (so a later `disconnected` is this attempt's end). */
  sawConnecting: boolean;
  hasQr: boolean;
  row: Pick<ConnectionRow, 'status' | 'lastErrorKind'> | null;
}

export function waLinkPhase({ started, sawConnecting, hasQr, row }: WaLinkInput): WaLinkPhase {
  if (row?.status === 'connected') return 'linked';
  if (!started) return 'idle';
  if (sawConnecting && row?.status === 'disconnected') return row.lastErrorKind === 'WA_LINK_FAILED' ? 'failed' : 'expired';
  return hasQr ? 'qr' : 'waiting';
}

/** A code from an earlier attempt is never shown again; then main forks the bridge and asks for a code. */
function begin(): void {
  update((s) => {
    s.connections.qr = null;
  });
  void invoke('whatsapp:linkStart', {}).catch(() => undefined);
}

/** The link attempt behind a QR panel: start / New code, and linkCancel when the view goes away unlinked. */
export function useWaLink(autoStart = false) {
  const row = useStore(selectWhatsAppRow);
  const qr = useStore(selectWaQr);
  const [started, setStarted] = useState(autoStart);
  const [sawConnecting, setSawConnecting] = useState(false);
  const phase = waLinkPhase({ started, sawConnecting, hasQr: qr !== null, row });
  const live = useRef(false);

  if (started && !sawConnecting && row?.status === 'connecting') setSawConnecting(true);

  useEffect(() => {
    live.current = started && (phase === 'waiting' || phase === 'qr');
  });

  useEffect(() => {
    if (autoStart) begin();
    return () => {
      if (live.current) void invoke('whatsapp:linkCancel', {}).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => {
    setSawConnecting(false);
    setStarted(true);
    begin();
  };

  return { phase, qr, row, start };
}
