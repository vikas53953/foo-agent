// Spec: 05-2 §5.5.3 (scope "how long this yes lasts": shown only for letting a helper use an app, calendar adds and email
// moves; hidden on every hard-limit card, which shows "I'll always ask for this one."), 08-2 §9.5 (`once` single use; `chat`
// a rule for this chat; `always` a `Rule` in settings.rules; rules never match hard limits, payments, new recipients, groups
// or personal attachments; rules apply only to use_app, calendar_write and mail_organise), 08-1 §3.2 (`card:approve` scope →
// SCOPE_NOT_ALLOWED), 08-2 §9.7 (`matchRule` / `addRule` / `removeRule`, RULE_NOT_ALLOWED), 08-0 §G.4 (activity `changed`
// rule_added | rule_removed), X-03, X-147. CR-0009 G-M5-01 ("For this chat" ends when foo restarts or at 11:59 PM local
// today, whichever comes first: so it lives in memory, never in settings.json), G-M5-02 (no scope for email moves in v1),
// G-M5-21 (a use_app rule matches `fields.app`, 08-5 §3.3).
import { fail, ok, type Result } from '../../shared/errors';
import type { ActivityOpRow } from '../../engine/protocol';
import type { ApprovalFields, ApprovalScope, ApprovalVerb, Rule } from '../../shared/types';

/** The verbs a scope (and so a rule) may cover (08-0 §G.3; approvals CHECK `scope IS NULL OR scope='once' OR verb IN (…)`). */
export const SCOPED_VERBS: readonly ApprovalVerb[] = ['use_app', 'calendar_write'];

/** The scope segments a card shows: all three only on a scoped verb that is not a hard limit; else just once (hidden). */
export function scopesFor(verb: ApprovalVerb, hardLimit: boolean): ApprovalScope[] {
  return !hardLimit && SCOPED_VERBS.includes(verb) ? ['once', 'chat', 'always'] : ['once'];
}

/** `card:approve` check: chat / always only where the card offers them (else SCOPE_NOT_ALLOWED, nothing written). */
export function checkScope(verb: ApprovalVerb, hardLimit: boolean, scope: ApprovalScope): Result<ApprovalScope> {
  return scopesFor(verb, hardLimit).includes(scope) ? ok(scope) : fail('SCOPE_NOT_ALLOWED');
}

export interface RuleSubject {
  verb: ApprovalVerb;
  fields: ApprovalFields;
  hardLimit: boolean;
}

/** The match of the rule a card's scope adds (08-2 §9.5 `match: { app?, calendarId? }`); RULE_NOT_ALLOWED when none fits. */
export function ruleMatch(s: RuleSubject): Result<{ verb: Rule['verb']; match: Rule['match'] }> {
  if (s.hardLimit || !SCOPED_VERBS.includes(s.verb)) return fail('RULE_NOT_ALLOWED');
  if (s.verb === 'calendar_write') return ok({ verb: 'calendar_write', match: { calendarId: 'primary' } });
  if (!s.fields.app) return fail('RULE_NOT_ALLOWED');
  return ok({ verb: 'use_app', match: { app: s.fields.app } });
}

const sameMatch = (a: Rule['match'], b: Rule['match']) => a.app === b.app && a.calendarId === b.calendarId;

/** A "For this chat" rule: kept in memory only (G-M5-01), so a restart clears it. */
export interface ChatRule {
  rule: Rule;
  chatId: string;
  until: number;
}

/**
 * 08-2 §9.7 `matchRule`: the rule that lets this approval skip its card, or null. Never for a hard limit or a verb outside
 * use_app / calendar_write (payments, sends, new recipients, groups and personal data are all hard limits, 08-2 §9.2).
 */
export function matchRule(
  rules: readonly Rule[],
  chatRules: readonly ChatRule[],
  s: RuleSubject & { chatId: string },
  now: number,
): Rule | null {
  const m = ruleMatch(s);
  if (!m.ok) return null;
  const hit = (r: Rule) => r.verb === m.value.verb && sameMatch(r.match, m.value.match);
  return rules.find(hit) ?? chatRules.find((c) => c.chatId === s.chatId && now < c.until && hit(c.rule))?.rule ?? null;
}

/** 11:59 PM local today, as the end of a "For this chat" rule (05-2 §5.5.3; G-M5-01): the next local midnight. */
export function endOfLocalDay(now: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const guess = Date.UTC(n('year'), n('month') - 1, n('day') + 1);
  // Shift by the zone's offset at that instant so the result is 00:00 local time (as nextMonthStart in jobCards.ts).
  const local = new Date(new Date(guess).toLocaleString('en-US', { timeZone })).getTime();
  const utc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return guess - (local - utc);
}

/** 08-0 §G.4 `changed` / rule_added | rule_removed (08-2 §9.5 "J21 Rules I follow"); a "For this chat" rule is card_chat. */
export function ruleActivity(
  event: 'rule_added' | 'rule_removed',
  rule: Rule,
  ctx: { chatId: string | null; chatTitle: string | null; jobId: string | null; approvalId: string | null; scope?: ApprovalScope },
): ActivityOpRow {
  return {
    kind: 'changed',
    event,
    actor: 'user',
    chatId: ctx.chatId,
    chatTitle: ctx.chatTitle,
    jobId: ctx.jobId,
    approvalId: ctx.approvalId,
    paymentId: null,
    routineId: null,
    summary: rule.text,
    toLabel: null,
    fromLabel: null,
    amountPaise: null,
    approvedHow: ctx.scope === 'chat' ? 'card_chat' : ctx.scope === 'always' ? 'card_always' : null,
    ruleText: rule.text,
    proofKind: null,
    proofRef: null,
    outcome: 'done',
    fields: { ruleId: rule.id, verb: rule.verb, match: rule.match },
  };
}

/** 08-2 §9.7 `addRule`: an `always` rule joins settings.rules once (an equal rule is not added twice). */
export function addRule(rules: readonly Rule[], rule: Rule): Rule[] {
  return rules.some((r) => r.verb === rule.verb && sameMatch(r.match, rule.match)) ? [...rules] : [...rules, rule];
}

/** 08-2 §9.7 `removeRule` (Settings → Permissions "Rules I follow", M13). */
export function removeRule(rules: readonly Rule[], ruleId: string): Rule[] {
  return rules.filter((r) => r.id !== ruleId);
}
