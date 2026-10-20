// Spec: 08-2 §8.3.5 (actions use Playwright locators on `[data-foo-ref="{ref}"]` with a 10 s actionability timeout; after each
// action the engine waits for `load` or 2 s network idle, max 15 s; two misses in a row raise SITE_TIMEOUT; the observation hash
// is URL + visible-text hash (§5.6); each action carries an expected change, no change after the wait → one retry → the stuck
// rules of §5.6 (the unchanged result keeps the runner's observation hash still)), §8.2.1 (commit clicks → USE_SUBMIT, also a
// click that raised `confirm()`, and a key press that would submit a commit form), §11.5 (`browser.type` refuses text that hits
// the secret patterns or the SecretRegistry: SECRET_IN_TYPE), §8.3.3 (no clicks while a sign-in page is in front), §8.3.10 (foo
// never types, clicks or reads inside a hand-back site), 08-3 §21.2 rows SITE_CHANGED and SITE_TIMEOUT (words below).
import { createHash } from 'node:crypto';
import type { Frame, Locator, Page } from 'playwright-core';
import { t } from '../../../shared/copy/t';
import { findSecrets } from '../../../shared/redactor';
import type { ErrorKind } from '../../../shared/types';
import { classify, type ElementFacts } from './clickClassifier';
import type { RefRouter } from './snapshot';
import { isChallengePage, type Watchdogs } from './watchdogs';
import { walkerCall, type KeyTargetResult } from './walker';

export const ACTIONABLE_MS = 10_000;
export const IDLE_MS = 2_000;
export const SETTLE_MAX_MS = 15_000;
export const WAIT_MAX_MS = 15_000;
/** Two misses in a row raise SITE_TIMEOUT (08-2 §8.3.5). */
export const MISSES_FOR_TIMEOUT = 2;

/** 08-3 §21.2 error-card words for the two site kinds this module raises (the runner posts the card). */
export function siteErrorCopy(kind: 'SITE_CHANGED' | 'SITE_TIMEOUT', site: string) {
  return kind === 'SITE_CHANGED'
    ? {
        whatHappened: t('errors.site_changed.what_happened', { site }),
        whatIsSafe: t('errors.site_changed.what_is_safe'),
        label: t('errors.site_changed.button'),
      }
    : {
        whatHappened: t('errors.site_timeout.what_happened', { site }),
        whatIsSafe: t('errors.site_timeout.what_is_safe'),
        label: t('errors.site_timeout.button'),
      };
}

/** §11.5: text the AI asks to type that hits pattern scrub 2 or a SecretRegistry value. */
export function secretInType(text: string, registryHit: (text: string) => boolean): boolean {
  return findSecrets(text).length > 0 || registryHit(text);
}

export type ActionRefusal = { ok: false; kind: ErrorKind; detail?: string };
export type ActionResult = { ok: true; value: Record<string, unknown> } | ActionRefusal;

const done = (value: Record<string, unknown>): ActionResult => ({ ok: true, value });
const refused = (kind: ErrorKind, detail?: string): ActionRefusal => (detail ? { ok: false, kind, detail } : { ok: false, kind });

export interface ActionDeps {
  router: RefRouter;
  watchdogs: Watchdogs;
  /** The engine SecretRegistry: does `text` contain a registered value (or a normalised form)? */
  registryHit(text: string): boolean;
  /** `handback.check(url)`. */
  handback(url: string): boolean;
  /** The CaptureGuard of 08-2 §8.3.3 (T7 owns the state): no clicks while a sign-in page is in front. */
  paused(jobId: string): boolean;
  /** Tests shorten the idle wait; the app uses the spec numbers. */
  timing?: { idleMs?: number; settleMaxMs?: number; actionableMs?: number };
}

