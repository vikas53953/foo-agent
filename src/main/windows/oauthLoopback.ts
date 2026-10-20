// Spec: 08-3 §16.1 (loopback redirect `http://127.0.0.1:{port}/oauth2/callback`, random free port ≥ 49152, served by main for
// ONE request, link valid 10 min → `OAUTH_TIMEOUT`), §16.1.1 (a callback whose `state` does not match is ignored and logged
// `OAUTH_STATE_MISMATCH`; loopback page: HTML served once, inline CSS from 02 tokens, no script, `<title>foo</title>`; success
// "You're connected. You can close this tab and go back to foo."; denied "Nothing was connected. You can close this tab."; the
// listener closes after that one request or after 10 min). Not in 08-0 §E (plan: "main/windows OAuth loopback handler").
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { t } from '../../shared/copy/t';
import { tokens } from '../../shared/tokens';

export const LOOPBACK_TTL_MS = 10 * 60_000;
const CALLBACK_PATH = '/oauth2/callback';
const MIN_PORT = 49152;

export type LoopbackOutcome = { kind: 'code'; code: string } | { kind: 'denied' } | { kind: 'timeout' } | { kind: 'cancelled' };

export interface Loopback {
  port: number;
  redirectUri: string;
  /** Settles once: the one matching request, the 10-minute limit, or close(). */
  result: Promise<LoopbackOutcome>;
  close(): void;
}

export interface LoopbackOptions {
  state: string;
  ttlMs?: number;
  /** Tech-log line (internal kinds only, never the code or the state). */
  log?: (evt: string) => void;
  /** Injected for tests: picks the next port to try. */
  pickPort?: () => number;
}

const c = (name: keyof typeof tokens.colors) => tokens.colors[name];
const px = (name: keyof typeof tokens.size) => `${tokens.size[name]}px`;

/** The one page the browser shows (no script; colours from the 02 tokens, both themes). */
export function loopbackPage(kind: 'ok' | 'denied'): string {
  const line = kind === 'ok' ? t('app.signin_page.connected') : t('app.signin_page.denied');
  const css =
    `body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;` +
    `font-family:"Segoe UI Variable Text","Segoe UI","Nirmala UI",system-ui,sans-serif;` +
    `background:${c('--bg-app').light};color:${c('--fg-1').light}}` +
    `p{max-width:${px('tooltip-max')};padding:${px('gutter')};text-align:center}` +
    `@media (prefers-color-scheme: dark){body{background:${c('--bg-app').dark};color:${c('--fg-1').dark}}}`;
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><title>foo</title><style>${css}</style></head><body><p>${line}</p></body></html>`;
}

const randomPort = () => MIN_PORT + Math.floor(Math.random() * (65535 - MIN_PORT));

async function listen(server: Server, pick: () => number): Promise<number> {
  for (let tries = 0; tries < 20; tries++) {
    const port = pick();
    const okPort = await new Promise<boolean>((resolve) => {
      const onError = () => resolve(false);
      server.once('error', onError);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', onError);
        resolve(true);
      });
    });
    if (okPort) return port;
  }
  throw new Error('no free loopback port');
}

/** Starts the one-request listener; the caller builds the authorization URL from `redirectUri`. */
export async function openLoopback(o: LoopbackOptions): Promise<Loopback> {
  let settle: (r: LoopbackOutcome) => void = () => {};
  const result = new Promise<LoopbackOutcome>((resolve) => (settle = resolve));
  let done = false;
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (done || req.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
      res.writeHead(404).end();
      return;
    }
    if (url.searchParams.get('state') !== o.state) {
      o.log?.('OAUTH_STATE_MISMATCH');
      res.writeHead(400).end();
      return;
    }
    const code = url.searchParams.get('code');
    const page = loopbackPage(code ? 'ok' : 'denied');
    done = true; // one request: anything after this one is a 404
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', connection: 'close' });
    const outcome: LoopbackOutcome = code ? { kind: 'code', code } : { kind: 'denied' };
    // A browser that drops the socket before the page flushes never calls end's callback; the close still settles it.
    res.on('close', () => finish(outcome));
    res.end(page, () => finish(outcome));
  });
  let settled = false;
  const finish = (r: LoopbackOutcome) => {
    if (settled) return;
    settled = done = true;
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
    settle(r);
  };
  const port = await listen(server, o.pickPort ?? randomPort);
  const timer = setTimeout(() => finish({ kind: 'timeout' }), o.ttlMs ?? LOOPBACK_TTL_MS);
  timer.unref?.();
  return { port, redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`, result, close: () => finish({ kind: 'cancelled' }) };
}
