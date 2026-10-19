// Spec: 06-2 §6.1 Account & your AI, AI rows: the "Using" status line (Works "✓ works · checked {2 min ago}" with the
// absolute time as tooltip, Testing…, Not answering, Signed out + Sign in, Plan limit until {3:00 PM}, Key didn't work +
// Replace key, Offline; tones --ok / --fg-3 / --bad / --warn), "Backup AI" (each other AI that passed a test, and None),
// "How it's paid" (plan / key with the saved date). Pure: the AccountAi component holds the state and calls these.
import { isKeyProvider } from '../../../shared/aiNames';
import { PROVIDER_IDS, type Settings } from '../../../shared/settings';
import type { AiStatus, ProviderId } from '../../../shared/types';

export type UsingLine =
  | { kind: 'works'; at: number | null }
  | { kind: 'testing' }
  | { kind: 'not_answering' }
  | { kind: 'signed_out' }
  | { kind: 'limit'; resetAt: number | null }
  | { kind: 'key_failed' }
  | { kind: 'offline' }
  | { kind: 'none' };

export type Tone = 'ok' | 'dim' | 'bad' | 'warn';

/** The line under "{Claude} (your AI)": a test in flight wins, then being offline, then the AI's own state. */
export function usingLine(ai: AiStatus | null, testing: boolean, offline: boolean): UsingLine {
  if (!ai || ai.primary === null) return { kind: 'none' };
  if (testing) return { kind: 'testing' };
  if (offline || ai.state === 'offline') return { kind: 'offline' };
  switch (ai.state) {
    case 'ok':
      return { kind: 'works', at: ai.lastVerifiedAt ?? null };
    case 'down':
      return { kind: 'not_answering' };
    case 'signed_out':
      return { kind: 'signed_out' };
    case 'limit':
      return { kind: 'limit', resetAt: ai.resetAt ?? null };
    case 'key_invalid':
      return { kind: 'key_failed' };
    default:
      return { kind: 'none' };
  }
}

export function lineTone(l: UsingLine): Tone {
  switch (l.kind) {
    case 'works':
      return 'ok';
    case 'limit':
    case 'offline':
      return 'warn';
    case 'not_answering':
    case 'signed_out':
    case 'key_failed':
      return 'bad';
    default:
      return 'dim';
  }
}

export type Ago = { unit: 'now' } | { unit: 'min' | 'hour' | 'day'; n: number };

/** "{2 min ago}": under a minute is "just now"; then minutes, hours, days. */
export function agoOf(at: number, now: number): Ago {
  const min = Math.floor(Math.max(0, now - at) / 60_000);
  if (min < 1) return { unit: 'now' };
  if (min < 60) return { unit: 'min', n: min };
  const hours = Math.floor(min / 60);
  if (hours < 24) return { unit: 'hour', n: hours };
  return { unit: 'day', n: Math.floor(hours / 24) };
}

/** "Backup AI" menu: every other AI whose last test passed, in the 08-2 §6.6 ladder order (`fake` is never offered). */
export function backupChoices(providers: Settings['ai']['providers'], primary: ProviderId | null): ProviderId[] {
  return PROVIDER_IDS.filter((id) => id !== primary && id !== 'fake' && providers[id]?.lastVerifyOk === true);
}

/** "How it's paid": the key's vault name when the AI is paid by a key, so the row can offer "Replace key". */
export const paidByKey = (primary: ProviderId | null) => (primary !== null && isKeyProvider(primary) ? primary : null);
