// Spec: project testing rule §4–10 (Vikas 2026-10-21); CR-0054 (batch 1); Vikas 2026-10-27 (the release gate). Keeps the
// gate honest: a measured failure (👀 on a plain message, a step that did not happen) is "broken" whatever a reviewer says,
// a feature no journey reached is "not tested", a picture nobody reviewed blocks, and every round of a repeated journey
// counts on its own (pass^k, never a re-run until green). Also checks every gate journey names a feature and that each
// batch-1 feature has a journey.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkpoints, featureVerdicts, GATE_FEATURES } from '../../scripts/release-gate';

const run = (journey: string, dir: string, results: object[]) => ({
  dir,
  s: { journey, title: journey, feature: 'chat', results } as never,
});
const sent = { i: 0, do: 'send', typed: 'hi', ok: true };
const reply = (extra: object) => ({ i: 1, do: 'waitReply', ok: true, shot: '02-hi.png', expect: 'a short reply', ...extra });

describe('release gate verdicts', () => {
  it('👀 measured on the user message is broken even when the reviewer says works', () => {
    const cps = checkpoints([
      run('G2-chat', '/r/1-G2', [
        sent,
        reply({
          ok: false,
          forbidden: { badge: 'seen', at: 2242 },
          watchShots: [{ at: 3000, mark: 3000, shot: '01-w.png', badges: ['seen'], thinking: true }],
        }),
      ]),
    ]);
    const works = new Map(cps.map((c) => [c.id, { id: c.id, verdict: 'works' as const, summary: '', problems: [], by: 'x' }]));
    const chat = featureVerdicts(cps, works).find((f) => f.feature === 'chat')!;
    expect(chat.verdict).toBe('broken');
    expect(cps.find((c) => c.kind === 'answer')!.measured).toMatch(/👀 showed on the user's message 2\.2 s after sending/);
    expect(cps.find((c) => c.kind === 'waiting')!.expect).toContain('"hi"');
  });

  it('a feature with no journey is not tested, and an unreviewed picture is not a pass', () => {
    const cps = checkpoints([run('G2-chat', '/r/1-G2', [sent, reply({})])]);
    const v = featureVerdicts(cps, new Map());
    expect(v.find((f) => f.feature === 'chat')!.verdict).toBe('not-reviewed');
    expect(v.find((f) => f.feature === 'settings')!.verdict).toBe('not-tested');
  });

  it('each round of a repeated journey is judged on its own (pass^k)', () => {
    const cps = checkpoints([
      run('G2-chat', '/r/1-G2', [sent, reply({})]),
      run('G2-chat', '/r/2-G2', [sent, reply({ ok: false, error: 'timeout' })]),
    ]);
    expect(cps.map((c) => c.id)).toEqual(['G2-chat#1', 'G2-chat·2#1']);
    const works = new Map([['G2-chat#1', { id: 'G2-chat#1', verdict: 'works' as const, summary: '', problems: [], by: 'x' }]]);
    expect(featureVerdicts(cps, works).find((f) => f.feature === 'chat')!.verdict).toBe('broken');
  });

  it('a sweep with a dead control is broken', () => {
    const cps = checkpoints([
      run('G4', '/r/1-G4', [
        {
          i: 0,
          do: 'sweep',
          ok: false,
          feature: 'settings',
          controls: [{ tid: 'x', name: 'Test now', status: 'fail', effect: ['NO VISIBLE EFFECT'], issues: [] }],
        },
      ]),
    ]);
    expect(featureVerdicts(cps, new Map()).find((f) => f.feature === 'settings')!.verdict).toBe('broken');
  });
});

describe('gate journeys', () => {
  const kit = join('test', 'real-pc');
  const ids = readFileSync(join(kit, 'gate.txt'), 'utf8').split(/\s+/).filter(Boolean);
  const load = (id: string) => {
    for (const d of ['gate', 'journeys'])
      try {
        return JSON.parse(readFileSync(join(kit, d, `${id}.json`), 'utf8')) as {
          feature?: string;
          steps: { feature?: string; shot?: string; expect?: string }[];
        };
      } catch {
        /* next */
      }
    throw new Error(`no journey file for ${id}`);
  };

  it('every gate journey exists, and every picture names its feature and what it should show', () => {
    for (const id of ids) {
      const j = load(id);
      for (const s of j.steps.filter((x) => x.shot)) {
        expect(GATE_FEATURES as readonly string[], `${id} ${s.shot}`).toContain(s.feature ?? j.feature);
        expect(s.expect, `${id} ${s.shot}`).toBeTruthy();
      }
    }
  });

  it('every batch-1 feature is reached by some gate journey', () => {
    const reached = new Set(
      ids.flatMap((id) => {
        const j = load(id);
        return j.steps.map((s) => s.feature ?? j.feature);
      }),
    );
    for (const f of GATE_FEATURES) expect([...reached], f).toContain(f);
  });
});
