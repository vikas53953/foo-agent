// Spec: 08-4 §27.3 (Browser Use: POST {base}/tasks → {id}; GET {base}/tasks/{id} status/output/steps[].url; PATCH {action:"stop"};
// key check GET {base}/me). Fake Browser Use: a task finishes after `runningPolls` polls, or never.
import { json, type Captured, type Handler } from './net';

export interface FakeBrowserUse {
  handler: Handler;
  created: Captured[];
  polls: number;
  stops: Captured[];
}

export function fakeBrowserUse(mode: { runningPolls?: number; final?: 'finished' | 'failed' | 'never'; output?: string; status?: number } = {}): FakeBrowserUse {
  const s: FakeBrowserUse = { created: [], polls: 0, stops: [], handler: () => json(500, {}) };
  s.handler = (req) => {
    if (mode.status && mode.status !== 200) return json(mode.status, { detail: 'fake' });
    if (req.path === '/api/v2/me' && req.method === 'GET') return json(200, { id: 'user_fake' });
    if (req.path === '/api/v2/tasks' && req.method === 'POST') {
      s.created.push(req);
      return json(202, { id: 'task_fake1' });
    }
    if (req.path === '/api/v2/tasks/task_fake1' && req.method === 'GET') {
      s.polls++;
      const done = mode.final !== 'never' && s.polls > (mode.runningPolls ?? 1);
      return json(200, {
        id: 'task_fake1',
        status: done ? (mode.final ?? 'finished') : 'started',
        output: done ? (mode.output ?? 'Three Italian places with menus online: Trattoria Uno, Pasta Corner, Cafe Due.') : null,
        steps: [{ url: 'https://example-guide.test/bandra' }, { url: 'https://example-food.test/menu' }, { url: 'https://example-food.test/menu' }],
      });
    }
    if (req.path === '/api/v2/tasks/task_fake1' && req.method === 'PATCH') {
      s.stops.push(req);
      return json(200, { id: 'task_fake1', status: 'stopped' });
    }
    return json(404, {});
  };
  return s;
}
