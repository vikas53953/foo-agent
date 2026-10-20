// Spec: 09 §9.27.3 (banner: 72 px = address 32 + banner 40, width = Edge's width, docked under Edge's toolbar at
// y = edge.y + (outerHeight − innerHeight); follows Edge on move / resize / minimise; without the addon the bounds are
// re-read every 500 ms; closes with its Edge window; Alt+D = I'm done / Hand back), 05-3 §5.10.3 (states waiting /
// in_control / signed_in; the success banner shows for 2 s, then the window closes; the address row is read-only, from
// the page URL), X-121 (Edge is never resized; one banner per job).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bannerHash, dockRect, SigninBanners, type BannerWindow, type EdgeBounds } from '../../src/main/windows/signinBanner';
import { trackWindow } from '../../src/main/windows/wintrack';
import { addressOf, parseBannerHash } from '../../src/renderer/signin-banner/bannerView';

const EDGE: EdgeBounds = { x: 100, y: 50, width: 1200, height: 800, chromeTop: 88, minimised: false };

class FakeWin implements BannerWindow {
  bounds: unknown = null;
  shown = false;
  closed = false;
  hashes: string[] = [];
  focused = 0;
  private closedCb: (() => void) | null = null;
  setBounds(r: unknown) {
    this.bounds = r;
  }
  show() {
    this.shown = true;
  }
  hide() {
    this.shown = false;
  }
  focus() {
    this.focused++;
  }
  load(hash: string) {
    this.hashes.push(hash);
  }
  close() {
    this.closed = true;
    this.closedCb?.();
  }
  onClosed(cb: () => void) {
    this.closedCb = cb;
  }
  get state() {
    return parseBannerHash(this.hashes.at(-1) ?? '')?.state;
  }
}

