// Spec: 08-1 §2.4 (every engine → main payload zod-checked; a request gets `{ re, result }`), 08-2 §8.2 `gmail.draft` (main makes
// the Gmail draft, the Draft card and its PENDING approvals row). M8 T6: `draft.create` answers once Gmail has answered, on
// the same port, later; a bad payload is IPC_REJECTED and never reaches the DraftService.
import { describe, expect, it } from 'vitest';
import { EngineBridge } from '../../src/main/engine-supervisor/EngineBridge';
import type { DraftInput } from '../../src/main/drafts/DraftService';
import type { Db } from '../../src/main/store/db';
import type { Settings } from '../../src/shared/settings';

function bridge() {
  const asked: DraftInput[] = [];
  const posted: unknown[] = [];
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
    }),
  });
  b.post = (m) => void posted.push(m);
  return { b, asked, posted, answer: (v: unknown) => answer(v) };
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
