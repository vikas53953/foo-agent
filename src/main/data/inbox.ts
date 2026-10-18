// Spec: 08-1 §3.2 files:stage (`{ name; bytes }` ≤ 25 MB → `{ attachmentId }` `att_…`; `FILE_TOO_BIG`, `FILE_TYPE`), §3.1.4
// (attachments and voice notes go through files:stage, which writes to `{DATA}\data\inbox\` first), §4.1 storage map (inbox
// files `{attachmentId}-{safeName(name)}`; voice notes `{DATA}\data\voice\{messageId}.*`), §0.7.1 safeName, 08-5 §3.4
// `Attachment` (path under {DATA}, forward slashes as the seeds write it), 04-2 §22.6 limits, §22.1 / 08-3 §18.1 (the
// recorder's WebM/Opus file is staged, then voice:submit makes it a voice note).
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileProblem, kindOf, MAX_FILE_BYTES, mimeOf, extOf } from '../../shared/attachmentRules';
import { safeName } from '../../shared/safeName';
import type { Attachment } from '../../shared/types';

export type StageResult = { ok: true; attachment: Attachment } | { ok: false; reason: 'too_big' | 'type' };

/** The names the composer's recorder stages under (renderer composer/voice.ts `voiceFileName`) and their mime. */
const RECORDING_MIME: Readonly<Record<string, string>> = { 'voice.webm': 'audio/webm', 'voice.ogg': 'audio/ogg' };

/** A recorder file: its own name and the container's header (WebM's EBML magic, Ogg's "OggS"), as MediaRecorder writes. */
export function isRecorderFile(name: string, bytes: Uint8Array): boolean {
  const starts = (...xs: number[]) => xs.every((x, i) => bytes[i] === x);
  if (name === 'voice.webm') return starts(0x1a, 0x45, 0xdf, 0xa3);
  if (name === 'voice.ogg') return starts(0x4f, 0x67, 0x67, 0x53);
  return false;
}

/**
 * Files staged in this run, by attachment id (a draft keeps its own copy of the list in the `drafts` row). Review S4: only
 * the recorder's own staging takes the voice exception to the §22.6 type check, and only such a recording, with its voice
 * kind and mime, may become a voice note.
 */
export class Inbox {
  private staged = new Map<string, Attachment>();
  private recordings = new Set<string>();

  constructor(private readonly dataDir: string) {}

  stage(id: string, name: string, bytes: Uint8Array): StageResult {
    if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, reason: 'too_big' };
    const recording = isRecorderFile(name, bytes);
    const problem = recording ? null : fileProblem(name, bytes.byteLength);
    if (problem === 'too_big') return { ok: false, reason: 'too_big' };
    if (problem) return { ok: false, reason: 'type' };
    const rel = `data/inbox/${id}-${safeName(name)}`;
    mkdirSync(join(this.dataDir, 'data', 'inbox'), { recursive: true });
    writeFileSync(join(this.dataDir, rel), bytes);
    const mime = recording ? RECORDING_MIME[name]! : mimeOf(name);
    const attachment: Attachment = { id, name, mime, bytes: bytes.byteLength, path: rel, kind: kindOf(name) };
    this.staged.set(id, attachment);
    if (recording) this.recordings.add(id);
    return { ok: true, attachment };
  }

  get(id: string): Attachment | undefined {
    return this.staged.get(id);
  }

  /** Staged in this run by the recorder (name and header checked at staging), still with its voice mime. */
  isRecording(id: string): boolean {
    const a = this.staged.get(id);
    return !!a && this.recordings.has(id) && RECORDING_MIME[a.name] === a.mime && a.mime.startsWith('audio/');
  }

  /**
   * voice:submit: the staged recording becomes `data/voice/{messageId}.{ext}`; returns that path (relative to {DATA}), or
   * null when `id` is not a recording this flow staged (a staged PDF or photo never becomes a voice note).
   */
  moveToVoice(id: string, messageId: string): string | null {
    const a = this.staged.get(id);
    if (!a || !this.isRecording(id)) return null;
    const rel = `data/voice/${messageId}.${extOf(a.name)}`;
    mkdirSync(join(this.dataDir, 'data', 'voice'), { recursive: true });
    renameSync(join(this.dataDir, a.path), join(this.dataDir, rel));
    this.staged.delete(id);
    this.recordings.delete(id);
    return rel;
  }
}