function rig() {
  const wins: FakeWin[] = [];
  const actions: [string, string][] = [];
  const keys = new Map<string, () => void>();
  let edge: EdgeBounds | null = { ...EDGE };
  const banners = new SigninBanners({
    create: () => {
      const w = new FakeWin();
      wins.push(w);
      return w;
    },
    agentName: () => 'foo',
    onAction: (jobId, action) => actions.push([jobId, action]),
    shortcut: {
      register: (accel, cb) => (keys.set(accel, cb), true),
      unregister: (accel) => void keys.delete(accel),
    },
  });
  const read = () => Promise.resolve(edge && { ...edge });
  return { banners, wins, actions, keys, read, setEdge: (e: EdgeBounds | null) => (edge = e) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('dock rect (09 §9.27.3)', () => {
  it('sits under Edge’s toolbar, Edge’s width, 72 px tall', () => {
    expect(dockRect(EDGE)).toEqual({ x: 100, y: 138, width: 1200, height: 72 });
  });
});

describe('wintrack JS fallback (bounds every 500 ms)', () => {
  it('reports a change once, and null when Edge is gone (then stops)', async () => {
    let b: EdgeBounds | null = { ...EDGE };
    const seen: (EdgeBounds | null)[] = [];
    const stop = trackWindow(
      () => Promise.resolve(b && { ...b }),
      (x) => seen.push(x),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([EDGE]);
    await vi.advanceTimersByTimeAsync(500);
    expect(seen).toHaveLength(1); // unchanged bounds are not re-reported
    b = { ...EDGE, x: 300 };
    await vi.advanceTimersByTimeAsync(499);
    expect(seen).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen.at(-1)).toMatchObject({ x: 300 });
    b = null;
    await vi.advanceTimersByTimeAsync(500);
    expect(seen.at(-1)).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(seen).toHaveLength(3);
    stop();
  });
});

describe('banner window (05-3 §5.10.3, 09 §9.27.3)', () => {
  it('sign in: opens in `waiting`, docked, shown and focused', async () => {
    const r = rig();
    r.banners.open({ jobId: 'j_1', mode: 'sign_in_here', url: 'https://www.irctc.co.in/nget/signin?x=1', readBounds: r.read });
    await vi.advanceTimersByTimeAsync(0);
    const w = r.wins[0]!;
    expect(w.state).toBe('waiting');
    expect(w.bounds).toEqual({ x: 100, y: 138, width: 1200, height: 72 });
    expect(w.shown).toBe(true);
    expect(w.focused).toBe(1);
  });

  it('take over: opens in `in_control`', async () => {
    const r = rig();
    r.banners.open({ jobId: 'j_1', mode: 'take_over', url: 'https://a.in/', readBounds: r.read });
    await vi.advanceTimersByTimeAsync(0);
    expect(r.wins[0]!.state).toBe('in_control');
  });

  it('one banner per job: a second open reuses it', async () => {
    const r = rig();
    r.banners.open({ jobId: 'j_1', mode: 'sign_in_here', url: 'https://a.in/', readBounds: r.read });
    r.banners.open({ jobId: 'j_1', mode: 'take_over', url: 'https://a.in/', readBounds: r.read });
    await vi.advanceTimersByTimeAsync(0);
    expect(r.wins).toHaveLength(1);
    expect(r.wins[0]!.state).toBe('in_control');
  });

  it('follows Edge when it moves, hides when Edge is minimised, shows again on restore', async () => {
    const r = rig();
    r.banners.open({ jobId: 'j_1', mode: 'sign_in_here', url: 'https://a.in/', readBounds: r.read });
    await vi.advanceTimersByTimeAsync(0);
    const w = r.wins[0]!;
    r.setEdge({ ...EDGE, x: 400, width: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(w.bounds).toEqual({ x: 400, y: 138, width: 900, height: 72 });
    r.setEdge({ ...EDGE, minimised: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(w.shown).toBe(false);
    r.setEdge({ ...EDGE });
    await vi.advanceTimersByTimeAsync(500);
    expect(w.shown).toBe(true);
  });

  it('closes with its Edge window', async () => {
    const r = rig();
    r.banners.open({ jobId: 'j_1', mode: 'sign_in_here', url: 'https://a.in/', readBounds: r.read });
    await vi.advanceTimersByTimeAsync(0);
    r.setEdge(null);
    await vi.advanceTimersByTimeAsync(500);
    expect(r.wins[0]!.closed).toBe(true);
    expect(r.banners.state('j_1')).toBeUndefined();
  });

  it('signed in: the success banner for 2 s, then the window closes', async () => {
    const r = rig();
    r.banners.open({ jobId: 'j_1', mode: 'sign_in_here', url: 'https://a.in/', readBounds: r.read });
    await vi.advanceTimersByTimeAsync(0);
    r.banners.signedIn('j_1');
    const w = r.wins[0]!;
    expect(w.state).toBe('signed_in');
    await vi.advanceTimersByTimeAsync(1999);
    expect(w.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(w.closed).toBe(true);
  });

  it('the address row follows the page URL', async () => {
    const r = rig();
    r.banners.open({ jobId: 'j_1', mode: 'sign_in_here', url: 'https://a.in/login', readBounds: r.read });
    r.banners.setUrl('j_1', 'https://a.in/otp');
    expect(parseBannerHash(r.wins[0]!.hashes.at(-1)!)?.url).toBe('https://a.in/otp');
  });

  it('Alt+D while a banner is shown = I’m done (sign in) / Hand back (take over); released when it closes', async () => {
    const r = rig();
    r.banners.open({ jobId: 'j_1', mode: 'sign_in_here', url: 'https://a.in/', readBounds: r.read });
    await vi.advanceTimersByTimeAsync(0);
    r.keys.get('Alt+D')!();
    r.banners.open({ jobId: 'j_2', mode: 'take_over', url: 'https://b.in/', readBounds: r.read });
    await vi.advanceTimersByTimeAsync(0);
    r.keys.get('Alt+D')!();
    expect(r.actions).toEqual([
      ['j_1', 'done'],
      ['j_2', 'hand_back'],
    ]);
    r.banners.close('j_1');
    r.banners.close('j_2');
    expect(r.keys.has('Alt+D')).toBe(false);
  });
});

describe('banner page model (05-3 §5.10.3 address row)', () => {
  it('round-trips the window state through the URL hash', () => {
    const h = bannerHash({ jobId: 'j_1', state: 'waiting', url: 'https://a.in/x', agentName: 'foo' });
    expect(parseBannerHash(h)).toEqual({ jobId: 'j_1', state: 'waiting', url: 'https://a.in/x', agentName: 'foo' });
    expect(parseBannerHash('#state=nope')).toBeNull();
  });

  it('https: lock, domain and path; the query and fragment are never shown', () => {
    expect(addressOf('https://www.irctc.co.in/nget/signin?token=abc#f')).toEqual({
      secure: true,
      domain: 'www.irctc.co.in',
      path: '/nget/signin',
    });
  });

  it('http: no lock (the row says "Not secure")', () => {
    expect(addressOf('http://example.test/login')).toEqual({ secure: false, domain: 'example.test', path: '/login' });
  });
});
