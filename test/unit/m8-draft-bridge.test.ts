// Spec: 08-1 §2.4 (every engine → main payload zod-checked; a request gets `{ re, result }`), 08-2 §8.2 `gmail.draft` (main makes
// the Gmail draft, the Draft card and its PENDING approvals row). M8 T6: `draft.create` answers once Gmail has answered, on
// the same port, later; a bad payload is IPC_REJECTED and never reaches the DraftService.
// M8 T7: the WhatsApp and X shapes of `draft.create` (each channel only its own fields), and `draft.openX`.
import { describe, expect, it } from 'vitest';
import { EngineBridge } from '../../src/main/engine-supervisor/EngineBridge';
import type { DraftInput } from '../../src/main/drafts/DraftService';
import type { Db } from '../../src/main/store/db';
import type { Settings } from '../../src/shared/settings';

function bridge() {
  const asked: DraftInput[] = [];
  const posted: unknown[] = [];
  const opened: unknown[] = [];
  let answer: (v: unknown) => void = () => undefined;
  const b = new EngineBridge({
    db: {} as Db,
    settings: { get: () => ({}) as Settings, update: () => undefined },
    emit: () => undefined,
    emitMessage: () => undefined,
    emitChat: () => undefined,
    drafts: () => ({
      create: (input) => {
        asked.push(input);
        return new Promise((resolve) => (answer = resolve as (v: unknown) => void));
      },
      openX: (req) => {
        opened.push(req);
        return Promise.resolve({ ok: true, value: undefined });
      },
    }),
  });
  b.post = (m) => void posted.push(m);
  return { b, asked, posted, opened, answer: (v: unknown) => answer(v) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('M8 T6 · engine draft.create through main', () => {
  it('returns nothing at once and posts { re, result } when the draft is made', async () => {
    const x = bridge();
    const payload = { jobId: 'j_1', to: { name: 'Rakesh Example', address: 'rakesh@example.com' }, subject: 'Hi', body: 'Hello.' };
    expect(x.b.receive({ id: 'e1', kind: 'draft.create', payload })).toBeNull();
    expect(x.asked).toEqual([payload]);
    expect(x.posted).toEqual([]);
    x.answer({ ok: true, value: { approvalId: 'ap_1', cardId: 'k_1', nonce: 'n_1' } });
    await flush();
    expect(x.posted).toEqual([{ re: 'e1', result: { ok: true, value: { approvalId: 'ap_1', cardId: 'k_1', nonce: 'n_1' } } }]);
  });

  it('a payload with an unknown field is IPC_REJECTED and never asks main', () => {
    const x = bridge();
    const r = x.b.receive({
      id: 'e2',
      kind: 'draft.create',
      payload: { jobId: 'j', to: { name: 'a', address: 'a@example.com' }, body: 'x', bcc: 'b@example.com' },
    });
    expect(r).toEqual({ re: 'e2', result: { ok: false, error: { kind: 'IPC_REJECTED' } } });
    expect(x.asked).toEqual([]);
  });
});

describe('M8 T7 · WhatsApp and X through draft.create', () => {
  const rejected = (id: string) => ({ re: id, result: { ok: false, error: { kind: 'IPC_REJECTED' } } });
  const MOM = '919800000011@s.whatsapp.net';

  it('a WhatsApp draft carries its jid and masked label; an X draft only its body', () => {
    const x = bridge();
    const wa = { jobId: 'j', channel: 'whatsapp', to: { name: 'Mom', address: '+91 98••• ••011' }, waJid: MOM, body: 'Hi' };
    expect(x.b.receive({ id: 'e1', kind: 'draft.create', payload: wa })).toBeNull();
    const post = { jobId: 'j', channel: 'x', to: { name: '', address: '' }, body: 'Power cut' };
    expect(x.b.receive({ id: 'e2', kind: 'draft.create', payload: post })).toBeNull();
    expect(x.asked).toEqual([wa, post]);
  });

  it("each channel refuses the other channels' fields", () => {
    const x = bridge();
    const base = { jobId: 'j', body: 'x' };
    const bad = [
      { ...base, channel: 'whatsapp', to: { name: 'Mom', address: '+91 98••• ••011' } },
      { ...base, channel: 'whatsapp', to: { name: 'Mom', address: 'm' }, waJid: MOM, subject: 'Hi' },
      { ...base, channel: 'whatsapp', to: { name: 'G', address: 'G' }, waJid: MOM, isGroup: true },
      { ...base, channel: 'whatsapp', to: { name: 'Mom', address: 'm' }, waJid: 'mom@example.com' },
      { ...base, channel: 'x', to: { name: 'Mom', address: '' } },
      { ...base, channel: 'x', to: { name: '', address: '' }, waJid: MOM },
      { ...base, to: { name: 'Mom', address: '+91 98••• ••011' } },
      { ...base, to: { name: 'Mom', address: 'mom@example.com' }, waJid: MOM },
    ];
    bad.forEach((payload, i) => expect(x.b.receive({ id: `b${i}`, kind: 'draft.create', payload })).toEqual(rejected(`b${i}`)));
    expect(x.asked).toEqual([]);
  });

  it('draft.openX reaches the service with the job and card', async () => {
    const x = bridge();
    expect(x.b.receive({ id: 'o1', kind: 'draft.openX', payload: { jobId: 'j', cardId: 'k_1' } })).toBeNull();
    await flush();
    expect(x.opened).toEqual([{ jobId: 'j', cardId: 'k_1' }]);
    expect(x.posted).toEqual([{ re: 'o1', result: { ok: true, value: undefined } }]);
  });
});
