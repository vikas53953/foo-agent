// Spec: 08-2 §6.2 (adapters take their dependencies, no module-level side effects), §6.3 (paths {LOCAL}, {DATA}),
// 08-3 §22.2 (injected Clock), §22.3 (FOO_FAKE_AI). `AdapterDeps` is named in types.ts's header; spelled out here.
import type { spawn as nodeSpawn } from 'node:child_process';
import type { ProviderId } from '../../shared/types';
import type { Clock } from '../../shared/clock';
import type { Pricing } from './models';
import type { CliLimiter } from './lanes';

/** The few file-system calls detect/fake/key adapters need; tests pass an in-memory fake. */
export interface AiFs {
  exists(p: string): Promise<boolean>;
  readFile(p: string): Promise<Buffer>;
  readText(p: string): Promise<string>;
  writeText(p: string, text: string): Promise<void>;
  appendText(p: string, text: string): Promise<void>;
  mkdirp(p: string): Promise<void>;
  remove(p: string): Promise<void>;
  list(dir: string): Promise<string[]>;
}

export interface AdapterDeps {
  clock: Clock;
  /** Defaults to node:child_process spawn. */
  spawn?: typeof nodeSpawn;
  fetch: typeof fetch;
  paths: { LOCAL: string; DATA: string };
  /** The user environment (main merges HKCU\Environment in). */
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  /** Vault read (08-2 §6.3.1, `vault.use({purpose:'ai_call'})`); null when no key. Never logged. */
  getKey(providerId: ProviderId): Promise<string | null>;
  /** `where <bin>` on Windows, `which` elsewhere; null when absent. */
  which(bin: string): Promise<string | null>;
  fs: AiFs;
  pricing: Pricing;
  /** settings.ai.providers[p] model overrides (08-4 §30.1 resolution order). */
  providerSettings?(providerId: ProviderId): { model?: string; cheapModel?: string } | undefined;
  /** Node binary used for `.cmd` shims (foo's own Electron binary, ELECTRON_RUN_AS_NODE=1). */
  execPath: string;
  /** IANA zone for reset-time parsing (settings.locale.timezone). */
  timeZone: string;
  /** net.isOnline() (08-2 §6.7 NET_OFFLINE). */
  isOnline?(): boolean;
  /** Shared cap of 4 CLI children (08-2 §6.9). One per engine. */
  cliLimiter: CliLimiter;
}
