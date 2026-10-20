// Spec: 05-3 §5.10.1–§5.10.2 (six lanes, their titles and exact buttons; states waiting → live → signed_in | skipped |
// timed_out | handed_back | withdrawn; LIVE only while Edge is in front), §5.10.4 (Tab order I'm done → Take over → Skip;
// card label "Sign-in needed: …"), 05-1 §0.3 (Primary, then Secondary, then link buttons), §0.5 (offline: Skip stays
// enabled), CR-0013 G-M9-10 (reason = lane), G-M9-11 (no Watch button); "Use the code box" opens the §5.8 Code box (M5).
import { describe, expect, it } from 'vitest';
import { openCodeBox, parseSignIn, signInView } from '../../src/renderer/cards/signinView';
import type { CardRow } from '../../src/shared/types';

const AT = Date.UTC(2026, 9, 16, 4, 2); // Fri 16 Oct 2026, 9:32 AM IST

function card(state: string, payload: Record<string, unknown>, p: Partial<CardRow> = {}): CardRow {
  return {
    id: 'k_1',
    chatId: 'c_1',
    messageId: 'm_1',
    jobId: 'j_1',
    type: 'signin',
    state,
    payload: { type: 'signin', jobId: 'j_1', site: 'irctc.co.in', ...payload },
    answer: null,
    nonce: 'n',
    expiresAt: null,
    resolvedBy: null,
    resolvedAt: null,
    supersedesId: null,
    rev: 1,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...p,
  };
}

const ctx = { offline: false, timeZone: 'Asia/Kolkata' };
const open = (c: CardRow, o = ctx) => {
  const v = signInView(c, o);
  if (v?.kind !== 'open') throw new Error(`expected an open card, got ${JSON.stringify(v)}`);
  return v;
};
const labels = (c: CardRow) => open(c).buttons.map((b) => b.label);

describe('sign-in card lanes (05-3 §5.10.2)', () => {
  it('Sign-in: title with the site, [ I’m done ] [ Take over ] Skip', () => {
    const v = open(card('waiting', { mode: 'sign_in_here', reason: 'sign_in' }));
    expect(v.title).toBe('irctc.co.in wants you to sign in. Do it here and I’ll carry on.');
    expect(v.buttons.map((b) => [b.action, b.label, b.variant])).toEqual([
      ['done', 'I’m done', 'primary'],
      ['take_over', 'Take over', 'secondary'],
      ['skip', 'Skip', 'link'],
    ]);
    expect(v.domain).toBe('irctc.co.in');
    expect(v.label).toBe('Sign-in needed: irctc.co.in wants you to sign in. Do it here and I’ll carry on.');
  });

  it('CAPTCHA: person check, [ Take over ] Skip, Take over is the Primary', () => {
    const v = open(card('waiting', { mode: 'take_over', reason: 'captcha' }));
    expect(v.title).toBe('This page wants to check you’re a person. You do this bit, then hand it back.');
    expect(v.buttons.map((b) => [b.action, b.variant])).toEqual([
      ['take_over', 'primary'],
      ['skip', 'link'],
    ]);
  });

  it('Passkey: approval on the phone, [ I’m done ] Skip', () => {
    const v = open(card('waiting', { mode: 'take_over', reason: 'passkey' }));
    expect(v.title).toBe('irctc.co.in sent an approval to your phone. Approve it there, then tap I’m done.');
    expect(labels(card('waiting', { mode: 'take_over', reason: 'passkey' }))).toEqual(['I’m done', 'Skip']);
  });

  it('Bank check: the masked phone, [ I’m done ] and the "Use the code box" link', () => {
    const c = card('waiting', { mode: 'take_over', reason: 'bank_3ds', phone: '+91 98••• ••210' });
    expect(open(c).title).toBe('Your bank sent a code to +91 98••• ••210. Type it on the bank’s page.');
    expect(open(c).buttons.map((b) => [b.action, b.label, b.variant])).toEqual([
      ['done', 'I’m done', 'primary'],
      ['use_code_box', 'Use the code box', 'link'],
    ]);
    expect(open(c).buttons.map((b) => b.disabled)).toEqual([false, false]);
    expect(open(c, { ...ctx, offline: true }).buttons.map((b) => b.disabled)).toEqual([true, true]);
  });

  it('"Use the code box" asks main for the chat\'s code box (secret:offer otp) and scrolls to it', async () => {
    const offers: unknown[] = [];
    const reveals: [string, string][] = [];
    const ok = await openCodeBox(card('waiting', { mode: 'take_over', reason: 'bank_3ds', phone: '+91 98••• ••210' }), {
      offer: (req) => (offers.push(req), Promise.resolve({ ok: true, value: { id: 'k_otp' } })),
      reveal: (chatId, cardId) => reveals.push([chatId, cardId]),
    });
    expect(ok).toBe(true);
    expect(offers).toEqual([{ chatId: 'c_1', slot: 'otp' }]);
    expect(reveals).toEqual([['c_1', 'k_otp']]);
  });

  it('"Use the code box": a refused offer scrolls nowhere', async () => {
    const reveals: unknown[] = [];
    const ok = await openCodeBox(card('waiting', { mode: 'take_over', reason: 'bank_3ds', phone: '+91 98••• ••210' }), {
      offer: () => Promise.resolve({ ok: false }),
      reveal: (...a) => reveals.push(a),
    });
    expect(ok).toBe(false);
    expect(reveals).toEqual([]);
  });

  it('Bank check without a phone to show is not drawn (no slot left empty)', () => {
    expect(signInView(card('waiting', { mode: 'take_over', reason: 'bank_3ds' }), ctx)).toBeNull();
  });

  it('Known puzzle site: the puzzle line on the card, [ Take over ] Skip', () => {
    const v = open(card('waiting', { mode: 'take_over', reason: 'known_puzzle' }));
    expect(v.line).toBe('This site asks a picture puzzle. I’ll show it to you; you solve it.');
    expect(v.buttons.map((b) => b.action)).toEqual(['take_over', 'skip']);
  });

  it('Saved login failed: its own title, buttons as Sign-in', () => {
    const v = open(card('waiting', { mode: 'sign_in_here', reason: 'saved_login_failed' }));
    expect(v.title).toBe('Your saved irctc.co.in login didn’t work. Sign in here and I’ll update it.');
    expect(v.buttons.map((b) => b.label)).toEqual(['I’m done', 'Take over', 'Skip']);
  });

  it('never offers a Watch button (G-M9-11)', () => {
    for (const reason of ['sign_in', 'captcha', 'passkey', 'known_puzzle', 'saved_login_failed'])
      expect(labels(card('live', { mode: 'sign_in_here', reason }))).not.toContain('Watch');
  });

  it('an unknown lane is not drawn', () => {
    expect(parseSignIn({ type: 'signin', jobId: 'j', site: 'a.in', mode: 'sign_in_here', reason: 'wifi' })).toBeNull();
  });
});

