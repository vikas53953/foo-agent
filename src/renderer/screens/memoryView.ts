// Spec: 06-2 §7.3 (filter chips: "All" default, "From …" chips only when such facts exist; learned strip = facts added in
// the last 7 days; groups by `kind`: PEOPLE, PREFERENCES, PLACES, FACTS, then HELPERS' NOTES, empty groups hidden, most
// recently used first; source line final copy, a guess without a reason is not shown; " · Private"), §7.5 (states), §7.6
// (Narrator row name), 08-3 §12 (facts read from Gmail/WhatsApp/Calendar are `guessed` with that origin), 06-3 §14 C-3.
// Pure: the page renders from a `MemoryFactView[]` and these functions.
import { t } from '../../shared/copy/t';
import type { ErrorKind, MemoryFactView, MemoryFilter, MemoryKind, MemoryOrigin } from '../../shared/types';
import { dayMonth } from '../shell/panelData';

export type MemoryChipId = MemoryFilter['chip'];
export interface PageFilter {
  chip: MemoryChipId;
  last7: boolean;
  q: string;
}

const DAY = 86_400_000;
const KINDS: MemoryKind[] = ['person', 'preference', 'place', 'fact'];
const APP_ORIGINS: MemoryOrigin[] = ['gmail', 'whatsapp', 'gcal'];
const FROM_CHIPS = ['gmail', 'whatsapp', 'chat'] as const;
const HELPER_FILE = /^helpers\/([^/]+)\/notes\.md$/;

/** Line 2 of a row, or null for a guess without a reason (never shown). */
export function sourceLine(f: MemoryFactView, now: number, timeZone: string): string | null {
  const date = dayMonth(f.learnedAt, now, timeZone);
  let line: string;
  if (f.provenance === 'said') line = t('screen.memory.row.source.said', { date });
  else if (!f.reason) return null;
  else if (APP_ORIGINS.includes(f.originKind)) line = t('screen.memory.row.source.app', { app: f.originLabel, date });
  else line = t('screen.memory.row.source.guessed', { reason: f.reason, date });
  return f.private ? line + t('screen.memory.row.private_suffix') : line;
}

/** 06-2 §7.6 "{Prefers window seats}. {I guessed, from 4 bookings, 9 October}." */
export function rowName(f: MemoryFactView, now: number, timeZone: string): string {
  return t('screen.memory.row.accessible', { fact: f.text, source: sourceLine(f, now, timeZone) ?? '' });
}

export const isShown = (f: MemoryFactView): boolean => f.provenance === 'said' || !!f.reason;

export function helperIdOf(f: MemoryFactView): string | null {
  return HELPER_FILE.exec(f.file)?.[1] ?? null;
}

export function matches(f: MemoryFactView, filter: PageFilter, now: number): boolean {
  const { chip } = filter;
  if ((chip === 'said' || chip === 'guessed') && f.provenance !== chip) return false;
  if ((chip === 'gmail' || chip === 'whatsapp' || chip === 'chat') && f.originKind !== chip) return false;
  if (filter.last7 && f.learnedAt < now - 7 * DAY) return false;
  const q = filter.q.trim().toLocaleLowerCase();
  return !q || f.text.toLocaleLowerCase().includes(q);
}

export function visibleChips(facts: MemoryFactView[]): MemoryChipId[] {
  return ['all', 'said', 'guessed', ...FROM_CHIPS.filter((c) => facts.some((f) => f.originKind === c))];
}

export function learnedCount(facts: MemoryFactView[], now: number): number {
  return facts.filter((f) => isShown(f) && f.learnedAt >= now - 7 * DAY).length;
}

export interface Segment {
  text: string;
  hit: boolean;
}

/** The text split around every case-insensitive match of `q` (marked `--accent-soft`). */
export function highlight(text: string, q: string): Segment[] {
  const needle = q.trim().toLocaleLowerCase();
  if (!needle) return [{ text, hit: false }];
  const out: Segment[] = [];
  const hay = text.toLocaleLowerCase();
  let i = 0;
  for (let j = hay.indexOf(needle); j >= 0; j = hay.indexOf(needle, i)) {
    if (j > i) out.push({ text: text.slice(i, j), hit: false });
    out.push({ text: text.slice(j, j + needle.length), hit: true });
    i = j + needle.length;
  }
  if (i < text.length) out.push({ text: text.slice(i), hit: false });
  return out;
}

const byUse = (a: MemoryFactView, b: MemoryFactView) => (b.lastUsedAt ?? -1) - (a.lastUsedAt ?? -1) || b.learnedAt - a.learnedAt;

export interface Grouped {
  sections: { kind: MemoryKind; facts: MemoryFactView[] }[];
  helpers: { helperId: string; name: string; facts: MemoryFactView[] }[];
}

export function groupFacts(facts: MemoryFactView[], helperName: (id: string) => string | undefined): Grouped {
  const shown = facts.filter(isShown);
  const mine = shown.filter((f) => helperIdOf(f) === null);
  const sections = KINDS.map((kind) => ({ kind, facts: mine.filter((f) => f.kind === kind).sort(byUse) })).filter(
    (s) => s.facts.length > 0,
  );
  const helperIds = [...new Set(shown.map(helperIdOf).filter((id): id is string => id !== null))];
  const helpers = helperIds.map((helperId) => ({
    helperId,
    name: helperName(helperId) ?? helperId,
    facts: shown.filter((f) => helperIdOf(f) === helperId).sort(byUse),
  }));
  return { sections, helpers };
}

export type PageState = 'first_time' | 'empty' | 'filter_empty' | 'list';

export function pageState(p: { facts: MemoryFactView[]; shown: MemoryFactView[]; forgotAll: boolean }): PageState {
  if (p.facts.length === 0) return p.forgotAll ? 'empty' : 'first_time';
  return p.shown.length === 0 ? 'filter_empty' : 'list';
}

export type ForgetSourceItem = 'gmail' | 'whatsapp' | 'chat';

/** C-3: the origin a ⋯ menu item forgets and how many facts it names in the title. */
export function forgetSource(item: ForgetSourceItem, facts: MemoryFactView[]): { origin: MemoryOrigin; count: number } {
  return { origin: item, count: facts.filter((f) => f.originKind === item).length };
}

/** C-3's `{app}` (06-3 §14 "your {Gmail}"); "chats" for "Forget everything from chats" (implementation-notes, T6). */
export const APP_NAME: Record<ForgetSourceItem, string> = { gmail: 'Gmail', whatsapp: 'WhatsApp', chat: 'chats' };

const UNDO_ITEM_MAX = 48;
/** 02-3 §F21.3: "Forgot "{fact}"." with the quoted item cut at 48 characters. */
export function undoText(fact: string): string {
  const chars = [...fact];
  const item = chars.length > UNDO_ITEM_MAX ? `${chars.slice(0, UNDO_ITEM_MAX - 1).join('')}…` : fact;
  return t('screen.memory.undo.text', { fact: item });
}

/** The status line when the memory export stops (08-3 §19.6); DISK_FULL raises main's DISK_LOW card instead, so no line. */
export function exportErrorLine(error: ErrorKind | undefined): string | null {
  if (!error || error === 'DISK_FULL') return null;
  return error === 'EXPORT_SECRET_FOUND' ? t('errors.export_secret_found.line') : t('errors.unknown.what_happened');
}
