// M5-T4: 05-2 §5.5.3 (scope shown only for use_app, calendar_write; hidden on hard limits, "I'll always ask for this one."),
// 08-2 §9.5 (rules never match hard limits, payments, new recipients, groups or personal attachments; use_app,
// calendar_write and mail_organise only), §9.7 (matchRule / addRule / removeRule, RULE_NOT_ALLOWED), 08-1 §3.2
// (SCOPE_NOT_ALLOWED), 08-0 §A.2 (locks, SETTING_LOCKED), CR-0009 G-M5-01 ("For this chat" until restart or 11:59 PM),
// G-M5-02 (no scope for email moves), G-M5-24 (use_app rules match fields.app). The gate's own use of rules is AT-132
// (gate, engine), T7.
import { describe, expect, it } from 'vitest';
import { addRule, checkScope, endOfLocalDay, matchRule, removeRule, scopesFor } from '../../../src/main/approvals/rules';
import { settingLocked } from '../../../src/shared/settings';
import type { ApprovalVerb, Rule } from '../../../src/shared/types';
import { FIELDS, gateHarness, T0 } from './gateHarness';

const VERBS: ApprovalVerb[] = ['send', 'book', 'buy', 'pay', 'post', 'delete', 'share', 'switch', 'use_app', 'calendar_write'];

