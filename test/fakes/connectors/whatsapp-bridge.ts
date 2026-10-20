// Spec: 08-3 §22.4 (connectors are faked through the same seams), 08-1 §2.4.2 (the engine's end of the bridge port). A fake
// wa-bridge for in-process tests: it records every EngineToBridge message the engine posts and lets a test play the bridge's
// BridgeToEngine side. It has no send path, so a test can count that the engine never asked for one. Fake numbers only.
import { bridgeToEngineSchema, engineToBridgeSchema, type BridgeToEngine, type EngineToBridge } from '../../../src/shared/waBridge';

type In = { [K in BridgeToEngine['kind']]: [K, Extract<BridgeToEngine, { kind: K }>['payload']] }[BridgeToEngine['kind']];

export class FakeWaBridgePort {
  /** What the engine sent, validated as the real bridge would. */
  readonly received: EngineToBridge[] = [];
  /** Anything the engine sent that the bridge protocol refuses (a send, for example). */
  readonly refused: unknown[] = [];
  private listener: ((e: { data: unknown }) => void) | null = null;
  private seq = 0;
  started = false;

  postMessage(msg: unknown): void {
    const r = engineToBridgeSchema.safeParse(msg);
    if (r.success) this.received.push(r.data);
    else this.refused.push(msg);
  }

  on(_event: 'message', fn: (e: { data: unknown }) => void): void {
    this.listener = fn;
  }

  start(): void {
    this.started = true;
  }

  /** The bridge says something to the engine. */
  emit(...[kind, payload]: In): void {
    this.seq += 1;
    const msg = bridgeToEngineSchema.parse({ id: `fb${this.seq}`, kind, payload });
    this.listener?.({ data: msg });
  }

  kinds(): string[] {
    return this.received.map((m) => m.kind);
  }
}
