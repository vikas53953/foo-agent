// Spec: 08-3 §18.1 step 2 (this PC: WebM → 16 kHz mono WAV, `whisper-cli.exe -m … -f … -l auto -t {min(4, cores − 1)} -nt
// -ojf -of …`, full JSON X-131, 60 s timeout), step 4 (AI-28 confidence and the no-speech rule), 08-1 §1 process table
// (`whisper-cli.exe`: engine, ≤ 1 at a time, killed after 60 s). G-M11-24: the field names follow the captured fixture
// `test/fixtures/whisper/output-full.json` (whisper.cpp examples/cli output_json, `full = true`).
import { join } from 'node:path';

export const WHISPER_TIMEOUT_MS = 60_000;
/** 08-3 §18.1 step 4: below this the user is asked "I heard: '{text}'. Right?". */
export const LOW_CONFIDENCE = 0.6;

export interface WhisperResult {
  text: string;
  /** Length-weighted mean token `p`; 0 when no token counts. */
  confidence: number;
  lowConfidence: boolean;
  noSpeech: boolean;
  /** whisper's detected language (`result.language`), or null. */
  language: string | null;
}

interface Token {
  text?: unknown;
  p?: unknown;
}
interface Segment {
  text?: unknown;
  tokens?: unknown;
}

const letters = (s: string): number => (s.match(/\p{L}/gu) ?? []).length;

/** Parses whisper-cli's `-ojf` output. Null when the shape is not whisper's. */
export function parseWhisperFull(json: unknown): WhisperResult | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as { result?: { language?: unknown }; transcription?: unknown };
  if (!Array.isArray(o.transcription)) return null;
  const segments = o.transcription as Segment[];
  let weighted = 0;
  let chars = 0;
  const parts: string[] = [];
  for (const s of segments) {
    if (typeof s.text === 'string') parts.push(s.text.trim());
    if (!Array.isArray(s.tokens)) continue;
    for (const t of s.tokens as Token[]) {
      if (typeof t.text !== 'string' || typeof t.p !== 'number' || t.text.startsWith('[_')) continue;
      weighted += t.p * t.text.length;
      chars += t.text.length;
    }
  }
  const text = parts.filter(Boolean).join(' ').trim();
  const confidence = chars > 0 ? weighted / chars : 0;
  const lang = typeof o.result?.language === 'string' && o.result.language ? o.result.language : null;
  const noSpeech = letters(text) < 2 || lang === null || lang === 'nospeech';
  return { text, confidence, lowConfidence: confidence < LOW_CONFIDENCE, noSpeech, language: lang };
}

/** The command line of 08-3 §18.1 step 2. One thread at least (a single-core PC would otherwise ask for 0). */
export function whisperArgs(a: { model: string; wav: string; outBase: string; cores: number }): string[] {
  const threads = Math.max(1, Math.min(4, a.cores - 1));
  return ['-m', a.model, '-f', a.wav, '-l', 'auto', '-t', String(threads), '-nt', '-ojf', '-of', a.outBase];
}

/** `{LOCAL}\voice-model\ggml-base.bin` (08-3 §18.1 step 2). */
export const modelPath = (LOCAL: string): string => join(LOCAL, 'voice-model', 'ggml-base.bin');

export interface ExecOutcome {
  exitCode: number | null;
  timedOut: boolean;
  spawnError?: string;
}

export interface WhisperDeps {
  /** Runs the bundled `whisper-cli.exe` with the args; killed at `timeoutMs` (ProcessHost + Job Object in the app). */
  exec(bin: string, args: string[], o: { timeoutMs: number; signal: AbortSignal }): Promise<ExecOutcome>;
  /** WebM/Opus → 16 kHz mono 16-bit WAV. Rejects when the note cannot be decoded. */
  decode(webmPath: string, wavPath: string): Promise<void>;
  readText(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  cores: number;
  bin: string;
  LOCAL: string;
  /** A temp folder for the WAV and the JSON (removed after the run). */
  tmpDir: string;
}

export type LocalOutcome =
  | ({ kind: 'ok' } & WhisperResult)
  | { kind: 'no_model' }
  | { kind: 'failed'; reason: 'decode' | 'timeout' | 'exit' | 'spawn' | 'parse' | 'cancelled' };

/** One local transcription (08-3 §18.1 step 2). Temp files are always removed. */
export async function transcribeLocal(webmPath: string, noteId: string, deps: WhisperDeps, signal: AbortSignal): Promise<LocalOutcome> {
  const model = modelPath(deps.LOCAL);
  if (!(await deps.exists(model))) return { kind: 'no_model' };
  const base = join(deps.tmpDir, `voice-${noteId}`);
  const wav = `${base}.wav`;
  const out = `${base}.json`;
  try {
    try {
      await deps.decode(webmPath, wav);
    } catch {
      return { kind: 'failed', reason: 'decode' };
    }
    if (signal.aborted) return { kind: 'failed', reason: 'cancelled' };
    const r = await deps.exec(deps.bin, whisperArgs({ model, wav, outBase: base, cores: deps.cores }), {
      timeoutMs: WHISPER_TIMEOUT_MS,
      signal,
    });
    if (signal.aborted) return { kind: 'failed', reason: 'cancelled' };
    if (r.timedOut) return { kind: 'failed', reason: 'timeout' };
    if (r.spawnError !== undefined) return { kind: 'failed', reason: 'spawn' };
    if (r.exitCode !== 0) return { kind: 'failed', reason: 'exit' };
    let parsed: WhisperResult | null = null;
    try {
      parsed = parseWhisperFull(JSON.parse(await deps.readText(out)));
    } catch {
      parsed = null;
    }
    return parsed ? { kind: 'ok', ...parsed } : { kind: 'failed', reason: 'parse' };
  } finally {
    await Promise.all([deps.remove(wav), deps.remove(out)].map((p) => p.catch(() => undefined)));
  }
}
