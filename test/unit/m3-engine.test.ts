// Spec: 08-2 §6.6 (detect, verify, choose; chat locked until one verifies), §6.9 (chat lane), §7.6 (output filters, filler
// phrases), 08-4 §25.2 (IntakeAct `react`), §25.5 (release gate, what is posted per kind), 04 §3.3 (Waiting to send,
// ✓✓ delivered, read on first byte), §4.1 rule 4 (a plain answer's badge is `seen` and goes when the first word appears),
// §19.4 (cut-off reply, Try again), 08-1 §4.3.5 (ai_turns), 08-3 §22.3 (FOO_FAKE_AI). Art. 12 (AI words never move a status).
// The real Engine and main's EngineBridge over a temp SQLite db; every AI turn is the fake script.
import { afterEach, describe, expect, it } from 'vitest';
import type { Settings } from '../../src/shared/settings';
import type { AiStatus } from '../../src/shared/types';
import {
  count,
  envelope,
  fooMessages,
  intake,
  makeHarness,
  setsOf,
  verified,
  VERIFY_LINE,
  type Harness,
  type HarnessOptions,
} from './m3-engine-helpers';

let h: Harness | null = null;
function harness(o: HarnessOptions): Harness {
  h = makeHarness(o);
  return h;
}
afterEach(() => {
  h?.close();
  h = null;
});

describe('J2 · detect, verify, choose (through the fake AI)', () => {
  it('AT-005 · Claude and ChatGPT both verify with a real request; choose makes Claude primary', async () => {
    const x = harness({ script: [VERIFY_LINE, VERIFY_LINE] });
    const rows = await x.aiCmd<{ providerId: string; state: string }[]>('detect');
    expect(rows.ok).toBe(true);
    // Rows come in ladder order with the fake rung last (its detect is the only one the fake controls, see report).
    const ids = rows.ok ? rows.value.map((r) => r.providerId) : [];
    expect(ids.slice(0, 2)).toEqual(['claude-cli', 'codex-cli']);
    expect(ids.at(-1)).toBe('fake');
    expect(rows.ok && rows.value.at(-1)?.state).toBe('testing');

    const a = await x.aiCmd<{ ok: boolean; displayName?: string }>('verify', 'claude-cli');
    const b = await x.aiCmd<{ ok: boolean; displayName?: string }>('verify', 'codex-cli');
    expect(a.ok && a.value).toMatchObject({ ok: true, displayName: 'Claude' });
    expect(b.ok && b.value).toMatchObject({ ok: true, displayName: 'ChatGPT' });
    // "Tested with a real request": two verify turns, the exact verify prompt (08-2 §6.6).
    const verifies = x.turnsJsonl().filter((t) => t.purpose === 'verify');
    expect(verifies).toHaveLength(2);
    expect(verifies.every((t) => t.prompt === 'Reply with the word ready' && t.matchedLine !== null)).toBe(true);
    expect(x.aiStates.filter((s) => (s.providers as Record<string, unknown>)['claude-cli'])).toHaveLength(1);

    const chosen = await x.aiCmd<AiStatus>('choose', 'claude-cli', 'codex-cli');
    expect(chosen.ok && chosen.value).toMatchObject({ primary: 'claude-cli', backup: 'codex-cli', displayName: 'Claude' });
    const s = x.settings();
    expect(s.ai.primary).toBe('claude-cli');
    expect(s.ai.backup).toBe('codex-cli');
    expect(s.ai.providers['claude-cli']).toMatchObject({ lastVerifyOk: true, lastVerifiedAt: x.clock.now() });
    expect(s.ai.providers['codex-cli']).toMatchObject({ lastVerifyOk: true });
    expect(x.engine.ai.status()).toMatchObject({ primary: 'claude-cli', state: 'ok', displayName: 'Claude' });
  });

  // KNOWN BUG (report): in a FOO_FAKE_AI run verify persists the fake adapter's billing ('local') as the plan CLI's kind.
  it('AT-005 · a verified plan CLI is stored with kind "plan" (not the fake adapter\'s billing)', async () => {
    const x = harness({ script: [VERIFY_LINE] });
    await x.aiCmd('verify', 'claude-cli');
    expect(x.settings().ai.providers['claude-cli']?.kind).toBe('plan');
  });

  it('AT-005 · choose before verify is refused (AI_NOT_VERIFIED)', async () => {
    const x = harness({ script: [] });
    const r = await x.aiCmd('choose', 'claude-cli');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.kind).toBe('AI_NOT_VERIFIED');
    expect(x.settings().ai.primary).toBeNull();
  });

  it('AT-005 · a provider whose test fails is persisted lastVerifyOk false and cannot be chosen', async () => {
    const x = harness({ script: [{ match: { purpose: 'verify' }, error: 'AI_SIGNED_OUT' }] });
    const r = await x.aiCmd<{ ok: boolean; kind?: string }>('verify', 'codex-cli');
    expect(r.ok && r.value).toMatchObject({ ok: false, kind: 'AI_SIGNED_OUT' });
    expect(x.settings().ai.providers['codex-cli']).toMatchObject({ lastVerifyOk: false });
    const c = await x.aiCmd('choose', 'codex-cli');
    expect(!c.ok && c.error.kind).toBe('AI_NOT_VERIFIED');
  });
});

