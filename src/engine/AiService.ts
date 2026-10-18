// Spec: 08-2 §6.6 (detect all rungs in parallel, rows in ladder order; verify; the chosen provider = first verified rung;
// chat locked until one verifies), §6.7 (error kinds → state: NET_OFFLINE / AI_SERVICE_DOWN after 2 failures in a row per
// provider; retest every 30 s / 2 min for 1 h, then every 15 min; AI_LIMIT waits for resetAt or polls every 15 min),
// §6.10 (detectAll, verify, choose), 08-4 §30.1 (turn parameters per purpose), §30.9 (backup scope: chat turns may use a
// verified backup while the primary is limited, down or unreachable), 08-5 §3.1 (AiStatus), 08-3 §22.3 (FOO_FAKE_AI
// selects the fake provider: in a FOO_FAKE_AI run every turn goes to the fake adapter, whatever the settings name).
import type { Clock, TimerId } from '../shared/clock';
import type { Settings } from '../shared/settings';
import type { AiStatus, DetectRow, ProviderId } from '../shared/types';
import { fail, ok, type Result } from '../shared/errors';
import type { VerifyResult as WireVerifyResult } from '../shared/ipc';
import { AiRegistry, PROVIDER_DISPLAY_NAME } from './ai/AiRegistry';
import { paramsFor, priceOf, resolveModel, temperatureFor, type Pricing } from './ai/models';
import type { AiAdapter, AiErrorKind, AiUsage, TurnRequest, TurnResult, TurnSink } from './ai/types';
import type { LaneAi } from './chat/ChatLane';

type State = AiStatus['state'];
const MIN = 60_000;

interface ProviderHealth {
  state: State;
  streak: number;
  resetAt?: number;
  since?: number;
  timer?: TimerId;
  violations?: number;
}

export interface AiServiceDeps {
  registry: AiRegistry;
  clock: Clock;
  pricing: Pricing;
  settings(): Settings;
  online(): boolean;
  fake: boolean;
  /** ai:status → renderer; ai.state → main (settings.json). */
  publish(status: AiStatus): void;
  persist(p: {
    providers: Record<string, { kind: 'plan' | 'key' | 'local'; lastVerifiedAt?: number; lastVerifyOk?: boolean }>;
    primary?: ProviderId | null;
    backup?: ProviderId | null;
  }): void;
  /** The AI is usable again: Waiting-to-send messages go now (04 §3.3). */
  onUsable(): void;
  detectRow(row: DetectRow): void;
  retestTimers: boolean;
}

export class AiService implements LaneAi {
  private health = new Map<ProviderId, ProviderHealth>();

  constructor(private d: AiServiceDeps) {}

  private adapterId(id: ProviderId): ProviderId {
    return this.d.fake ? 'fake' : id;
  }
  private adapter(id: ProviderId): AiAdapter {
    return this.d.registry.adapter(this.adapterId(id));
  }
  private h(id: ProviderId): ProviderHealth {
    let x = this.health.get(id);
    if (!x) {
      const v = this.d.settings().ai.providers[id];
      x = { state: v?.lastVerifyOk === true ? 'ok' : v?.lastVerifyOk === false ? 'down' : 'unverified', streak: 0 };
      this.health.set(id, x);
    }
    return x;
  }

  /** Settings changed (primary or verify records): forget states that no longer match. */
  settingsChanged(): void {
    for (const [id, x] of this.health) {
      const v = this.d.settings().ai.providers[id];
      if (x.state === 'unverified' && v?.lastVerifyOk === true) x.state = 'ok';
    }
    this.publish();
  }

  netChanged(online: boolean): void {
    if (online) {
      for (const x of this.health.values())
        if (x.state === 'offline') {
          x.state = 'ok';
          x.streak = 0;
        }
      this.publish();
      if (this.pick()) this.d.onUsable();
    } else this.publish();
  }

