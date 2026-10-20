// Spec: 08-2 §8.2 (`browser.submit { ref; approvalId }`, engine-only, class from the approval verb), §10.4 (after the
// write-ahead ack: ONE click, no retry on any error or timeout; classify the outcome ≤ 120 s polling every 2 s), §8.3.8 (one
// masked step picture after each `browser.submit`, never on sign-in, 3-D Secure or OTP pages), 08-4 §28.1 item 8 (book: success
// text or confirmation code → COMPLETED with proof; explicit refusal → FAILED; anything else → CHECKING through the site's
// history page, never Gmail), §26.11 (the page text is in the result, so the pre-redaction copy carries the code), X-125.
// The ToolLayer only reaches this through `executeApproved` (ENGINE_ONLY); the runner's outcome mapping (`outcomeState`) reads
// `refused: true` as FAILED and every other error as CHECKING.
import type { Page } from 'playwright-core';
import { z } from 'zod';
import { PromptBuilder } from '../../prompt/PromptBuilder';
import type { ToolContext, ToolDef, ToolOutcome } from '../ToolLayer';
import type { Actions } from './actions';
import { isHistoryLink, watchOutcome, type OutcomeTiming, type PageFacts } from './outcome';
import type { StepShots } from './stepShots';

/** How much of the result page goes into the result (the AI reads it redacted; the proof check reads it raw). */
export const SUBMIT_TEXT_MAX = 4_000;

const ARGS = z.object({ ref: z.string().min(1).max(32), approvalId: z.string().min(1).max(64) }).strict();

export interface SubmitDeps {
  actions: Actions;
  shots: StepShots;
  /** The job's open page (never opens a new window: the approved form must already be on it). */
  page(jobId: string): Page | null;
  timing?: Partial<OutcomeTiming>;
  /** Waits between looks; tests pass a short one. */
  sleep?(ms: number): Promise<void>;
  now(): number;
}

/** What the page shows now: visible text and whether a one-time-code field is on it. Null when the page is gone. */
export async function pageFacts(page: Page): Promise<PageFacts | null> {
  if (page.isClosed()) return null;
  const text = (await page.evaluate('document.body ? document.body.innerText : ""').catch(() => null)) as string | null;
  if (text === null) return null;
  const otp = await page
    .locator('input[autocomplete="one-time-code"]')
    .count()
    .catch(() => 0);
  return { text, hasOtpField: otp > 0 };
}

/** The site's own history page linked from the result page ("Your bookings"), same site only. */
async function historyUrl(page: Page): Promise<string | null> {
  const links = (await page
    .evaluate('Array.from(document.querySelectorAll("a[href]")).map(function(a){return [a.innerText||a.textContent||"", a.href]})')
    .catch(() => [])) as [string, string][];
  const here = (() => {
    try {
      return new URL(page.url()).host;
    } catch {
      return null;
    }
  })();
  for (const [name, href] of links) {
    if (!isHistoryLink(name.trim())) continue;
    try {
      const u = new URL(href);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && u.host === here) return u.toString();
    } catch {
      // not a URL
    }
  }
  return null;
}

export function createSubmitTool(d: SubmitDeps): ToolDef {
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timing: OutcomeTiming = {
    maxMs: d.timing?.maxMs ?? 120_000,
    pollMs: d.timing?.pollMs ?? 2_000,
    waitMaxMs: d.timing?.waitMaxMs ?? 300_000,
  };
  return {
    name: 'browser.submit',
    actionClass: 'book',
    args: 'ref: string, approvalId: string',
    description: 'Engine only: the one approved click.',
    async run(raw: unknown, ctx: ToolContext): Promise<ToolOutcome> {
      const a = ARGS.safeParse(raw ?? {});
      if (!a.success) return { kind: 'error', errorKind: 'VALIDATION' };
      const page = d.page(ctx.jobId);
      if (!page || page.isClosed()) return { kind: 'error', errorKind: 'VALIDATION', result: { reason: 'no_page' } };
      const click = await d.actions.submitClick(ctx.jobId, page, a.data.ref);
      if (!click.ok && !click.clicked)
        return { kind: 'error', errorKind: click.kind, ...(click.detail ? { result: { reason: click.detail } } : {}) };
      const outcome = await watchOutcome(() => pageFacts(page), sleep, d.now, timing, ctx.signal);
      const facts = await pageFacts(page);
      const screenshot = await d.shots.capture(ctx.jobId, page, 'shot').catch(() => null);
      const base = {
        url: page.isClosed() ? null : page.url(),
        page: PromptBuilder.untrusted('web', `submit-${a.data.approvalId}`, (facts?.text ?? '').slice(0, SUBMIT_TEXT_MAX)),
        ...(screenshot ? { screenshot } : {}),
      };
      switch (outcome.kind) {
        case 'success':
          return { kind: 'ok', result: { outcome: 'success', ...(outcome.code ? { code: outcome.code } : {}), ...base } };
        case 'decline':
          return { kind: 'error', errorKind: 'UNKNOWN', result: { outcome: 'declined', refused: true, ...base } };
        case 'timeout':
          return { kind: 'error', errorKind: 'UNKNOWN', result: { outcome: `${outcome.during}_timeout`, refused: true, ...base } };
        case 'unknown': {
          const history = page.isClosed() ? null : await historyUrl(page);
          return {
            kind: 'error',
            errorKind: 'UNKNOWN',
            result: { outcome: 'unknown', ...(history ? { historyUrl: history } : {}), ...base },
          };
        }
      }
    },
  };
}