describe('Waiting to send until an AI verifies', () => {
  const unverified = (s: Settings): Settings => ({
    ...s,
    ai: { ...s.ai, primary: 'claude-cli', providers: { 'claude-cli': { kind: 'plan' } } },
  });

  it('AT-006 · with no verified AI a message stays queued: no foo message, no ai_turns row, no AI turn', async () => {
    const x = harness({ script: [intake(envelope('Hello!'))], settings: unverified });
    const id = x.userSays('hello', { waiting: true });
    await x.idle();
    expect(x.message(id).status).toBe('queued');
    expect(fooMessages(x)).toHaveLength(0);
    expect(count(x, 'ai_turns')).toBe(0);
    expect(x.turnsJsonl()).toHaveLength(0);
    expect(x.engine.ai.pick()).toBeNull();
  });

  it('AT-006 · a message main stored as sent is moved to queued while no AI works', async () => {
    const x = harness({ script: [], settings: (s) => s });
    const id = x.userSays('hello');
    await x.idle();
    expect(x.message(id).status).toBe('queued');
    expect(fooMessages(x)).toHaveLength(0);
  });

  it('AT-006 · after a verify succeeds, queued messages drain oldest first and each gets a reply', async () => {
    const x = harness({
      script: [
        VERIFY_LINE,
        intake(envelope('First answer.'), { match: { purpose: 'intake', promptIncludes: 'one' } }),
        intake(envelope('Second answer.')),
      ],
      settings: unverified,
    });
    const m1 = x.userSays('message one', { waiting: true });
    const m2 = x.userSays('message two', { waiting: true });
    await x.idle();
    expect(fooMessages(x)).toHaveLength(0);

    const v = await x.aiCmd<{ ok: boolean }>('verify', 'claude-cli');
    expect(v.ok && v.value.ok).toBe(true);
    await x.idle();
    expect(x.message(m1).status).toBe('complete');
    expect(x.message(m2).status).toBe('complete');
    expect(fooMessages(x).map((m) => m.text)).toEqual(['First answer.', 'Second answer.']);
    expect(count(x, 'ai_turns')).toBe(2);
  });

  // KNOWN BUG (report): Engine drains the queue only on the first settings.changed or when verify finds pick() usable; on a
  // first-time J2 the primary is set by choose → ai.state → settings.changed, which never drains. Flip to `it` when fixed.
  it('AT-006 · first-time J2 (no primary yet): verify then choose drains the queued message', async () => {
    const x = harness({ script: [VERIFY_LINE, intake(envelope('Here now.'))] });
    const id = x.userSays('are you there?', { waiting: true });
    await x.idle();
    await x.aiCmd('verify', 'claude-cli');
    const c = await x.aiCmd('choose', 'claude-cli');
    expect(c.ok).toBe(true);
    await x.idle();
    expect(x.message(id).status).toBe('complete');
    expect(fooMessages(x).map((m) => m.text)).toEqual(['Here now.']);
  });
});

