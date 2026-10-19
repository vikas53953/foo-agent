// Spec: 06-1 §2.2 (the AI finder: rows in fixed order Claude, ChatGPT, Gemini, one row per saved key, "Your own key", "AI on
// this PC"; the twelve row states and their status words; the choice block once every row settled or after 25 s: 2+ work →
// "I'll use {Claude}. It works and it's the best fit…" [ Use ] [ Pick another ], 1 works → "I'll use {ChatGPT}. It works…"
// [ Use ] only; nothing works → "I couldn't find an AI on this PC yet…"; only "AI on this PC" works → its Choice question;
// `ai.backup` = the next working AI), 08-2 §6.6 (`verify()` = one tiny real request, 20 s limit), §6.7 (error kinds →
// row states). Pure: the AiFinder component holds the state and calls these.
import { AI_MAKER, AI_NAME, isKeyProvider } from '../../../shared/aiNames';
import { t } from '../../../shared/copy/t';
import { formatTime } from '../../../shared/format';
import type { VerifyResult } from '../../../shared/ipc';
import type { DetectRow, ProviderId } from '../../../shared/types';

/** 06-1 §2.2 row 5 has no provider: it only opens the key question. */
export type RowId = ProviderId | 'own-key';
export type RowState = DetectRow['state'];

export interface FinderRow {
  id: RowId;
  state: RowState;
  /** A CLI helper is on this PC (detail "signed in" / "installed, not signed in"). */
  found: boolean;
  signedIn?: boolean;
  /** A key row whose key is only in the user's environment (06-1 §2.2 row 4 "found on this PC"; 08-2 §6.6 rung 4). */
  envKey?: boolean;
  resetAt?: number;
}

export const VERIFY_LIMIT_MS = 20_000;
export const SETTLE_LIMIT_MS = 25_000;
/** While the engine starts, detection is asked again this often. */
export const DETECT_RETRY_MS = 1_000;
export const HELPER_POLL_MS = 5_000;
export const HELPER_LIMIT_MS = 10 * 60_000;
export const OFFLINE_RETRY_MS = 30_000;

const CLI_ROWS: ProviderId[] = ['claude-cli', 'codex-cli', 'gemini-cli'];
const KEY_ROWS: ProviderId[] = ['openai-key', 'anthropic-key', 'google-key'];

/** Before detection answers: the five rows that always show, all Looking (UX-02-01). */
export function initialRows(): FinderRow[] {
  return [...CLI_ROWS, 'own-key' as const, 'ollama' as const].map((id) => ({ id, state: 'looking', found: false }));
}

/** Detection → the rows in fixed order; a key row shows only when that key was found (row 4). `fake` is never a row. */
export function rowsFromDetect(detect: readonly DetectRow[]): FinderRow[] {
  const by = new Map(detect.map((r) => [r.providerId, r]));
  const row = (id: ProviderId): FinderRow => {
    const d = by.get(id);
    if (!d) return { id, state: 'not_found', found: false };
    const out: FinderRow = { id, state: d.state, found: d.found };
    if (d.signedIn !== undefined) out.signedIn = d.signedIn;
    // 08-2 §6.6: a key only in the environment is copied into the vault after the user saves it; until then it is not tested.
    if (isKeyProvider(id) && d.state === 'not_signed_in') out.envKey = true;
    return out;
  };
  const keys = KEY_ROWS.map(row).filter((r) => r.found);
  return [...CLI_ROWS.map(row), ...keys, { id: 'own-key', state: 'not_found', found: false }, row('ollama')];
}

/** 08-2 §6.7 kinds → the row state a failed test leaves. A test that did not answer reads as slow, with [ Test again ]. */
export function stateAfterVerify(r: VerifyResult): Pick<FinderRow, 'state' | 'resetAt'> {
  if (r.ok) return { state: 'works' };
  switch (r.kind) {
    case 'AI_KEY_INVALID':
      return { state: 'key_failed' };
    case 'AI_LIMIT':
      return r.resetAt !== undefined ? { state: 'plan_limit', resetAt: r.resetAt } : { state: 'plan_limit' };
    case 'AI_SIGNED_OUT':
      return { state: 'not_signed_in' };
    case 'NET_OFFLINE':
      return { state: 'offline' };
    default:
      return { state: 'slow' };
  }
}

export const isSettled = (rows: readonly FinderRow[]) => rows.every((r) => r.state !== 'looking' && r.state !== 'testing');

/** The rows that passed their test, in ladder order. */
export const workingIds = (rows: readonly FinderRow[]): ProviderId[] =>
  rows.filter((r) => r.state === 'works' && r.id !== 'own-key').map((r) => r.id as ProviderId);

export type Block =
  | { kind: 'pending' }
  | { kind: 'many'; pick: ProviderId; working: ProviderId[] }
  | { kind: 'one'; pick: ProviderId }
  | { kind: 'local' }
  | { kind: 'plan_limited'; pick: ProviderId; resetAt: number }
  | { kind: 'nothing' };

/**
 * 06-1 §2.2 step 3: the block under the rows. The pick is the first working AI in ladder order that is not "AI on this PC"
 * (it can't do bookings well, so it is only offered on its own question).
 */
