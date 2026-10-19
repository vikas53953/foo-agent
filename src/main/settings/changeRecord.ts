// Spec: 08-1 §4.4.2 step 3 (settings:set change record: kind `changed`, event `cap_changed`, fields { path, old, new },
// actor 'user', approved_how 'user', outcome 'done'; changeId = the row's id), 06-3 §9.4 ("Changed your AI cap to ₹{1,500}"),
// 06-3 §14 C-21, 05-3 §5.21. M4 writes the AI-cap row only; the other paths' rows land with the settings change-record work.
import type { ActivityOpRow } from '../../engine/protocol';
import { formatInr } from '../../shared/format';

/** The activity row a saved `settings:set` writes for this path, or null when M4 records nothing for it. */
export function changeRecordRow(path: string, oldValue: unknown, newValue: unknown): ActivityOpRow | null {
  if (path !== 'money.aiCapPaise' || typeof newValue !== 'number' || oldValue === newValue) return null;
  return {
    kind: 'changed',
    event: 'cap_changed',
    actor: 'user',
    chatId: null,
    chatTitle: null,
    jobId: null,
    approvalId: null,
    paymentId: null,
    routineId: null,
    summary: `Changed your AI cap to ${formatInr(newValue)}`,
    toLabel: null,
    fromLabel: null,
    amountPaise: newValue,
    approvedHow: 'user',
    ruleText: null,
    proofKind: null,
    proofRef: null,
    outcome: 'done',
    fields: { path, old: oldValue, new: newValue },
  };
}
