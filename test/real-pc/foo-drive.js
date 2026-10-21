// Spec: 07 journeys, 10 acceptance (real-PC / real-AI end-to-end check).
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS run by foo's own Electron as Node, no bundler */
// foo real-PC driver. Runs one journey file against the INSTALLED foo.exe with a real AI.
// Run with foo's own Electron as Node (nothing to install):
//   set ELECTRON_RUN_AS_NODE=1
//   "%LOCALAPPDATA%\Programs\foo\foo.exe" foo-drive.js journeys\J07-chat.json
// Env: FOO_EXE (path to foo.exe, default %LOCALAPPDATA%\Programs\foo\foo.exe),
//      FOO_ARGS (extra args, only for a dev run: '. --no-sandbox'),
//      FOO_REAL_TEST_DIR (test profile + output root, default %USERPROFILE%\foo-real-test).
// The test profile lives in its own folder (FOO_DATA_DIR / FOO_LOCAL_DIR), so the user's own foo data is never touched.
// Safety: clicks on money or outbound-message buttons are refused, whatever the journey file says.
'use strict';
const fs = require('fs');
const path = require('path');

const EXE = process.env.FOO_EXE || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'foo', 'foo.exe');
const ROOT = process.env.FOO_REAL_TEST_DIR || path.join(process.env.USERPROFILE || '.', 'foo-real-test');
const PROFILE = path.join(ROOT, 'profile');

// Never clicked by the driver: real spend, real outbound messages, real bookings.
const REFUSED_TIDS = new Set([
  'card-approval-approve',
  'card-draft-send',
  'card-draft-send-when-online',
  'card-connect-allow-send',
  'composer-paste-send',
]);
const REFUSED_WORDS = /^(approve|pay|pay now|book|book now|confirm booking|send email|send now|post|post now)$/i;

function loadPlaywright() {
  const candidates = [
    path.join(path.dirname(EXE), 'resources', 'app.asar', 'node_modules', 'playwright-core'),
    path.join(path.dirname(EXE), 'resources', 'app.asar.unpacked', 'node_modules', 'playwright-core'),
    'playwright-core',
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* next */
    }
  }
  throw new Error('playwright-core not found next to foo.exe; run `npm i playwright-core@1.64.1` in this folder');
}

