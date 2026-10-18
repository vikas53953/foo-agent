// Spec: 08-0 §E.4 (load URL and CSP, FE-22), 08-1 §1.2.1. Production loads app://foo/index.html. 08-1 §4.1 storage map
// (attachments `{DATA}\data\inbox\`, draft copies `{DATA}\data\drafts\{chatId}\`, voice notes `{DATA}\data\voice\`): the
// app://media host serves only those folders (review S2), after resolving links.
import { realpathSync } from 'node:fs';
import { app, net, protocol } from 'electron';
import { basename, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CSP = "default-src 'self' app:; img-src 'self' app: data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'none'";
export const APP_URL = 'app://foo/index.html';
export const DEV_URL = 'http://localhost:5173';

/** Must run before `ready`. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

export function rendererRoot(): string {
  return join(app.getAppPath(), 'out', 'renderer');
}

/**
 * `path` (absolute, or relative to `dir` with either slash) resolved inside `dir`, or null when it would leave it. Used by
 * files:open / files:showInFolder (PATH_NOT_ALLOWED, 08-1 §3.2) and the app://media host.
 */
export function insideDir(dir: string, path: string): string | null {
  if (!dir || path.includes('\0')) return null;
  const root = resolve(dir);
  const file = normalize(isAbsolute(path) ? path : join(root, path.replace(/\\/g, '/')));
  return file.startsWith(root + sep) ? file : null;
}

/**
 * The CSP allows images only from `app:` (08-0 §E.4), so attachments and voice notes under {DATA} are served as
 * `app://media/?p={path relative to {DATA}}` (M2 builder A gap: 08-0 names no media URL). Only the media folders below.
 */
export const MEDIA_HOST = 'media';

/** 08-1 §4.1: the only folders under {DATA} whose files a page may load (attachments, draft copies, voice notes). */
export const MEDIA_ROOTS = ['data/inbox', 'data/voice', 'data/drafts'] as const;

/** Never served, even if one were linked into a media folder: the database, its WAL/SHM/journal, settings. */
const NEVER_SERVED = /(?:\.db(?:-wal|-shm|-journal)?|^settings(?:\.[a-z]+)*)$/i;

const real = (p: string): string | null => {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
};

/** Windows paths compare case-insensitively. */
const within = (root: string, file: string, win = process.platform === 'win32') => {
  const [r, f] = win ? [root.toLowerCase(), file.toLowerCase()] : [root, file];
  return f.startsWith(r.endsWith(sep) ? r : r + sep);
};

/**
 * The file an app://media `p` names, or null. `p` (relative to {DATA} or absolute) must stay lexically inside {DATA},
 * exist, and its real path (symlinks and junctions resolved) must lie inside the real path of one of MEDIA_ROOTS; the
 * database, WAL/SHM and settings are refused whatever the folder.
 */
export function mediaFile(dataDir: string, p: string): string | null {
  const file = insideDir(dataDir, p);
  if (!file) return null;
  const target = real(file);
  if (!target || NEVER_SERVED.test(basename(target)) || NEVER_SERVED.test(basename(file))) return null;
  for (const root of MEDIA_ROOTS) {
    const r = real(join(dataDir, root));
    if (r && within(r, target)) return target;
  }
  return null;
}

export function handleAppScheme(dataDir: string): void {
  const root = rendererRoot();
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host === MEDIA_HOST) {
      const file = mediaFile(dataDir, url.searchParams.get('p') ?? '');
      if (!file) return new Response('Not found', { status: 404 });
      const res = await net.fetch(pathToFileURL(file).toString());
      return new Response(res.body, { status: res.status, headers: res.headers });
    }
    let rel: string;
    try {
      rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    } catch {
      return new Response('Not found', { status: 404 });
    }
    const file = normalize(join(root, rel));
    if (url.host !== 'foo' || !(file === root || file.startsWith(root + sep))) {
      return new Response('Not found', { status: 404 });
    }
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  });
}

export const isDev = () => process.env.FOO_DEV === '1';
export const startUrl = () => (isDev() ? DEV_URL : APP_URL);

/** Only foo's own pages may talk to main. */
export function isTrustedUrl(url: string): boolean {
  return url.startsWith('app://foo/') || (isDev() && url.startsWith(`${DEV_URL}/`));
}
