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
const { stillWorking, settled } = require('./settle');
const {
  canLatePromoteWaitReply,
  isLiveWindow,
  previousReplyBaseline,
  waitForPageClose,
  waitForWindowAfterClick,
} = require('./driver-helpers');

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

// foo's own tech log (08-3 §19.1) from the test profile, only the lines written during this journey. The app already keeps
// message text out and redacts; the repo is public, so keep only the allowed fields and drop any line that still holds
// something value-like (an email, a long number, an API key).
const DIDNT_GET = /didn[’']t get that/i;
const LOG_KEYS = ['t', 'lvl', 'mod', 'evt', 'ids', 'kind', 'ms'];
const LEAK = /@|\d{10,}|sk-[A-Za-z0-9_-]{6,}/;
const DIAGNOSTIC_SECRET = /(?:https?:\/\/|app:\/\/)[^\s'"<>]+|[A-Za-z0-9_-]{32,}|\b\d{6,}\b|\b(?:sk|key|token|bearer)[-_=:A-Za-z0-9]+/gi;
const safeDiagnosticText = (value) =>
  String(value || '')
    .replace(DIAGNOSTIC_SECRET, '[redacted]')
    .slice(0, 500);
const safeLiveRoute = (value) => {
  try {
    const u = new URL(String(value));
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return '[invalid-route]';
  }
};
function copyTechLog(from, out) {
  const dir = path.join(PROFILE, 'data', 'logs');
  const secret = process.env.ANTHROPIC_API_KEY || '';
  const lines = [];
  let dropped = 0;
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((n) => /^app-.*\.log$/.test(n))
        .sort()
    : [];
  for (const f of files) {
    for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!l.trim()) continue;
      let o;
      try {
        o = JSON.parse(l);
      } catch {
        dropped += 1;
        continue;
      }
      if (typeof o.t !== 'number' || o.t < from) continue;
      const keep = Object.fromEntries(LOG_KEYS.filter((k) => k in o).map((k) => [k, o[k]]));
      const words = [keep.mod, keep.evt, keep.kind].map((v) => String(v ?? '')).join(' ');
      const idsOk = Object.values(keep.ids || {}).every((v) => /^[A-Za-z0-9_-]{1,64}$/.test(String(v)));
      if (LEAK.test(words) || !idsOk || (secret && JSON.stringify(keep).includes(secret))) {
        dropped += 1;
        continue;
      }
      lines.push(JSON.stringify(keep));
    }
  }
  fs.writeFileSync(path.join(out, 'app-log.jsonl'), lines.length ? lines.join('\n') + '\n' : '');
  return { lines: lines.length, dropped };
}

