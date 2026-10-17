// Spec: 08-1 §3.2 files:stage (`{ name; bytes }` ≤ 25 MB → `{ attachmentId }` `att_…`; `FILE_TOO_BIG`, `FILE_TYPE`), §3.1.4
// (attachments and voice notes go through files:stage, which writes to `{DATA}\data\inbox\` first), §4.1 storage map (inbox
// files `{attachmentId}-{safeName(name)}`; voice notes `{DATA}\data\voice\{messageId}.*`), §0.7.1 safeName, 08-5 §3.4
// `Attachment` (path under {DATA}, forward slashes as the seeds write it), 04-2 §22.6 limits.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileProblem, kindOf, MAX_FILE_BYTES, mimeOf, VOICE_EXT, extOf } from '../../shared/attachmentRules';
import { safeName } from '../../shared/safeName';
import type { Attachment } from '../../shared/types';

export type StageResult = { ok: true; attachment: Attachment } | { ok: false; reason: 'too_big' | 'type' };

/** Files staged in this run, by attachment id (a draft keeps its own copy of the list in the `drafts` row). */
export class Inbox {
  private staged = new Map<string, Attachment>();

  constructor(private readonly dataDir: string) {}

  stage(id: string, name: string, bytes: Uint8Array): StageResult {
    if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, reason: 'too_big' };
    const voice = (VOICE_EXT as readonly string[]).includes(extOf(name));
    const problem = voice ? null : fileProblem(name, bytes.byteLength);
    if (problem === 'too_big') return { ok: false, reason: 'too_big' };
    if (problem) return { ok: false, reason: 'type' };
    const rel = `data/inbox/${id}-${safeName(name)}`;
    mkdirSync(join(this.dataDir, 'data', 'inbox'), { recursive: true });
    writeFileSync(join(this.dataDir, rel), bytes);
    const attachment: Attachment = { id, name, mime: mimeOf(name), bytes: bytes.byteLength, path: rel, kind: kindOf(name) };
    this.staged.set(id, attachment);
    return { ok: true, attachment };
  }

  get(id: string): Attachment | undefined {
    return this.staged.get(id);
  }

  /** voice:submit: the staged recording becomes `data/voice/{messageId}.{ext}`; returns that path (relative to {DATA}). */
  moveToVoice(id: string, messageId: string): string | null {
    const a = this.staged.get(id);
    if (!a) return null;
    const rel = `data/voice/${messageId}.${extOf(a.name) || 'webm'}`;
    mkdirSync(join(this.dataDir, 'data', 'voice'), { recursive: true });
    renameSync(join(this.dataDir, a.path), join(this.dataDir, rel));
    this.staged.delete(id);
    return rel;
  }
}
