// Spec: 08-3 §18.1 step 4 (AI-28, X-131): local confidence = mean of every token's `p` over all segments, weighted by the
// token's text length, tokens whose text starts with `[_` excluded; < 0.60 → "I heard…"; no speech = < 2 letters after
// trimming, or `result.language` 'nospeech' / absent. Step 2 (the whisper-cli command line, X-131 full JSON).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWhisperFull, whisperArgs, LOW_CONFIDENCE } from '../../../src/engine/voice/whisper';

const tok = (text: string, p: number) => ({ text, p, id: 1, t_dtw: -1, offsets: { from: 0, to: 0 } });
const doc = (language: string | undefined, segments: { text: string; tokens: ReturnType<typeof tok>[] }[]) => ({
  result: language === undefined ? {} : { language },
  transcription: segments.map((s) => ({ timestamps: { from: '00:00:00,000', to: '00:00:01,000' }, offsets: { from: 0, to: 1000 }, ...s })),
});

describe('whisper full JSON (08-3 §18.1 step 4)', () => {
  it('weights each token p by its text length and skips [_ tokens', () => {
    // "ab" (2 chars) at 0.9 and "cdef" (4 chars) at 0.3 → (1.8 + 1.2) / 6 = 0.5; [_BEG_] at 0.0 does not count.
    const r = parseWhisperFull(
      doc('en', [{ text: ' ab cdef', tokens: [tok('[_BEG_]', 0), tok('ab', 0.9), tok('cdef', 0.3), tok('[_TT_50]', 0)] }]),
    );
    expect(r).not.toBeNull();
    expect(r!.text).toBe('ab cdef');
    expect(r!.confidence).toBeCloseTo(0.5, 6);
    expect(r!.lowConfidence).toBe(true);
    expect(r!.noSpeech).toBe(false);
    expect(r!.language).toBe('en');
  });

  it('joins every segment and averages over all of them', () => {
    // 3 chars at 0.8 + 1 char at 0.4 → (2.4 + 0.4) / 4 = 0.7 → not low.
    const r = parseWhisperFull(doc('hi', [{ text: ' नमस', tokens: [tok('नमस', 0.8)] }, { text: ' े', tokens: [tok('x', 0.4)] }]))!;
    expect(r.text).toBe('नमस े');
    expect(r.confidence).toBeCloseTo(0.7, 6);
    expect(r.lowConfidence).toBe(false);
  });

  it('0.60 exactly is not low confidence', () => {
    expect(LOW_CONFIDENCE).toBe(0.6);
    expect(parseWhisperFull(doc('en', [{ text: ' hello', tokens: [tok('hello', 0.6)] }]))!.lowConfidence).toBe(false);
  });

  it('no speech: fewer than 2 letters, nospeech, or no language', () => {
    expect(parseWhisperFull(doc('en', [{ text: ' . ', tokens: [tok('.', 0.9)] }]))!.noSpeech).toBe(true);
    expect(parseWhisperFull(doc('en', [{ text: ' a', tokens: [tok('a', 0.9)] }]))!.noSpeech).toBe(true);
    expect(parseWhisperFull(doc('nospeech', [{ text: ' hello', tokens: [tok('hello', 0.9)] }]))!.noSpeech).toBe(true);
    expect(parseWhisperFull(doc(undefined, [{ text: ' hello', tokens: [tok('hello', 0.9)] }]))!.noSpeech).toBe(true);
    expect(parseWhisperFull(doc('en', []))!.noSpeech).toBe(true);
  });

  it('anything that is not whisper JSON → null', () => {
    expect(parseWhisperFull(null)).toBeNull();
    expect(parseWhisperFull({ transcription: 'x' })).toBeNull();
  });

  it('reads the captured whisper-cli fixture (G-M11-24: the fixture is binding for the field names)', () => {
    const fixture: unknown = JSON.parse(readFileSync(join(__dirname, '../../fixtures/whisper/output-full.json'), 'utf8'));
    const r = parseWhisperFull(fixture);
    expect(r).not.toBeNull();
    expect(typeof r!.confidence).toBe('number');
  });
});

describe('whisper-cli command line (08-3 §18.1 step 2)', () => {
  it('-m model -f wav -l auto -t min(4, cores − 1) -nt -ojf -of base', () => {
    expect(whisperArgs({ model: 'M', wav: 'W.wav', outBase: 'O', cores: 8 })).toEqual([
      '-m',
      'M',
      '-f',
      'W.wav',
      '-l',
      'auto',
      '-t',
      '4',
      '-nt',
      '-ojf',
      '-of',
      'O',
    ]);
    expect(whisperArgs({ model: 'M', wav: 'W.wav', outBase: 'O', cores: 3 })[7]).toBe('2');
    expect(whisperArgs({ model: 'M', wav: 'W.wav', outBase: 'O', cores: 1 })[7]).toBe('1');
  });
});