describe('sign-in card states (05-3 §5.10.2 States)', () => {
  const p = { mode: 'sign_in_here', reason: 'sign_in' };

  it('LIVE shows only in `live` (Edge in front with the banner)', () => {
    expect(open(card('waiting', p)).live).toBe(false);
    expect(open(card('live', p)).live).toBe(true);
  });

  it('signed_in: "✓ Signed in to {site} · {time}" in the ok tone', () => {
    expect(signInView(card('signed_in', p, { resolvedAt: AT }), ctx)).toEqual({
      kind: 'summary',
      tone: 'ok',
      text: 'Signed in to irctc.co.in · 9:32 AM', // Checkmark icon beside it (CR-0021 pick 19)
    });
  });

  it('skipped: grey "Skipped. I’ll try another way."', () => {
    expect(signInView(card('skipped', p), ctx)).toEqual({ kind: 'summary', tone: 'grey', text: 'Skipped. I’ll try another way.' });
  });

  it('withdrawn: the universal withdrawn copy (05-1 §0.5)', () => {
    expect(signInView(card('withdrawn', p), ctx)).toMatchObject({ tone: 'grey', text: 'No longer needed. The job was stopped.' });
  });

  it('timed_out and handed_back: a grey summary of the card, no buttons', () => {
    for (const state of ['timed_out', 'handed_back'])
      expect(signInView(card(state, p), ctx)).toEqual({
        kind: 'summary',
        tone: 'grey',
        text: 'irctc.co.in wants you to sign in. Do it here and I’ll carry on.',
      });
  });

  it('offline: the offline line; I’m done and Take over disabled, Skip stays enabled', () => {
    const v = open(card('waiting', p), { ...ctx, offline: true });
    expect(v.offlineLine).toBe('You’re offline. I’ll do this when you’re back.');
    expect(v.buttons.map((b) => [b.action, b.disabled])).toEqual([
      ['done', true],
      ['take_over', true],
      ['skip', false],
    ]);
  });
});
