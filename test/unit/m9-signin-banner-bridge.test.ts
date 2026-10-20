// Spec: 09 §9.27.3 (one docked banner per job, following Edge's bounds; it closes with its Edge window), 05-3 §5.10.3 (the
// address row from the page URL; success then close). The engine reads Edge over CDP and reports `signin.banner`; main turns
// each report into one SigninBanners call (M9 T7 gap pick, like `web.refused`).
import { describe, expect, it } from 'vitest';
import { bannerReports } from '../../src/main/jobs/signinBannerBridge';
import type { EdgeBounds, ReadBounds, SigninBanners } from '../../src/main/windows/signinBanner';

const EDGE: EdgeBounds = { x: 10, y: 20, width: 1200, height: 800, chromeTop: 88, minimised: false };

function fakeBanners() {
  const calls: string[] = [];
  let read: ReadBounds | null = null;
  const b = {
    open: (o: { jobId: string; mode: string; url: string; readBounds: ReadBounds }) => {
      calls.push(`open ${o.jobId} ${o.mode} ${o.url}`);
      read = o.readBounds;
    },
    setUrl: (jobId: string, url: string) => calls.push(`url ${jobId} ${url}`),
    signedIn: (jobId: string) => calls.push(`signed_in ${jobId}`),
    close: (jobId: string) => calls.push(`close ${jobId}`),
  };
  return { calls, banners: b as unknown as SigninBanners, read: () => read!() };
}

describe('09 §9.27.3 signin.banner reports', () => {
  it('open, then bounds and the address row follow Edge; until the first bounds the banner stays hidden', async () => {
    const f = fakeBanners();
    const report = bannerReports(() => f.banners);
    report({ jobId: 'j1', op: 'open', mode: 'take_over', url: 'https://example.com/login' });
    expect(f.calls).toEqual(['open j1 take_over https://example.com/login']);
    expect((await f.read())?.minimised).toBe(true);
    report({ jobId: 'j1', op: 'bounds', bounds: EDGE });
    expect(await f.read()).toEqual(EDGE);
    report({ jobId: 'j1', op: 'url', url: 'https://example.com/otp' });
    expect(f.calls.at(-1)).toBe('url j1 https://example.com/otp');
  });

  it('Edge gone (null bounds) reads null, so the banner closes with its window', async () => {
    const f = fakeBanners();
    const report = bannerReports(() => f.banners);
    report({ jobId: 'j1', op: 'open', mode: 'sign_in_here', url: 'https://example.com/', bounds: EDGE });
    expect(await f.read()).toEqual(EDGE);
    report({ jobId: 'j1', op: 'bounds', bounds: null });
    expect(await f.read()).toBeNull();
  });

  it('a failed first read (open with null bounds) waits for the next bounds instead of closing the banner', async () => {
    const f = fakeBanners();
    const report = bannerReports(() => f.banners);
    report({ jobId: 'j1', op: 'open', mode: 'sign_in_here', url: 'https://example.com/', bounds: null });
    expect((await f.read())?.minimised).toBe(true);
    report({ jobId: 'j1', op: 'bounds', bounds: EDGE });
    expect(await f.read()).toEqual(EDGE);
  });

  it('signed_in and close reach the banner; with no banner host (no window yet) a report does nothing', () => {
    const f = fakeBanners();
    const report = bannerReports(() => f.banners);
    report({ jobId: 'j1', op: 'signed_in' });
    report({ jobId: 'j2', op: 'close' });
    expect(f.calls).toEqual(['signed_in j1', 'close j2']);
    expect(() => bannerReports(() => null)({ jobId: 'j1', op: 'close' })).not.toThrow();
  });
});
