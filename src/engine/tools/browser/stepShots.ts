// Spec: 08-2 §8.3.8 (step screenshots: one masked JPEG after each step completes and after each `browser.submit`; never on pages
// with sign-in pause, bank 3-D Secure or OTP fields (§11.6); kept `settings.privacy.screenshotDays` (default 7, 0 = don't keep);
// none when disk < 500 MB, J19.6), §11.6 (no-capture pages: sign-in window up, an OTP field, a host in no-capture-hosts.json, or
// "3D Secure" / "Verified by Visa" / "Mastercard ID Check" / "SafeKey" on the page), 08-1 §4 storage table (`{DATA}\jobs\{jobId}\
// steps\{stepIdx}-{n}.jpg`, JPEG q70, masked), 08-3 §19.3 (pruned per screenshotDays), 08-3 §21.2 DISK_LOW (free < 500 MB).
// The mask is verified on every frame before the picture is taken; an unverifiable page gives no picture (R6).
import { mkdir, readdir, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import type { HostMatcher } from '../../../shared/handback';
import type { Masker } from './masker';
import { walkerCall, type ProbeResult } from './walker';

export const MIN_FREE_BYTES = 500 * 1024 * 1024;
export const JPEG_QUALITY = 70;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Pictures that are not a finished step: the masked picture a thin snapshot adds (§8.3.4) and `browser.screenshot`. */
export type ShotTag = 'snap' | 'shot';

export interface ShotRule {
  screenshotDays: number;
  freeBytes: number;
  /** CaptureGuard: a sign-in / take-over page is in front (08-2 §8.3.3). */
  paused: boolean;
  /** §11.6 no-capture page (OTP field, 3-D Secure words, no-capture host). */
  noCapture: boolean;
  handback: boolean;
}

/** The whole §8.3.8 rule in one place. */
export function shotAllowed(r: ShotRule): boolean {
  return r.screenshotDays > 0 && r.freeBytes >= MIN_FREE_BYTES && !r.paused && !r.noCapture && !r.handback;
}

export function shotPath(dataDir: string, jobId: string, stepIdx: number | ShotTag, n: number): string {
  return join(dataDir, 'jobs', jobId, 'steps', `${stepIdx}-${n}.jpg`);
}

export async function freeBytes(dir: string): Promise<number> {
  try {
    const s = await statfs(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return 0;
  }
}

/** §11.6 for one page: no-capture host, OTP field, or the 3-D Secure words, in any frame. */
export async function isNoCapturePage(page: Page, noCaptureHosts: HostMatcher): Promise<boolean> {
  if (noCaptureHosts.check(page.url())) return true;
  for (const f of page.frames()) {
    if (noCaptureHosts.check(f.url())) return true;
    const p = (await f.evaluate(walkerCall({ cmd: 'probe' })).catch(() => null)) as ProbeResult | null;
    // A frame that cannot be checked is treated as no-capture (the safe side).
    if (!p || p.noCapture) return true;
  }
  return false;
}

export interface StepShotDeps {
  dataDir: string;
  masker: Masker;
  noCaptureHosts: HostMatcher;
  handback(url: string): boolean;
  paused(jobId: string): boolean;
  screenshotDays(): number;
  freeBytes?(dir: string): Promise<number>;
  now(): number;
}

export class StepShots {
  private readonly counters = new Map<string, number>();
  constructor(private readonly d: StepShotDeps) {}

  /** Writes one masked JPEG for the step and returns its path, or null when the rule says no picture. */
  async capture(jobId: string, page: Page, stepIdx: number | ShotTag): Promise<string | null> {
    if (page.isClosed()) return null;
    const free = await (this.d.freeBytes ?? freeBytes)(this.d.dataDir);
    const rule: ShotRule = {
      screenshotDays: this.d.screenshotDays(),
      freeBytes: free,
      paused: this.d.paused(jobId),
      noCapture: await isNoCapturePage(page, this.d.noCaptureHosts),
      handback: this.d.handback(page.url()),
    };
    if (!shotAllowed(rule)) return null;
    await this.d.masker.apply(page);
    if (!(await this.d.masker.verifyPage(page))) return null;
    const jpeg = await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY }).catch(() => null);
    // Re-check after the picture: a field that appeared while it was taken drops the picture.
    if (!jpeg || !(await this.d.masker.verifyPage(page))) return null;
    const key = `${jobId}:${stepIdx}`;
    const n = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, n);
    const path = shotPath(this.d.dataDir, jobId, stepIdx, n);
    await mkdir(join(this.d.dataDir, 'jobs', jobId, 'steps'), { recursive: true });
    await writeFile(path, jpeg);
    return path;
  }

  /** 08-3 §19.3: removes step pictures older than `screenshotDays` (all of them when it is 0). Returns how many went. */
  async prune(): Promise<number> {
    const days = this.d.screenshotDays();
    const cutoff = this.d.now() - days * DAY_MS;
    const jobsDir = join(this.d.dataDir, 'jobs');
    let gone = 0;
    const jobs = await readdir(jobsDir).catch(() => [] as string[]);
    for (const j of jobs) {
      const dir = join(jobsDir, j, 'steps');
      for (const f of await readdir(dir).catch(() => [] as string[])) {
        if (!f.endsWith('.jpg')) continue;
        const p = join(dir, f);
        const st = await stat(p).catch(() => null);
        if (st && (days === 0 || st.mtimeMs < cutoff)) {
          await rm(p, { force: true });
          gone += 1;
        }
      }
    }
    return gone;
  }
}
