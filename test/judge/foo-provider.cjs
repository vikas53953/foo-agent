// Spec: 07 journeys, 10 acceptance (AI-judged chat quality on a real AI; Vikas picked "full stack" 2026-10-21).
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS loaded by promptfoo, no bundler */
// promptfoo provider: sends one ask to the real foo app and returns everything foo answered in the open chat.
// Each ask gets a fresh copy of a signed-in test profile (made by the real-PC kit's first-run journey), so asks never
// see each other's memory or chats. foo runs its own AI the normal way (the Claude CLI on ANTHROPIC_API_KEY in CI).
// Env: FOO_EXE (foo.exe, or the electron binary for a dev build), FOO_ARGS (dev build only: '<app dir> --no-sandbox'),
//      FOO_JUDGE_PROFILE (the signed-in profile folder to copy), FOO_JUDGE_OUT (where screenshots go).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('playwright-core');

// What foo can put in a chat: a text bubble, a card (TID registry names), or a reaction on the user's message (foo
// answers a short "thanks" with a 👍 and no bubble, 04 §4). Sub-parts of cards are skipped.
const REPLY_TIDS = new Set([
  'bubble-foo',
  'bubble-reaction',
  'card-approval',
  'card-checklist',
  'card-choice',
  'card-connect',
  'card-done-saved',
  'card-draft',
  'card-error',
  'card-file',
  'card-job-link',
  'card-kit',
  'card-link-preview',
  'card-place',
  'card-plan',
  'card-secret',
  'card-signin',
  'card-spend-cap',
  'card-stuck',
  'card-table',
  'card-tiles',
  'card-time',
]);
const QUIET_MS = 8000; // the reply is over when nothing new arrived for this long
const MAX_MS = Number(process.env.FOO_JUDGE_ASK_TIMEOUT_MS || 150000);

function childEnv(profile) {
  const env = { ...process.env, FOO_DATA_DIR: path.join(profile, 'data'), FOO_LOCAL_DIR: path.join(profile, 'local') };
  for (const k of Object.keys(env)) if (['ELECTRON_RUN_AS_NODE', 'FOO_TEST', 'FOO_FAKE_AI'].includes(k.toUpperCase())) delete env[k];
  return env;
}

async function replies(page) {
  return page
    .locator('[data-testid="thread-log"] [data-testid]')
    .evaluateAll(
      (els, tids) =>
        els
          .filter((e) => tids.includes(e.getAttribute('data-testid')))
          .map((e) => `[${e.getAttribute('data-testid')}] ${(e.innerText || '').replace(/\s+\n/g, '\n').trim()}`),
      [...REPLY_TIDS],
    );
}

/** Waits until the welcome and any restart notes have landed (nothing new for 4 s, cap 20 s); returns the count. */
async function settled(page) {
  let n = (await replies(page)).length;
  let since = Date.now();
  const t0 = Date.now();
  while (Date.now() - since < 4000 && Date.now() - t0 < 20000) {
    await page.waitForTimeout(500);
    const m = (await replies(page)).length;
    if (m !== n) {
      n = m;
      since = Date.now();
    }
  }
  return n;
}

class FooProvider {
  id() {
    return 'foo-real-ai';
  }

  async callApi(prompt, context) {
    const template = process.env.FOO_JUDGE_PROFILE;
    if (!template || !fs.existsSync(template)) return { error: 'FOO_JUDGE_PROFILE is not a signed-in profile folder' };
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'foo-judge-'));
    fs.cpSync(template, profile, { recursive: true });
    let app;
    try {
      app = await _electron.launch({
        executablePath: process.env.FOO_EXE,
        args: process.env.FOO_ARGS ? process.env.FOO_ARGS.split(' ') : [],
        env: childEnv(profile),
        colorScheme: null,
      });
      const page = await app.firstWindow();
      const field = page.locator('[data-testid="composer-field"]');
      await field.waitFor({ timeout: 60000 });
      // The rest of first-run setup (name and face) is skipped, so asks run in a plain chat, not beside a setup card.
      await page.evaluate(() => window.foo.invoke('setup:skipRest', {})).catch(() => {});
      const before = await settled(page);
      await field.click();
      await field.fill(prompt);
      await page.keyboard.press('Enter');
      const t0 = Date.now();
      let last = before;
      let change = t0;
      let first = null;
      while (Date.now() - t0 < MAX_MS) {
        await page.waitForTimeout(500);
        const n = (await replies(page)).length;
        if (n !== last) {
          last = n;
          change = Date.now();
          first ??= Date.now() - t0;
        }
        if (n > before && Date.now() - change > QUIET_MS) break;
      }
      const items = (await replies(page)).slice(before);
      const out = process.env.FOO_JUDGE_OUT;
      if (out) {
        fs.mkdirSync(out, { recursive: true });
        const name = String(context?.test?.description || prompt)
          .replace(/[^a-z0-9]+/gi, '-')
          .slice(0, 60);
        await page.screenshot({ path: path.join(out, `${name}.png`) }).catch(() => {});
      }
      return { output: items.join('\n---\n') || '(no reply)', metadata: { firstReplyMs: first, items: items.length } };
    } catch (e) {
      return { error: `foo run failed: ${String(e && e.message ? e.message : e).slice(0, 400)}` };
    } finally {
      if (app) await app.close().catch(() => {});
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
}

module.exports = FooProvider;
