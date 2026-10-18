// AT-155a (10-acceptance-1 §B; X-42; 08-0 §E.5): the helper apps are exactly claude-cli, codex-cli, gemini-cli (plus the
// local ollama page), each with an https maker page, and foo has no install path: no `ai:install` channel and no code that
// downloads or runs an AI installer. CR-0016 pick G-M12-20.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMakerPages, makerPageUrl } from '../../../src/main/setup/resources';
import { INVOKE_CHANNELS } from '../../../src/shared/ipc';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?)$/.test(p) ? [p] : [];
  });
}

describe('AT-155a maker pages, no install path', () => {
  it('AT-155a: maker-pages.json lists exactly the three helper apps and the local page, https only', () => {
    const pages = loadMakerPages('resources');
    expect(Object.keys(pages).sort()).toEqual(['claude-cli', 'codex-cli', 'gemini-cli', 'ollama']);
    for (const p of Object.values(pages)) expect(new URL(p.url).protocol).toBe('https:');
    expect(pages.ollama.url).toBe('https://ollama.com/download');
    expect(makerPageUrl(pages, 'codex-cli')).toBe(pages['codex-cli'].url);
    expect(makerPageUrl(pages, 'openai-key')).toBeNull();
  });

  it('AT-155a: there is no ai:install channel and nothing in src runs or downloads an installer', () => {
    expect(INVOKE_CHANNELS as readonly string[]).not.toContain('ai:install');
    const install = /ai:install|npm (i|install) -g|winget install|\.msi\b|setup\.exe|installer\.exe/i;
    const hits = walk('src').filter((f) => install.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
