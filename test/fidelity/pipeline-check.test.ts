// CR-0072 (12 Nov 2026 build audit): the pipeline rules L1, L3, L4 and L6 hold as checks, not words.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkBatches,
  checkCaps,
  checkLayers,
  checkProof,
  checkQaSplit,
  parseBatches,
  parseLayers,
  type Batch,
} from '../../scripts/pipeline-check';

const b = (id: string, features: string, state: Batch['state'], usedOn = ''): Batch => ({
  id,
  features: features.split(','),
  state,
  usedOn,
});

describe('pipeline-check L1: batch scope', () => {
  it('the repo files pass: batch 1 active, its five features on', () => {
    const batches = parseBatches(readFileSync('docs/batches.tsv', 'utf8'));
    const on = (JSON.parse(readFileSync('resources/features.json', 'utf8')) as { on: string[] }).on;
    expect(checkBatches(batches, on)).toEqual([]);
  });

  it('a feature from a draft batch switched on fails', () => {
    const p = checkBatches([b('B1', 'chat', 'active'), b('B2', 'jobs', 'draft')], ['chat', 'jobs']);
    expect(p.join()).toMatch(/"jobs" is switched on/);
  });

  it('batch 2 cannot be active until batch 1 is done and was used', () => {
    expect(checkBatches([b('B1', 'chat', 'done'), b('B2', 'jobs', 'active')], []).join()).toMatch(/B1 is not done with a used_on/);
    expect(checkBatches([b('B1', 'chat', 'done', '2026-11-20'), b('B2', 'jobs', 'active')], ['chat', 'jobs'])).toEqual([]);
  });

  it('two active batches fail', () => {
    expect(checkBatches([b('B1', 'a', 'active'), b('B2', 'b', 'active')], []).join()).toMatch(/exactly one active/);
  });
});

describe('pipeline-check L3: layers register', () => {
  const today = new Date('2026-11-12T12:00:00Z');
  const row = { layer: 'X', replaces: 'none', enforcer: 'ci', lastRan: '2026-11-10', state: 'running' };

  it('the repo register passes the per-PR check', () => {
    expect(checkLayers(parseLayers(readFileSync('docs/pipeline-layers.tsv', 'utf8')), today, false)).toEqual([]);
  });

  it('a running layer with no enforcer or no "replaces" fails', () => {
    expect(checkLayers([{ ...row, enforcer: '' }], today, false).join()).toMatch(/names no enforcer/);
    expect(checkLayers([{ ...row, replaces: '' }], today, false).join()).toMatch(/does not say what it replaces/);
  });

  it('weekly, a layer that has not run for 14 days must be run or retired', () => {
    expect(checkLayers([{ ...row, lastRan: '2026-10-28' }], today, true).join()).toMatch(/run it or retire it/);
    expect(checkLayers([{ ...row, lastRan: '2026-10-28' }], today, false)).toEqual([]);
    expect(checkLayers([{ ...row, lastRan: '', state: 'retired' }], today, true)).toEqual([]);
  });
});

describe('pipeline-check L4: builder never edits the QA bar', () => {
  it('app code plus a QA journey in one PR fails', () => {
    expect(checkQaSplit(['src/main/x.ts', 'test/real-pc/journeys/B1.json'], '').join()).toMatch(/QA-owned tests/);
    expect(checkQaSplit(['src/main/x.ts', 'test/qa-explore/f30.test.ts'], '').length).toBe(1);
  });

  it('either one alone passes, and a QA-Split trailer explains a joint change', () => {
    expect(checkQaSplit(['src/main/x.ts', 'test/unit/x.test.ts'], '')).toEqual([]);
    expect(checkQaSplit(['test/real-pc/gate.txt'], '')).toEqual([]);
    expect(checkQaSplit(['src/a.ts', 'test/qa/b.ts'], 'fix\n\nQA-Split: QA thread asked for the id rename')).toEqual([]);
  });
});

describe('pipeline-check L4: proof on ready PRs', () => {
  const proof = '## Proof\nmain 4e11747, record gate/4e11747/summary.json step 3, shot gate/4e11747/shots/1-hi.png';

  it('a ready app PR without proof fails; a draft or docs-only PR does not', () => {
    expect(checkProof(['src/a.ts'], 'Fixes the thing', false).length).toBe(1);
    expect(checkProof(['src/a.ts'], 'Fixes the thing', true)).toEqual([]);
    expect(checkProof(['docs/a.md'], '', false)).toEqual([]);
  });

  it('sha + record + picture passes, and so does an honest "pre-check only"', () => {
    expect(checkProof(['src/a.ts'], proof, false)).toEqual([]);
    expect(checkProof(['src/a.ts'], 'Proof: pre-check only (pretend AI)', false)).toEqual([]);
  });

  it('a picture alone is not proof', () => {
    expect(checkProof(['src/a.ts'], '## Proof\nshot.png', false).length).toBe(1);
  });
});

describe('pipeline-check L6: caps', () => {
  it('more than 5 open PRs, or a branch left from a closed PR, fails', () => {
    expect(checkCaps(6, [], []).join()).toMatch(/6 open PRs/);
    expect(checkCaps(2, ['claude/a', 'claude/b'], ['claude/a']).join()).toMatch(/1 branches left/);
    expect(checkCaps(5, ['claude/b'], ['claude/a'])).toEqual([]);
  });
});
