// Spec: 03-shell-1 §3.4.11 AI status (first match: not set up, offline, then the provider's state; "ready" only when
// verified in the last 10 min) and the spend line (key-based: spent of cap, `--warn` from 80 %, `--bad` at the cap;
// plan-based: "Uses your {AI} plan"), Article 21 (the limit time is absolute). Pure; unit-tested.
import { t } from '../../shared/copy/t';
import { formatInr } from '../../shared/format';
import type { AiStatus, SpendSummary } from '../../shared/types';
import { absoluteTime } from '../ui/time';

export const VERIFIED_FRESH_MS = 10 * 60_000;

export type FooterTone = 'ok' | 'warn' | 'bad' | 'muted';

export interface FooterAi {
  key: 'ready' | 'checking' | 'not_answering' | 'signed_out' | 'plan_limit' | 'offline' | 'setting_up';
  tone: FooterTone;
}

/** §3.4.11 AI status, first match: not set up → offline → the provider's state. */
export function footerAi(ai: AiStatus | null, opts: { setupComplete: boolean; offline: boolean; now: number }): FooterAi {
  if (!opts.setupComplete) return { key: 'setting_up', tone: 'muted' };
  if (opts.offline || ai?.state === 'offline') return { key: 'offline', tone: 'warn' };
  if (!ai) return { key: 'checking', tone: 'muted' };
  switch (ai.state) {
    case 'ok':
      return ai.lastVerifiedAt !== undefined && opts.now - ai.lastVerifiedAt > VERIFIED_FRESH_MS
        ? { key: 'checking', tone: 'muted' }
        : { key: 'ready', tone: 'ok' };
    case 'down':
      return { key: 'not_answering', tone: 'bad' };
    case 'signed_out':
    case 'key_invalid':
      return { key: 'signed_out', tone: 'bad' };
    case 'limit':
      return { key: 'plan_limit', tone: 'warn' };
    case 'unverified':
      return { key: 'checking', tone: 'muted' };
    default:
      return { key: 'checking', tone: 'muted' };
  }
}

/** §3.4.11 spend line: key-based AI shows spent of cap (warn from 80 %, bad at the cap); plan-based names the plan. */
export function footerSpend(spend: SpendSummary | null, aiName: string): { text: string; tone: FooterTone } | null {
  if (!spend) return null;
  if (spend.aiBilling !== 'key') return { text: t('sidebar.footer.spend.plan', { AI: aiName }), tone: 'muted' };
  const spent = spend.aiSpentPaise ?? 0;
  const cap = spend.aiCapPaise;
  if (cap > 0 && spent >= cap) return { text: t('sidebar.footer.spend.cap_reached', { cap: formatInr(cap) }), tone: 'bad' };
  const text = t('sidebar.footer.spend.used', { spent: formatInr(spent), cap: formatInr(cap) });
  return { text, tone: cap > 0 && spent >= cap * 0.8 ? 'warn' : 'muted' };
}

export function aiText(a: FooterAi, ai: AiStatus | null, now: number, tz: string): string {
  const AI = ai?.displayName ?? '';
  switch (a.key) {
    case 'ready':
      return t('sidebar.footer.ai.ready', { AI });
    case 'checking':
      return t('sidebar.footer.ai.checking', { AI });
    case 'not_answering':
      return t('sidebar.footer.ai.not_answering', { AI });
    case 'signed_out':
      return t('sidebar.footer.ai.signed_out', { AI });
    case 'plan_limit':
      // M5 T10 (CR-0009 G-M5-23): no reset time → "{AI} limit reached", never "limit until" with nothing after.
      return ai?.resetAt === undefined
        ? t('sidebar.footer.ai.plan_limit.no_time', { AI })
        : t('sidebar.footer.ai.plan_limit', { AI, time: absoluteTime(ai.resetAt, now, tz) });
    case 'offline':
      return t('sidebar.footer.ai.offline');
    case 'setting_up':
      return t('sidebar.footer.ai.setting_up');
  }
}
