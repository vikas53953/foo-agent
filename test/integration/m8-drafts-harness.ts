// Spec: the shared set-up of the M8 T6 drafts tests (08-3 §16.1.4 real Gmail drafts port over the shared fake Google; main's
// DraftService on main's ApprovalGate with a fake clock). Made-up addresses only.
import { FakeClock } from '../../src/shared/clock';
import { googleGmailDrafts } from '../../src/main/drafts/gmailDraftsGoogle';
import { DraftService } from '../../src/main/drafts/DraftService';
import type { DraftPayload } from '../../src/shared/types';
import { draftsState, fakeGmailDrafts } from '../fakes/connectors/gmail';
import { fakeAccess, fakeGoogle, fakeGmailRead, gmailState } from '../fakes/connectors/gmail-read';
import { gateHarness, T0 } from '../unit/approvals/gateHarness';

export const TO = { name: 'Rakesh Example', address: 'rakesh@example.com' };

export function port() {
  const clock = new FakeClock(T0);
  const mail = gmailState();
  const drafts = draftsState();
  const g = fakeGoogle([fakeGmailDrafts(drafts, mail), fakeGmailRead(mail)], () => clock.now());
  const access = fakeAccess();
  const p = googleGmailDrafts({
    http: g.fetch,
    access: access.access,
    clock,
    connectionId: () => 'cn_gmail',
    base: 'https://gmail.example',
  });
  return { clock, mail, drafts, g, access, p };
}

export function service(over: { granted?: { draft: boolean; send: boolean } } = {}) {
  const x = port();
  const h = gateHarness();
  const looks: string[] = [];
  const opened: string[] = [];
  const drafts = new DraftService({
    db: h.db,
    gate: h.gate,
    now: () => h.clock.now,
    gmail: () => x.p,
    changed: (e) => h.changed.push(e),
    secondLook: (a) => {
      looks.push(a.id);
      return Promise.resolve({ pass: true });
    },
    openExternal: (url) => void opened.push(url),
    signature: () => x.p.signature(),
    granted: () => over.granted ?? { draft: true, send: true },
    email: () => 'tester@example.com',
  });
  const payload = (cardId: string) => JSON.parse(String(h.card(cardId).payload)) as DraftPayload;
  return { ...x, store: x.drafts, h, drafts, looks, opened, payload };
}

export const tap = (c: { cardId: string; nonce: string }) => ({ cardId: c.cardId, nonce: c.nonce, resolvedBy: 'tap' as const });
