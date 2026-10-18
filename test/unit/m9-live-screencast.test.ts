// M9 T5: the engine's screencast (08-2 §8.3.7, 09 §9.27.2, 08-3 §20): `Page.startScreencast({ format:'jpeg', quality:60,
// maxWidth:1280, everyNthFrame:2 })` only while `job.watch` is on, ≤ 5 fps, every frame acknowledged, each frame verified
// masked before it is sent and dropped when it cannot be verified (§8.3.6), nothing during the sign-in pause (§8.3.3),
// frames never stored. Seam: a fake BrowserHandle whose CDP session emits known JPEG frames.
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import type { BrowserHandle, CdpSession, JobWindow } from '../../src/engine/tools/browser/types';
import { Screencast, type EngineLiveFrame } from '../../src/engine/tools/browser/screencast';

const JPEG_A = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const JPEG_B = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 0xff, 0xd9]);

function fakeWorld() {
  const sent: { method: string; params?: Record<string, unknown> }[] = [];
  const listeners = new Map<string, Set<(p: unknown) => void>>();
  let detached = 0;
  const closedCbs = new Set<() => void>();
  const session: CdpSession = {
    async send<T>(method: string, params?: Record<string, unknown>) {
      sent.push({ method, ...(params ? { params } : {}) });
      return undefined as T;
    },
    on(event, cb) {
      const set = listeners.get(event) ?? new Set();
      set.add(cb);
      listeners.set(event, set);
      return () => set.delete(cb);
    },
    async detach() {
      detached += 1;
    },
  };
  let url = 'https://www.makemytrip.com/hotels/goa';
  const win: JobWindow = {
    jobId: 'j1',
    url: () => url,
    cdp: async () => session,
    bringToFront: async () => undefined,
    close: async () => undefined,
    onClosed(cb) {
      closedCbs.add(cb);
      return () => closedCbs.delete(cb);
    },
  };
  const browser: BrowserHandle = {
    ensure: async () => ({ ok: true, value: undefined }),
    openWindow: async () => ({ ok: true, value: win }),
    window: (id) => (id === 'j1' ? win : undefined),
    closeWindow: async () => undefined,
  };
  let sessionId = 0;
  const frame = async (jpeg: Buffer) => {
    sessionId += 1;
    for (const cb of listeners.get('Page.screencastFrame') ?? [])
      cb({ data: jpeg.toString('base64'), sessionId, metadata: { deviceWidth: 1280, deviceHeight: 720 } });
    await new Promise((r) => setImmediate(r));
  };
  return {
    sent,
    browser,
    frame,
    listeners,
    setUrl: (u: string) => (url = u),
    closeWindow: () => closedCbs.forEach((cb) => cb()),
    detached: () => detached,
  };
}

function setup(o: { verified?: () => boolean; paused?: () => boolean; noBrowser?: boolean } = {}) {
  const w = fakeWorld();
  const clock = new FakeClock();
  const out: EngineLiveFrame[] = [];
  const cast = new Screencast({
    browser: () => (o.noBrowser ? null : w.browser),
    verifier: { verify: async () => (o.verified ?? (() => true))() },
    guard: { paused: () => (o.paused ?? (() => false))() },
    clock,
    send: (f) => out.push(f),
    nowLine: () => 'Filling guest details on makemytrip.com',
  });
  return { w, clock, out, cast };
}

