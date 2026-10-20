// Spec: 08-2 §8.3.5 (watchdogs run for every job page: dialogs, only `alert` is auto-dismissed and `confirm` is treated as a
// commit control (§8.2.1); new tabs and pop-ups are adopted into the job (payment gateways); downloads finished; page crash →
// reload once; challenge page detected → `job.needSignIn{kind:"captcha"}`, here reported as SITE_CAPTCHA for the runner and the
// sign-in lanes (T7) to turn into the Take over lane, 08-2 §8.4: foo never solves a challenge), §8.6 `browser.watchdogs.start`,
// 08-3 §21.2 SITE_CAPTCHA.
import { join } from 'node:path';
import type { Dialog, Download, Page } from 'playwright-core';
import type { DriverWindow } from './browser';

/** Words and frames that mark a bot check or CAPTCHA page (never solved; 08-2 §8.4). */
const CHALLENGE_TEXT =
  /verify (that )?you are (a )?human|are you a robot|i'?m not a robot|checking your browser|attention required|press (and|&) hold|complete the security check|captcha/i;
const CHALLENGE_FRAMES = /recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha|geo\.captcha-delivery/i;

export interface WatchState {
  /** `confirm()` dialogs seen (and dismissed) on the job's pages; a click that raised one is a commit click. */
  confirms: number;
  downloads: { suggestedFilename: string; path: string | null; failed: boolean }[];
  crashes: number;
}

export interface WatchdogDeps {
  log(evt: string, kind?: string): void;
  /** Where a finished download is saved: `{DATA}\jobs\{id}\downloads\`. */
  downloadsDir(jobId: string): string;
}

export class Watchdogs {
  private readonly states = new Map<string, WatchState>();
  private readonly hooked = new WeakSet<Page>();

  constructor(private readonly d: WatchdogDeps) {}

  state(jobId: string): WatchState {
    let s = this.states.get(jobId);
    if (!s) this.states.set(jobId, (s = { confirms: 0, downloads: [], crashes: 0 }));
    return s;
  }

  forget(jobId: string): void {
    this.states.delete(jobId);
  }

  /** `browser.watchdogs.start` for a new job window. */
  start(win: DriverWindow): void {
    this.hook(win, win.page());
  }

  private hook(win: DriverWindow, page: Page): void {
    if (this.hooked.has(page)) return;
    this.hooked.add(page);
    const s = this.state(win.jobId);
    page.on('dialog', (dlg: Dialog) => {
      if (dlg.type() === 'alert') {
        void dlg.accept().catch(() => undefined);
        return;
      }
      if (dlg.type() === 'confirm') s.confirms += 1;
      // confirm, prompt and beforeunload are answered "no": nothing a page asks for this way is agreed to by foo.
      this.d.log('browser.dialog', dlg.type());
      void dlg.dismiss().catch(() => undefined);
    });
    page.on('popup', (popup: Page) => {
      win.adopt(popup);
      this.hook(win, popup);
      this.d.log('browser.popup_adopted');
    });
    page.on('download', (dl: Download) => void this.saveDownload(win.jobId, dl));
    let reloaded = false;
    page.on('crash', () => {
      s.crashes += 1;
      this.d.log('browser.crash', reloaded ? 'again' : 'reload');
      if (!reloaded) {
        reloaded = true;
        void page.reload().catch(() => undefined);
      }
    });
  }

  private async saveDownload(jobId: string, dl: Download): Promise<void> {
    const s = this.state(jobId);
    const name = dl.suggestedFilename().replace(/[\\/:*?"<>|]/g, '_');
    const row = { suggestedFilename: name, path: null as string | null, failed: false };
    s.downloads.push(row);
    try {
      const path = join(this.d.downloadsDir(jobId), name);
      await dl.saveAs(path);
      row.path = path;
    } catch {
      row.failed = true;
    }
  }
}

/** A bot check or CAPTCHA page (08-2 §8.3.5 "challenge page detected"). */
export async function isChallengePage(page: Page): Promise<boolean> {
  if (page.isClosed()) return false;
  if (page.frames().some((f) => CHALLENGE_FRAMES.test(f.url()))) return true;
  const title = await page.title().catch(() => '');
  if (CHALLENGE_TEXT.test(title)) return true;
  const text = (await page.evaluate('document.body ? document.body.innerText.slice(0, 4000) : ""').catch(() => '')) as string;
  return CHALLENGE_TEXT.test(text);
}
