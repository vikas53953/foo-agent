// Spec: 08-2 §8.3.6 (masking at source: the mask stylesheet is present while foo controls the page and removed on take-over;
// fill functions add `data-foo-secret`), §8.3.7 (before a frame leaves the engine the mask is verified by a computed-style check on
// every sensitive element, cached per DOM mutation; a frame that cannot be verified is dropped), 11.4 R6. CR-0013: implements the
// `FrameVerifier` seam T5's screencast and T3's step screenshots call. Every frame of the page is checked, cross-origin ones
// included; a frame that cannot be evaluated fails the check.
import type { Frame, Page } from 'playwright-core';
import type { FrameVerifier, JobWindow } from './types';
import { MASK_CSS, MASK_STYLE_ID, walkerCall, type VerifyResult } from './walker';

interface Pageful {
  page(): Page;
}
const hasPage = (w: JobWindow): w is JobWindow & Pageful => typeof (w as Partial<Pageful>).page === 'function';

export class Masker implements FrameVerifier {
  /** Pages foo controls (mask on). Take-over removes the page from here (T7 calls `remove`). */
  private readonly on = new WeakSet<Page>();
  private readonly hooked = new WeakSet<Page>();

  private async eachFrame<T>(page: Page, fn: (f: Frame) => Promise<T>): Promise<T[]> {
    return Promise.all(page.frames().map(fn));
  }

  /** Puts the stylesheet into every frame (and open shadow root) and keeps it there across navigations. */
  async apply(page: Page): Promise<void> {
    this.on.add(page);
    if (!this.hooked.has(page)) {
      this.hooked.add(page);
      const again = (f: Frame) => {
        if (this.on.has(page)) void f.evaluate(walkerCall({ cmd: 'inject', css: MASK_CSS, id: MASK_STYLE_ID })).catch(() => undefined);
      };
      page.on('domcontentloaded', () => void this.eachFrame(page, async (f) => again(f)));
      page.on(
        'frameattached',
        (f) =>
          void f.waitForLoadState('domcontentloaded').then(
            () => again(f),
            () => undefined,
          ),
      );
      page.on(
        'framenavigated',
        (f) =>
          void f.waitForLoadState('domcontentloaded').then(
            () => again(f),
            () => undefined,
          ),
      );
    }
    await this.eachFrame(page, (f) => f.evaluate(walkerCall({ cmd: 'inject', css: MASK_CSS, id: MASK_STYLE_ID })).catch(() => false));
  }

  /** Take-over (08-2 §8.3.6): the user sees their own typing; nothing is captured meanwhile (§8.3.3). */
  async remove(page: Page): Promise<void> {
    this.on.delete(page);
    await this.eachFrame(page, (f) => f.evaluate(walkerCall({ cmd: 'remove', id: MASK_STYLE_ID })).catch(() => false));
  }

  isOn(page: Page): boolean {
    return this.on.has(page);
  }

  /** True only when every sensitive element in every frame computes `filter: blur(10px)`. */
  async verifyPage(page: Page): Promise<boolean> {
    if (!this.on.has(page) || page.isClosed()) return false;
    const results = await this.eachFrame(page, (f) =>
      (f.evaluate(walkerCall({ cmd: 'verify', css: MASK_CSS, id: MASK_STYLE_ID })) as Promise<VerifyResult>).catch(() => null),
    );
    return results.every((r) => r !== null && r.ok);
  }

  verify(win: JobWindow): Promise<boolean> {
    return hasPage(win) ? this.verifyPage(win.page()) : Promise.resolve(false);
  }
}