describe('J7 · reactions and filters', () => {
  for (const ack of ['thanks!', 'ok', 'cool', '👍']) {
    it(`AT-027 / ART-23a · "${ack}" gets a 👍 and no message`, async () => {
      const x = harness({ script: [intake(envelope('', { kind: 'react', emoji: '👍' }))], settings: verified() });
      const id = x.userSays(ack);
      await x.idle();
      const reactions = x.db.prepare('SELECT * FROM reactions WHERE message_id = ?').all(id) as Record<string, unknown>[];
      expect(reactions).toEqual([expect.objectContaining({ by: 'foo', emoji: '👍' })]);
      expect(fooMessages(x)).toHaveLength(0);
      expect(x.message(id).badge).toBeNull();
      expect(x.message(id).status).toBe('complete');
      expect(x.turnsJsonl().filter((t) => t.purpose === 'intake')).toHaveLength(1);
    });
  }

  it('AT-031 · filler phrases never reach the stored foo message', async () => {
    const say = 'Great question! Your train leaves at 6:40 PM from platform 3. How can I help you?';
    const x = harness({ script: [intake(envelope(say))], settings: verified() });
    x.userSays('when is my train?');
    await x.idle();
    const [foo] = fooMessages(x);
    expect(foo?.status).toBe('complete');
    const text = String(foo?.text);
    expect(text).toContain('6:40 PM');
    for (const f of ['Great question', 'How can I help you', 'I apologize for the confusion']) expect(text).not.toContain(f);
  });

  it('AT-031 · filler is also removed in sentence mode (reply streamed after the 1.5 s hold)', async () => {
    const say = 'Great question! Your train leaves at 6:40 PM. I hope this helps.';
    const x = harness({ script: [intake(envelope(say), { delayMs: 2_000 })], settings: verified() });
    x.userSays('when is my train?');
    await x.idle();
    const [foo] = fooMessages(x);
    expect(String(foo?.text)).toContain('6:40 PM');
    expect(String(foo?.text)).not.toMatch(/Great question|I hope this helps/);
    const deltas = x.patches.filter((p) => p.event === 'message:delta').map((p) => (p.payload as { append: string }).append);
    expect(deltas.join('')).not.toMatch(/Great question|I hope this helps/);
  });
});

describe('Art. 12 · AI words never move a status', () => {
  it('ART-12a · "Step 3 done… step 4 done…" as a plain reply: badge ends null, never working/done, no job or card', async () => {
    const x = harness({ script: [intake(envelope('Step 3 done… step 4 done…'), { delayMs: 2_000 })], settings: verified() });
    const id = x.userSays('how is it going?');
    await x.idle();
    const badges = setsOf(x, id, 'badge');
    expect(badges).not.toContain('working');
    expect(badges).not.toContain('done');
    expect(x.message(id).badge).toBeNull();
    expect(count(x, 'jobs')).toBe(0);
    expect(count(x, 'cards')).toBe(0);
    expect(x.patches.some((p) => p.event === 'job:upsert' || p.event === 'card:upsert')).toBe(false);
    expect(fooMessages(x).map((m) => m.text)).toEqual(['Step 3 done… step 4 done…']);
  });
});

