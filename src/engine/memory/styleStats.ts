// Spec: 08-3 §12.9 (style stats are the engine's, never the AI's: after every 20th user message in foo's chat, over the
// last 20 user text messages: average length in characters (integer); casing `lower` (≥ 80 % have no capital letter) /
// `sentence` (≥ 80 % start with a capital) / `mixed`; emoji per message, one decimal; greeting and sign-off = the most
// frequent first and last token, only when it appears in ≥ 5 of the 20; written as lines in `preferences\style.md`, each
// `guessed`, reason "from your last 20 messages", replacing the previous ones; never chips, never groups), §12.1 row
// (style.md), §12.8 `memory.styleStats`, 08-2 §7.2 (they are ordinary pinned facts of part 5). CR-0010 G-M6-06
// (`privacy.rememberOn=false` blocks style stats). The line words are this ticket's copy keys `memory.style.*`.
// CR-0037 (X-195): a line is written only when its measure found something: no emoji line at 0.0, no casing line for
// `mixed`; no lines at all from fewer than 20 non-blank user text messages (the previous lines stay).
import type { EngineFact } from '../../main/db/queries';
import { t } from '../../shared/copy/t';
import { ok, type Result } from '../../shared/errors';
import type { Settings } from '../../shared/settings';
import type { MainLink } from '../protocol';
import type { LearnOp, MemoryService } from './MemoryService';

export const STYLE_EVERY = 20;
export const STYLE_FILE = 'memory/preferences/style.md';
const SHARE = 0.8;
const TOKEN_MIN = 5;

/** The four measures of §12.9. */
export interface StyleStats {
  avgChars: number;
  casing: 'lower' | 'sentence' | 'mixed';
  emojiRate: number;
  greeting: string | null;
  signoff: string | null;
}

const EMOJI = /\p{Extended_Pictographic}/gu;
const cps = (s: string) => Array.from(s).length;

function mostFrequent(tokens: string[]): string | null {
  const counts = new Map<string, number>();
  for (const tk of tokens) counts.set(tk, (counts.get(tk) ?? 0) + 1);
  let best: [string, number] | null = null;
  for (const e of counts) if (!best || e[1] > best[1]) best = e;
  return best && best[1] >= TOKEN_MIN ? best[0] : null;
}

/** First and last word tokens, case-folded, punctuation and emoji stripped. */
function words(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .split(/\s+/u)
    .map((w) => w.replace(/[^\p{L}\p{N}\p{M}']/gu, ''))
    .filter(Boolean);
}

/** §12.9 over the given texts (the last 20 user text messages); blank texts are left out. */
export function computeStyle(all: readonly string[]): StyleStats {
  const texts = all.filter((s) => s.trim() !== '');
  const n = texts.length || 1;
  const avgChars = Math.round(texts.reduce((a, s) => a + cps(s), 0) / n);
  const noCapital = texts.filter((s) => !/\p{Lu}/u.test(s)).length / n;
  const startsCapital = texts.filter((s) => /^\P{L}*\p{Lu}/u.test(s)).length / n;
  const casing = noCapital >= SHARE ? 'lower' : startsCapital >= SHARE ? 'sentence' : 'mixed';
  const emojiRate = Math.round((texts.reduce((a, s) => a + (s.match(EMOJI)?.length ?? 0), 0) / n) * 10) / 10;
  const ws = texts.map(words).filter((w) => w.length > 0);
  return {
    avgChars,
    casing,
    emojiRate,
    greeting: mostFrequent(ws.map((w) => w[0]!)),
    signoff: mostFrequent(ws.map((w) => w[w.length - 1]!)),
  };
}

/**
 * The style.md lines (the greeting and sign-off share one line; it is left out when neither reaches 5 of 20). CR-0037: a
 * measure that found nothing says nothing about the person, so `mixed` casing and a 0.0 emoji rate give no line.
 */
export function styleLines(s: StyleStats): string[] {
  const lines = [t('memory.style.length', { chars: s.avgChars })];
  if (s.casing === 'lower') lines.push(t('memory.style.casing.lower'));
  else if (s.casing === 'sentence') lines.push(t('memory.style.casing.sentence'));
  if (s.emojiRate >= 0.1) lines.push(t('memory.style.emoji', { rate: s.emojiRate.toFixed(1) }));
  if (s.greeting && s.signoff) lines.push(t('memory.style.greeting_signoff', { greeting: s.greeting, signoff: s.signoff }));
  else if (s.greeting) lines.push(t('memory.style.greeting', { greeting: s.greeting }));
  else if (s.signoff) lines.push(t('memory.style.signoff', { signoff: s.signoff }));
  return lines;
}

export interface StyleDeps {
  link: MainLink;
  memory: Pick<MemoryService, 'drop' | 'learn'>;
  settings: () => Settings;
  log: (evt: string, kind?: string) => void;
}

/** `memory.styleStats`: called for each new user message; acts only on foo's 1:1 chat at every 20th user message. */
export class StyleStatsRunner {
  constructor(private readonly d: StyleDeps) {}

  async onUserMessage(chatId: string): Promise<Result<{ written: number }>> {
    if (!this.d.settings().privacy.rememberOn) return ok({ written: 0 });
    const foo = await this.query<string | null>('chats.foo', []);
    if (!foo || foo !== chatId) return ok({ written: 0 });
    const recent = await this.query<{ total: number; texts: string[] }>('messages.userTexts', [chatId, STYLE_EVERY]);
    if (!recent || recent.total === 0 || recent.total % STYLE_EVERY !== 0) return ok({ written: 0 });
    // CR-0037: a full sample of 20 non-blank texts or nothing; the previous lines stay until one is there.
    if (recent.texts.filter((s) => s.trim() !== '').length < STYLE_EVERY) return ok({ written: 0 });
    return this.write(chatId, styleLines(computeStyle(recent.texts)));
  }

  /** Supersede, not append: the previous engine lines (guessed, this reason) go, the new ones are learned. */
  private async write(chatId: string, lines: string[]): Promise<Result<{ written: number }>> {
    const reason = t('memory.style.reason');
    const old = ((await this.query<EngineFact[]>('memory.byFile', [STYLE_FILE])) ?? []).filter(
      (f) => f.provenance === 'guessed' && f.reason === reason,
    );
    if (old.length) {
      const r = await this.d.memory.drop(old.map((f) => f.id));
      if (!r.ok) return r;
    }
    let written = 0;
    for (const text of lines) {
      const op: LearnOp = {
        text,
        provenance: 'guessed',
        reason,
        originKind: 'chat',
        origin: `chat:${chatId}`,
        category: 'style',
        kind: 'preference',
        scope: 'global',
        private: false,
      };
      const r = await this.d.memory.learn(op);
      if (r.ok && 'factId' in r.value) written += 1;
      else this.d.log('memory.style_skipped', r.ok && 'skipped' in r.value ? r.value.skipped : r.ok ? '' : r.error.kind);
    }
    return ok({ written });
  }

  private async query<T>(q: string, args: unknown[]): Promise<T | null> {
    const r = await this.d.link.request<T>('db.query', { q, args });
    return r.ok ? r.value : null;
  }
}
