// Spec: 08-0 §E.4 (load URL and CSP, FE-22), 08-1 §1.2.1. Production loads app://foo/index.html.
import { app, net, protocol } from 'electron';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';
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
 * `app://media/?p={path relative to {DATA}}` (M2 builder A gap: 08-0 names no media URL). Nothing outside {DATA}.
 */
export const MEDIA_HOST = 'media';

export function handleAppScheme(dataDir: string): void {
  const root = rendererRoot();
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host === MEDIA_HOST) {
      const file = insideDir(dataDir, url.searchParams.get('p') ?? '');
      if (!file) return new Response('Not found', { status: 404 });
      const res = await net.fetch(pathToFileURL(file).toString());
      return new Response(res.body, { status: res.status, headers: res.headers });
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
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