// foo must start as the app, not as Node: drop the variable this script itself runs under.
function childEnv() {
  const env = { ...process.env, FOO_DATA_DIR: path.join(PROFILE, 'data'), FOO_LOCAL_DIR: path.join(PROFILE, 'local') };
  for (const k of Object.keys(env)) if (k.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[k];
  return env;
}

const sel = (s) => (s.tid ? `[data-testid="${s.tid}"]` : s.css ? s.css : `text=${s.text}`);
// The element a step acts on: nth (default first), or the last one with "last": true; "has" keeps matches containing text.
let pageRef = null;
const pick = (s) => {
  let loc = pageRef.locator(sel(s));
  if (s.has) loc = loc.filter({ hasText: s.has });
  return s.last ? loc.last() : loc.nth(s.nth ?? 0);
};
const fooProcs = () => {
  if (process.platform !== 'win32') return null;
  try {
    const name = path.basename(EXE);
    const out = require('child_process').execSync(`tasklist /FI "IMAGENAME eq ${name}" /NH`, { encoding: 'utf8' });
    return out.split('\n').filter((l) => l.toLowerCase().startsWith(name.toLowerCase())).length;
  } catch {
    return null;
  }
};
const norm = (t) =>
  String(t || '')
    .replace(/\r\n/g, '\n')
    .trim();
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: foo-drive.js <journey.json>');
  // {AI_ROW} in a journey names the Find-your-AI row to use (FOO_AI_ROW: claude-cli, anthropic-key, openai-key, codex-cli).
  const journey = JSON.parse(fs.readFileSync(file, 'utf8').replaceAll('{AI_ROW}', process.env.FOO_AI_ROW || 'claude-cli'));
  const out = path.join(ROOT, 'runs', `${stamp()}-${journey.id}`);
  fs.mkdirSync(out, { recursive: true });
  const logPath = path.join(out, 'log.jsonl');
  const log = (o) => fs.appendFileSync(logPath, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');
  log({ journey: journey.id, title: journey.title, spec: journey.spec, exe: EXE });

  const { _electron } = loadPlaywright();
  let app;
  let page;
  let shotN = 0;
  const launch = async () => {
    app = await _electron.launch({
      executablePath: EXE,
      args: process.env.FOO_ARGS ? process.env.FOO_ARGS.split(' ') : [],
      colorScheme: null,
      env: childEnv(),
      timeout: 60_000,
    });
    page = await app.firstWindow();
    pageRef = page;
    // Wait until the window shows the chat or the setup card, then let the thread finish loading its history,
    // so counting foo's bubbles before a send never mistakes old messages for a new reply.
    await page
      .locator('[data-testid="composer-field"], [data-testid="card-setup"]')
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 })
      .catch(() => {});
    await page.waitForTimeout(4_000);
    page.on('console', (m) => m.type() === 'error' && log({ console: m.text().slice(0, 500) }));
    log({ step: 'launch', ok: true });
  };
  const shot = async (name) => {
    shotN += 1;
    const f = path.join(out, `${String(shotN).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: f });
    log({ shot: path.basename(f) });
  };
  const threadDump = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-testid="thread-log"] [data-testid^="bubble-"], [data-testid="thread-log"] [data-testid^="card-"]',
        ),
      ]
        .filter((el) => /^(bubble-(me|foo|helper|wa)|card-[a-z]+)$/.test(el.getAttribute('data-testid')))
        .map((el) => ({
          kind: el.getAttribute('data-testid'),
          state: el.getAttribute('data-state'),
          text: (el.innerText || '').trim().slice(0, 1500),
        })),
    );
  // What counts as foo answering: a foo text bubble or any card foo posts, below the user's newest bubble. The thread is a
  // virtual list (only the rows near the bottom are in the page), so counting all bubbles stops working in a long chat;
  // counting what sits after the newest bubble-me does not.
  const afterMe = () =>
    page.evaluate(() => {
      const log = document.querySelector('[data-testid="thread-log"]');
      if (!log) return { n: 0, texts: [] };
      const all = [...log.querySelectorAll('[data-testid^="bubble-"], [data-testid^="card-"]')].filter((el) =>
        /^(bubble-(me|foo|helper|wa)|card-[a-z-]+)$/.test(el.getAttribute('data-testid')),
      );
      const kinds = all.map((el) => el.getAttribute('data-testid'));
      const after = all
        .slice(kinds.lastIndexOf('bubble-me') + 1)
        .filter(
          (el) => /^(bubble-foo|card-[a-z-]+)$/.test(el.getAttribute('data-testid')) && el.getAttribute('data-testid') !== 'card-time',
        );
      return { n: after.length, texts: after.map((el) => (el.innerText || '').trim().slice(0, 1500)) };
    });

  try {
    await launch();
  } catch (e) {
    log({ step: 'launch', ok: false, error: String(e && e.stack ? e.stack : e).slice(0, 3000) });
    throw e;
  }
  const results = [];
  for (const [i, s] of journey.steps.entries()) {
    const t0 = Date.now();
    const rec = { i, do: s.do, note: s.note, expect: s.expect, soft: s.soft };
    try {
      switch (s.do) {
        case 'wait':
          await page.waitForTimeout(s.ms);
          break;
        case 'waitFor':
          await page
            .locator(sel(s))
            .first()
            .waitFor({ state: 'visible', timeout: s.timeoutMs ?? 30_000 });
          break;
        case 'check': {
          const n = await page.locator(sel(s)).count();
          rec.found = n;
          rec.ok = s.count !== undefined ? n === s.count : n > 0;
          break;
        }
        case 'click': {
          // unlessTid: skip the click when that control is already showing (e.g. no retest needed once Use is offered).
          if (s.unlessTid && (await page.locator(`[data-testid="${s.unlessTid}"]`).count())) {
            rec.skipped = `${s.unlessTid} already showing`;
            break;
          }
          const loc = pick(s);
          const label = ((await loc.innerText({ timeout: 3_000 }).catch(() => '')) || '').trim();
          if ((s.tid && REFUSED_TIDS.has(s.tid)) || REFUSED_WORDS.test(label)) {
            rec.refused = `safety: will not click "${label || s.tid}"`;
            break;
          }
          await loc.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
          await loc.click({ timeout: s.timeoutMs ?? 15_000, button: s.button ?? 'left' });
          break;
        }
        case 'hover':
          await pick(s).hover({ timeout: s.timeoutMs ?? 10_000 });
          break;
        case 'expectText': {
          // Soft or hard check that an element's text matches a pattern (case-insensitive).
          const txt = ((await pick(s).innerText({ timeout: s.timeoutMs ?? 10_000 })) || '').slice(0, 2000);
          rec.text = txt;
          rec.ok = new RegExp(s.re, 'i').test(txt) !== !!s.not;
          break;
        }
        case 'shotEl':
          // A picture of one element, for side-by-side comparison with the design reference.
          shotN += 1;
          await pick(s).screenshot({ path: path.join(out, `${String(shotN).padStart(2, '0')}-${s.name}.png`), timeout: 10_000 });
          break;
        case 'openChat':
          await page.locator('[data-testid="chatlist-row"]').filter({ hasText: s.name }).first().click({ timeout: 15_000 });
          await page.waitForTimeout(1_000);
          break;
        case 'clickIf': {
          // Clicks only when the control is there (e.g. a plan's Go); never a refused control.
          const loc = page.locator(sel(s)).last();
          rec.found = await loc.count();
          if (rec.found && !(s.tid && REFUSED_TIDS.has(s.tid))) await loc.click({ timeout: 10_000 });
          break;
        }
        case 'paste':
          // Puts text on the clipboard and pastes it into the composer, like Ctrl+V.
          await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), s.repeat ? s.text.repeat(s.repeat) : s.text);
          await page.locator('[data-testid="composer-field"]').click();
          await page.keyboard.press('Control+V');
          break;
        case 'typeSend':
        case 'pasteSend': {
          // Type fast (no retry) or paste, send, then read back what was sent through the bubble's own Copy and require
          // the exact text: a dropped or doubled letter fails the step.
          const field = page.locator('[data-testid="composer-field"]');
          const ME = '[data-testid="thread-log"] [data-testid="bubble-me"]';
          const mine = page.locator(ME);
          await field.click();
          if (s.do === 'typeSend') await page.keyboard.type(s.text, { delay: s.delay ?? 0 });
          else {
            await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), s.text);
            await page.keyboard.press('Control+V');
          }
          await page.waitForTimeout(300);
          rec.inField = norm(await field.innerText());
          // The thread is a virtual list, so the bubble count stops growing in long chats.
          // Mark the newest bubble-me before sending and wait for a newer, unmarked one.
          await page.evaluate((q) => {
            const b = [...document.querySelectorAll(q)].pop();
            if (b) b.setAttribute('data-drv-seen', '1');
          }, ME);
          await page.keyboard.press('Enter');
          await page.waitForFunction(
            (q) => {
              const b = [...document.querySelectorAll(q)].pop();
              return b && !b.hasAttribute('data-drv-seen');
            },
            ME,
            { timeout: 15_000 },
          );
          await app.evaluate(({ clipboard }) => clipboard.writeText(''));
          await mine.last().click({ button: 'right' });
          await page.locator('[data-testid="bubble-menu-copy"]').click();
          await page.waitForTimeout(400);
          const got = norm(await app.evaluate(({ clipboard }) => clipboard.readText()));
          const want = norm(s.text);
          rec.ok = got === want;
          if (!rec.ok) {
            let at = 0;
            while (at < want.length && got[at] === want[at]) at += 1;
            rec.mismatch = { wantLen: want.length, gotLen: got.length, at, want: want.slice(at, at + 40), got: got.slice(at, at + 40) };
            rec.fieldOk = rec.inField === want;
          }
          await page.keyboard.press('Escape').catch(() => {});
          break;
        }
        case 'eval':
          rec.value = await page.evaluate(s.js);
          break;
        case 'fill':
          await page.locator(sel(s)).first().fill(s.value);
          break;
        case 'key':
          await page.keyboard.press(s.key);
          break;
        case 'send': {
          const field = page.locator('[data-testid="composer-field"]');
          await field.waitFor({ state: 'visible', timeout: 30_000 });
          const mine = page.locator('[data-testid="thread-log"] [data-testid="bubble-me"]');
          const lastMine = mine.count().then((c) => (c ? mine.last().innerText() : ''));
          const prev = await lastMine;
          await field.click();
          await field.fill(s.text);
          await page.keyboard.press('Enter');
          rec.sentAt = Date.now();
          // Wait until the sent bubble is the newest bubble-me, then take what is already below it as the baseline.
          await page
            .waitForFunction(
              (p) => {
                const b = [...document.querySelectorAll('[data-testid="thread-log"] [data-testid="bubble-me"]')].pop();
                return b && b.innerText !== p;
              },
              prev,
              { timeout: 10_000 },
            )
            .catch(() => {});
          rec.before = (await afterMe()).n;
          break;
        }
        case 'waitReply': {
          // A reply is "settled" once the replies below the newest user bubble have grown and then stayed the same for quietMs.
          const start = Date.now();
          // The baseline comes from the latest send, unless a waitReply has already used it.
          const lastSend = results.findLastIndex((r) => r.do === 'send');
          const prevSend = lastSend > results.findLastIndex((r) => r.do === 'waitReply') ? results[lastSend] : null;
          const before = s.before ?? prevSend?.before ?? (await afterMe()).n;
          const quiet = s.quietMs ?? 6_000;
          let cur = await afterMe();
          let lastChange = Date.now();
          let first = null;
          while (Date.now() - start < (s.timeoutMs ?? 120_000)) {
            await page.waitForTimeout(500);
            const now = await afterMe();
            if (now.n > before && first === null) first = Date.now() - start;
            if (now.n !== cur.n || now.texts.join() !== cur.texts.join()) lastChange = Date.now();
            cur = now;
            if (now.n > before && Date.now() - lastChange >= quiet) break;
          }
          rec.firstReplyMs = first;
          rec.newBubbles = cur.n - before;
          rec.ok = cur.n > before;
          const texts = cur.texts.slice(before);
          rec.duplicates = texts.filter((x, k) => x && texts.indexOf(x) !== k).length;
          rec.lastReply = texts.join('\n---\n').slice(0, 2000);
          break;
        }
        case 'dump':
          fs.writeFileSync(path.join(out, `${s.name}.json`), JSON.stringify(await threadDump(), null, 2));
          break;
        case 'shot':
          await shot(s.name);
          break;
        case 'text':
          rec.text = (
            (await page
              .locator(sel(s))
              .first()
              .innerText({ timeout: s.timeoutMs ?? 10_000 })) || ''
          ).slice(0, 2000);
          break;
        case 'closeWindow':
          await page.evaluate(() => window.close());
          break;
        case 'quit':
          await app.close();
          break;
        case 'relaunch':
          await app.close().catch(() => {});
          await launch();
          break;
        case 'resize':
          // The window's content size, for the Blueprint breakpoint shots (03-shell-1 §3.1.3).
          await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [s.w, s.h]);
          await page.waitForTimeout(800);
          break;
        case 'crashRelaunch': {
          // A crash then an instant reopen: kill only foo's main process (its helpers live on, as after a real crash),
          // reopen without waiting, and pass only if a window shows. fooProcs counts foo.exe processes left (it includes
          // this driver, which runs under foo.exe too).
          process.kill(app.process().pid, 'SIGKILL');
          if (s.gapMs) await new Promise((r) => setTimeout(r, s.gapMs));
          rec.fooProcs = fooProcs();
          await launch();
          rec.ok = await page.locator('[data-testid="composer-field"], [data-testid="card-setup"]').first().isVisible();
          break;
        }
        default:
          throw new Error(`unknown step ${s.do}`);
      }
      if (rec.ok === undefined) rec.ok = !rec.refused;
    } catch (e) {
      rec.ok = false;
      rec.error = String(e && e.message ? e.message : e)
        .split('\n')[0]
        .slice(0, 400);
      await shot(`error-step${i}`).catch(() => {});
    }
    rec.ms = Date.now() - t0;
    results.push(rec);
    log(rec);
    if (s.shot) await shot(s.shot).catch(() => {});
  }
  await app.close().catch(() => {});
  const summary = {
    journey: journey.id,
    title: journey.title,
    steps: results.length,
    failed: results.filter((r) => r.ok === false && !r.soft).length,
    out,
  };
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ ...summary, results }, null, 2));
  console.log(JSON.stringify(summary));
  // A required journey (first run: picking the AI) stops the batch, since every later journey needs it.
  if (journey.required && summary.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
