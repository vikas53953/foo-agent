// Spec: 08-2 §9.3 (`fields_hash` = sha256 of the RFC 8785 canonical JSON of ApprovalFields, 08-0 §E.7), X-113. CR-0009:
// one function for main's ApprovalGate (create, draft:update re-hash) and the engine's gate (liveTerms, second look).
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../shared/canon';
import type { ApprovalFields } from '../../shared/types';

export function fieldsHash(fields: ApprovalFields): string {
  return createHash('sha256').update(canonicalJson(fields), 'utf8').digest('hex');
}
