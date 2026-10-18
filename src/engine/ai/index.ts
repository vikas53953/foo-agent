// Spec: 08-2 §6 (your-AI adapters: one per ProviderId, built from injected deps, no module-level side effects),
// §6.3 (`where` / `which` for binaries), 08-4 §30.2 (pricing.json loaded and zod-checked).
import { execFile } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { ProviderId } from '../../shared/types';
import type { AiAdapter } from './types';
import type { AdapterDeps, AiFs } from './deps';
import { createClaudeCli } from './claudeCli';
import { createCodexCli } from './codexCli';
import { createGeminiCli } from './geminiCli';
import { createOpenAiKey } from './openaiKey';
import { createAnthropicKey } from './anthropicKey';
import { createGoogleKey } from './googleKey';
import { createOllama } from './ollama';
import { createFake } from './fake';
import { loadPricing, type Pricing } from './models';

export type { AdapterDeps, AiFs } from './deps';
export { AiRegistry, LADDER, PROVIDER_DISPLAY_NAME, toDetectRow, type DetectRow } from './AiRegistry';
export { CliLimiter, LaneLimiter } from './lanes';
export { createLmStudio } from './openaiKey';
export { sweepSystemFiles } from './cliCommon';
export { loadPricing, paramsFor, resolveModel } from './models';

export function createAdapters(deps: AdapterDeps): Record<ProviderId, AiAdapter> {
  return {
    'claude-cli': createClaudeCli(deps),
    'codex-cli': createCodexCli(deps),
    'gemini-cli': createGeminiCli(deps),
    'openai-key': createOpenAiKey(deps),
    'anthropic-key': createAnthropicKey(deps),
    'google-key': createGoogleKey(deps),
    ollama: createOllama(deps),
    fake: createFake(deps),
  };
}

/** The real file system for AdapterDeps.fs. */
export const nodeAiFs: AiFs = {
  exists: async (p) =>
    fsp.access(p).then(
      () => true,
      () => false,
    ),
  readFile: (p) => fsp.readFile(p),
  readText: (p) => fsp.readFile(p, 'utf8'),
  writeText: (p, t) => fsp.writeFile(p, t, 'utf8'),
  appendText: (p, t) => fsp.appendFile(p, t, 'utf8'),
  mkdirp: async (p) => {
    await fsp.mkdir(p, { recursive: true });
  },
  remove: (p) => fsp.rm(p, { force: true }),
  list: (d) => fsp.readdir(d),
};

/** `where <bin>` on Windows (first hit, `.exe` preferred), `which` elsewhere; null when absent. */
export function nodeWhich(platform: NodeJS.Platform = process.platform): (bin: string) => Promise<string | null> {
  return (bin) =>
    new Promise((resolve) => {
      execFile(platform === 'win32' ? 'where' : 'which', [bin], { windowsHide: true, timeout: 2000 }, (err, stdout) => {
        if (err) return resolve(null);
        const hits = String(stdout)
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        resolve(hits.find((h) => /\.exe$/i.test(h)) ?? hits[0] ?? null);
      });
    });
}

/** Reads and validates resources/pricing.json (throws on a bad file). */
export async function readPricingFile(file: string, fs: Pick<AiFs, 'readText'> = nodeAiFs): Promise<Pricing> {
  return loadPricing(JSON.parse(await fs.readText(path.resolve(file))));
}
