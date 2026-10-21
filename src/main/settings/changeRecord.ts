// Spec: 08-1 §4.4.2 step 3 (settings:set change record: kind `changed`, event `cap_changed`, fields { path, old, new },
// actor 'user', approved_how 'user', outcome 'done'; changeId = the row's id), 06-3 §9.4 ("Changed your AI cap to ₹{1,500}"),
// 06-3 §14 C-21, 05-3 §5.21. M4 writes the AI-cap row only; CR-0043 (X-201) adds the paths foo may change by chat (08-0 §A.3),
// event `setting_changed`, actor 'foo' and approved_how 'none' for an AI op (06-3 §9.4 "Changed {Theme} to {Dark}").
import type { ActivityOpRow } from '../../engine/protocol';
import { formatInr } from '../../shared/format';
import { isChatSettingPath, settingRowLabel, settingValueLabel } from '../../shared/settingsByChat';

/** The activity row a saved `settings:set` writes for this path, or null when nothing is recorded for it yet. */
export function changeRecordRow(path: string, oldValue: unknown, newValue: unknown, actor: 'user' | 'foo' = 'user'): ActivityOpRow | null {
  if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return null;
  const capRow = path === 'money.aiCapPaise' && typeof newValue === 'number';
  const chatPath = isChatSettingPath(path) ? path : null;
  if (!capRow && !chatPath) return null;
  return {
    kind: 'changed',
    event: capRow ? 'cap_changed' : 'setting_changed',
    actor,
    chatId: null,
    chatTitle: null,
    jobId: null,
    approvalId: null,
    paymentId: null,
    routineId: null,
    summary: capRow
      ? `Changed your AI cap to ${formatInr(newValue)}`
      : `Changed ${settingRowLabel(chatPath!)} to ${settingValueLabel(chatPath!, newValue)}`,
    toLabel: null,
    fromLabel: null,
    amountPaise: capRow ? newValue : null,
    approvedHow: actor === 'foo' ? 'none' : 'user',
    ruleText: null,
    proofKind: null,
    proofRef: null,
    outcome: 'done',
    fields: { path, old: oldValue, new: newValue },
  };
}
