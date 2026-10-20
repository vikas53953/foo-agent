// Spec: 08-3 §22.3 (test runs swap real outside services for fakes; this one stands in for foo's Edge, 08-2 §8.3, until M9 T3
// lands the playwright-core BrowserHandle), 08-2 §8.3.7 (the CDP screencast events the live window consumes). Only in FOO_TEST
// runs with FOO_FAKE_BROWSER = a folder of JPEG frames (already masked at source, like real frames); every job has a window
// whose page sends those frames in turn, a few times a second, while its screencast runs.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok } from '../../../shared/errors';
import type { BrowserHandle, CdpSession, JobWindow } from './types';

export const FAKE_PAGE_URL = 'https://stays.example/goa/guest-details';
const FRAME_EVERY_MS = 250;

export function fakeBrowser(framesDir: string): BrowserHandle {
  const frames = readdirSync(framesDir)
    .filter((n) => /\.jpe?g$/i.test(n))
    .sort()
    .map((n) => readFileSync(join(framesDir, n)).toString('base64'));
  const windows = new Map<string, JobWindow>();

  const windowFor = (jobId: string): JobWindow => {
    const existing = windows.get(jobId);
    if (existing) return existing;
    const listeners = new Map<string, Set<(p: unknown) => void>>();
    let timer: ReturnType<typeof setInterval> | null = null;
    let seq = 0;
    const emit = () => {
      seq += 1;
      for (const cb of listeners.get('Page.screencastFrame') ?? [])
        cb({ data: frames[(seq - 1) % frames.length], sessionId: seq, metadata: { deviceWidth: 1280, deviceHeight: 720 } });
    };
    const session: CdpSession = {
      async send<T>(method: string) {
        if (method === 'Page.startScreencast' && !timer && frames.length) {
          emit();
          timer = setInterval(emit, FRAME_EVERY_MS);
        }
        if (method === 'Page.stopScreencast' && timer) {
          clearInterval(timer);
          timer = null;
        }
        return undefined as T;
      },
      on(event, cb) {
        const set = listeners.get(event) ?? new Set();
        set.add(cb);
        listeners.set(event, set);
        return () => set.delete(cb);
      },
      async detach() {
        if (timer) clearInterval(timer);
        timer = null;
      },
    };
    const win: JobWindow = {
      jobId,
      url: () => FAKE_PAGE_URL,
      cdp: async () => session,
      bringToFront: async () => undefined,
      close: async () => undefined,
      onClosed: () => () => undefined,
    };
    windows.set(jobId, win);
    return win;
  };

  return {
    ensure: async () => ok(undefined),
    openWindow: async (jobId) => ok(windowFor(jobId)),
    window: (jobId) => windowFor(jobId),
    closeWindow: async (jobId) => {
      windows.delete(jobId);
    },
  };
}
