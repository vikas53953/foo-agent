// Spec: 08-2 §6.10 (detectAll streamed, verify, choose → AI_NOT_VERIFIED, runTurn, cancel, estimate), §6.6 (all rungs
// in parallel, shown in ladder order; detect < 3 s; chosen = first verified rung), §6.1 (ladder ranks), 08-5 §3
// (DetectRow, AiStatus), 08-0 §B.4 (display names).
import type { AiStatus, ErrorKind, ProviderId } from '../../shared/types';
import type { Result } from '../../shared/errors';
import { fail, ok } from '../../shared/errors';
import type { Clock } from '../../shared/clock';
import type { AiAdapter, DetectResult, TurnRequest, TurnResult, TurnSink, VerifyResult } from './types';

/** 08-5 §3 DetectRow. */
export interface DetectRow {
  providerId: ProviderId;
  found: boolean;
  version?: string;
  signedIn?: boolean;
  path?: string;
  state:
    | 'looking'
    | 'testing'
    | 'works'
    | 'not_found'
    | 'not_signed_in'
    | 'signin_unfinished'
    | 'key_failed'
    | 'plan_limit'
    | 'slow'
    | 'offline'
    | 'needs_helper'
    | 'waiting_helper';
  failKind?: ErrorKind;
}

/** J2 ladder order (08-2 §6.1 ranks 1–5). `fake` is listed last and only when FOO_FAKE_AI is set. */
export const LADDER: ProviderId[] = ['claude-cli', 'codex-cli', 'gemini-cli', 'openai-key', 'anthropic-key', 'google-key', 'ollama'];

/** 08-0 §B.4 (the same table as src/main/store/queries.ts AI_DISPLAY_NAME). */
export const PROVIDER_DISPLAY_NAME: Record<ProviderId, string> = {
  'claude-cli': 'Claude',
  'codex-cli': 'ChatGPT',
  'gemini-cli': 'Gemini',
  'openai-key': 'OpenAI key',
  'anthropic-key': 'Anthropic key',
  'google-key': 'Google key',
  ollama: 'AI on this PC',
  fake: 'Test AI',
};

export const DETECT_LIMIT_MS = 3000;

/** DetectResult → the J2 row right after detection (verification moves it to works / a failure state). */
export function toDetectRow(providerId: ProviderId, r: DetectResult): DetectRow {
  const row: DetectRow = { providerId, found: r.found, state: 'not_found' };
  if (r.version) row.version = r.version;
  if (r.binaryPath) row.path = r.binaryPath;
  switch (r.state) {
    case 'not_installed':
      row.state = 'not_found';
      break;
    case 'installed_not_signed_in':
      row.state = 'not_signed_in';
      row.signedIn = false;
      break;
    case 'key_in_env':
      // The env key is copied into the vault only after "Use this key" (08-2 §6.6), so it cannot be tested yet.
      row.state = 'not_signed_in';
      row.signedIn = false;
      break;
    case 'ready':
    case 'running_local':
      row.state = 'testing';
      row.signedIn = true;
      break;
  }
  return row;
}

export class AiRegistry {
  private readonly verified = new Map<ProviderId, { ok: boolean; at: number }>();
  private readonly turnOwner = new Map<string, ProviderId>();

  constructor(
    private readonly adapters: Record<ProviderId, AiAdapter>,
    private readonly deps: { clock: Clock; fakeEnabled: boolean },
  ) {}

  adapter(id: ProviderId): AiAdapter {
    return this.adapters[id];
  }

  /** Runs every rung at once; `onRow` gets rows in ladder order as soon as each and all before it have settled. */
  async detectAll(onRow: (row: DetectRow) => void = () => undefined): Promise<DetectRow[]> {
    const ids = this.deps.fakeEnabled ? [...LADDER, 'fake' as const] : LADDER;
    const rows: (DetectRow | undefined)[] = ids.map(() => undefined);
    let next = 0;
    const flush = (): void => {
      while (next < ids.length && rows[next]) onRow(rows[next++]!);
    };
    await Promise.all(
      ids.map(async (id, i) => {
        rows[i] = toDetectRow(id, await this.detectOne(id));
        flush();
      }),
    );
    return rows as DetectRow[];
  }

  async verify(id: ProviderId, signal: AbortSignal = new AbortController().signal): Promise<VerifyResult> {
    const r = await this.adapters[id].verify(signal);
    this.verified.set(id, { ok: r.ok, at: this.deps.clock.now() });
    return r;
  }

  isVerified(id: ProviderId): boolean {
    return this.verified.get(id)?.ok === true;
  }

  /** 08-2 §6.10 `choose`: primary (and a backup when given) must have verified. A backup equal to the primary is dropped. */
  choose(primary: ProviderId, backup?: ProviderId | null): Result<AiStatus> {
    if (!this.isVerified(primary)) return fail('AI_NOT_VERIFIED');
    const b = backup && backup !== primary ? backup : null;
    if (b && !this.isVerified(b)) return fail('AI_NOT_VERIFIED');
    return ok({
      primary,
      backup: b,
      displayName: PROVIDER_DISPLAY_NAME[primary],
      billing: this.adapters[primary].billing,
      state: 'ok',
      lastVerifiedAt: this.verified.get(primary)!.at,
      usingBackup: false,
    });
  }

  async runTurn(id: ProviderId, req: TurnRequest, sink: TurnSink, signal: AbortSignal): Promise<TurnResult> {
    this.turnOwner.set(req.turnId, id);
    try {
      return await this.adapters[id].runTurn(req, sink, signal);
    } finally {
      this.turnOwner.delete(req.turnId);
    }
  }

  /** Kill tree / abort; idempotent, a finished or unknown turn is a no-op. */
  async cancel(turnId: string): Promise<void> {
    const id = this.turnOwner.get(turnId);
    if (id) await this.adapters[id].cancel(turnId);
  }

  estimate(id: ProviderId, req: TurnRequest): { tokensIn: number; tokensOutMax: number; costPaise: number | null } {
    return this.adapters[id].estimate(req);
  }

  private async detectOne(id: ProviderId): Promise<DetectResult> {
    let timer: number | undefined;
    const limit = new Promise<DetectResult>((resolve) => {
      timer = this.deps.clock.setTimeout(() => resolve({ found: false, state: 'not_installed' }), DETECT_LIMIT_MS);
    });
    try {
      return await Promise.race([this.adapters[id].detect().catch((): DetectResult => ({ found: false, state: 'not_installed' })), limit]);
    } finally {
      if (timer !== undefined) this.deps.clock.clearTimeout(timer);
    }
  }
}
