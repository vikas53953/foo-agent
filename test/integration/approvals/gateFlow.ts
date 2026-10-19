// Spec: 08-4 §28.1 (a request_approval the engine verifies from recorded tool results), 08-2 §9.4 (the card it opens). Shared
// fixtures for the T7 job tests (AT-110, AT-111 / AT-128 job halves, ART-03, ART-05a, ART-05b). Made-up places and sites only.
import type { ToolDef } from '../../../src/engine/tools/ToolLayer';
import type { Settings } from '../../../src/shared/settings';
import { jobIntake, step, tool, verified, type PlanStepIn } from '../jobs/jobHarness';

export const TABLE_PAGE = 'Table for 4 at Toit, Sat 8:00 PM. Total ₹2,400. Free cancellation until Sat 6:00 PM.';
export const BOOK_PLAN: PlanStepIn[] = [{ phraseKey: 'check_site', slots: { site: 'table.example' }, route: 'browser' }, { phraseKey: 'compare', slots: { what: 'tables' } }];

/** Test-only page read and the acting tools a fake AI tries directly (ART-05a). */
export function gateTools(log: string[] = []): ToolDef[] {
  const acting = (name: string, cls: ToolDef['actionClass']): ToolDef => ({
    name,
    actionClass: cls,
    args: 'to?: string',
    description: `Test only: ${name}.`,
    run: () => (log.push(name), Promise.resolve({ kind: 'ok', result: { done: true } })),
  });
  return [
    {
      name: 'fake.page',
      actionClass: 'read',
      args: 'site: string',
      description: 'Test only: read a made-up booking page.',
      run: (a) => Promise.resolve({ kind: 'ok', result: { site: String((a as { site?: string }).site ?? 'table.example'), text: TABLE_PAGE } }),
    },
    { ...acting('browser.submit', 'book'), run: () => (log.push('browser.submit'), Promise.resolve({ kind: 'ok', result: { text: 'Booked. Reference TBL42.' } })) },
    acting('fake.book', 'book'),
    acting('fake.pay', 'pay'),
    acting('fake.delete', 'delete'),
    acting('fake.post', 'post'),
    acting('gmail.send', 'send'),
    acting('browser.fillCard', 'prepare'),
  ];
}

/** The fake AI's request_approval for the table read by tool call `tc` (08-4 §25.3). */
export const bookRequest = (tc = 'tc_000001', payee: string | null = 'Toit') =>
  step({
    kind: 'request_approval',
    draft: {
      verb: 'book',
      fields: { verb: 'book', ...(payee === null ? {} : { payee }), siteDomain: 'table.example', partySize: 4, amountPaise: 1, cancelTerms: { refundable: true }, irreversible: false },
      evidence: [{ field: 'amountPaise', toolCallId: tc, quote: 'Total ₹2,400', ref: 'e7' }],
    },
    submitRef: 'e9',
  });

export const bookScript = (after = [step({ kind: 'done', result: 'Booked.', unverified: true })]) => [
  jobIntake(BOOK_PLAN, { title: 'Book a table' }),
  tool('fake.page', { site: 'table.example' }),
  bookRequest(),
  ...after,
];

/**
 * ART-05b: every permission chip at its most permissive allowed value (08-0 §A.2 locks: send / book / pay / delete / share
 * stop at ask, post stays never in v1) and every allowed "Always" rule (08-2 §9.5: use_app per app, calendar_write).
 */
export const permissive =
  (base = verified()) =>
  (s: Settings): Settings => {
    const v = base(s);
    const apps = ['gmail', 'calendar', 'contacts', 'whatsapp', 'browser', 'outlook'] as const;
    return {
      ...v,
      permissions: {
        ...v.permissions,
        actions: { read: 'always', drafts: 'always', calendar: 'always', send: 'ask', book: 'ask', pay: 'ask', post: 'never', delete: 'ask', share: 'ask' },
        apps: { gmail: 'always', calendar: 'always', contacts: 'always', whatsapp: 'always', browser: 'always', outlook: 'always' },
      },
      rules: [
        ...apps.map((app) => ({ id: `r_${app}`, verb: 'use_app' as const, match: { app }, text: `Use ${app}`, createdAt: 0, source: 'card' as const })),
        { id: 'r_cal', verb: 'calendar_write', match: { calendarId: 'primary' }, text: 'Add to calendar', createdAt: 0, source: 'card' },
      ],
    };
  };
