// Regression coverage for the bounded live-window routing used by B07.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TID } from '../../src/shared/testids';

type DriverHelpers = {
  isLiveWindow: (pageOrUrl: string | { url: () => string }) => boolean;
  canLatePromoteWaitReply: (
    result: { do: string; before?: number; newBubbles?: number; lastReply?: string; replyTexts?: string[] },
    observed: number | { n: number; texts: string[] },
    hasLaterCausalAction?: boolean,
  ) => boolean;
  previousReplyBaseline: (args: {
    explicitBefore?: number;
    previousSend: { before?: number } | null;
    previousAction: { clicked?: boolean; before?: number } | null;
    previousSendIndex?: number;
    previousActionIndex?: number;
    currentCount: number;
  }) => number;
  waitForWindowAfterClick: (args: {
    app: { waitForEvent: (name: string, predicate: (page: { url: () => string }) => boolean) => Promise<unknown> };
    click: () => Promise<void>;
    ready?: (page: unknown) => Promise<void>;
    observe?: (page: unknown) => Promise<void> | void;
    predicate?: (page: { url: () => string }) => boolean;
  }) => Promise<unknown>;
  waitForPageClose: (
    page: { waitForEvent: (name: string, options: { timeout: number }) => Promise<unknown> },
    timeoutMs?: number,
  ) => Promise<unknown>;
};

// The driver is intentionally CommonJS: foo.exe runs it directly as Node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const helpers = require('../../test/real-pc/driver-helpers.js') as DriverHelpers;
const b07Path = join(process.cwd(), 'test', 'real-pc', 'journeys', 'B07-live.json');
const b07Text = readFileSync(b07Path, 'utf8');
const b07 = JSON.parse(b07Text) as {
  steps: Array<{
    do?: string;
    tid?: string;
    expectTid?: string;
    expectKit?: string;
    css?: string;
    note?: string;
    count?: number;
    ms?: number;
  }>;
};
const r427 = JSON.parse(readFileSync(join(process.cwd(), 'test', 'real-pc', 'journeys', 'R-chat-rules.json'), 'utf8')) as {
  steps: Array<Record<string, unknown>>;
};