describe('scopes and rules (08-2 §9.5)', () => {
  it('scope segments only on use_app / calendar_write that are not a hard limit; SCOPE_NOT_ALLOWED otherwise', () => {
    for (const verb of VERBS) {
      const scoped = verb === 'use_app' || verb === 'calendar_write';
      expect(scopesFor(verb, false), verb).toEqual(scoped ? ['once', 'chat', 'always'] : ['once']);
      expect(scopesFor(verb, true), verb).toEqual(['once']);
      expect(checkScope(verb, false, 'once').ok).toBe(true);
      for (const s of ['chat', 'always'] as const)
        expect(checkScope(verb, false, s), `${verb} ${s}`).toEqual(
          scoped ? { ok: true, value: s } : { ok: false, error: { kind: 'SCOPE_NOT_ALLOWED' } },
        );
    }
  });

  it('AT-132 (rules, main) an "Always" app-use rule never skips a payment, hard-limit, send, book, post, delete or share card', () => {
    const h = gateHarness();
    const o = h.open({ verb: 'use_app', fields: FIELDS.use_app!, hardLimit: false, title: 'Let Trips use Calendar?' });
    expect(h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'always', resolvedBy: 'tap' })).toEqual({
      ok: true,
      value: { state: 'APPROVED' },
    });
    expect(h.rules).toEqual([
      expect.objectContaining({ verb: 'use_app', match: { app: 'calendar' }, text: 'Let Trips use Calendar?', source: 'card' }),
    ]);
    const activity = h.db.prepare("SELECT kind, event, approved_how, rule_text FROM activity WHERE event = 'rule_added'").all();
    expect(activity).toEqual([{ kind: 'changed', event: 'rule_added', approved_how: 'card_always', rule_text: 'Let Trips use Calendar?' }]);
    const chatId = h.chatId;
    // The same app again: skipped by the rule.
    expect(h.gate.ruleFor({ verb: 'use_app', fields: FIELDS.use_app!, hardLimit: false, chatId })?.verb).toBe('use_app');
    // Never for anything else, even with the app named, and never for a hard limit.
    for (const verb of VERBS.filter((v) => v !== 'use_app'))
      expect(h.gate.ruleFor({ verb, fields: { verb, app: 'calendar', irreversible: true }, hardLimit: true, chatId }), verb).toBeNull();
    expect(h.gate.ruleFor({ verb: 'use_app', fields: FIELDS.use_app!, hardLimit: true, chatId })).toBeNull();
    expect(h.gate.ruleFor({ verb: 'use_app', fields: { ...FIELDS.use_app!, app: 'gmail' }, hardLimit: false, chatId })).toBeNull();
  });

  it('"For this chat" holds in this chat until 11:59 PM today and lives in memory only (G-M5-01)', () => {
    const h = gateHarness();
    const o = h.open({
      verb: 'calendar_write',
      fields: FIELDS.calendar_write!,
      hardLimit: false,
      title: 'Add Train to Mumbai to your calendar?',
    });
    expect(h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'chat', resolvedBy: 'keyboard' }).ok).toBe(true);
    expect(h.rules).toEqual([]);
    expect(h.approval(o.approvalId)).toMatchObject({ scope: 'chat', approved_via: 'card', approved_at: T0 });
    const s = { verb: 'calendar_write' as const, fields: FIELDS.calendar_write!, hardLimit: false };
    expect(h.gate.ruleFor({ ...s, chatId: h.chatId })?.match).toEqual({ calendarId: 'primary' });
    expect(h.gate.ruleFor({ ...s, chatId: 'c_other' })).toBeNull();
    const midnight = endOfLocalDay(T0, 'Asia/Kolkata');
    expect(midnight).toBe(Date.parse('2026-10-17T00:00:00+05:30'));
    h.clock.now = midnight - 1;
    expect(h.gate.ruleFor({ ...s, chatId: h.chatId })).not.toBeNull();
    h.clock.now = midnight;
    expect(h.gate.ruleFor({ ...s, chatId: h.chatId })).toBeNull();
  });

  it('chat / always on a hard-limit or unscoped card: SCOPE_NOT_ALLOWED and nothing written', () => {
    const h = gateHarness();
    for (const verb of ['book', 'delete', 'share'] as const) {
      const o = h.open({ verb, fields: FIELDS[verb]! });
      for (const scope of ['chat', 'always'] as const)
        expect(h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope, resolvedBy: 'tap' })).toEqual({
          ok: false,
          error: { kind: 'SCOPE_NOT_ALLOWED' },
        });
      expect(h.approval(o.approvalId).state).toBe('PENDING');
    }
    // A use_app card with no app to match: RULE_NOT_ALLOWED (G-M5-24).
    const o = h.open({ verb: 'use_app', fields: { verb: 'use_app', irreversible: false }, hardLimit: false });
    expect(h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'always', resolvedBy: 'tap' })).toEqual({
      ok: false,
      error: { kind: 'RULE_NOT_ALLOWED' },
    });
    expect(h.rules).toEqual([]);
  });

  it('addRule keeps one rule per match; removeRule drops it', () => {
    const r: Rule = { id: 'rule_1', verb: 'use_app', match: { app: 'gmail' }, text: 'x', createdAt: T0, source: 'card' };
    const once = addRule([], r);
    expect(addRule(once, { ...r, id: 'rule_2' })).toEqual([r]);
    expect(removeRule(once, 'rule_1')).toEqual([]);
    expect(
      matchRule(
        once,
        [],
        { verb: 'use_app', fields: { verb: 'use_app', app: 'gmail', irreversible: false }, hardLimit: false, chatId: 'c' },
        T0,
      ),
    ).toEqual(r);
  });

  it('settings locks (08-0 §A.2): send/book/pay/delete/share never always; post stays never', () => {
    for (const a of ['send', 'book', 'pay', 'delete', 'share']) {
      expect(settingLocked(`permissions.actions.${a}`, 'always'), a).toBe(true);
      expect(settingLocked(`permissions.actions.${a}`, 'ask'), a).toBe(false);
      expect(settingLocked(`permissions.actions.${a}`, 'never'), a).toBe(false);
    }
    expect(settingLocked('permissions.actions.post', 'ask')).toBe(true);
    expect(settingLocked('permissions.actions.post', 'never')).toBe(false);
    for (const a of ['read', 'drafts', 'calendar']) expect(settingLocked(`permissions.actions.${a}`, 'always')).toBe(false);
    expect(settingLocked('permissions.apps.whatsapp', 'always')).toBe(false);
  });
});
