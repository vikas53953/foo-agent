// ART-02c (10-2 §D, Article 2) and AT-085 (10-1 §B, J19): every error card has exactly one primary button, at most one
// secondary link and no banned word (07-2 R-03; 05-3 §5.20: the fix button only while the card is `asking`; `shown` cards
// such as "File too big" have none). The real ErrorCard and Spend-cap card render server-side with the words the runner
// builds from `errors.{kind}.*` (05-3 §5.20.2); every `errors.*` family in en-IN.json is rendered, so a kind added later
// is counted without editing this file. Fake names and amounts only (public repo).
import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BANNED } from '../../scripts/check-copy';
import { ErrorCard } from '../../src/renderer/cards/ErrorCard';
import { SpendCap } from '../../src/renderer/cards/SpendCap';
import buttonStyles from '../../src/renderer/ui/Button.module.css';
import { CARD_STATES } from '../../src/shared/cards';
import copy from '../../src/shared/copy/en-IN.json';
import { t, type CopyKey } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import type { CardRow, ErrorKind, ErrorPayload, FixAction } from '../../src/shared/types';

const T = Date.parse('2026-10-16T09:41:00+05:30');
const TIME = { at: T, timeZone: 'Asia/Kolkata', now: T };
const VARS = {
  AI: 'Claude',
  backup: 'ChatGPT',
  job: 'Goa stay',
  n: 3,
  of: 4,
  time: '3:00 PM',
  cap: '₹1,000',
  jobs: 2,
  routines: 4,
  agentName: 'foo',
  site: 'example.com',
  amount: '₹14,600',
  app: 'Gmail',
  calendar: 'calendar',
};

/**
 * Error card kinds with no words in en-IN.json yet, so nothing in M5 can show them (M-owner notes, 07-2 R-03 and 05-3
 * §5.20.2 rows; owners per plan §6). Each one is counted here as soon as its `errors.{kind}.*` keys land.
 */
export const LATER = [
  'J1 / J19.6 disk nearly full [ Open storage settings ] (M11 Windows)',
  'J2 AI sign-in window [ Reopen ] · Try again (M12 onboarding)',
  'J4 Gmail access denied [ Try again ] · Skip (M8 connectors; connection expired / revoked / rate limit are counted here since M8 T5)',
  'J9 site changed / site timed out (M9 browser; "all blocked" = errors.site_blocked, counted here)',
  'J10 card declined [ Try another card ] · Pay with UPI (M10 payments)',
  'J11 UPI declined [ Try again ] · Pay with card (M10 payments)',
  'J12 email or X post failed to send (M8 connectors; the Draft card failed state)',
  'J13 sign-in here, OTP, CAPTCHA (M9; SITE_CAPTCHA shows the Sign-in-here card, not an error card)',
  'J19.5 crash mid-payment, no button, Payment card goes CHECKING (M10; rendered below as a `shown` card)',
  'J19.6 clock wrong, browser broken, update failed, microphone blocked, no microphone, file too big (M11 / M14)',
];

type Words = Pick<ErrorPayload, 'variant' | 'kind' | 'whatHappened' | 'whatIsSafe' | 'button' | 'secondary'>;

const word = (key: string) => t(key as CopyKey, VARS);
const has = (key: string) => key in copy;
const ACTION: FixAction = { kind: 'retry' };

/** One card per copy variant of each `errors.{kind}` family: the base words, then `.no_reset` / `.paying` forms. */
function errorCases(): { name: string; words: Words; fix: boolean }[] {
  const families = [...new Set(Object.keys(copy).flatMap((k) => /^errors\.([a-z0-9_]+)\.what_happened$/.exec(k)?.[1] ?? []))];
  return families.flatMap((f) => {
    const kind = f.toUpperCase() as ErrorKind;
    const variant = f === 'crash_recovery' ? 'recovery' : 'error';
    const link = has(`errors.${f}.link`) ? { label: word(`errors.${f}.link`), action: ACTION } : undefined;
    const base: Words = {
      variant,
      kind,
      whatHappened: word(`errors.${f}.what_happened`),
      whatIsSafe: word(`errors.${f}.what_is_safe`),
      button: { label: word(`errors.${f}.button`), action: ACTION },
      secondary: link,
    };
    const out = [{ name: f, words: base, fix: true }];
    if (has(`errors.${f}.what_happened.no_reset`))
      // 05-3 §5.20.2 "Plan limit, no reset time": [ Try again ] and no link.
      out.push({
        name: `${f} (no reset time)`,
        fix: true,
        words: {
          variant,
          kind,
          whatHappened: word(`errors.${f}.what_happened.no_reset`),
          whatIsSafe: word(`errors.${f}.what_is_safe.no_reset`),
          button: { label: word(`errors.${f}.button.no_reset`), action: ACTION },
        },
      });
    if (has(`errors.${f}.what_is_safe.paying`))
      // "Crash mid-payment": no button (the card is `shown`).
      out.push({ name: `${f} (mid-payment)`, fix: false, words: { ...base, whatIsSafe: word(`errors.${f}.what_is_safe.paying`) } });
    return out;
  });
}

