// Spec: 09 §9.27.3 (one docked banner per job: shown on a sign-in or a take-over, follows Edge on every move, resize and
// minimise, "the banner re-reads the bounds through CDP every 500 ms" without the native addon, the address row from
// `page.url()` every 1 s, success for 2 s then it closes, it closes with its Edge window), 05-3 §5.10.3. Edge is the engine's
// (CDP) and the banner is main's window, so the engine reports what it reads (`signin.banner`, gap pick like `web.refused`)
// and this turns each report into one SigninBanners call (open / setUrl / signedIn / close). M9 T7.
import type { SigninBannerMsg } from '../../engine/protocol';
import type { EdgeBounds, SigninBanners } from '../windows/signinBanner';

/** Until the engine's first bounds arrive the banner stays hidden (a minimised Edge hides it, 09 §9.27.3 Stacking). */
const NOT_YET: EdgeBounds = { x: 0, y: 0, width: 0, height: 0, chromeTop: 0, minimised: true };

export function bannerReports(banners: () => SigninBanners | null): (m: SigninBannerMsg) => void {
  const last = new Map<string, EdgeBounds | null>();
  return (m) => {
    const b = banners();
    if (!b) return;
    switch (m.op) {
      case 'open':
        if (m.bounds !== undefined) last.set(m.jobId, m.bounds);
        b.open({
          jobId: m.jobId,
          mode: m.mode ?? 'sign_in_here',
          url: m.url ?? '',
          // wintrack polls this every 500 ms; null (the window is gone) closes the banner.
          readBounds: async () => (last.has(m.jobId) ? (last.get(m.jobId) ?? null) : NOT_YET),
        });
        return;
      case 'bounds':
        last.set(m.jobId, m.bounds ?? null);
        return;
      case 'url':
        if (m.url !== undefined) b.setUrl(m.jobId, m.url);
        return;
      case 'signed_in':
        last.delete(m.jobId);
        b.signedIn(m.jobId);
        return;
      case 'close':
        last.delete(m.jobId);
        b.close(m.jobId);
        return;
    }
  };
}