// foo's AI turn log (ai_turns, 0001_init.sql) from the test profile's database, for this journey only. Only ids and enum
// columns are kept (no text, no tokens of content), so it is safe for the public evidence branch.
const TURN_COLS = ['started_at', 'purpose', 'outcome', 'error_kind', 'duration_ms', 'chat_id', 'job_id', 'provider_id', 'billing'];
function copyAiTurns(from, out) {
  const file = path.join(PROFILE, 'data', 'data', 'foo.db');
  if (!fs.existsSync(file)) return { turns: 0, note: 'no database' };
  const Database = require(path.join(path.dirname(EXE), 'resources', 'app.asar.unpacked', 'node_modules', 'better-sqlite3'));
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare(`SELECT ${TURN_COLS.join(', ')} FROM ai_turns WHERE started_at >= ? ORDER BY started_at`).all(from);
    const safe = rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).filter(([, v]) => v === null || typeof v === 'number' || /^[A-Za-z0-9_.:-]{1,64}$/.test(String(v))),
      ),
    );
    fs.writeFileSync(path.join(out, 'ai-turns.jsonl'), safe.map((r) => JSON.stringify(r)).join('\n') + (safe.length ? '\n' : ''));
    return { turns: safe.length };
  } finally {
    db.close();
  }
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: foo-drive.js <journey.json>');
  // {AI_ROW} in a journey names the Find-your-AI row to use (FOO_AI_ROW: claude-cli, anthropic-key, openai-key, codex-cli).
  const journey = JSON.parse(fs.readFileSync(file, 'utf8').replaceAll('{AI_ROW}', process.env.FOO_AI_ROW || 'claude-cli'));
  const out = path.join(ROOT, 'runs', `${stamp()}-${journey.id}`);
  fs.mkdirSync(out, { recursive: true });
  const logPath = path.join(out, 'log.jsonl');
  const log = (o) => fs.appendFileSync(logPath, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');
  const journeyStart = Date.now();
  log({ journey: journey.id, title: journey.title, spec: journey.spec, exe: EXE });

  const { _electron } = loadPlaywright();
  let app;
  let mainPage;
  let livePage = null;
  let shotN = 0;
  const setActivePage = (next) => {
    pageRef = next;
  };
  const attachLiveDiagnostics = (page) => {
    log({ step: 'liveWindowOpened', url: safeLiveRoute(page.url()) });
    page.on('console', (m) => log({ step: 'liveConsole', type: m.type(), text: safeDiagnosticText(m.text()) }));
    page.on('pageerror', (e) => log({ step: 'livePageError', message: safeDiagnosticText(e?.message || e) }));
    page.on('requestfailed', (request) =>
      log({
        step: 'liveRequestFailed',
        url: safeLiveRoute(request.url()),
        error: safeDiagnosticText(request.failure()?.errorText || 'request failed'),
      }),
    );
  };
  const snapshotLiveDiagnostics = async (page) => {
    const dom = await page
      .evaluate(() => {
        const root = document.querySelector('[data-testid="live-root"]');
        return {
          readyState: document.readyState,
          rootCount: document.querySelectorAll('[data-testid="live-root"]').length,
          state: root?.getAttribute('data-state') ?? null,
          pictureCount: document.querySelectorAll('[data-testid="live-picture"]').length,
          maskedCount: document.querySelectorAll('[data-testid="live-picture"][data-masked="true"]').length,
          takeoverCount: document.querySelectorAll('[data-testid="live-take-over"]').length,
          handBackCount: document.querySelectorAll('[data-testid="live-hand-back"]').length,
        };
      })
      .catch((e) => ({ error: safeDiagnosticText(e?.message || e) }));
    log({ step: 'liveDiagnostics', url: safeLiveRoute(page.url()), title: safeDiagnosticText(await page.title().catch(() => '')), dom });
  };
  const launch = async () => {
    app = await _electron.launch({
      executablePath: EXE,
      args: process.env.FOO_ARGS ? process.env.FOO_ARGS.split(' ') : [],
      colorScheme: null,
      env: childEnv(),
      timeout: 60_000,
    });
    mainPage = await app.firstWindow();
    livePage = null;
    setActivePage(mainPage);
    // Wait until the window shows the chat or the setup card, then let the thread finish loading its history,
    // so counting foo's bubbles before a send never mistakes old messages for a new reply.
    await mainPage
      .locator('[data-testid="composer-field"], [data-testid="card-setup"]')
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 })
      .catch(() => {});
    await mainPage.waitForTimeout(4_000);
    mainPage.on('console', (m) => m.type() === 'error' && log({ console: m.text().slice(0, 500) }));
    log({ step: 'launch', ok: true });
  };
  const shot = async (name) => {
    shotN += 1;
    const f = path.join(out, `${String(shotN).padStart(2, '0')}-${name}.png`);
    await pageRef.screenshot({ path: f });
    log({ shot: path.basename(f) });
  };
  const threadDump = () =>
    mainPage.evaluate(() =>
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
  // CR-0046: foo's replies that hold a fence (```a2ui, ```page), as the AI wrote them, so a kit piece that drew only
  // "Couldn't show part of this" can become a cassette (test/fixtures/kit-replies). The drawn thread keeps only the words.
  const rawFences = () =>
    mainPage.evaluate(async () => {
      const out = [];
      const chats = await window.foo.invoke('chat:list', {});
      for (const c of chats.ok ? chats.value : []) {
        const list = await window.foo.invoke('message:list', { chatId: c.id, limit: 50 });
        for (const m of list.ok ? list.value : []) {
          if (m.authorKind === 'foo' && m.text.includes('```'))
            out.push({ chatId: c.id, messageId: m.id, status: m.status, text: m.text.slice(0, 20_000) });
        }
      }
      return out;
    });
  // What counts as foo answering: a foo text bubble or any card foo posts, below the user's newest bubble. The thread is a
  // virtual list (only the rows near the bottom are in the page), so counting all bubbles stops working in a long chat;
  // counting what sits after the newest bubble-me does not. A memory chip ("I'll remember: … · Undo", 05-3 §5.17.1) is
  // foo's whole answer to "remember that …", so it counts too.
  const afterMe = () =>
    mainPage.evaluate(() => {
      const log = document.querySelector('[data-testid="thread-log"]');
      if (!log) return { n: 0, texts: [], items: [] };
      const memoryChip = (el) =>
        el.getAttribute('data-testid') === 'thread-marker' && !!el.querySelector('[data-testid="thread-memory-undo"]');
      // Only top-level rows: a card's own parts (card-connect-allow-send inside card-connect) are not extra replies.
      const nested = (el) => !!el.parentElement?.closest('[data-testid^="bubble-"], [data-testid^="card-"]');
      const all = [...log.querySelectorAll('[data-testid^="bubble-"], [data-testid^="card-"], [data-testid="thread-marker"]')].filter(
        (el) => (/^(bubble-(me|foo|helper|wa)|card-[a-z-]+)$/.test(el.getAttribute('data-testid')) || memoryChip(el)) && !nested(el),
      );
      const kinds = all.map((el) => el.getAttribute('data-testid'));
      const after = all
        .slice(kinds.lastIndexOf('bubble-me') + 1)
        .filter(
          (el) =>
            memoryChip(el) ||
            (/^(bubble-foo|card-[a-z-]+)$/.test(el.getAttribute('data-testid')) && el.getAttribute('data-testid') !== 'card-time'),
        );
      return {
        n: after.length,
        texts: after.map((el) => (el.innerText || '').trim().slice(0, 1500)),
        // foo still at work: a bubble streaming, or an AI page inside it still building (see settle.js).
        items: after.map((el) => ({
          state: el.getAttribute('data-state'),
          pageState: el.querySelector('[data-testid="ai-page"]')?.getAttribute('data-state') ?? null,
          // The kit pieces this reply drew (kit-calculator, kit-dropped ...), so a step is judged on its own reply only.
          kit: [...new Set([...el.querySelectorAll('[data-testid^="kit-"]')].map((k) => k.getAttribute('data-testid')))],
        })),
      };
    });

  // The end state a step names: expectTid / tid / css on screen (count if given), and expectJs true in the page. Kit pieces
  // are judged in waitReply on the new reply only: expectKit names the kit-* test id it must draw, and a "Couldn't show part
  // of this" (kit-dropped) fails the step unless it sets allowKitDropped.
  const endState = async (s) => {
    const q = s.expectTid ? `[data-testid="${s.expectTid}"]` : s.tid || s.css ? sel(s) : null;
    if (q) {
      const n = await mainPage.locator(q).count();
      if (s.count !== undefined ? n !== s.count : n === 0) return false;
    }
    if (s.expectJs && !(await mainPage.evaluate(s.expectJs))) return false;
    return true;
  };

  try {
    await launch();
  } catch (e) {
    log({ step: 'launch', ok: false, error: String(e && e.stack ? e.stack : e).slice(0, 3000) });
    throw e;
  }
  // A web job left stuck by an earlier journey blocks every later reply in the chat
  // (reported product bug). Clear it with a typed "stop" so this journey can still be judged.
  const stuck = mainPage.locator('[data-testid="thread-log"] [data-testid="card-stuck"]');
  if (await stuck.count().catch(() => 0)) {
    const t0 = Date.now();
    const field = mainPage.locator('[data-testid="composer-field"]');
    const ok = await field
      .fill('stop')
      .then(() => field.press('Enter'))
      .then(() => mainPage.waitForTimeout(8_000))
      .then(() => true)
      .catch(() => false);
    log({ step: 'cleanup', stoppedStuckJob: ok, stuckLeft: await stuck.count().catch(() => -1), ms: Date.now() - t0 });
  }
  const results = [];
  for (const [i, s] of journey.steps.entries()) {
    const t0 = Date.now();
    const rec = { i, do: s.do, note: s.note, expect: s.expect, soft: s.soft };
    try {
      switch (s.do) {
        case 'wait':
          await pageRef.waitForTimeout(s.ms);
          break;
        case 'waitFor':
          await pageRef
            .locator(sel(s))
            .first()
            .waitFor({ state: 'visible', timeout: s.timeoutMs ?? 30_000 });
          break;
        case 'check': {
          const n = await pageRef.locator(sel(s)).count();
          rec.found = n;
          rec.ok = s.count !== undefined ? n === s.count : n > 0;
          break;
        }
        case 'click': {
          // unlessTid: skip the click when that control is already showing (e.g. no retest needed once Use is offered).
          if (s.unlessTid && (await mainPage.locator(`[data-testid="${s.unlessTid}"]`).count())) {
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
          const baseline = await afterMe();
          await loc.click({ timeout: s.timeoutMs ?? 15_000, button: s.button ?? 'left' });
          rec.before = baseline.n;
          rec.clicked = true;
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
          await mainPage.locator('[data-testid="chatlist-row"]').filter({ hasText: s.name }).first().click({ timeout: 15_000 });
          await mainPage.waitForTimeout(1_000);
          break;
        case 'clickIf': {
          // Clicks only when the control is there (e.g. a plan's Go); never a refused control.
          // Opening the live viewer is the one main-page action whose result is
          // a second BrowserWindow.  Arm the window listener before clicking,
          // then route generic checks and screenshots to that live page.
          const target = s.captureWindow ? mainPage : pageRef;
          const loc = target.locator(sel(s)).last();
          rec.found = await loc.count();
          if (rec.found && !(s.tid && REFUSED_TIDS.has(s.tid))) {
            const baseline = await afterMe();
            if (s.captureWindow) {
              livePage = await waitForWindowAfterClick({
                app,
                click: () => loc.click({ timeout: s.timeoutMs ?? 15_000 }),
                predicate: isLiveWindow,
                observe: attachLiveDiagnostics,
                ready: (opened) =>
                  opened.locator('[data-testid="live-root"]').waitFor({ state: 'visible', timeout: s.timeoutMs ?? 30_000 }),
              });
              setActivePage(livePage);
              await snapshotLiveDiagnostics(livePage);
              rec.window = 'live';
              rec.before = baseline.n;
              rec.clicked = true;
            } else {
              const close = s.awaitClose && livePage ? waitForPageClose(livePage, s.timeoutMs ?? 30_000) : null;
              // Keep a rejected close wait handled if the initiating click
              // fails, while awaiting the original promise on success.
              if (close) void close.catch(() => {});
              await loc.click({ timeout: s.timeoutMs ?? 10_000 });
              rec.before = baseline.n;
              rec.clicked = true;
              if (close) {
                await close;
                livePage = null;
                setActivePage(mainPage);
                rec.window = 'main';
              }
            }
          }
          break;
        }
        case 'paste':
          // Puts text on the clipboard and pastes it into the composer, like Ctrl+V.
          await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), s.repeat ? s.text.repeat(s.repeat) : s.text);
          await mainPage.locator('[data-testid="composer-field"]').click();
          await mainPage.keyboard.press('Control+V');
          break;
        case 'typeSend':
        case 'pasteSend': {
          // Type fast (no retry) or paste, send, then read back what was sent through the bubble's own Copy and require
          // the exact text: a dropped or doubled letter fails the step.
          const field = mainPage.locator('[data-testid="composer-field"]');
          const ME = '[data-testid="thread-log"] [data-testid="bubble-me"]';
          const mine = mainPage.locator(ME);
          await field.click();
          if (s.do === 'typeSend') await mainPage.keyboard.type(s.text, { delay: s.delay ?? 0 });
          else {
            await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), s.text);
            await mainPage.keyboard.press('Control+V');
          }
          await mainPage.waitForTimeout(300);
          rec.inField = norm(await field.innerText());
          // The thread is a virtual list, so the bubble count stops growing in long chats.
          // Mark the newest bubble-me before sending and wait for a newer, unmarked one.
          await mainPage.evaluate((q) => {
            const b = [...document.querySelectorAll(q)].pop();
            if (b) b.setAttribute('data-drv-seen', '1');
          }, ME);
          await mainPage.keyboard.press('Enter');
          await mainPage.waitForFunction(
            (q) => {
              const b = [...document.querySelectorAll(q)].pop();
              return b && !b.hasAttribute('data-drv-seen');
            },
            ME,
            { timeout: 15_000 },
          );
          await app.evaluate(({ clipboard }) => clipboard.writeText(''));
          await mine.last().click({ button: 'right' });
          await mainPage.locator('[data-testid="bubble-menu-copy"]').click();
          await mainPage.waitForTimeout(400);
          const got = norm(await app.evaluate(({ clipboard }) => clipboard.readText()));
          const want = norm(s.text);
          rec.ok = got === want;
          if (!rec.ok) {
            let at = 0;
            while (at < want.length && got[at] === want[at]) at += 1;
            rec.mismatch = { wantLen: want.length, gotLen: got.length, at, want: want.slice(at, at + 40), got: got.slice(at, at + 40) };
            rec.fieldOk = rec.inField === want;
          }
          await mainPage.keyboard.press('Escape').catch(() => {});
          break;
        }
        case 'eval':
          rec.value = await mainPage.evaluate(s.js);
          break;
        case 'fill':
          await pageRef.locator(sel(s)).first().fill(s.value);
          break;
        case 'key':
          await pageRef.keyboard.press(s.key);
          break;
        case 'send': {
          const field = mainPage.locator('[data-testid="composer-field"]');
          await field.waitFor({ state: 'visible', timeout: 30_000 });
          const ME = '[data-testid="thread-log"] [data-testid="bubble-me"]';
          await field.click();
          await field.fill(s.text);
          // Mark the newest bubble-me, send, and wait for a newer unmarked one (the same text sent twice still counts).
          await mainPage.evaluate((q) => {
            const b = [...document.querySelectorAll(q)].pop();
            if (b) b.setAttribute('data-drv-seen', '1');
          }, ME);
          await mainPage.keyboard.press('Enter');
          rec.sentAt = Date.now();
          rec.sent = await mainPage
            .waitForFunction(
              (q) => {
                const b = [...document.querySelectorAll(q)].pop();
                return b && !b.hasAttribute('data-drv-seen');
              },
              ME,
              { timeout: 10_000 },
            )
            .then(() => true)
            .catch(() => false);
          // Everything below the sent bubble is foo's answer, even one that landed before this line ran (B04's instant
          // "Nothing's running right now."), so the baseline is 0. If no bubble was sent, keep what is below the old one.
          rec.before = rec.sent ? 0 : (await afterMe()).n;
          break;
        }
        case 'waitReply': {
          // A reply is "settled" once the replies below the newest user bubble have grown and then stayed the same for quietMs.
          const start = Date.now();
          // The baseline comes from the latest send, unless a waitReply has already used it.
          const lastSend = results.findLastIndex((r) => r.do === 'send');
          const lastWait = results.findLastIndex((r) => r.do === 'waitReply');
          const prevSend = lastSend > lastWait ? results[lastSend] : null;
          const lastAction = results.findLastIndex((r) => (r.do === 'click' || r.do === 'clickIf') && r.clicked);
          const prevAction = lastAction > lastWait ? results[lastAction] : null;
          const before = previousReplyBaseline({
            explicitBefore: s.before,
            previousSend: prevSend,
            previousAction: prevAction,
            previousSendIndex: lastSend,
            previousActionIndex: lastAction,
            currentCount: (await afterMe()).n,
          });
          rec.before = before;
          const quiet = s.quietMs ?? 6_000;
          let cur = await afterMe();
          let lastChange = Date.now();
          let first = null;
          while (Date.now() - start < (s.timeoutMs ?? 120_000)) {
            await mainPage.waitForTimeout(500);
            const now = await afterMe();
            if (now.n > before && first === null) first = Date.now() - start;
            if (now.n !== cur.n || now.texts.join() !== cur.texts.join()) lastChange = Date.now();
            cur = now;
            if (settled({ n: now.n, before, items: now.items.slice(before), quietFor: Date.now() - lastChange, quietMs: quiet })) break;
          }
          rec.firstReplyMs = first;
          rec.newBubbles = cur.n - before;
          rec.ok = cur.n > before;
          if (s.exactNewBubbles !== undefined && rec.newBubbles !== s.exactNewBubbles) {
            rec.exactNewBubblesExpected = s.exactNewBubbles;
            rec.ok = false;
          }
          // Timed out with foo still writing: not an answer (and closing now would cut the reply off).
          if (stillWorking(cur.items.slice(before))) {
            rec.stillWorking = true;
            rec.ok = false;
          }
          const texts = cur.texts.slice(before);
          rec.duplicates = texts.filter((x, k) => x && texts.indexOf(x) !== k).length;
          rec.lastReply = texts.join('\n---\n').slice(0, 2000);
          rec.replyTexts = texts;
          // A reply is not the outcome: "I didn't get that" fails unless the journey expects it, and a step that names an end
          // state (a card on screen, the theme changed) needs that state too.
          if (DIDNT_GET.test(rec.lastReply) && !s.allowDidntGet) {
            rec.didntGetThat = true;
            rec.ok = false;
          }
          // A kit piece dropped as "Couldn't show part of this" fails the step (CR-0050): the words alone passed run 30
          // while the calculator, map and chart were never drawn. expectKit names the piece this reply must draw.
          const kit = [...new Set(cur.items.slice(before).flatMap((x) => x.kit || []))];
          rec.kit = kit;
          if (kit.includes('kit-dropped') && !s.allowKitDropped) {
            rec.kitDropped = true;
            rec.ok = false;
          }
          if (s.expectKit && !kit.includes(s.expectKit)) {
            rec.kitMissing = s.expectKit;
            rec.ok = false;
          }
          if (s.replyFixtureMaxChars !== undefined && rec.newBubbles > 0) {
            const fixture = await mainPage.evaluate(() => {
              const bubble = [...document.querySelectorAll('[data-testid="thread-log"] [data-testid="bubble-foo"]')].at(-1);
              const body = bubble?.querySelector('[data-copy="ai"]');
              const text = (body?.innerText || '').trim();
              const paragraphs = body ? [...body.children].filter((e) => e.tagName === 'P' && (e.textContent || '').trim()).length : 0;
              return {
                chars: text.length,
                paragraphs,
                timestamps: bubble?.querySelectorAll('[data-testid="bubble-meta"]').length ?? 0,
              };
            });
            rec.replyFixture = fixture;
            if (fixture.chars > s.replyFixtureMaxChars) {
              rec.blocked = 'precondition';
              rec.blockedReason = `provider reply exceeded the ${s.replyFixtureMaxChars}-character fixture`;
              rec.ok = false;
            }
          }
          if (rec.ok && (s.expectTid || s.expectJs)) {
            rec.endState = await endState(s);
            rec.ok = rec.endState;
          }
          break;
        }
        case 'dump':
          fs.writeFileSync(path.join(out, `${s.name}.json`), JSON.stringify(await threadDump(), null, 2));
          fs.writeFileSync(
            path.join(out, `${s.name}-raw.json`),
            JSON.stringify(await rawFences().catch((e) => [{ error: String(e).slice(0, 300) }]), null, 2),
          );
          break;
        case 'shot':
          await shot(s.name);
          break;
        case 'text':
          rec.text = (
            (await pageRef
              .locator(sel(s))
              .first()
              .innerText({ timeout: s.timeoutMs ?? 10_000 })) || ''
          ).slice(0, 2000);
          break;
        case 'closeWindow':
          await pageRef.evaluate(() => window.close());
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
          await pageRef.waitForTimeout(800);
          break;
        case 'crashRelaunch': {
          // A crash then an instant reopen: kill only foo's main process (its helpers live on, as after a real crash),
          // reopen without waiting, and pass only if a window shows. fooProcs counts foo.exe processes left (it includes
          // this driver, which runs under foo.exe too).
          // After a failed reopen the last app is already gone; then this case starts from a fresh launch.
          // foo's own main pid, asked from inside the app: Playwright's pid can be a launcher whose child is the real
          // main (seen in dev runs on CI), and killing it leaves foo running.
          // Bounded: a hung (not dead) main must not hang the journey.
          const mainPid = () =>
            Promise.race([
              app.evaluate(() => process.pid),
              new Promise((_, no) => setTimeout(() => no(new Error('no answer')), 10_000)),
            ]).catch(() => app.process().pid);
          try {
            process.kill(await mainPid(), 'SIGKILL');
          } catch {
            await new Promise((r) => setTimeout(r, 10_000)); // let the last crash's helpers exit first
            rec.fooProcsBefore = fooProcs();
            const err = await launch().then(
              () => null,
              (e) => String(e && e.message ? e.message : e).split('\n')[0],
            );
            if (err) throw new Error(`fresh launch 10 s after the last crash failed (${rec.fooProcsBefore} foo.exe left): ${err}`);
            process.kill(await mainPid(), 'SIGKILL');
          }
          if (s.gapMs) await new Promise((r) => setTimeout(r, s.gapMs));
          rec.fooProcs = fooProcs();
          await launch();
          rec.ok = await mainPage.locator('[data-testid="composer-field"], [data-testid="card-setup"]').first().isVisible();
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
  // Closing foo mid-reply cuts that reply off, and the next journey (same profile) would find "That reply got cut off".
  // Let any reply still streaming, or page still building, finish first, for up to 3 minutes.
  const busy =
    '[data-testid="thread-log"] :is([data-testid="bubble-foo"][data-state="streaming"], [data-testid="ai-page"][data-state="building"])';
  const t1 = Date.now();
  while (
    Date.now() - t1 < 180_000 &&
    (await mainPage
      .locator(busy)
      .count()
      .catch(() => 0))
  )
    await mainPage.waitForTimeout(1_000);
  if (Date.now() - t1 > 1_000) log({ step: 'drain', ms: Date.now() - t1 });
  // Some outcomes land after the step gave up (a saved fact, an AI page that opens late). Before calling a step failed,
  // look again at the end state it names; a late pass is kept as ok with late: true.
  for (const r of results) {
    const s = journey.steps[r.i];
    if (r.ok !== false || r.didntGetThat || r.refused || r.blocked) continue;
    const named = s.do === 'check' || s.do === 'waitFor' ? { tid: s.tid, css: s.css, count: s.count } : s;
    if (!(named.tid || named.css || named.expectTid || named.expectJs)) continue;
    if (r.do === 'waitReply') {
      const observed = await afterMe().catch(() => ({ n: 0, texts: [] }));
      const hasLaterCausalAction = results.some(
        (next) => next.i > r.i && ((next.do === 'send' && next.sent) || ((next.do === 'click' || next.do === 'clickIf') && next.clicked)),
      );
      if (!canLatePromoteWaitReply(r, observed, hasLaterCausalAction)) continue;
    }
    const now = await endState(named).catch(() => false);
    if (now) {
      r.ok = true;
      r.late = true;
      log({ step: 'recheck', i: r.i, do: r.do, late: true });
    }
  }
  await app.close().catch(() => {});
  try {
    log({ step: 'appLog', ...copyTechLog(journeyStart, out) });
  } catch (e) {
    log({ step: 'appLog', ok: false, error: String(e).slice(0, 300) });
  }
  try {
    log({ step: 'aiTurns', ...copyAiTurns(journeyStart, out) });
  } catch (e) {
    log({ step: 'aiTurns', ok: false, error: String(e).slice(0, 300) });
  }
  const summary = {
    journey: journey.id,
    title: journey.title,
    steps: results.length,
    failed: results.filter((r) => r.ok === false && !r.soft && !r.blocked).length,
    blocked: results.filter((r) => r.blocked).length,
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
