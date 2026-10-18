// Spec: 08-4 §27.3 (`web.browseCloud` Browser Use: POST {base}/tasks, header `X-Browser-Use-API-Key`, body { task: goal,
// startUrl: url, allowedDomains: [hostname(url)], maxSteps: 20 } → { id }; poll GET {base}/tasks/{id} every 3 s for ≤ 180 s;
// status "finished" → output (≤ 20,000 chars) + steps[].url as links; any other terminal status or the deadline → PATCH
// {base}/tasks/{id} { action: "stop" } and USE_EDGE; key check GET {base}/me; item 5: steps = steps.length of the final GET).
import { MAX_READ_CHARS } from './firecrawl';
import { field, hostOf, str, type CloudRequest } from './http';
import type { ReadResult } from './types';

export const POLL_MS = 3_000;
export const MAX_STEPS = 20;
const RUNNING = new Set(['created', 'started', 'running', 'queued', 'pending', 'paused']);

export const browseruse = {
  create(base: string, key: string, goal: string, url: string): CloudRequest {
    return {
      method: 'POST',
      url: `${base}/tasks`,
      headers: { 'X-Browser-Use-API-Key': key },
      body: { task: goal, startUrl: url, allowedDomains: [hostOf(url)], maxSteps: MAX_STEPS },
    };
  },
  get(base: string, key: string, id: string): CloudRequest {
    return { method: 'GET', url: `${base}/tasks/${encodeURIComponent(id)}`, headers: { 'X-Browser-Use-API-Key': key } };
  },
  stop(base: string, key: string, id: string): CloudRequest {
    return { method: 'PATCH', url: `${base}/tasks/${encodeURIComponent(id)}`, headers: { 'X-Browser-Use-API-Key': key }, body: { action: 'stop' } };
  },
  me(base: string, key: string): CloudRequest {
    return { method: 'GET', url: `${base}/me`, headers: { 'X-Browser-Use-API-Key': key } };
  },
  taskId(body: unknown): string | null {
    return str(field(body, 'id'));
  },
  status(body: unknown): 'running' | 'finished' | 'other' {
    const s = str(field(body, 'status')) ?? '';
    if (s === 'finished') return 'finished';
    return RUNNING.has(s) ? 'running' : 'other';
  },
  steps(body: unknown): number {
    const s = field(body, 'steps');
    return Array.isArray(s) ? s.length : 0;
  },
  map(body: unknown, startUrl: string): ReadResult {
    const steps = field(body, 'steps');
    const links = Array.isArray(steps) ? [...new Set(steps.map((s: unknown) => str(field(s, 'url'))).filter((u): u is string => !!u))] : [];
    return { text: (str(field(body, 'output')) ?? '').slice(0, MAX_READ_CHARS), title: null, url: startUrl, site: hostOf(startUrl), date: null, links };
  },
};
