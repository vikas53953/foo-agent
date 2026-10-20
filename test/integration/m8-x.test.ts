// Spec: 10-acceptance-1 AT-054 (an X post draft: foo never posts to X; it only opens X's compose page with the text), 08-3
// §16.3 (no account, X-34; `twitter-text` weighted length: URLs count 23; > 280 → "Too long for X by {n} characters.";
// `x.openCompose` → `https://x.com/intent/post?text=` + encodeURIComponent(text); "Opened in X · not posted by foo"; no
// proof), 05-2 §5.7.2 (X opened; X too long: Primary disabled), §5.7.4 (Activity `opened_x_draft`), 06-3 §9.4 ("Opened an X
// post for you to send"). M8 T7: main's DraftService with a fake clock; the only way out is shell.openExternal.
import { describe, expect, it } from 'vitest';
import { DraftService } from '../../src/main/drafts/DraftService';
import { xIntentUrl, xRemaining } from '../../src/main/drafts/channels';
import type { DraftPayload } from '../../src/shared/types';
import { gateHarness } from '../unit/approvals/gateHarness';

function service() {
  const h = gateHarness();
  const opened: string[] = [];
  const drafts = new DraftService({
    db: h.db,
    gate: h.gate,
    now: () => h.clock.now,
    gmail: () => null,
    changed: (e) => h.changed.push(e),
    secondLook: () => Promise.resolve({ pass: true }),
    openExternal: (url) => void opened.push(url),
  });
  const payload = (cardId: string) => JSON.parse(String(h.card(cardId).payload)) as DraftPayload;
  const make = async (body: string) => {
    const d = await drafts.create({ jobId: h.jobId, channel: 'x', to: { name: '', address: '' }, body });
    if (!d.ok) throw new Error(d.error.kind);
    return d.value;
  };
  const tap = (c: { cardId: string; nonce: string }) => ({ ...c, resolvedBy: 'tap' as const });
  return { h, drafts, opened, payload, make, tap };
}

describe('08-3 §16.3 · weighted length', () => {
  it('counts a URL as 23 and CJK as 2 (twitter-text)', () => {
    expect(xRemaining('a'.repeat(280))).toBe(0);
    expect(xRemaining('see https://example.com/a/very/long/path/that/is/long')).toBe(280 - 4 - 23);
    expect(xRemaining('日本')).toBe(276);
  });

  it('builds the intent URL with the text encoded', () => {
    expect(xIntentUrl('Rent paid & done #home')).toBe('https://x.com/intent/post?text=Rent%20paid%20%26%20done%20%23home');
  });
});

describe('AT-054 · foo never posts to X', () => {
  it('AT-054 an X draft has no approvals row and no Send; Open in X opens the compose page with the text, nothing else', async () => {
    const s = service();
    const d = await s.make('Lights out in Indiranagar again. Third time this week.');
    expect(s.h.db.prepare('SELECT COUNT(*) FROM approvals').pluck().get()).toBe(0);
    expect(s.payload(d.cardId)).toMatchObject({ channel: 'x', xRemaining: 280 - 54, edited: false });
    expect(s.h.card(d.cardId).expires_at).toBeNull();
    expect(s.drafts.send(s.tap(d))).toEqual({ ok: false, error: { kind: 'VALIDATION' } });
    expect(await s.drafts.openInApp({ cardId: d.cardId })).toEqual({ ok: true, value: undefined });
    expect(s.opened).toEqual([xIntentUrl('Lights out in Indiranagar again. Third time this week.')]);
    expect(s.h.card(d.cardId).state).toBe('opened_in_app');
    // foo's line, and Activity opened_x_draft with no proof.
    const line = s.h.db.prepare("SELECT text FROM messages WHERE kind = 'text' AND author_kind = 'foo'").pluck().all();
    expect(line).toEqual(['It’s ready in X. Press Post there when you’re happy.']);
    const act = s.h.db.prepare("SELECT * FROM activity WHERE event = 'opened_x_draft'").all() as Record<string, unknown>[];
    expect(act).toHaveLength(1);
    expect(act[0]).toMatchObject({ kind: 'sent', summary: 'Opened an X post for you to send', proof_kind: null });
    // A second tap only opens the page again.
    await s.drafts.openInApp({ cardId: d.cardId });
    expect(s.opened).toHaveLength(2);
    expect(s.h.db.prepare("SELECT COUNT(*) FROM activity WHERE event = 'opened_x_draft'").pluck().get()).toBe(1);
  });

  it('AT-054 a post over 280 does not open; Change makes it fit, then it opens', async () => {
    const s = service();
    const d = await s.make('x'.repeat(314));
    expect(s.payload(d.cardId).xRemaining).toBe(-34);
    expect(await s.drafts.openInApp({ cardId: d.cardId })).toEqual({ ok: false, error: { kind: 'VALIDATION' } });
    expect(s.opened).toEqual([]);
    const changed = await s.drafts.update({ cardId: d.cardId, nonce: d.nonce, fields: { body: 'Short now.' } });
    expect(changed.ok).toBe(true);
    expect(s.payload(d.cardId)).toMatchObject({ body: 'Short now.', edited: true, xRemaining: 270 });
    // The old nonce is stale after a change.
    expect((await s.drafts.update({ cardId: d.cardId, nonce: d.nonce, fields: { body: 'again' } })).ok).toBe(false);
    expect((await s.drafts.openInApp({ cardId: d.cardId })).ok).toBe(true);
    expect(s.opened).toEqual([xIntentUrl('Short now.')]);
  });

  it('Discard ends the X draft; it never opens after that', async () => {
    const s = service();
    const d = await s.make('bye');
    expect((await s.drafts.discard(s.tap(d))).ok).toBe(true);
    expect(s.h.card(d.cardId).state).toBe('discarded');
    expect((await s.drafts.openInApp({ cardId: d.cardId })).ok).toBe(false);
    expect(s.opened).toEqual([]);
  });

  it("AT-054 x.openCompose and the x_intent button open only this job's X card, with the card's own text", async () => {
    const s = service();
    const d = await s.make('From the AI');
    expect(await s.drafts.openX({ cardId: d.cardId, jobId: 'j_other' })).toEqual({ ok: false, error: { kind: 'URL_NOT_ALLOWED' } });
    expect(await s.drafts.openX({ cardId: d.cardId, nonce: 'stale' })).toEqual({ ok: false, error: { kind: 'CARD_STALE' } });
    expect(await s.drafts.openX({ cardId: 'k_missing', jobId: s.h.jobId })).toEqual({ ok: false, error: { kind: 'URL_NOT_ALLOWED' } });
    expect(s.opened).toEqual([]);
    expect(await s.drafts.openX({ cardId: d.cardId, jobId: s.h.jobId })).toEqual({ ok: true, value: undefined });
    expect(await s.drafts.openX({ cardId: d.cardId, nonce: d.nonce })).toEqual({ ok: true, value: undefined });
    expect(s.opened).toEqual([xIntentUrl('From the AI'), xIntentUrl('From the AI')]);
  });
});
