// Spec: 08-2 §9.4 (GateLogic.decide, exact order: permission row first (X-125) → helper → app → read → prepare → read-only
// offer → hard limit → always → calendar covered / rule → draft send → card), §9.2 (classes, rows, hard limits), §9.5 (rules
// never skip hard limits, payments, send/book/post/delete/share), 08-0 §A.2 (locks), AT-132 (gate half), Art. 3, 5.
import { describe, expect, it } from 'vitest';
import { createGate, type ActionClass, type GateCall, type GateJob } from '../../../src/engine/gate/GateLogic';
import type { Settings } from '../../../src/shared/settings';
import { settingsDefaults } from '../../../src/shared/settingsDefaults';
import type { ApprovalFields } from '../../../src/shared/types';

const NOW = Date.UTC(2026, 9, 19, 9, 0);

function gate(edit: (s: Settings) => void = () => undefined) {
  const s = structuredClone(settingsDefaults);
  edit(s);
  return createGate({ settings: () => s, now: () => NOW });
}
const job = (o: Partial<GateJob> = {}): GateJob => ({
  id: 'j1',
  intent: 'do',
  doVerbs: ['book', 'delete', 'pay', 'send'],
  ownerId: null,
  appAnswers: new Map(),
  ...o,
});
const call = (tool: string, cls: ActionClass, extra: Partial<GateCall> = {}): GateCall => ({ tool, cls, ...extra });
const freeBook: ApprovalFields = {
  verb: 'book',
  siteDomain: 'table.example',
  partySize: 4,
  cancelTerms: { refundable: true },
  irreversible: false,
};

