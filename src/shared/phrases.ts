// Spec: 08-4 §26.1 (step phrase catalogue, F-061: the only phrase list; each entry { next, running, done, slots }; copy keys
// `cards.checklist.{key}.next|running|done`; slots match `^[\p{L}\p{N}₹ .,:'&()/<>+-]{1,40}$`u and pass the banned-word
// filter; an unknown key or a failing slot → `generic_working`; keys with "—" are runner-only), 08-2 §5.3.3, §5.4.3, 05-1 §5.2.2
// (next for rows not started, running for the current row, done for finished rows). Builders add a key only by a
// constitution change. The texts are the table's, word for word; en-IN.json holds the same texts under the copy keys (test).
import type { CopyKey } from './copy/t';

export const PHRASES = {
  read_app: { next: 'Read your {app}', running: 'Reading your {app}', done: 'Read your {app}', slots: ['app'] },
  read_email: { next: 'Read your email', running: 'Reading your email', done: 'Read your email', slots: [] },
  check_calendar: { next: 'Check your calendar', running: 'Checking your calendar', done: 'Checked your calendar', slots: [] },
  look_web: { next: 'Look on the web', running: 'Looking on the web', done: 'Looked on the web', slots: [] },
  check_sites: { next: 'Check {sites}', running: 'Checking {sites}', done: 'Checked {sites}', slots: ['sites'] },
  check_site: { next: 'Check {site}', running: 'Checking {site}', done: 'Checked {site}', slots: ['site'] },
  wait_site: { next: 'Wait for {site}', running: 'Waiting for {site}', done: '{site} answered', slots: ['site'] },
  look_for: { next: 'Look for {what}', running: 'Looking for {what}', done: 'Looked for {what}', slots: ['what'] },
  compare: { next: 'Compare {what}', running: 'Comparing {what}', done: 'Compared {what}', slots: ['what'] },
  shortlist: {
    next: 'Keep {n} {what} that fit {rule}',
    running: 'Picking the best {what}',
    done: 'Kept {n} {what} that fit {rule}',
    slots: ['n', 'what', 'rule'],
  },
  wait_pick: { next: 'Wait for you to pick one', running: 'Waiting for you to pick one ›', done: 'You picked', slots: [] },
  wait_approve: { next: 'Show you before doing anything', running: 'Waiting for you to approve ›', done: 'You said yes', slots: [] },
  show_before: {
    next: 'Show you before {acting}',
    running: 'Showing you before {acting}',
    done: 'Showed you before {acting}',
    slots: ['acting'],
  },
  wait_signin: { next: 'Sign in to {site}', running: 'Waiting for you to sign in ›', done: 'Signed in to {site}', slots: ['site'] },
  fill_details: {
    next: 'Fill in your details on {site}',
    running: 'Filling in your details on {site}',
    done: 'Filled in your details',
    slots: ['site'],
  },
  book: { next: 'Book {what}', running: 'Booking {what}', done: 'Booked {what}', slots: ['what'] },
  book_calendar: {
    next: 'Book {what} and add it to your calendar',
    running: 'Booking {what}',
    done: 'Booked {what} and added it to your calendar',
    slots: ['what'],
  },
  pay: { next: 'Pay {payee}', running: 'Paying {payee}', done: 'Paid {payee}', slots: ['payee'] },
  add_calendar: { next: 'Add it to your calendar', running: 'Adding it to your calendar', done: 'Added to your calendar', slots: [] },
  draft: { next: 'Write the {channel}', running: 'Writing the {channel}', done: 'Wrote the {channel}', slots: ['channel'] },
  writing: { next: 'Write it', running: 'Writing', done: 'Wrote it', slots: [] },
  send: {
    next: 'Send the {channel} to {to}',
    running: 'Sending the {channel} to {to}',
    done: 'Sent the {channel} to {to}',
    slots: ['channel', 'to'],
  },
  make_file: { next: 'Make {what}', running: 'Making {what}', done: 'Made {what}', slots: ['what'] },
  use_pc: { next: 'Open it on your computer', running: 'Working on your computer', done: 'Done on your computer', slots: [] },
  find_proof: { next: 'Check it went through', running: 'Checking it went through', done: 'Checked it went through', slots: [] },
  blocked_try_next: { next: null, running: null, done: '{site} blocked me, trying {next}', slots: ['site', 'next'] },
  took_over: { next: null, running: null, done: 'You took over', slots: [] },
  stopped: { next: null, running: null, done: 'Stopped by you', slots: [] },
  find_trains: { next: 'Find trains on {site}', running: 'Finding trains on {site}', done: 'Found trains on {site}', slots: ['site'] },
  sign_in: { next: 'Sign in to {site}', running: 'Signing in to {site}', done: 'Signed in to {site}', slots: ['site'] },
  fill_passengers: { next: 'Fill in passengers', running: 'Filling in passengers', done: 'Filled in passengers', slots: [] },
  get_fare: { next: 'Get the fare', running: 'Getting the fare', done: 'Got the fare', slots: [] },
  wait_opens: {
    next: 'Wait for Tatkal to open at {time}',
    running: 'Waiting for Tatkal · opens {time}',
    done: 'Tatkal opened',
    slots: ['time'],
  },
  read_plans: {
    next: 'Read the {biller} plans',
    running: 'Reading the {biller} plans',
    done: 'Read the {biller} plans',
    slots: ['biller'],
  },
  read_bill: { next: 'Read your {biller} bill', running: 'Reading your {biller} bill', done: 'Read your {biller} bill', slots: ['biller'] },
  generic_working: { next: 'Work on it', running: 'Working on it', done: 'Done this part', slots: [] },
} as const;

