// M8 T3: the QR panel's phase (05-3 §5.11.2) from the whatsapp connections row and the newest code. The engine owns the 60 s
// timer and the failed-link count (08-3 §16.4.4) and reports both as the row going `disconnected`, the third one with
// WA_LINK_FAILED; the panel only reads that.
import { describe, expect, it } from 'vitest';
import { waLinkPhase } from '../../src/renderer/cards/connect/waLink';

const row = (status: 'connecting' | 'connected' | 'disconnected' | 'unlinked', lastErrorKind: string | null = null) => ({
  status,
  lastErrorKind,
});

describe('waLinkPhase', () => {
  it('is idle until Show QR code, and linked whenever the row is connected', () => {
    expect(waLinkPhase({ started: false, sawConnecting: false, hasQr: false, row: null })).toBe('idle');
    expect(waLinkPhase({ started: false, sawConnecting: false, hasQr: false, row: row('connected') })).toBe('linked');
    expect(waLinkPhase({ started: true, sawConnecting: true, hasQr: true, row: row('connected') })).toBe('linked');
  });

  it('waits for the first code, then shows it', () => {
    expect(waLinkPhase({ started: true, sawConnecting: false, hasQr: false, row: null })).toBe('waiting');
    expect(waLinkPhase({ started: true, sawConnecting: true, hasQr: false, row: row('connecting') })).toBe('waiting');
    expect(waLinkPhase({ started: true, sawConnecting: true, hasQr: true, row: row('connecting') })).toBe('qr');
  });

  it('an old disconnected row does not end an attempt that has not reached main yet', () => {
    expect(waLinkPhase({ started: true, sawConnecting: false, hasQr: false, row: row('disconnected', 'WA_LINK_FAILED') })).toBe('waiting');
  });

  it('60 s with no scan reads as expired (New code); the third failed link reads as failed (Skip for now)', () => {
    expect(waLinkPhase({ started: true, sawConnecting: true, hasQr: true, row: row('disconnected') })).toBe('expired');
    expect(waLinkPhase({ started: true, sawConnecting: true, hasQr: true, row: row('disconnected', 'WA_LINK_FAILED') })).toBe('failed');
  });

  it('an unlinked row is not linked: Link again starts a fresh attempt', () => {
    expect(waLinkPhase({ started: false, sawConnecting: false, hasQr: false, row: row('unlinked', 'WA_UNLINKED') })).toBe('idle');
    expect(waLinkPhase({ started: true, sawConnecting: false, hasQr: false, row: row('unlinked', 'WA_UNLINKED') })).toBe('waiting');
  });
});