  status(): AiStatus {
    const s = this.d.settings();
    const primary = s.ai.primary;
    const backup = s.ai.backup;
    if (!primary) return { primary: null, backup, displayName: '', billing: 'plan', state: 'unverified', usingBackup: false };
    const x = this.h(primary);
    const pick = this.pick();
    const out: AiStatus = {
      primary,
      backup,
      displayName: PROVIDER_DISPLAY_NAME[primary],
      billing:
        this.d.registry.adapter(primary).billing === 'local'
          ? 'local'
          : (s.ai.providers[primary]?.kind ?? this.d.registry.adapter(primary).billing),
      state: !this.d.online() ? 'offline' : x.state,
      usingBackup: pick?.backup === true,
    };
    if (x.resetAt !== undefined) out.resetAt = x.resetAt;
    const at = s.ai.providers[primary]?.lastVerifiedAt;
    if (at !== undefined) out.lastVerifiedAt = at;
    return out;
  }

  publish(): void {
    this.d.publish(this.status());
  }

  // ---------------------------------------------------------------- LaneAi

  pick(): { providerId: ProviderId; billing: 'plan' | 'key' | 'local'; backup: boolean } | null {
    if (!this.d.online()) return null;
    const s = this.d.settings();
    const billingOf = (id: ProviderId) => s.ai.providers[id]?.kind ?? this.d.registry.adapter(id).billing;
    const primary = s.ai.primary;
    if (!primary) return null;
    const p = this.h(primary);
    if (p.state === 'ok') return { providerId: primary, billing: billingOf(primary), backup: false };
    // 08-4 §30.9 item 1: chat turns use a verified backup while the primary rests.
    const b = s.ai.backup;
    if (b && b !== primary && (p.state === 'limit' || p.state === 'down' || p.state === 'offline') && this.h(b).state === 'ok')
      return { providerId: b, billing: billingOf(b), backup: true };
    return null;
  }

  turnParams(
    providerId: ProviderId,
    purpose: 'intake' | 'repair' | 'rewrite',
  ): Omit<TurnRequest, 'turnId' | 'purpose' | 'system' | 'prompt'> {
    const p = paramsFor(purpose === 'repair' ? 'intake' : purpose);
    const id = this.adapterId(providerId);
    const out: Omit<TurnRequest, 'turnId' | 'purpose' | 'system' | 'prompt'> = {
      maxOutputTokens: p.maxOutputTokens,
      timeoutMs: purpose === 'repair' ? 30_000 : p.timeoutMs, // 08-4 §30.1 repair row
      temperature: purpose === 'repair' ? (id === 'ollama' || id.endsWith('-key') ? 0 : null) : temperatureFor(id, p),
      stream: purpose === 'intake',
    };
    const model = resolveModel(id, p.tier, this.d.pricing, this.d.settings().ai.providers[providerId]);
    if (model !== undefined) out.model = model;
    return out;
  }

  runTurn(providerId: ProviderId, req: TurnRequest, sink: TurnSink, signal: AbortSignal): Promise<TurnResult> {
    return this.d.registry.runTurn(this.adapterId(providerId), req, sink, signal);
  }

  reportOk(providerId: ProviderId): void {
    const x = this.h(providerId);
    const changed = x.state !== 'ok';
    x.streak = 0;
    x.state = 'ok';
    x.violations = 0;
    delete x.resetAt;
    if (changed) this.publish();
  }

  /** 08-2 §6.7 runner effects for the provider's state. */
  reportError(providerId: ProviderId, kind: AiErrorKind, resetAt?: number): void {
    const x = this.h(providerId);
    const before = x.state;
    switch (kind) {
      case 'NET_OFFLINE':
      case 'AI_SERVICE_DOWN':
        x.streak += 1;
        if (x.streak >= 2) this.rest(providerId, x, kind === 'NET_OFFLINE' ? 'offline' : 'down', kind === 'NET_OFFLINE' ? 30_000 : 2 * MIN);
        break;
      case 'AI_SIGNED_OUT':
        x.state = 'signed_out';
        break;
      case 'AI_KEY_INVALID':
        x.state = 'key_invalid';
        break;
      case 'AI_LIMIT':
        if (resetAt !== undefined) x.resetAt = resetAt;
        this.rest(providerId, x, 'limit', resetAt !== undefined ? Math.max(1_000, resetAt - this.d.clock.now()) : 15 * MIN);
        break;
      case 'AI_CLI_INCOMPATIBLE':
        // Unusable until the next probe (a re-verify re-probes) (08-2 §6.7).
        x.state = 'down';
        break;
      case 'AI_PROTOCOL_VIOLATION':
        // The lane retries once; a second violation in a row makes the provider unusable like AI_CLI_INCOMPATIBLE (08-2 §6.5).
        x.violations = (x.violations ?? 0) + 1;
        if (x.violations >= 2) x.state = 'down';
        break;
      default:
        // AI_TIMEOUT, PROTOCOL_INVALID, …: one failed turn, no state change (08-2 §6.7).
        break;
    }
    if (x.state !== before) this.publish();
  }

