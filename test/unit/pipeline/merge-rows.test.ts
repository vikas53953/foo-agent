// Spec: docs/build-method.md §3 (shared files); retro lever 1. scripts/merge-rows.ts settles the files every ticket
// appends to, and stops on a row or key changed differently on both sides.
import { describe, expect, it } from 'vitest';
import { mergeJson, mergeRows, mergeText, traceKey } from '../../../scripts/merge-rows';

const H = 'ts\tdecision';

describe('row merge', () => {
  it('keeps both sides appended rows: ours first, then theirs', () => {
    const r = mergeRows(`${H}\na\n`, `${H}\na\nb\n`, `${H}\na\nc\n`);
    expect(r).toEqual({ ok: true, text: `${H}\na\nb\nc\n` });
  });

  it('a row one side removed or changed goes; the change stays', () => {
    const r = mergeRows(`${H}\na\nb\n`, `${H}\na\nb2\n`, `${H}\na\nb\nc\n`);
    expect(r).toEqual({ ok: true, text: `${H}\na\nb2\nc\n` });
  });

  it('the same row added on both sides appears once', () => {
    expect(mergeRows(`${H}\n`, `${H}\nx\n`, `${H}\nx\n`)).toEqual({ ok: true, text: `${H}\nx\n` });
  });

  it('a file added on both sides (no base) merges', () => {
    expect(mergeRows('', `${H}\nx\n`, `${H}\ny\n`)).toEqual({ ok: true, text: `${H}\nx\ny\n` });
  });

  it('CRLF reads like LF', () => {
    expect(mergeRows(`${H}\r\na\r\n`, `${H}\r\na\r\nb\r\n`, `${H}\na\n`)).toEqual({ ok: true, text: `${H}\na\nb\n` });
  });

  it('a header changed differently on both sides is a clash', () => {
    expect(mergeRows(`${H}\n`, `${H}\tx\n`, `${H}\ty\n`)).toEqual({ ok: false, clashes: ['header changed on both sides'] });
  });
});

describe('trace.csv', () => {
  const head = 'R,J,AT / ART / PERF,UX step,BP ref,Spec §,Test file,Milestone,Status';
  const row = (id: string, file: string, status: string) => `,"J10, J12",${id},,,10-1 §B,${file},M5,${status}`;

  it('the row identity ignores the test file and status, and reads quoted cells', () => {
    expect(traceKey(row('AT-1', 'a.ts', 'live'))).toBe(traceKey(row('AT-1', 'b.ts', 'pending')));
    expect(traceKey(row('AT-1', 'a.ts', 'live'))).not.toBe(traceKey(row('AT-2', 'a.ts', 'live')));
  });

  it('one side flips a row to live while the other adds rows: both land', () => {
    const base = `${head}\n${row('AT-1', 'a.ts', 'pending')}\n`;
    const ours = `${head}\n${row('AT-1', 'a.ts', 'live')}\n`;
    const theirs = `${head}\n${row('AT-1', 'a.ts', 'pending')}\n${row('AT-2', 'b.ts', 'pending')}\n`;
    expect(mergeText('csv', base, ours, theirs, 'spec/trace.csv')).toEqual({
      ok: true,
      text: `${head}\n${row('AT-1', 'a.ts', 'live')}\n${row('AT-2', 'b.ts', 'pending')}\n`,
    });
  });

  it('the same row changed differently on both sides is a clash', () => {
    const base = `${head}\n${row('AT-1', 'a.ts', 'pending')}\n`;
    const r = mergeText(
      'csv',
      base,
      `${head}\n${row('AT-1', 'a.ts', 'live')}\n`,
      `${head}\n${row('AT-1', 'b.ts', 'live')}\n`,
      'spec/trace.csv',
    );
    expect(r.ok).toBe(false);
  });
});

describe('JSON merge', () => {
  it('keys added on both sides land; a key one side deleted goes', () => {
    const base = { keys: { a: 'T1', b: 'T2' } };
    const r = mergeJson(base, { keys: { a: 'T1', b: 'T2', c: 'T3' } }, { keys: { b: 'T2', d: 'T4' } });
    expect(r).toEqual({ value: { keys: { b: 'T2', c: 'T3', d: 'T4' } }, clashes: [] });
  });

  it('a key changed differently on both sides is a clash, by path', () => {
    expect(mergeJson({ k: 'a' }, { k: 'b' }, { k: 'c' }).clashes).toEqual(['$.k changed on both sides']);
  });

  it('writes 2-space JSON with a final newline', () => {
    expect(mergeText('json', '{}', '{"a":1}', '{"b":2}')).toEqual({ ok: true, text: '{\n  "a": 1,\n  "b": 2\n}\n' });
  });
});