/** Enter and Space, with or without modifiers ("Control+Enter" submits many forms too). */
const ENTER_KEYS = /(^|\+)(Enter|NumpadEnter|Space| )$/;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Counts network requests so "2 s network idle" can be waited for. */
function idleTracker(page: Page) {
  let inflight = 0;
  let last = Date.now();
  const on = () => {
    inflight += 1;
    last = Date.now();
  };
  const off = () => {
    inflight = Math.max(0, inflight - 1);
    last = Date.now();
  };
  page.on('request', on);
  page.on('requestfinished', off);
  page.on('requestfailed', off);
  return {
    async wait(idleMs: number, deadline: number): Promise<boolean> {
      for (;;) {
        if (inflight === 0 && Date.now() - last >= idleMs) return true;
        if (Date.now() >= deadline) return false;
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    stop() {
      page.off('request', on);
      page.off('requestfinished', off);
      page.off('requestfailed', off);
    },
  };
}

export class Actions {
  private readonly misses = new Map<string, number>();

  constructor(private readonly d: ActionDeps) {}

  private get idleMs() {
    return this.d.timing?.idleMs ?? IDLE_MS;
  }
  private get settleMaxMs() {
    return this.d.timing?.settleMaxMs ?? SETTLE_MAX_MS;
  }
  private get actionableMs() {
    return this.d.timing?.actionableMs ?? ACTIONABLE_MS;
  }

  forget(jobId: string): void {
    this.misses.delete(jobId);
  }

  /** URL + visible-text hash (08-2 §5.6 progress; the text never leaves this function). */
  async observation(page: Page): Promise<string> {
    const text = (await page.evaluate('document.body ? document.body.innerText : ""').catch(() => '')) as string;
    const values = (await page
      .evaluate(
        'Array.from(document.querySelectorAll("input:not([type=password]),select,textarea")).map(function(e){return e.type==="checkbox"||e.type==="radio"?String(e.checked):e.value}).join("|")',
      )
      .catch(() => '')) as string;
    return sha256(`${page.url()}\n${sha256(text)}\n${sha256(values)}`);
  }

  /**
   * Runs `act` and waits: `load` when it navigated, else 2 s of network idle; both capped at 15 s. A miss (the page did not
   * reach `load` in the cap) counts; two in a row → SITE_TIMEOUT.
   */
  async settled(jobId: string, page: Page, act: () => Promise<void>): Promise<ActionRefusal | null> {
    let navigated = false;
    const onNav = (f: Frame) => {
      if (f === page.mainFrame()) navigated = true;
    };
    page.on('framenavigated', onNav);
    const idle = idleTracker(page);
    try {
      await act();
      const deadline = Date.now() + this.settleMaxMs;
      let loaded = true;
      if (navigated)
        loaded = await page.waitForLoadState('load', { timeout: this.settleMaxMs }).then(
          () => true,
          () => false,
        );
      else if (!(await idle.wait(this.idleMs, deadline)))
        loaded = ((await page.evaluate('document.readyState').catch(() => 'loading')) as string) === 'complete';
      if (loaded) {
        this.misses.set(jobId, 0);
        return null;
      }
      const n = (this.misses.get(jobId) ?? 0) + 1;
      this.misses.set(jobId, n);
      return n >= MISSES_FOR_TIMEOUT ? refused('SITE_TIMEOUT') : null;
    } finally {
      idle.stop();
      page.off('framenavigated', onNav);
    }
  }

  private guard(jobId: string, page: Page): ActionResult | null {
    if (this.d.paused(jobId)) return refused('VALIDATION', 'sign_in_in_front');
    if (this.d.handback(page.url())) return refused('SITE_HANDBACK');
    return null;
  }

  private locate(page: Page, ref: string): { frame: Frame; loc: Locator } | null {
    if (!/^(f\d+)?e\d+$/.test(ref)) return null;
    const frame = this.d.router.frameOf(page, ref);
    return frame ? { frame, loc: frame.locator(`[data-foo-ref="${ref}"]`) } : null;
  }

  private async facts(frame: Frame, ref: string): Promise<ElementFacts | null> {
    return (await frame.evaluate(walkerCall({ cmd: 'facts', ref })).catch(() => null)) as ElementFacts | null;
  }

  /** Runs the action with the expected-change check: unchanged → one retry; still unchanged → ok with `changed:false`. */
  private async withExpectedChange(
    jobId: string,
    page: Page,
    act: () => Promise<void>,
    changed: (before: string, after: string) => Promise<boolean>,
  ): Promise<ActionResult> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = await this.observation(page);
      const miss = await this.settled(jobId, page, act);
      if (miss) return miss;
      if (await isChallengePage(page)) return refused('SITE_CAPTCHA');
      const after = await this.observation(page);
      if (await changed(before, after)) return done({ url: page.url(), changed: true });
    }
    return done({ url: page.url(), changed: false });
  }

  private notActionable(e: unknown): ActionResult {
    return refused('SITE_CHANGED', e instanceof Error && /timeout/i.test(e.message) ? 'not_actionable' : 'not_found');
  }

  async click(jobId: string, page: Page, ref: string): Promise<ActionResult> {
    const g = this.guard(jobId, page);
    if (g) return g;
    const at = this.locate(page, ref);
    if (!at) return refused('VALIDATION', 'unknown_ref');
    const f = await this.facts(at.frame, ref);
    if (!f) return refused('SITE_CHANGED', 'not_found');
    if (classify(f) === 'commit') return refused('USE_SUBMIT');
    const w = this.d.watchdogs.state(jobId);
    const confirmsBefore = w.confirms;
    const popupsBefore = w.popups;
    try {
      const r = await this.withExpectedChange(
        jobId,
        page,
        async () => {
          await at.loc.click({ timeout: this.actionableMs });
          if (w.confirms > confirmsBefore) throw new ConfirmRaised();
        },
        // A target=_blank link leaves this page as it was: the pop-up it opened is the change, so it is never clicked twice.
        async (b, a) => b !== a || w.popups > popupsBefore,
      );
      return w.confirms > confirmsBefore ? refused('USE_SUBMIT', 'confirm_dialog') : r;
    } catch (e) {
      if (e instanceof ConfirmRaised) return refused('USE_SUBMIT', 'confirm_dialog');
      return this.notActionable(e);
    }
  }

  async type(jobId: string, page: Page, ref: string, text: string): Promise<ActionResult> {
    const g = this.guard(jobId, page);
    if (g) return g;
    if (secretInType(text, this.d.registryHit)) return refused('SECRET_IN_TYPE');
    const at = this.locate(page, ref);
    if (!at) return refused('VALIDATION', 'unknown_ref');
    // A masked field (password, card, code) takes only engine fills (browser.fillSecret / fillCard), never AI typing.
    if (await this.isSensitive(at.frame, ref)) return refused('SECRET_IN_TYPE');
    try {
      return await this.withExpectedChange(
        jobId,
        page,
        () => at.loc.fill(text, { timeout: this.actionableMs }),
        async () => (await at.loc.inputValue().catch(() => '')) === text,
      );
    } catch (e) {
      return this.notActionable(e);
    }
  }

  /** The walker's masked-at-source rule for one ref (mark adds data-foo-secret to name/label matches too). */
  private async isSensitive(frame: Frame, ref: string): Promise<boolean> {
    await frame.evaluate(walkerCall({ cmd: 'mark' })).catch(() => 0);
    return (await frame
      .locator(`[data-foo-ref="${ref}"]`)
      .evaluate((el: unknown) => {
        const e = el as { hasAttribute(a: string): boolean; getAttribute(a: string): string | null };
        return e.hasAttribute('data-foo-secret') || (e.getAttribute('type') ?? '').toLowerCase() === 'password';
      })
      .catch(() => true)) as boolean;
  }

  async select(jobId: string, page: Page, ref: string, value: string): Promise<ActionResult> {
    const g = this.guard(jobId, page);
    if (g) return g;
    const at = this.locate(page, ref);
    if (!at) return refused('VALIDATION', 'unknown_ref');
    try {
      return await this.withExpectedChange(
        jobId,
        page,
        async () => {
          const byLabel = await at.loc.selectOption({ label: value }, { timeout: this.actionableMs }).catch(() => null);
          if (!byLabel) await at.loc.selectOption(value, { timeout: this.actionableMs });
        },
        async (b, a) => b !== a,
      );
    } catch (e) {
      return this.notActionable(e);
    }
  }

  async check(jobId: string, page: Page, ref: string, on: boolean): Promise<ActionResult> {
    const g = this.guard(jobId, page);
    if (g) return g;
    const at = this.locate(page, ref);
    if (!at) return refused('VALIDATION', 'unknown_ref');
    const f = await this.facts(at.frame, ref);
    if (f && classify(f) === 'commit' && f.role !== 'checkbox' && f.role !== 'radio' && f.role !== 'switch') return refused('USE_SUBMIT');
    try {
      return await this.withExpectedChange(
        jobId,
        page,
        () => at.loc.setChecked(on, { timeout: this.actionableMs }),
        async () => (await at.loc.isChecked().catch(() => !on)) === on,
      );
    } catch (e) {
      return this.notActionable(e);
    }
  }

  /** A key on a control (or the focused one). Enter / Space that would submit a commit form is refused like the click. */
  async press(jobId: string, page: Page, key: string, ref: string | null): Promise<ActionResult> {
    const g = this.guard(jobId, page);
    if (g) return g;
    const at = ref ? this.locate(page, ref) : { frame: page.mainFrame(), loc: null };
    if (!at) return refused('VALIDATION', 'unknown_ref');
    if (ENTER_KEYS.test(key)) {
      const k = (await at.frame.evaluate(walkerCall({ cmd: 'keyTarget', ref })).catch(() => null)) as KeyTargetResult | null;
      // Focus inside a child frame (a payment gateway's form): what the key reaches is unseen, so it is refused.
      if (!k || k.inFrame) return refused('USE_SUBMIT', 'unknown_target');
      // Enter in a field of a form with a password or payment field submits it implicitly, submit button or not.
      if (k.target?.inForm && k.target.formHasSensitive) return refused('USE_SUBMIT');
      if ((k.target && classify(k.target) === 'commit') || k.formControls.some((c) => classify(c) === 'commit'))
        return refused('USE_SUBMIT');
    }
    const w = this.d.watchdogs.state(jobId);
    const confirmsBefore = w.confirms;
    try {
      const miss = await this.settled(jobId, page, () =>
        at.loc ? at.loc.press(key, { timeout: this.actionableMs }) : page.keyboard.press(key),
      );
      if (w.confirms > confirmsBefore) return refused('USE_SUBMIT', 'confirm_dialog');
      return miss ?? done({ url: page.url() });
    } catch (e) {
      return this.notActionable(e);
    }
  }

  async scroll(jobId: string, page: Page, ref: string | null, direction: 'up' | 'down'): Promise<ActionResult> {
    const g = this.guard(jobId, page);
    if (g) return g;
    try {
      if (ref) {
        const at = this.locate(page, ref);
        if (!at) return refused('VALIDATION', 'unknown_ref');
        await at.loc.scrollIntoViewIfNeeded({ timeout: this.actionableMs });
      } else await page.mouse.wheel(0, direction === 'up' ? -600 : 600);
      return done({ url: page.url() });
    } catch (e) {
      return this.notActionable(e);
    }
  }

  async back(jobId: string, page: Page): Promise<ActionResult> {
    const g = this.guard(jobId, page);
    if (g) return g;
    const from = page.url();
    const miss = await this.settled(jobId, page, async () => {
      await page.goBack({ timeout: this.settleMaxMs }).catch(() => null);
    });
    return miss ?? done({ url: page.url(), changed: page.url() !== from });
  }

  /** `browser.download { ref }`: the click is classified like any click; the watchdog saves the file into the job folder. */
  async download(jobId: string, page: Page, ref: string): Promise<ActionResult> {
    const g = this.guard(jobId, page);
    if (g) return g;
    const at = this.locate(page, ref);
    if (!at) return refused('VALIDATION', 'unknown_ref');
    const f = await this.facts(at.frame, ref);
    if (!f) return refused('SITE_CHANGED', 'not_found');
    if (classify(f) === 'commit') return refused('USE_SUBMIT');
    const w = this.d.watchdogs.state(jobId);
    const before = w.downloads.length;
    try {
      await Promise.all([page.waitForEvent('download', { timeout: this.settleMaxMs }), at.loc.click({ timeout: this.actionableMs })]);
    } catch (e) {
      return this.notActionable(e);
    }
    const deadline = Date.now() + this.settleMaxMs;
    for (;;) {
      const row = w.downloads[before];
      if (row && (row.path || row.failed)) return row.path ? done({ file: row.suggestedFilename }) : refused('UNKNOWN', 'download_failed');
      if (Date.now() > deadline) return refused('SITE_TIMEOUT');
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async wait(page: Page, ms: number): Promise<ActionResult> {
    await page.waitForTimeout(Math.max(0, Math.min(ms, WAIT_MAX_MS)));
    return done({ url: page.url() });
  }
}

class ConfirmRaised extends Error {}