  costPaise(
    providerId: ProviderId,
    usage: AiUsage,
    model?: string,
  ): { paise: number | null; source: 'reported' | 'priced' | 'estimated' | 'free' | 'unknown' } {
    const id = this.adapterId(providerId);
    const billing = this.adapter(providerId).billing;
    if (billing === 'local') return { paise: 0, source: 'free' };
    const inr = this.d.pricing.usdToInr * 100;
    if (usage.costUsd !== null) return { paise: Math.round(usage.costUsd * inr), source: 'reported' };
    if (billing === 'key' && usage.tokensIn !== null && usage.tokensOut !== null) {
      const price = priceOf(this.d.pricing, id, model);
      if (price) {
        const usd = (usage.tokensIn * price.inPerMTokUsd + usage.tokensOut * price.outPerMTokUsd) / 1_000_000;
        return { paise: Math.round(usd * inr), source: 'priced' };
      }
    }
    // Plan-billed CLIs report no cost: unknown, never guessed (plan §5 M3 risks).
    return { paise: null, source: 'unknown' };
  }

  // ---------------------------------------------------------------- ai.cmd

  async detect(): Promise<DetectRow[]> {
    return this.d.registry.detectAll((row) => this.d.detectRow(row));
  }

  async verify(providerId: ProviderId): Promise<WireVerifyResult> {
    const r = await this.d.registry.verify(this.adapterId(providerId));
    const at = this.d.clock.now();
    const kind = this.d.settings().ai.providers[providerId]?.kind ?? this.d.registry.adapter(providerId).billing;
    this.d.persist({ providers: { [providerId]: { kind, lastVerifiedAt: at, lastVerifyOk: r.ok } } });
    const x = this.h(providerId);
    if (r.ok) this.reportOk(providerId);
    else if (r.kind) {
      this.reportError(providerId, r.kind, r.resetAt);
      if (x.state === 'ok') x.state = 'down';
      this.publish();
    }
    if (r.ok && this.pick()) this.d.onUsable();
    return r.ok
      ? { ok: true, providerId, displayName: PROVIDER_DISPLAY_NAME[providerId], billing: kind, verifiedAt: at }
      : { ok: false, providerId, kind: r.kind ?? 'UNKNOWN' };
  }

  choose(primary: ProviderId, backup: ProviderId | null): Result<AiStatus> {
    const v = (id: ProviderId) => this.h(id).state === 'ok' || this.d.registry.isVerified(this.adapterId(id));
    if (!v(primary) || (backup && backup !== primary && !v(backup))) return fail('AI_NOT_VERIFIED');
    const b = backup && backup !== primary ? backup : null;
    this.d.persist({ providers: {}, primary, backup: b });
    return ok({ ...this.status(), primary, backup: b, displayName: PROVIDER_DISPLAY_NAME[primary] });
  }

  private rest(providerId: ProviderId, x: ProviderHealth, state: State, retestMs: number): void {
    x.state = state;
    x.since ??= this.d.clock.now();
    if (!this.d.retestTimers) return;
    if (x.timer !== undefined) this.d.clock.clearTimeout(x.timer);
    // After the first hour, retests slow to every 15 min (08-2 §6.7).
    const elapsed = this.d.clock.now() - (x.since ?? this.d.clock.now());
    const wait = state === 'limit' ? retestMs : elapsed >= 60 * MIN ? 15 * MIN : retestMs;
    x.timer = this.d.clock.setTimeout(() => {
      delete x.timer;
      void this.verify(providerId).then((r) => {
        if (r.ok) delete x.since;
      });
    }, wait);
  }
}
