// Spec: 08-1 §3.1.1 (per-window channel allow list: the sign-in banner window gets `signin:done`, `signin:skip`,
// `job:handBack` and nothing else), 09 §9.27.3.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INVOKE_CHANNELS } from '../../src/shared/ipc';

const src = readFileSync('src/preload/preloadBanner.ts', 'utf8');
const invokes = [...src.slice(src.indexOf('const INVOKES = new Set(['), src.indexOf(']);')).matchAll(/'([^']+)'/g)].map((m) => m[1]);

describe('sign-in banner preload', () => {
  it('allows exactly signin:done, signin:skip and job:handBack', () =>
    expect(invokes.sort()).toEqual(['job:handBack', 'signin:done', 'signin:skip']));
  it('each is a shared invoke channel', () => {
    for (const c of invokes) expect(INVOKE_CHANNELS as readonly string[]).toContain(c);
  });
  it('the banner window loads it, not the main preload', () => {
    const host = readFileSync('src/main/windows/signinBannerHost.ts', 'utf8');
    expect(host).toContain("'preloadBanner.js'");
    expect(host).not.toContain('preloadPath()');
  });
});