describe('real-PC live-window driver', () => {
  it('does not promote a stale bubble to a late waitReply pass', () => {
    expect(helpers.canLatePromoteWaitReply({ do: 'waitReply', before: 1, newBubbles: 0, lastReply: '' }, { n: 1, texts: [] })).toBe(false);
    expect(
      helpers.canLatePromoteWaitReply(
        { do: 'waitReply', before: 1, newBubbles: 1, lastReply: 'fresh reply', replyTexts: ['fresh reply'] },
        { n: 2, texts: ['old reply', 'fresh reply'] },
      ),
    ).toBe(true);
    expect(
      helpers.canLatePromoteWaitReply(
        { do: 'waitReply', before: 1, newBubbles: 1, lastReply: 'fresh reply', replyTexts: ['fresh reply'] },
        { n: 3, texts: ['old reply', 'fresh reply', 'later turn'] },
      ),
    ).toBe(false);
    expect(
      helpers.canLatePromoteWaitReply(
        { do: 'waitReply', before: 1, newBubbles: 1, lastReply: 'fresh reply', replyTexts: ['fresh reply'] },
        { n: 2, texts: ['old reply', 'fresh reply'] },
        true,
      ),
    ).toBe(false);
  });

  it('uses the pre-click reply count when a click starts a reply', () => {
    expect(
      helpers.previousReplyBaseline({
        previousSend: { before: 0 },
        previousAction: { clicked: true, before: 1 },
        previousSendIndex: 1,
        previousActionIndex: 2,
        currentCount: 2,
      }),
    ).toBe(1);
    expect(
      helpers.previousReplyBaseline({
        previousSend: { before: 0 },
        previousAction: null,
        previousSendIndex: 3,
        previousActionIndex: 1,
        currentCount: 2,
      }),
    ).toBe(0);
    expect(
      helpers.previousReplyBaseline({
        previousSend: { before: 0 },
        previousAction: { clicked: true, before: 1 },
        previousSendIndex: 3,
        previousActionIndex: 1,
        currentCount: 2,
      }),
    ).toBe(0);
  });

  it('matches the live path without exposing query-string values', () => {
    expect(helpers.isLiveWindow('app://foo/windows/live.html?job=private-job')).toBe(true);
    expect(helpers.isLiveWindow('app://foo/windows/live.html?token=placeholder')).toBe(true);
    expect(helpers.isLiveWindow('app://foo/index.html')).toBe(false);
    expect(helpers.isLiveWindow('not a url')).toBe(false);
  });

  it('arms the window event before the click and waits for live readiness', async () => {
    const events: string[] = [];
    const page = { url: () => 'app://foo/windows/live.html?job=private-job' };
    const app = {
      waitForEvent: (_name: string, predicate: (candidate: typeof page) => boolean) => {
        events.push('armed');
        return Promise.resolve(predicate(page) ? page : null);
      },
    };
    const opened = await helpers.waitForWindowAfterClick({
      app,
      click: async () => {
        events.push('click');
      },
      observe: async () => {
        events.push('observe');
      },
      ready: async () => {
        events.push('ready');
      },
    });
    expect(opened).toBe(page);
    expect(events).toEqual(['armed', 'click', 'observe', 'ready']);
  });

  it('preserves a failed click without leaking a rejected window wait', async () => {
    let rejectWindow: ((reason: Error) => void) | undefined;
    const app = {
      waitForEvent: () =>
        new Promise<never>((_resolve, reject) => {
          rejectWindow = reject;
        }),
    };
    await expect(
      helpers.waitForWindowAfterClick({
        app,
        click: async () => {
          rejectWindow?.(new Error('window wait timed out'));
          throw new Error('live click failed');
        },
      }),
    ).rejects.toThrow('live click failed');
  });

  it('keeps B07 takeover and hand-back checks state-bounded', () => {
    expect(b07.steps.some((step) => step.do === 'waitFor' && step.tid === 'chat-header-watch-live')).toBe(true);
    expect(b07.steps.some((step) => step.do === 'wait' && step.ms === 45_000)).toBe(false);
    expect(b07.steps.some((step) => step.do === 'waitFor' && step.css?.includes('data-state="in_control"'))).toBe(true);
    expect(
      b07.steps.some((step) => step.do === 'waitFor' && step.css?.includes('data-state="live"') && step.note?.includes('hand-back')),
    ).toBe(true);
    expect(b07.steps.some((step) => step.do === 'check' && step.css?.endsWith('button') && step.count === 2)).toBe(true);
    expect(b07.steps.some((step) => step.do === 'check' && step.tid === 'live-take-over' && step.count === 0)).toBe(true);
    expect(b07.steps.some((step) => step.do === 'wait' && step.ms === 3_000)).toBe(false);
  });

  // AT-427 fixture contract only; application acceptance remains in c1-bubbles.spec.ts.
  it('keeps the reply-area fixture bounded to one short rendered reply per locale', () => {
    const waits = r427.steps.filter((step) => step.do === 'waitReply');
    expect(waits).toHaveLength(5);
    expect(waits.every((step) => step.exactNewBubbles === 1 && step.replyFixtureMaxChars === 600)).toBe(true);
    expect(waits.every((step) => String(step.expectJs).includes('bubble-meta'))).toBe(true);
  });

  it('arms a bounded close listener for the live window', async () => {
    const calls: Array<{ name: string; timeout: number }> = [];
    const page = {
      waitForEvent: (name: string, options: { timeout: number }) => {
        calls.push({ name, timeout: options.timeout });
        return Promise.resolve();
      },
    };
    await helpers.waitForPageClose(page, 12_345);
    expect(calls).toEqual([{ name: 'close', timeout: 12_345 }]);
  });

  it('keeps B07 selectors registered and free of secret-like values', () => {
    const known = new Set<string>(Object.values(TID));
    const ids = new Set<string>();
    for (const step of b07.steps) {
      for (const id of [step.tid, step.expectTid, step.expectKit]) if (id) ids.add(id);
      for (const match of step.css?.matchAll(/data-testid\s*=\s*["']?([A-Za-z0-9_-]+)/g) ?? []) {
        const id = match[1];
        if (id === undefined) throw new Error('Missing test-id regex capture');
        ids.add(id);
      }
    }
    expect([...ids].filter((id) => !known.has(id))).toEqual([]);
    expect(b07Text).not.toMatch(/(?:sk-|api[_-]?key|bearer\s+|password)/i);
  });
});
