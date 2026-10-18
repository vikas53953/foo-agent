// Spec: 08-2 §5.8 (finish checks the proof from recorded tool results, never from the AI's words: a confirmation code must
// appear verbatim in the pre-redaction result of `seenInToolCallId` of this job; email / sent_folder ids are re-fetched through
// the connector; a screenshot path must exist in this job's folder), 08-4 §26.11 (RAM results first, else the stored redacted
// result; a code that is also a secret → PROOF_INVALID; not found → done_unverified), AT-114, AT-115, AT-119, ART-11.
// M4 has no connectors (M8) or payments (M10): email, sent_folder, wa_delivered, calendar_event, receipt and read_source
// cannot be re-checked yet, so they finish `done_unverified` (the conservative side of Art. 11).
import path from 'node:path';
import { redactSecrets } from '../../shared/redactor';
import type { Proof } from '../../shared/schemas';

export interface ProofContext {
  /** This job's pre-redaction results kept in RAM (§26.11 item 1). */
  raw: ReadonlyMap<string, string>;
  /** This job's stored (redacted) result text of a tool call, or null when the call is not this job's. */
  stored(toolCallId: string): string | null;
  /** This job's folder `{DATA}\jobs\{id}`. */
  jobDir: string;
  exists(file: string): boolean;
}

export type ProofCheck = { ok: true } | { ok: false; why: 'missing' | 'not_found' | 'secret' | 'not_checkable' };

export function checkProof(proof: Proof | undefined, ctx: ProofContext): ProofCheck {
  if (!proof) return { ok: false, why: 'missing' };
  switch (proof.kind) {
    case 'confirmation': {
      if (redactSecrets(proof.code).hits > 0) return { ok: false, why: 'secret' };
      const text = ctx.raw.get(proof.seenInToolCallId) ?? ctx.stored(proof.seenInToolCallId);
      return text !== null && text !== undefined && text.includes(proof.code) ? { ok: true } : { ok: false, why: 'not_found' };
    }
    case 'emails_read': {
      if (proof.messageIds.length === 0 || proof.count !== proof.messageIds.length) return { ok: false, why: 'not_found' };
      const all = [...ctx.raw.values()];
      const seen = (id: string) => all.some((t) => t.includes(JSON.stringify(id)));
      return proof.messageIds.every(seen) ? { ok: true } : { ok: false, why: 'not_found' };
    }
    case 'screenshot': {
      const file = path.resolve(ctx.jobDir, proof.path);
      const inside = file.startsWith(path.resolve(ctx.jobDir) + path.sep);
      return inside && ctx.exists(file) ? { ok: true } : { ok: false, why: 'not_found' };
    }
    default:
      // TODO(M8, M10): re-fetch through the connector / payment record.
      return { ok: false, why: 'not_checkable' };
  }
}
