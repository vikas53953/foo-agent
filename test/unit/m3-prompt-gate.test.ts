// M3 streaming release gate (08-4 §25.5 item 2) driven by the fake clock: whole within 1.5 s; sentences after; never a
// partial sentence; a held sentence → rewrite → released or dropped; filters (§7.6 steps 1, 2, 4) before release.
import { describe, expect, it } from 'vitest';
import { ReleaseGate, type ReleaseMode } from '../../src/engine/prompt/releaseGate';
import { Redactor } from '../../src/engine/redact/Redactor';
import { FakeClock } from '../../src/shared/clock';

const flush = () => new Promise<void>((r) => setImmediate(r));

function setup(rewrite: (s: string) => Promise<string | null> = async () => null) {
  const clock = new FakeClock();
  const out: { text: string; mode: ReleaseMode; at: number }[] = [];
  let closed = 0;
  const rewrites: string[] = [];
  const redactor = new Redactor({ clock, log: () => {} });
  const gate = new ReleaseGate({
    clock,
    redactor,
    rewrite: (s) => {
      rewrites.push(s);
      return rewrite(s);
    },
    onRelease: (text, mode) => out.push({ text, mode, at: clock.now() }),
    onSayClosed: () => closed++,
  });
  return { clock, out, gate, rewrites, redactor, closed: () => closed };
}

describe('m3 ReleaseGate', () => {
  it('</say> within 1.5 s → the whole text at once (chat mode)', async () => {
    const { clock, out, gate, closed } = setup();
    gate.feed('<say>Hi Vikas. The train');
    clock.advance(500);
    expect(out).toEqual([]);
    gate.feed(' leaves at 9:00 AM.</say><act>{"decision":{"kind":"reply"}');
    await gate.done;
    expect(out.map((o) => [o.text, o.mode])).toEqual([['Hi Vikas. The train leaves at 9:00 AM.', 'whole']]);
    expect(closed()).toBe(1);
    clock.advance(5_000);
    expect(out).toHaveLength(1);
  });

  it('holds everything for 1.5 s, then releases complete sentences only', async () => {
    const { clock, out, gate } = setup();
    gate.feed('<say>First one. Second ');
    clock.advance(1_499);
    expect(out).toEqual([]);
    clock.advance(1);
    expect(out.map((o) => o.text)).toEqual(['First one. ']);
    expect(out[0]!.mode).toBe('sentence');
    gate.feed('one is lo');
    expect(out).toHaveLength(1);
    gate.feed('nger! Third');
    expect(out.map((o) => o.text)).toEqual(['First one. ', 'Second one is longer! ']);
    gate.feed(' at 3.5');
    expect(out).toHaveLength(2);
    gate.feed(' km</say>');
    await gate.done;
    expect(out.map((o) => o.text)).toEqual(['First one. ', 'Second one is longer! ', 'Third at 3.5 km']);
    expect(gate.releasedText).toBe('First one. Second one is longer! Third at 3.5 km');
  });

  it('danda and line breaks end sentences; a split closing tag is never shown', async () => {
    const { clock, out, gate } = setup();
    clock.advance(1_500);
    gate.feed('<say>ट्रेन 9 बजे है। ');
    gate.feed('Line one\n\nLine two</s');
    expect(out.map((o) => o.text)).toEqual(['ट्रेन 9 बजे है। ', 'Line one\n\n']);
    gate.feed('ay>');
    await gate.done;
    expect(out.map((o) => o.text)).toEqual(['ट्रेन 9 बजे है। ', 'Line one\n\n', 'Line two']);
  });

  it('mapped banned words and filler are filtered before release', async () => {
    const { clock, out, gate } = setup();
    clock.advance(1_500);
    gate.feed('<say>Great question! Your token is fine. ');
    gate.feed('</say>');
    await gate.done;
    expect(out.map((o) => o.text)).toEqual(['Your key is fine. ']);
  });

  it('a sentence with an unmapped word is held, rewritten, then released in order', async () => {
    let resolve!: (s: string | null) => void;
    const { clock, out, gate, rewrites } = setup(() => new Promise((r) => (resolve = r)));
    clock.advance(1_500);
    gate.feed('<say>One. The webhook broke. Three. ');
    expect(out.map((o) => o.text)).toEqual(['One. ']);
    expect(rewrites).toEqual(['The webhook broke. ']);
    gate.feed('Four.</say>');
    expect(out).toHaveLength(1);
    resolve('The link broke. ');
    await gate.done;
    expect(out.map((o) => o.text)).toEqual(['One. ', 'The link broke. ', 'Three. ', 'Four.']);
  });

  it('a failed rewrite (or one that keeps the word) drops the sentence', async () => {
    const a = setup(async () => null);
    a.clock.advance(1_500);
    a.gate.feed('<say>Fine. JSON is broken. End.</say>');
    await a.gate.done;
    expect(a.out.map((o) => o.text)).toEqual(['Fine. ', 'End.']);
    const b = setup(async (s) => s);
    b.clock.advance(1_500);
    b.gate.feed('<say>Fine. localhost is down. End.</say>');
    await b.gate.done;
    expect(b.out.map((o) => o.text)).toEqual(['Fine. ', 'End.']);
  });

  it('whole mode also rewrites or drops', async () => {
    const { out, gate } = setup(async () => 'All good now.');
    gate.feed('<say>The MCP link failed.</say>');
    await gate.done;
    expect(out).toEqual([{ text: 'All good now.', mode: 'whole', at: expect.any(Number) }]);
  });

  it('untagged text: the say ends at <act>', async () => {
    const { clock, out, gate } = setup();
    gate.feed('Hello');
    clock.advance(1_500);
    gate.feed(' there. More');
    expect(out.map((o) => o.text)).toEqual(['Hello there. ']);
    gate.feed('<act>{}</act>');
    await gate.done;
    expect(gate.releasedText).toBe('Hello there. More');
  });

  it('end() closes an unclosed say; nothing is released for an empty say', async () => {
    const a = setup();
    a.gate.feed('<say>Half a reply');
    a.gate.end();
    await a.gate.done;
    expect(a.out.map((o) => o.text)).toEqual(['Half a reply']);
    const b = setup();
    b.gate.feed('<say></say><act>{"decision":{"kind":"react","emoji":"👍"}}</act>');
    await b.gate.done;
    expect(b.out).toEqual([]);
    expect(b.gate.releasedText).toBe('');
  });

  it('registry values are hidden before release (step 4)', async () => {
    const { clock, out, gate, redactor } = setup();
    redactor.registry.add({ handle: 'h', value: 'zebra-quartz-77' });
    clock.advance(1_500);
    gate.feed('<say>Your code is zebra-quartz-77. Bye.</say>');
    await gate.done;
    await flush();
    expect(out.map((o) => o.text).join('')).toBe('Your code is [hidden]. Bye.');
  });
});