describe('screencast (08-2 §8.3.7)', () => {
  it('starts the CDP screencast with the spec parameters only when watched, and stops it when unwatched', async () => {
    const { w, cast } = setup();
    expect(w.sent).toEqual([]);
    expect(await cast.watch('j1', true)).toEqual({ ok: true, value: undefined });
    expect(w.sent).toContainEqual({
      method: 'Page.startScreencast',
      params: { format: 'jpeg', quality: 60, maxWidth: 1280, everyNthFrame: 2 },
    });
    await cast.watch('j1', false);
    expect(w.sent.at(-1)).toEqual({ method: 'Page.stopScreencast' });
    expect(w.listeners.get('Page.screencastFrame')?.size ?? 0).toBe(0);
    expect(w.detached()).toBe(1);
  });

  it('a second watch on the same job does not start a second screencast', async () => {
    const { w, cast } = setup();
    await cast.watch('j1', true);
    await cast.watch('j1', true);
    expect(w.sent.filter((s) => s.method === 'Page.startScreencast')).toHaveLength(1);
  });

  it('a job with no browser window answers LIVE_UNAVAILABLE', async () => {
    const { cast } = setup({ noBrowser: true });
    expect(await cast.watch('j1', true)).toMatchObject({ ok: false, error: { kind: 'LIVE_UNAVAILABLE' } });
    const other = setup();
    expect(await other.cast.watch('nope', true)).toMatchObject({ ok: false, error: { kind: 'LIVE_UNAVAILABLE' } });
  });

  it('forwards a verified frame as live:frame with masked:true, its bytes, size, Now line and page URL', async () => {
    const { w, cast, out } = setup();
    await cast.watch('j1', true);
    await w.frame(JPEG_A);
    expect(out).toHaveLength(1);
    const f = out[0]!;
    expect(f).toMatchObject({ jobId: 'j1', w: 1280, h: 720, masked: true, nowLine: 'Filling guest details on makemytrip.com' });
    expect(f.pageUrl).toBe('https://www.makemytrip.com/hotels/goa');
    expect(Buffer.from(f.jpeg)).toEqual(JPEG_A);
  });

  it('acknowledges every frame, even dropped ones (Chromium stops sending otherwise)', async () => {
    const { w, cast } = setup({ verified: () => false });
    await cast.watch('j1', true);
    await w.frame(JPEG_A);
    await w.frame(JPEG_B);
    expect(w.sent.filter((s) => s.method === 'Page.screencastFrameAck').map((s) => s.params)).toEqual([{ sessionId: 1 }, { sessionId: 2 }]);
  });

  it('drops a frame whose masking cannot be verified (§8.3.6)', async () => {
    let ok = false;
    const { w, cast, out, clock } = setup({ verified: () => ok });
    await cast.watch('j1', true);
    await w.frame(JPEG_A);
    expect(out).toHaveLength(0);
    ok = true;
    clock.advance(200);
    await w.frame(JPEG_B);
    expect(out.map((f) => Buffer.from(f.jpeg))).toEqual([JPEG_B]);
  });

  it('sends at most 5 frames a second', async () => {
    const { w, cast, out, clock } = setup();
    await cast.watch('j1', true);
    for (let i = 0; i < 20; i++) {
      await w.frame(JPEG_A);
      clock.advance(50);
    }
    // 20 frames over 1 s of fake time → one every 200 ms
    expect(out).toHaveLength(5);
  });

  it('sends nothing while the sign-in pause is on (§8.3.3)', async () => {
    let paused = true;
    const { w, cast, out, clock } = setup({ paused: () => paused });
    await cast.watch('j1', true);
    await w.frame(JPEG_A);
    expect(out).toHaveLength(0);
    paused = false;
    clock.advance(200);
    await w.frame(JPEG_B);
    expect(out).toHaveLength(1);
  });

  it('stops by itself when the job’s Edge window closes', async () => {
    const { w, cast } = setup();
    await cast.watch('j1', true);
    w.closeWindow();
    await new Promise((r) => setImmediate(r));
    expect(cast.watching('j1')).toBe(false);
  });

  it('stopAll ends every screencast (engine shutdown, test reset)', async () => {
    const { w, cast } = setup();
    await cast.watch('j1', true);
    await cast.stopAll();
    expect(cast.watching('j1')).toBe(false);
    expect(w.sent.at(-1)).toEqual({ method: 'Page.stopScreencast' });
  });
});
