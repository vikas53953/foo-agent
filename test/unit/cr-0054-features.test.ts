// Spec: CR-0054 (X-211): which features a build switches on (FOO_FEATURES, resources/features.json, a FOO_TEST run), and the
// composer's + menu rows and round button when photos, sign-in or voice are off.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attachMenuEntries } from '../../src/renderer/composer/AttachMenu';
import { roundButtonState } from '../../src/renderer/composer/roundState';
import { FEATURE_IDS, FEATURES, parseFeatureFile, resolveFeatures } from '../../src/shared/features';

const BATCH_1 = ['install', 'ai', 'name', 'chat', 'settings'];
const file = (on: string[]) => () => JSON.stringify({ on });

describe('CR-0054 · which features are on', () => {
  it('34 features, 7 batches of at most 5, batch 1 = install, ai, name, chat, settings', () => {
    expect(FEATURE_IDS).toHaveLength(34);
    expect(new Set(FEATURE_IDS).size).toBe(34);
    for (let b = 1; b <= 7; b++) expect(FEATURES.filter((f) => f.batch === b).length).toBeLessThanOrEqual(5);
    expect(FEATURES.filter((f) => f.batch === 1).map((f) => f.id)).toEqual(BATCH_1);
  });

  it('the shipped resources/features.json is batch 1', () => {
    expect(parseFeatureFile(readFileSync(join(__dirname, '../../resources/features.json'), 'utf8'))).toEqual(BATCH_1);
  });

  it('a real run reads the file; no file = every feature', () => {
    expect(resolveFeatures({}, false, file(['chat', 'ai']))).toEqual(['ai', 'chat']);
    expect(resolveFeatures({}, false, () => null)).toEqual([...FEATURE_IDS]);
  });

  it('a broken file or an unknown id switches batch 1 on, never nothing', () => {
    expect(resolveFeatures({}, false, () => '{not json')).toEqual(BATCH_1);
    expect(resolveFeatures({}, false, file(['chat', 'teleport']))).toEqual(BATCH_1);
  });

  it('FOO_FEATURES wins: all, a list, or shipped (the file, even in a FOO_TEST run)', () => {
    expect(resolveFeatures({ FOO_FEATURES: 'all' }, false, file(['chat']))).toEqual([...FEATURE_IDS]);
    expect(resolveFeatures({ FOO_FEATURES: 'chat, memory' }, true, () => null)).toEqual(['chat', 'memory']);
    expect(resolveFeatures({ FOO_FEATURES: 'shipped' }, true, file(['chat']))).toEqual(['chat']);
  });

  it('a FOO_TEST run with no FOO_FEATURES has every feature on', () => {
    expect(resolveFeatures({}, true, file(['chat']))).toEqual([...FEATURE_IDS]);
  });
});

describe('CR-0054 · composer with features off', () => {
  const noop = () => {};
  it('photos and sign-in off: the + menu keeps Emoji only', () => {
    expect(attachMenuEntries({ onEmoji: noop, hideSecret: true }).map((e) => e.id)).toEqual(['emoji']);
  });
  it('all on: the four rows stay', () => {
    expect(attachMenuEntries({ onFiles: noop, onEmoji: noop, onSecret: noop }).map((e) => e.id)).toEqual([
      'files',
      'screenshot',
      'secret',
      'emoji',
    ]);
  });
  it('voice off: an empty field shows Send, never the mic', () => {
    const f = { notSetUp: false, editing: false, recording: null, hasContent: false, replying: false, catchOpen: false, tooLong: false };
    expect(roundButtonState(f)).toBe('mic');
    expect(roundButtonState({ ...f, noVoice: true })).toBe('send');
    expect(roundButtonState({ ...f, noVoice: true, replying: true })).toBe('stop');
  });
});
