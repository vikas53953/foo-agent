// Spec: 08-3 §22.5 (test sites). A small HTTPS client for unit tests: talks to 127.0.0.1 with the sandbox host as SNI
// and Host header, trusts only the sandbox certificate, never follows redirects, and drives the `/__control` endpoint.
import { request } from 'node:https';
import type { SiteName } from './hosts';
import type { Sandbox } from './server';

export interface SandboxReply {
  status: number;
  headers: Record<string, string>;
  text: string;
  /** `name=value` pairs from Set-Cookie, ready to send back. */
  cookie: string;
}

export interface FetchOpts {
  method?: 'GET' | 'POST';
  form?: Record<string, string>;
  json?: unknown;
  cookie?: string;
  /** Override the Host header only (SNI stays the site's), to test routing. */
  hostHeader?: string;
}

export function sandboxFetch(sb: Sandbox, site: SiteName, path: string, o: FetchOpts = {}): Promise<SandboxReply> {
  const host = sb.hosts[site];
  const body = o.json !== undefined ? JSON.stringify(o.json) : o.form ? new URLSearchParams(o.form).toString() : undefined;
  const headers: Record<string, string> = { host: `${o.hostHeader ?? host}:${sb.port}` };
  if (body !== undefined) {
    headers['content-type'] = o.json !== undefined ? 'application/json' : 'application/x-www-form-urlencoded';
    headers['content-length'] = String(Buffer.byteLength(body));
  }
  if (o.cookie) headers.cookie = o.cookie;
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: sb.port,
        path,
        method: o.method ?? (body !== undefined ? 'POST' : 'GET'),
        servername: host,
        ca: sb.cert.cert,
        headers,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) if (typeof v === 'string') flat[k] = v;
          const cookie = (res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]!).join('; ');
          resolve({ status: res.statusCode ?? 0, headers: flat, text: Buffer.concat(chunks).toString('utf8'), cookie });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

export interface ControlState {
  toggles: Record<string, string | number | boolean>;
  counters: Record<string, number>;
  data: unknown;
}

export async function control(sb: Sandbox, site: SiteName): Promise<ControlState> {
  return JSON.parse((await sandboxFetch(sb, site, '/__control')).text) as ControlState;
}

export const setToggles = (sb: Sandbox, site: SiteName, patch: Record<string, unknown>) =>
  sandboxFetch(sb, site, '/__control', { json: patch });

export async function reset(sb: Sandbox, site: SiteName): Promise<void> {
  const r = await sandboxFetch(sb, site, '/__control/reset', { method: 'POST' });
  if (r.status !== 200) throw new Error(`sandbox reset ${site}: ${r.status}`);
}