export function choiceBlock(rows: readonly FinderRow[], timeUp: boolean): Block {
  if (!timeUp && !isSettled(rows)) return { kind: 'pending' };
  const working = workingIds(rows);
  const strong = working.filter((id) => id !== 'ollama');
  if (strong.length >= 2 || (strong.length === 1 && working.length >= 2)) return { kind: 'many', pick: strong[0]!, working };
  if (strong.length === 1) return { kind: 'one', pick: strong[0]! };
  if (working.includes('ollama')) return { kind: 'local' };
  // "Only plan-limited AI": the block names the time it starts working, so a limit with no known reset time reads as nothing.
  const limited = rows.find((r) => r.state === 'plan_limit' && r.resetAt !== undefined && r.id !== 'own-key');
  if (limited) return { kind: 'plan_limited', pick: limited.id as ProviderId, resetAt: limited.resetAt! };
  return { kind: 'nothing' };
}

/** 08-0 §A `ai.backup`: the next working AI after the chosen one, else null (06-1 §2.2 Writes). */
export function backupFor(primary: ProviderId, rows: readonly FinderRow[]): ProviderId | null {
  return workingIds(rows).find((id) => id !== primary) ?? null;
}

/** What the user pays with: a plan, a key (cost shown, cap applies) or nothing (this PC). */
export function billingOf(id: ProviderId): 'plan' | 'key' | 'local' {
  return isKeyProvider(id) ? 'key' : id === 'ollama' ? 'local' : 'plan';
}

export function rowName(r: FinderRow): string {
  return r.id === 'own-key' ? t('setup.ai_finder.row.own_key') : AI_NAME[r.id];
}

/** The detail line under the name (06-1 §2.2 rows table). */
export function rowDetail(r: FinderRow, needsHelper: boolean): string {
  if (needsHelper) return t('setup.ai_finder.needs_helper');
  if (r.id === 'own-key') return '';
  if (isKeyProvider(r.id)) return r.found ? t('setup.ai_finder.detail.found') : '';
  if (r.id === 'ollama') return r.found ? t('setup.ai_finder.detail.local') : '';
  if (!r.found) return '';
  return r.signedIn === false ? t('setup.ai_finder.detail.not_signed_in') : t('setup.ai_finder.detail.signed_in');
}

/** The status words on the right (06-1 §2.2 per-row states); empty where the row shows a button instead. */
export function rowStatus(r: FinderRow, timeZone: string): string {
  if (r.id === 'own-key') return '';
  switch (r.state) {
    case 'looking':
      return t('setup.ai_finder.status.looking');
    case 'testing':
      return t('setup.ai_finder.status.testing');
    case 'works':
      return t('setup.ai_finder.status.works');
    case 'not_found':
      return t('setup.ai_finder.status.not_found');
    case 'signin_unfinished':
      return t('setup.ai_finder.status.signin_unfinished');
    case 'key_failed':
      return t('setup.ai_finder.status.key_failed');
    case 'plan_limit':
      return r.resetAt !== undefined
        ? t('setup.ai_finder.status.plan_limit', { time: formatTime(r.resetAt, { timeZone }) })
        : t('setup.ai_finder.status.plan_limit_no_time');
    case 'slow':
      return t('setup.ai_finder.status.slow');
    case 'offline':
      return t('setup.ai_finder.status.offline');
    default:
      return '';
  }
}

export type RowAction = 'sign_in' | 'add_key' | 'replace_key' | 'test_again' | 'try_again';

/** The row's Secondary button (06-1 §2.2 Control column), if any. */
export function rowAction(r: FinderRow): RowAction | null {
  if (r.id === 'own-key') return 'add_key';
  if (r.envKey) return 'add_key';
  switch (r.state) {
    case 'not_signed_in':
      return 'sign_in';
    case 'signin_unfinished':
      return 'try_again';
    case 'key_failed':
      return 'replace_key';
    case 'slow':
      return 'test_again';
    default:
      return null;
  }
}

/** The status tone (06-1 §2.2 Tone column) as the row's `data-tone`. */
export function rowTone(r: FinderRow): 'ok' | 'warn' | 'bad' | 'dim' {
  switch (r.state) {
    case 'works':
      return 'ok';
    case 'signin_unfinished':
    case 'plan_limit':
    case 'slow':
      return 'warn';
    case 'key_failed':
      return 'bad';
    default:
      return 'dim';
  }
}

/** "{OpenAI}" in the key lines: the maker of a key row. */
export const makerOf = (id: ProviderId) => AI_MAKER[id];

/** Puts a row in its fixed place: replaces the row with its id, or adds a newly saved key row before "Your own key". */
export function upsertRow(rows: readonly FinderRow[], row: FinderRow): FinderRow[] {
  if (rows.some((r) => r.id === row.id)) return rows.map((r) => (r.id === row.id ? row : r));
  const at = rows.findIndex((r) => r.id === 'own-key');
  const keys = rows.filter((r) => isKeyProvider(r.id));
  const order = KEY_ROWS.filter((id) => id === row.id || keys.some((k) => k.id === id));
  const before = rows.filter((r) => !isKeyProvider(r.id));
  const own = at < 0 ? before.length : before.findIndex((r) => r.id === 'own-key');
  const merged = order.map((id) => (id === row.id ? row : keys.find((k) => k.id === id)!));
  return [...before.slice(0, own), ...merged, ...before.slice(own)];
}
