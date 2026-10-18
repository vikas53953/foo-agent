// Spec: 08-2 §5.5 (tool calls through the gate; X-113 idem_key = sha256(jobId|stepId|tool|canonicalJson(args)|approvalId), a
// repeat of the same side-effect call is refused IDEMPOTENT_REPEAT), 08-1 §4.3.4 (tool_calls.result ≤ 16 KB; args and result
// stored redacted), 08-4 §26.11 (the pre-redaction result stays in RAM for the proof check and is cleared at the end).
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../src/shared/clock';
import type { DbOp, MainLink } from '../../../src/engine/protocol';
import type { GateLogic } from '../../../src/engine/gate/GateLogic';
import { RAW_MAX_BYTES, ToolLayer, type ToolDef } from '../../../src/engine/tools/ToolLayer';

const SECRET = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD';
const openGate: GateLogic = { decide: () => 'EXECUTE' } as unknown as GateLogic;

function layer(tools: ToolDef[], gate: GateLogic = openGate) {
  const ops: DbOp[] = [];
  const link = {
    request: (_kind: string, payload: { ops: DbOp[] }) => {
      ops.push(...payload.ops);
      return Promise.resolve({ ok: true, value: {} });
    },
    send: () => undefined,
  } as unknown as MainLink;
  let n = 0;
  const l = new ToolLayer({
    link,
    clock: new FakeClock(),
    newId: () => `tc_${++n}`,
    tools: Object.fromEntries(tools.map((t) => [t.name, t])),
    gate,
    log: () => undefined,
  });
  const row = (id: string) => {
    const insert = ops.find((o) => o.op === 'insert' && (o.row as { id: string }).id === id) as Extract<DbOp, { op: 'insert' }>;
    const update = ops.find((o) => o.op === 'update' && o.id === id) as Extract<DbOp, { op: 'update' }> | undefined;
    return { ...insert.row, ...(update?.set ?? {}) } as Record<string, unknown>;
  };
  return { l, ops, row };
}

const def = (name: string, actionClass: ToolDef['actionClass'], result: unknown): ToolDef => ({
  name,
  actionClass,
  args: '',
  description: name,
  run: () => Promise.resolve({ kind: 'ok', result }),
});
const job = { id: 'j1', stepId: 's1', turnId: 't1' };
const signal = new AbortController().signal;

describe('ToolLayer', () => {
  it('the same side-effect call twice → the second is refused IDEMPOTENT_REPEAT and never runs', async () => {
    let runs = 0;
    const send: ToolDef = { ...def('x.send', 'send', { ok: 1 }), run: () => Promise.resolve({ kind: 'ok', result: (runs += 1) }) };
    const { l, row } = layer([send]);
    const a = await l.execute(job, { tool: 'x.send', args: { to: 'a' } }, signal);
    const b = await l.execute(job, { tool: 'x.send', args: { to: 'a' } }, signal);
    expect(a.outcome).toBe('ok');
    expect(b).toMatchObject({ outcome: 'error', errorKind: 'IDEMPOTENT_REPEAT' });
    expect(runs).toBe(1);
    expect(row(a.toolCallId).idem_key).toMatch(/^[0-9a-f]{64}$/);
    expect(row(b.toolCallId)).toMatchObject({ gate: 'blocked', outcome: 'error', error_kind: 'IDEMPOTENT_REPEAT' });
    // Different args are a different call.
    expect((await l.execute(job, { tool: 'x.send', args: { to: 'b' } }, signal)).outcome).toBe('ok');
  });

  it('a result over 16 KB is stored cut ({ cut: true, text }) and the RAM copy stays ≤ 16 KB', async () => {
    const big = 'a'.repeat(40_000);
    const { l, row } = layer([def('x.read', 'read', { big })]);
    const r = await l.execute(job, { tool: 'x.read', args: {} }, signal);
    const stored = row(r.toolCallId).result as { cut: boolean; text: string };
    expect(stored.cut).toBe(true);
    expect(Buffer.byteLength(stored.text, 'utf8')).toBeLessThanOrEqual(RAW_MAX_BYTES);
    expect(Buffer.byteLength(l.rawResult('j1', r.toolCallId)!, 'utf8')).toBeLessThanOrEqual(RAW_MAX_BYTES);
  });

  it('args and result are stored redacted; the RAM copy keeps the raw text for the proof check', async () => {
    const { l, row } = layer([def('x.read', 'read', { note: `key ${SECRET}` })]);
    const r = await l.execute(job, { tool: 'x.read', args: { q: SECRET } }, signal);
    const stored = row(r.toolCallId);
    expect(JSON.stringify(stored.args)).not.toContain(SECRET);
    expect(JSON.stringify(stored.result)).not.toContain(SECRET);
    expect(l.rawResult('j1', r.toolCallId)).toContain(SECRET);
  });

  it('a refused class (gate) is logged blocked and never runs', async () => {
    let ran = false;
    const send: ToolDef = { ...def('x.send', 'send', null), run: () => ((ran = true), Promise.resolve({ kind: 'ok', result: null })) };
    const { l, row } = layer([send], { decide: () => 'REFUSE' } as unknown as GateLogic);
    const r = await l.execute(job, { tool: 'x.send', args: {} }, signal);
    expect(ran).toBe(false);
    expect(row(r.toolCallId)).toMatchObject({ gate: 'blocked', outcome: 'error', error_kind: 'VALIDATION' });
  });

  it('clearJob drops the RAM results and the idem keys of that job only', async () => {
    const { l } = layer([def('x.send', 'send', 1), def('x.read', 'read', 2)]);
    const a = await l.execute(job, { tool: 'x.send', args: {} }, signal);
    const other = await l.execute({ ...job, id: 'j2' }, { tool: 'x.read', args: {} }, signal);
    l.clearJob('j1');
    expect(l.rawResults('j1').size).toBe(0);
    expect(l.rawResult('j2', other.toolCallId)).toBeDefined();
    expect(l.rawResult('j1', a.toolCallId)).toBeUndefined();
    expect((await l.execute(job, { tool: 'x.send', args: {} }, signal)).outcome).toBe('ok');
  });
});
