// ART-15b (10-2 §D, Article 15), hosts so far (CR-0012 G-M8-01): foo's connector traffic goes only to the connected apps'
// own hosts and never to a foo-owned host (D-38). Pages foo opens in the user's browser (Google's sign-in, Gmail's web
// pages, X's post page) are the browser's traffic, not foo's. The full network capture through every journey is the
// release run's (10-2 §G.8); this scan keeps the M8 code honest until then.
import { describe, expect, it } from 'vitest';
import { files, read } from './scan';

/** G-M8-01: the hosts foo's own connector calls may reach. */
const CONNECTOR_HOSTS = new Set([
  'oauth2.googleapis.com',
  'gmail.googleapis.com',
  'www.googleapis.com',
  'people.googleapis.com',
  'web.whatsapp.com',
  // The OAuth loopback on the user's own PC (08-3 §16.1).
  '127.0.0.1',
]);

/** Pages foo hands to the default browser (app:openExternal / a link), never fetched by foo itself. */
const BROWSER_HOSTS = new Set(['accounts.google.com', 'mail.google.com', 'x.com']);

const CONNECTOR_DIRS = [
  'src/engine/tools/connectors',
  'src/engine/connections',
  'src/wa-bridge',
  'src/main/connections',
  'src/main/drafts',
  'src/main/whatsapp',
];

const hostsIn = (text: string) => [...text.matchAll(/\b(?:https?|wss?):\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]!.toLowerCase());

describe('ART-15b · connector traffic only to the connected apps (hosts so far, G-M8-01)', () => {
  const sources = CONNECTOR_DIRS.flatMap((d) => files(d, /\.tsx?$/));

  it('ART-15b · every host named in the connector code is a connected app, the loopback, or a page opened in the browser', () => {
    expect(sources.length).toBeGreaterThan(10);
    const stray = sources.flatMap((p) =>
      hostsIn(read(p))
        .filter((h) => !CONNECTOR_HOSTS.has(h) && !BROWSER_HOSTS.has(h))
        .map((h) => `${p}: ${h}`),
    );
    expect(stray).toEqual([]);
  });

  it('ART-15b · the WhatsApp bridge never asks GitHub for the latest Baileys version (G-M8-06)', () => {
    const code = (p: string) =>
      read(p)
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    const bridge = files('src/wa-bridge', /\.ts$/).map(code).join('\n');
    expect(bridge).not.toMatch(/fetchLatestBaileysVersion\s*\(/);
  });

  it('ART-15b · no foo-owned host anywhere in the app (D-38)', () => {
    const owned = files('src', /\.(tsx?|json)$/).flatMap((p) =>
      hostsIn(read(p))
        .filter((h) => /(^|\.)foo[a-z0-9-]*\.[a-z]+$/.test(h) && h !== 'www.example.com')
        .map((h) => `${p}: ${h}`),
    );
    expect(owned).toEqual([]);
  });
});
