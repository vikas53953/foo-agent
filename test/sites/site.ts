// Spec: 08-3 §22.5 (test sites). The shape every sandbox site has: its own toggles (changed through the `/__control`
// endpoint), its own counters, and a pure request handler. Pages are plain HTML with no external assets.

export interface SiteRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  /** urlencoded POST body (empty for GET). */
  form: URLSearchParams;
  cookies: Record<string, string>;
}

export interface SiteResponse {
  status: number;
  body: string;
  type?: string;
  headers?: Record<string, string>;
}

export type Counters = Record<string, number>;

/** Toggles are flat scalars, so `/__control` can type-check a patch against the initial values. */
export type Toggles = Record<string, string | number | boolean>;

export interface Site<T extends Toggles, D = unknown> {
  initialToggles(): T;
  initialData(): D;
  handle(req: SiteRequest, ctx: { toggles: T; data: D; count(name: string): void }): SiteResponse;
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function html(title: string, body: string, head = ''): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>${head}
<style>body{font:16px system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1b1b1f}
img{border-radius:8px}li.option{display:flex;gap:12px;align-items:center;margin:12px 0}dl{display:grid;grid-template-columns:auto auto;gap:4px 16px}
label{display:block;margin:8px 0}button{font:inherit;padding:8px 16px}</style></head>
<body>${body}</body></html>`;
}

export const page = (title: string, body: string, status = 200, head = ''): SiteResponse => ({
  status,
  body: html(title, body, head),
});

export const redirect = (location: string, cookie?: string): SiteResponse => ({
  status: 303,
  body: '',
  headers: { location, ...(cookie ? { 'set-cookie': `${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax` } : {}) },
});

export const notFound = (): SiteResponse => page('Not found', '<h1>Not found</h1>', 404);

export const defineSite = <T extends Toggles, D>(site: Site<T, D>) => site;