describe('A plain reply end to end', () => {
  it('whole reply (closed inside the 1.5 s hold): delivered, 👀 while thinking, one foo message, ai_turns ok', async () => {
    const x = harness({
      script: [
        intake(envelope('Mon 2 Nov is not a bank holiday.'), {
          usage: { tokensIn: 900, tokensOut: 12, cacheRead: null, cacheWrite: null, costUsd: null },
        }),
      ],
      settings: verified(),
    });
    const id = x.userSays('is Mon 2 Nov a holiday?');
    await x.idle();
    expect(setsOf(x, id, 'status')).toEqual(['complete']);
    expect(setsOf(x, id, 'badge')).toEqual(['seen', null]);
    expect(x.message(id).status).toBe('complete');
    const foo = fooMessages(x);
    expect(foo).toHaveLength(1);
    expect(foo[0]).toMatchObject({ text: 'Mon 2 Nov is not a bank holiday.', status: 'complete', author_kind: 'foo' });
    const turns = x.db.prepare('SELECT * FROM ai_turns').all() as Record<string, unknown>[];
    expect(turns).toEqual([
      expect.objectContaining({ purpose: 'intake', outcome: 'ok', error_kind: null, tokens_in: 900, tokens_out: 12, chat_id: x.chatId }),
    ]);
    const typing = x.patches.filter((p) => p.event === 'chat:typing').map((p) => (p.payload as { on: boolean }).on);
    expect(typing[0]).toBe(true);
    expect(typing.at(-1)).toBe(false);
  });

  it('streamed reply (past the hold): foo message inserted streaming, deltas sent, then completed with the final text', async () => {
    const say = 'Your cake is booked for Saturday. The shop opens at 10 AM.';
    const x = harness({ script: [intake(envelope(say), { delayMs: 2_000 })], settings: verified() });
    const id = x.userSays('did the cake get booked?');
    await x.idle();
    const inserts = x.txs.flatMap((t) => t.ops).filter((o) => o.op === 'insert' && o.table === 'messages');
    expect(inserts).toHaveLength(1);
    const ins = inserts[0] as { row: Record<string, unknown> };
    expect(ins.row).toMatchObject({ status: 'streaming', text: '', author_kind: 'foo' });
    const fooId = String(ins.row.id);
    const deltas = x.patches
      .filter((p) => p.event === 'message:delta')
      .map((p) => p.payload as { messageId: string; seq: number; append: string });
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.every((d) => d.messageId === fooId)).toBe(true);
    expect(deltas.map((d) => d.seq)).toEqual(deltas.map((_, i) => i + 1));
    expect(
      deltas
        .map((d) => d.append)
        .join('')
        .trim(),
    ).toBe(say);
    expect(x.message(fooId)).toMatchObject({ status: 'complete', text: say });
    expect(x.message(id)).toMatchObject({ status: 'complete', badge: null });
    expect(setsOf(x, id, 'badge')[0]).toBe('seen');
    expect((x.db.prepare('SELECT outcome FROM ai_turns').get() as { outcome: string }).outcome).toBe('ok');
  });
});

describe('Cut-off reply and Try again (04 §19.4)', () => {
  for (const kind of ['AI_SERVICE_DOWN', 'AI_TIMEOUT'] as const) {
    it(`${kind} · foo message failed; reply.retry re-runs the turn and the reply lands`, async () => {
      const x = harness({ script: [intake('', { error: kind }), intake(envelope('Back again: it is sunny.'))], settings: verified() });
      const id = x.userSays('weather?');
      await x.idle();
      const [failed] = fooMessages(x);
      expect(failed).toMatchObject({ status: 'failed', text: '' });
      expect(x.message(id).badge).toBeNull();
      const t1 = x.db.prepare('SELECT outcome, error_kind FROM ai_turns').all();
      expect(t1).toEqual([{ outcome: kind === 'AI_TIMEOUT' ? 'timeout' : 'error', error_kind: kind }]);

      x.send('reply.retry', { messageId: String(failed!.id) });
      await x.idle();
      const ok = fooMessages(x).filter((m) => m.status === 'complete');
      expect(ok.map((m) => m.text)).toEqual(['Back again: it is sunny.']);
      expect(count(x, 'ai_turns')).toBe(2);
      expect(x.turnsJsonl().filter((t) => t.purpose === 'intake')).toHaveLength(2);
    });
  }

  it('reply.retry on an unknown message does nothing', async () => {
    const x = harness({ script: [], settings: verified() });
    x.send('reply.retry', { messageId: 'm_nope' });
    await x.idle();
    expect(count(x, 'ai_turns')).toBe(0);
  });
});

describe('Languages pass through', () => {
  for (const [lang, text, reply] of [
    ['hi', 'कल मौसम कैसा रहेगा?', 'कल धूप रहेगी।'],
    ['pa', 'ਕੱਲ੍ਹ ਮੌਸਮ ਕਿਹੋ ਜਿਹਾ ਹੋਵੇਗਾ?', 'ਕੱਲ੍ਹ ਧੁੱਪ ਹੋਵੇਗੀ।'],
  ] as const) {
    it(`${lang} · the message reaches the AI as written and the reply lands`, async () => {
      const x = harness({
        script: [intake(envelope(reply), { match: { purpose: 'intake', promptIncludes: text } })],
        settings: verified(),
      });
      const id = x.userSays(text);
      await x.idle();
      expect(x.message(id)).toMatchObject({ lang, status: 'complete' });
      expect(fooMessages(x).map((m) => m.text)).toEqual([reply]);
    });
  }
});