export type PhraseKey = keyof typeof PHRASES;
export type PhraseForm = 'next' | 'running' | 'done';
export type PhraseSlots = Record<string, string>;

/** 08-4 §26.1 slot rule. */
export const SLOT_RE = /^[\p{L}\p{N}₹ .,:'&()/<>+-]{1,40}$/u;

export const isPhraseKey = (k: string): k is PhraseKey => Object.prototype.hasOwnProperty.call(PHRASES, k);

/** Runner-only keys ("—" for next and running): never in a PlanStep. */
export const RUNNER_ONLY: readonly PhraseKey[] = (Object.keys(PHRASES) as PhraseKey[]).filter((k) => PHRASES[k].next === null);

/** The copy key of one form (05-1 §5.2.2), or null for a runner-only key's missing forms. */
export function phraseCopyKey(key: PhraseKey, form: PhraseForm): CopyKey | null {
  return PHRASES[key][form] === null ? null : (`cards.checklist.${key}.${form}` as CopyKey);
}

/**
 * 08-2 §5.3.3 / 08-4 §26.1: the key and slots a step is stored with. An unknown key, a runner-only key in a plan, a missing
 * slot, or a slot that fails the slot rule or the banned-word filter (`isBanned`, the engine's filter) → `generic_working`.
 */
export function resolvePhrase(
  key: string,
  slots: Record<string, unknown> = {},
  opts: { inPlan?: boolean; isBanned?: (text: string) => boolean } = {},
): { key: PhraseKey; slots: PhraseSlots } {
  const fallback = { key: 'generic_working' as const, slots: {} };
  if (!isPhraseKey(key)) return fallback;
  if (opts.inPlan && RUNNER_ONLY.includes(key)) return fallback;
  const out: PhraseSlots = {};
  for (const name of PHRASES[key].slots) {
    const v = slots[name];
    const s = typeof v === 'number' ? String(v) : v;
    if (typeof s !== 'string' || !SLOT_RE.test(s) || opts.isBanned?.(s)) return fallback;
    out[name] = s;
  }
  return { key, slots: out };
}

/** The phrase text with its slots filled (plan.md, logs, tests; the UI uses t(phraseCopyKey(…), slots)). */
export function phraseText(key: PhraseKey, form: PhraseForm, slots: PhraseSlots = {}): string | null {
  const text = PHRASES[key][form] as string | null;
  return text === null ? null : text.replace(/\{(\w+)\}/g, (_, n: string) => slots[n] ?? `{${n}}`);
}
