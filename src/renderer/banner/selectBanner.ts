// Spec: 03-shell-1 §3.3.2 (seven types in priority order, highest first; at most one shows; when it clears the next one
// shows), J19.1 (offline after ≥ 10 s, confirmed by main), Article 13 (AI cap), 08-5 §3.1 AiStatus. Pure; unit-tested.
import type { AiStatus, BannerType, SpendSummary } from '../../shared/types';

export const BANNER_PRIORITY: readonly BannerType[] = [
  'offline',
  'ai_not_answering',
  'ai_signed_out',
  'ai_cap',
  'plan_limit',
  'notifications_blocked',
  'update_ready',
];

export const DISMISSIBLE: readonly BannerType[] = ['notifications_blocked', 'update_ready'];

export interface BannerFacts {
  connection: 'online' | 'offline' | 'ai_down';
  ai: AiStatus | null;
  spend: SpendSummary | null;
  notificationsAllowed: boolean;
  updateReady: boolean;
  dismissed: readonly BannerType[];
}

export function activeBanners(f: BannerFacts): BannerType[] {
  const on: Record<BannerType, boolean> = {
    offline: f.connection === 'offline' || f.ai?.state === 'offline',
    ai_not_answering: f.ai?.state === 'down',
    ai_signed_out: f.ai?.state === 'signed_out',
    ai_cap: !!f.spend && f.spend.aiBilling === 'key' && f.spend.aiSpentPaise !== null && f.spend.aiSpentPaise >= f.spend.aiCapPaise,
    plan_limit: f.ai?.state === 'limit',
    notifications_blocked: !f.notificationsAllowed,
    update_ready: f.updateReady,
  };
  return BANNER_PRIORITY.filter((b) => on[b] && !(DISMISSIBLE.includes(b) && f.dismissed.includes(b)));
}

/** The one banner that shows (or null). */
export function pickBanner(f: BannerFacts): BannerType | null {
  return activeBanners(f)[0] ?? null;
}