function row(type: CardRow['type'], state: string, payload: object): CardRow {
  return {
    id: 'k_1',
    chatId: 'c_1',
    messageId: 'm_1',
    jobId: null,
    type,
    state,
    payload: payload as Record<string, unknown>,
    answer: null,
    nonce: 'n_1',
    expiresAt: null,
    resolvedBy: null,
    resolvedAt: T,
    supersedesId: null,
    rev: 1,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  };
}

interface Count {
  primary: number;
  links: number;
  other: string[];
  text: string;
}

const render = (view: FunctionComponent<{ card: CardRow; time: typeof TIME }>, card: CardRow) =>
  renderToStaticMarkup(createElement(view, { card, time: TIME }));

/** Sorts a rendered card's buttons: the fix button (a primary pill), Link buttons, anything else. */
function count(html: string, fix: string, link: string): Count {
  const buttons = [...html.matchAll(/<button\b([^>]*)>/g)].map((m) => m[1]!);
  const tid = (attrs: string) => /data-testid="([^"]+)"/.exec(attrs)?.[1] ?? '';
  const isPrimary = (attrs: string) => (/class="([^"]*)"/.exec(attrs)?.[1] ?? '').split(' ').includes(buttonStyles.primary!);
  const primary = buttons.filter((b) => tid(b) === fix && isPrimary(b)).length;
  const links = buttons.filter((b) => tid(b) === link).length;
  const other = buttons.map(tid).filter((id) => id !== fix && id !== link);
  const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
  const text = [html.replace(/<[^>]+>/g, ' '), ...labels]
    .join(' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return { primary, links, other, text };
}

const ERROR_CASES = errorCases();

describe('AT-085 ART-02c error cards: one primary button, at most one link, no banned word', () => {
  it('renders every errors.* family in the copy file (the M5 kinds J9 site blocked and J19.1–19.6)', () => {
    expect(ERROR_CASES.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'net_offline',
        'ai_service_down',
        'ai_signed_out',
        'ai_limit',
        'ai_limit (no reset time)',
        'ai_key_invalid',
        'spend_cap',
        'crash_recovery',
        'crash_recovery (mid-payment)',
        'safe_mode',
        'site_blocked',
        'db_rebuilt',
        'unknown',
      ]),
    );
    expect(LATER.length).toBeGreaterThan(0);
  });

  it.each(ERROR_CASES)('AT-085 ART-02c error card $name', ({ words, fix }) => {
    for (const state of fix ? CARD_STATES.error : ['shown']) {
      const c = count(render(ErrorCard, row('error', state, words)), TID.cardErrorFix, TID.cardErrorLink);
      expect(c.other, state).toEqual([]);
      expect(c.links, state).toBeLessThanOrEqual(1);
      if (fix && state === 'asking') {
        expect(c.primary, state).toBe(1);
        expect(c.links, state).toBe(words.secondary ? 1 : 0);
      } else expect(c.primary, state).toBe(0);
      expect(c.text.match(new RegExp(BANNED.source, 'gi')), state).toBeNull();
    }
  });

  it('AT-085 ART-02c Spend-cap card (J19.3): [ Raise cap ] and one "Wait until" link', () => {
    const payload = { which: 'ai', capPaise: 100_000, spentPaise: 100_000 };
    for (const state of CARD_STATES.spend_cap) {
      const c = count(render(SpendCap, row('spend_cap', state, payload)), TID.cardSpendCapRaise, TID.cardSpendCapWait);
      expect(c.other, state).toEqual([]);
      expect(c.primary, state).toBe(state === 'shown' ? 1 : 0);
      expect(c.links, state).toBe(state === 'shown' ? 1 : 0);
      expect(c.text.match(new RegExp(BANNED.source, 'gi')), state).toBeNull();
    }
  });

  it('ART-02c the counter sees a second primary, a second link and a stray button (negative control)', () => {
    const html = render(ErrorCard, row('error', 'asking', ERROR_CASES.find((c) => c.words.secondary)!.words));
    const fix = /<button\b[^>]*data-testid="card-error-fix"[^>]*>.*?<\/button>/.exec(html)![0];
    const link = /<button\b[^>]*data-testid="card-error-link"[^>]*>.*?<\/button>/.exec(html)![0];
    const c = count(
      html.replace(fix, fix + fix).replace(link, link + link + '<button data-testid="x">Help</button>'),
      TID.cardErrorFix,
      TID.cardErrorLink,
    );
    expect(c).toMatchObject({ primary: 2, links: 2, other: ['x'] });
  });
});
