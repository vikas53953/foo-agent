// Spec: 08-2 §8.2 (`web.fetch` local path: GET with the Edge user agent, URL policy as `browser.open` re-checked on every
// redirect), 08-4 §27.6 (FOO_TEST_ALLOW_HOSTS, test builds only), CR-0047 (the private-range block is on the address the
// connection is made to: the lookup that feeds the socket refuses a private answer, so a name re-pointed between a check and
// the connect still cannot reach this PC or the local network). The `HttpFetch` the local web read uses.
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { Readable, pipeline } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { HttpFetch } from '../web/types';
import { bareHost, blockedAddress, isLocalName, isPrivateIp, systemResolve, withTimeout, type Resolve } from './address';

const NO_BODY = new Set([204, 205, 304]);

/** The refusal: `localFetch` reports it as URL_NOT_ALLOWED. */
export const REFUSED = 'URL_NOT_ALLOWED';
const refused = () => Object.assign(new Error(REFUSED), { code: REFUSED });
const RESOLVE_MS = 3_000;

function decoded(res: IncomingMessage): Readable {
  const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
  const dec =
    enc === 'gzip' || enc === 'x-gzip'
      ? createGunzip()
      : enc === 'deflate'
        ? createInflate()
        : enc === 'br'
          ? createBrotliDecompress()
          : null;
  if (!dec) return res;
  // pipeline, not pipe: an abort or a dropped socket ends the decoder too, so the reader never waits forever.
  pipeline(res, dec, () => undefined);
  return dec;
}

/** A GET that never connects to a private address unless the host is a test host (redirects are left to the caller). */
export function guardedGet(o: { allowHosts: readonly string[]; resolve?: Resolve }): HttpFetch {
  const resolve = o.resolve ?? systemResolve;
  const allowed = (host: string) => o.allowHosts.includes(bareHost(host));
  const lookup: LookupFunction = (hostname, options, cb) => {
    // Chromium and some resolvers answer localhost names with loopback themselves: refused whatever DNS says.
    if (isLocalName(hostname) && !allowed(hostname)) return cb(refused(), '', 4);
    withTimeout(resolve(bareHost(hostname)), RESOLVE_MS).then(
      (answers) => {
        const all =
          options.family === 4 || options.family === 6 ? answers.filter((a) => (a.includes(':') ? 6 : 4) === options.family) : answers;
        if (!all.length) return cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }), '', 4);
        // Any private answer refuses the host: the socket could pick that one.
        if (all.some((a) => blockedAddress(hostname, a, o.allowHosts))) return cb(refused(), '', 4);
        const fam = (a: string) => (a.includes(':') ? 6 : 4);
        if (options.all)
          return (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(
            null,
            all.map((a) => ({ address: a, family: fam(a) })),
          );
        cb(null, all[0]!, fam(all[0]!));
      },
      (e: unknown) => cb(e as NodeJS.ErrnoException, '', 4),
    );
  };
  return (url, init) =>
    new Promise<Response>((done, fail) => {
      const u = new URL(url);
      const host = bareHost(u.hostname);
      // An address written in the URL is never looked up: it is checked here.
      if ((/^[\d.]+$/.test(host) || host.includes(':')) && isPrivateIp(host) && !allowed(host)) return fail(refused());
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((v, k) => (headers[k] = v));
      headers['accept-encoding'] ??= 'gzip, deflate, br';
      const req = (u.protocol === 'https:' ? httpsRequest : httpRequest)(
        u,
        { method: init.method ?? 'GET', headers, lookup, ...(init.signal ? { signal: init.signal } : {}) },
        (res) => {
          // Any status a server sends is read here; one the Response type cannot carry is a failed read, never a crash.
          const status = res.statusCode ?? 0;
          if (status < 200 || status > 599) {
            res.destroy();
            return fail(new Error(`HTTP_STATUS_${status}`));
          }
          try {
            const h = new Headers();
            for (const [k, v] of Object.entries(res.headers)) {
              if (Array.isArray(v)) v.forEach((x) => h.append(k, x));
              else if (v !== undefined) h.set(k, v);
            }
            const body = NO_BODY.has(status) ? null : (Readable.toWeb(decoded(res)) as ReadableStream<Uint8Array>);
            if (!body) res.resume();
            done(new Response(body, { status, statusText: res.statusMessage ?? '', headers: h }));
          } catch (e) {
            res.destroy();
            fail(e as Error);
          }
        },
      );
      req.on('error', fail);
      req.end();
    });
}