describe('GateLogic.decide (08-2 §9.4)', () => {
  it('read and prepare run; a read-only job is only offered the action (Art. 3)', () => {
    const g = gate();
    expect(g.decide(job(), call('gmail.search', 'read'))).toEqual({ kind: 'EXECUTE' });
    expect(g.decide(job(), call('gmail.draft', 'prepare'))).toEqual({ kind: 'EXECUTE' });
    expect(g.decide(job({ intent: 'read_only', doVerbs: [] }), call('fake.book', 'book', { fields: freeBook }))).toEqual({
      kind: 'ASK_CHOICE',
      purpose: 'offer_action',
      cls: 'book',
    });
  });

  it('the permission row is read first: never → REFUSE(row), post never → HAND_BACK (X-125)', () => {
    const g = gate((s) => {
      s.permissions.actions.read = 'never';
      s.permissions.actions.delete = 'never';
    });
    expect(g.decide(job(), call('gmail.search', 'read'))).toEqual({ kind: 'REFUSE', row: 'read' });
    expect(g.decide(job({ intent: 'read_only' }), call('files.delete', 'delete'))).toEqual({ kind: 'REFUSE', row: 'delete' });
    expect(gate().decide(job(), call('x.post', 'post'))).toEqual({ kind: 'HAND_BACK' });
  });

  it('a helper job outside its allowed apps → REFUSE HELPER_NOT_ALLOWED (08-3 §17.6)', () => {
    const g = gate();
    const helper = job({ ownerId: 'h1', helperApps: { gmail: false, gcal: true, payments: false } });
    expect(g.decide(helper, call('gmail.search', 'read'))).toEqual({ kind: 'REFUSE', error: 'HELPER_NOT_ALLOWED' });
    expect(g.decide(helper, call('gcal.list', 'read'))).toEqual({ kind: 'EXECUTE' });
    expect(g.decide(helper, call('memory.search', 'read'))).toEqual({ kind: 'EXECUTE' });
    expect(g.decide(helper, call('browser.submit', 'pay', { fields: { verb: 'pay', irreversible: true } }))).toEqual({
      kind: 'REFUSE',
      error: 'HELPER_NOT_ALLOWED',
    });
  });

  it('app ask → "Can I use {app} for this?" once per job; Yes runs, Not this time refuses; app never refuses', () => {
    const g = gate((s) => {
      s.permissions.apps.outlook = 'never';
    });
    expect(g.decide(job(), call('whatsapp.read', 'read'))).toEqual({ kind: 'ASK_CHOICE', purpose: 'app_use', app: 'whatsapp' });
    expect(g.decide(job({ appAnswers: new Map([['whatsapp', true]]) }), call('whatsapp.read', 'read'))).toEqual({ kind: 'EXECUTE' });
    expect(g.decide(job({ appAnswers: new Map([['whatsapp', false]]) }), call('whatsapp.read', 'read'))).toEqual({
      kind: 'REFUSE',
      app: 'whatsapp',
    });
    expect(g.decide(job(), call('outlook.search', 'read'))).toEqual({ kind: 'REFUSE', app: 'outlook' });
    // A use_app rule for the app answers it.
    const ruled = gate((s) => {
      s.rules = [{ id: 'rule_1', verb: 'use_app', match: { app: 'whatsapp' }, text: 'x', createdAt: NOW, source: 'card' }];
    });
    expect(ruled.decide(job(), call('whatsapp.read', 'read'))).toEqual({ kind: 'EXECUTE' });
  });

  it('typing a phone or address is share_personal, not a plain prepare', () => {
    const g = gate();
    const fill = (field: string) => call('browser.fillPersonal', 'prepare', { args: { ref: 'e1', field } });
    expect(g.decide(job(), fill('name'))).toEqual({ kind: 'EXECUTE' });
    expect(g.decide(job(), fill('phone'))).toEqual({ kind: 'CARD', hard: true });
  });

  it('calendar: always runs; ask → card unless covered by a booking or a calendar_write rule', () => {
    expect(gate((s) => (s.permissions.actions.calendar = 'always')).decide(job(), call('gcal.create', 'calendar_write'))).toEqual({
      kind: 'EXECUTE',
    });
    const g = gate();
    expect(g.decide(job(), call('gcal.create', 'calendar_write'))).toEqual({ kind: 'CARD', hard: false });
    expect(g.decide(job(), call('gcal.create', 'calendar_write', { coveredByBooking: true }))).toEqual({ kind: 'EXECUTE' });
    const ruled = gate((s) => {
      s.rules = [{ id: 'rule_2', verb: 'calendar_write', match: { calendarId: 'primary' }, text: 'x', createdAt: NOW, source: 'card' }];
    });
    expect(ruled.decide(job(), call('gcal.create', 'calendar_write'))).toEqual({ kind: 'EXECUTE', approvedVia: 'rule' });
  });

  it('gmail.send / whatsapp.send go through the Draft card approval, never a fresh card', () => {
    expect(gate().decide(job(), call('gmail.send', 'send'))).toEqual({ kind: 'DRAFT_SEND' });
  });

  it('book: a free-cancel booking is a card without the hard line; no free cancel or a phone shared is a hard limit', () => {
    const g = gate();
    expect(g.decide(job(), call('browser.submit', 'book', { fields: freeBook }))).toEqual({ kind: 'CARD', hard: false });
    expect(g.decide(job(), call('browser.submit', 'book', { fields: { ...freeBook, cancelTerms: { refundable: false } } }))).toEqual({
      kind: 'CARD',
      hard: true,
    });
    expect(g.decide(job(), call('browser.submit', 'book', { fields: { ...freeBook, personalShared: ['phone'] } }))).toEqual({
      kind: 'CARD',
      hard: true,
    });
  });

  it('AT-132 (gate, engine) "Always" rules never skip payment, hard-limit, send, book, post, delete or share cards', () => {
    // Every rule a user can hold, and the most permissive rows the locks allow (08-0 §A.2).
    const g = gate((s) => {
      s.permissions.actions.calendar = 'always';
      s.rules = [
        ...(['gmail', 'calendar', 'contacts', 'whatsapp', 'browser', 'outlook'] as const).map((app, i) => ({
          id: `rule_a${i}`,
          verb: 'use_app' as const,
          match: { app },
          text: 'x',
          createdAt: NOW,
          source: 'card' as const,
        })),
        { id: 'rule_c', verb: 'calendar_write', match: { calendarId: 'primary' }, text: 'x', createdAt: NOW, source: 'card' },
        { id: 'rule_m', verb: 'mail_organise', match: {}, text: 'x', createdAt: NOW, source: 'card' },
      ];
    });
    const cases: [string, ActionClass, ApprovalFields | undefined][] = [
      ['browser.submit', 'pay', { verb: 'pay', amountPaise: 120_000, irreversible: true }],
      ['browser.submit', 'buy', { verb: 'buy', amountPaise: 99_900, irreversible: true }],
      ['browser.submit', 'book', { ...freeBook, cancelTerms: { refundable: false } }],
      ['browser.submit', 'book', freeBook],
      ['files.delete', 'delete', { verb: 'delete', irreversible: true }],
      ['browser.fillPersonal', 'share_personal', undefined],
      ['fake.switch', 'switch', undefined],
    ];
    for (const [tool, cls, fields] of cases) {
      const d = g.decide(job(), call(tool, cls, fields ? { fields } : {}));
      expect(d.kind, `${tool} ${cls}`).toBe('CARD');
    }
    expect(g.decide(job(), call('gmail.send', 'send'))).toEqual({ kind: 'DRAFT_SEND' });
    expect(g.decide(job(), call('x.post', 'post'))).toEqual({ kind: 'HAND_BACK' });
    // The hard ones say so on the card ("I'll always ask for this one.").
    expect(g.decide(job(), call('browser.submit', 'pay', { fields: cases[0]![2] }))).toEqual({ kind: 'CARD', hard: true });
  });
});
