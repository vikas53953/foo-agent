// Spec: project testing rule §4–10 (Vikas 2026-10-21); CR-0054 (batch 1); Vikas 2026-10-27 (the release gate). Keeps the
// gate honest: a measured failure (👀 on a plain message, a step that did not happen) is "broken" whatever a reviewer says,
// a feature no journey reached is "not tested", a picture nobody reviewed blocks, and every round of a repeated journey
// counts on its own (pass^k, never a re-run until green). Also checks every gate journey names a feature and that each
// batch-1 feature has a journey.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkpoints, checkRows, featureVerdicts, GATE_FEATURES, knownRedFor, missingRuns } from '../../scripts/release-gate';

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

  it("the journey's own neverCss 👀 (CR-0066) is broken too", () => {
    const cps = checkpoints([run('B1-batch1', '/r/1-B1', [sent, reply({ ok: false, neverSeenMs: 2600 })])]);
    expect(cps.find((c) => c.kind === 'answer')!.measured).toMatch(/👀 showed on the user's message 2\.6 s/);
  });

  it('a feature with no journey is not tested, and an unreviewed picture is not a pass', () => {
    const cps = checkpoints([run('G2-chat', '/r/1-G2', [sent, reply({})])]);
    const v = featureVerdicts(cps, new Map());
    expect(v.find((f) => f.feature === 'chat')!.verdict).toBe('not-reviewed');
    expect(v.find((f) => f.feature === 'settings')!.verdict).toBe('not-tested');
  });

  it('any failed journey turns the gate red: a step no feature claims gets its own broken row', () => {
    const untagged = {
      dir: '/r/1-QA1',
      s: { journey: 'QA1', title: 'QA1', results: [{ i: 3, do: 'click', ok: false, error: 'gone' }] } as never,
    };
    const v = featureVerdicts(checkpoints([untagged]), new Map());
    expect(v.find((f) => f.feature === 'unassigned')).toMatchObject({ verdict: 'broken', broken: 1 });
    // No such row when every step has a feature.
    expect(featureVerdicts(checkpoints([run('G2-chat', '/r/1-G2', [sent])]), new Map()).map((f) => f.feature)).toEqual([...GATE_FEATURES]);
  });

  it('a known-red failure is named with its owner and fix on every round, and only for its own step', () => {
    const cps = checkpoints([
      run('B1-batch1', '/r/1-B1', [sent, reply({ ok: false, error: 'x' })]),
      run('B1-batch1', '/r/2-B1', [sent, reply({ ok: false, error: 'x' })]),
    ]);
    const known = [{ journey: 'B1-batch1', step: 1, bug: 'F30', owner: 'builder', fix: '#169' }];
    expect(cps.filter((c) => c.measured).map((c) => knownRedFor(c, known)?.bug)).toEqual(['F30', 'F30']);
    expect(knownRedFor(cps[0]!, [{ ...known[0]!, step: 7 }])).toBeUndefined();
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
  it('a sweep where every control did something counts as works without a reviewer', () => {
    const cps = checkpoints([
      run('G4', '/r/1-G4', [
        {
          i: 0,
          do: 'sweep',
          ok: true,
          feature: 'settings',
          controls: [{ tid: 'x', name: 'Dark', status: 'pass', effect: ['theme: dark'], issues: [] }],
        },
      ]),
    ]);
    expect(featureVerdicts(cps, new Map()).find((f) => f.feature === 'settings')!.verdict).toBe('works');
  });

  it('a round that left no record is broken for every feature it covers', () => {
    const runs = [run('G2-chat', '/r/1-G2', [sent, reply({})])];
    const missing = missingRuns(runs, [{ journey: 'G2-chat', features: ['chat', 'refusals'], count: 3 }]);
    expect(missing).toHaveLength(4);
    expect(featureVerdicts(missing, new Map()).find((f) => f.feature === 'refusals')!.verdict).toBe('broken');
  });

  it('a missing Windows shard or a skipped golden lane is not green', () => {
    const rows = checkRows([
      { name: 'Fast lane (ubuntu-latest)', conclusion: 'success' },
      { name: 'Full suite (windows-latest, shard 1/4)', conclusion: 'success' },
      { name: 'Golden lane (windows-latest)', conclusion: 'skipped' },
    ]);
    expect(rows.filter((r) => !r.green).map((r) => r.name)).toEqual([
      'Golden lane (windows-latest)',
      'Full suite (missing on this commit)',
      'Full suite (missing on this commit)',
      'Full suite (missing on this commit)',
    ]);
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

  it('the gate runs on the real AI only: the workflow sets FOO_REAL_AI_ONLY and nothing in the kit names the pretend AI', () => {
    const wf = readFileSync(join('.github', 'workflows', 'release-gate.yml'), 'utf8');
    expect(wf).toMatch(/FOO_REAL_AI_ONLY: '1'/);
    const code = wf.replace(/#.*$/gm, '');
    expect(code).not.toMatch(/FOO_FAKE_|FOO_TEST/);
    for (const id of ids) expect(JSON.stringify(load(id)), id).not.toMatch(/FOO_FAKE_|FOO_TEST/);
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

  it('the release needs the installed app, red-first and mutation, and every known-red entry names a real journey and owner', () => {
    const wf = readFileSync(join('.github', 'workflows', 'release-gate.yml'), 'utf8');
    expect(wf).toMatch(/needs: \[drive, review, red-first, mutation\]/);
    expect(wf).toMatch(/FOO_EXE="\$\{\{ steps\.install\.outputs\.exe \}\}"/);
    expect(wf).toMatch(/Uninstall foo and check it is gone/);
    const known = JSON.parse(readFileSync(join('test', 'real-pc', 'known-red.json'), 'utf8')) as Record<string, unknown>[];
    for (const k of known) {
      expect(() => load(String(k.journey)), JSON.stringify(k)).not.toThrow();
      for (const f of ['bug', 'owner', 'fix']) expect(k[f], `${f} in ${JSON.stringify(k)}`).toBeTruthy();
    }
  });
});
