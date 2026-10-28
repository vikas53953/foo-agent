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

const EXE = process.env.FOO_EXE || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'foo', 'foo.exe');
const ROOT = process.env.FOO_REAL_TEST_DIR || path.join(process.env.USERPROFILE || '.', 'foo-real-test');
// A journey with "profile": "own" runs on its own fresh profile (profile-<id>) instead of the shared one (CR-0054).
let PROFILE = path.join(ROOT, 'profile');

// Never clicked by the driver: real spend, real outbound messages, real bookings.
const REFUSED_TIDS = new Set([
  'card-approval-approve',
  'card-draft-send',
  'card-draft-send-when-online',
  'card-connect-allow-send',
  'composer-paste-send',
]);
const REFUSED_WORDS = /^(approve|pay|pay now|book|book now|confirm booking|send email|send now|post|post now)$/i;

// Release gate (Vikas 2026-10-27: test the real app like a user, and look at it). FOO_VIDEO=1 records a video of every
// launch; FOO_WATCH_MS ("1500,5000") takes a picture that long after each send while foo is still answering, so the
// waiting state is checked, not only the answer; `sweep` clicks every visible control with the QA crawler's in-page
// helpers (test/qa-explore/inpage.js, or FOO_QA_INPAGE). FOO_TICK_TEST_CLOCK=1 is for a local dev run only: a FOO_TEST
// build's clock stands still unless it is ticked (a packaged build has no test clock, so it does nothing there).
const VIDEO = process.env.FOO_VIDEO === '1';
const WATCH_MS = (process.env.FOO_WATCH_MS || '')
  .split(',')
  .map(Number)
  .filter((n) => n > 0)
  .sort((a, b) => a - b);
const INPAGE_FILE = process.env.FOO_QA_INPAGE || path.join(__dirname, '..', 'qa-explore', 'inpage.js');
const TICK = process.env.FOO_TICK_TEST_CLOCK === '1';

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

let journeyFeatures = null;

// foo must start as the app, not as Node: drop the variable this script itself runs under.
function childEnv() {
  const env = { ...process.env, FOO_DATA_DIR: path.join(PROFILE, 'data'), FOO_LOCAL_DIR: path.join(PROFILE, 'local') };
  // CR-0054: every feature is on unless the journey asks for the build's own list ("features": "shipped") or names some.
  env.FOO_FEATURES = journeyFeatures ?? process.env.FOO_FEATURES ?? 'all';
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
  if (journey.features) journeyFeatures = journey.features;
  if (journey.profile === 'own') {
    PROFILE = path.join(ROOT, `profile-${journey.id}`);
    fs.rmSync(PROFILE, { recursive: true, force: true });
  }
  const out = path.join(ROOT, 'runs', `${stamp()}-${journey.id}`);
  fs.mkdirSync(out, { recursive: true });
  const logPath = path.join(out, 'log.jsonl');
  const log = (o) => fs.appendFileSync(logPath, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');
  const journeyStart = Date.now();
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
      ...(VIDEO ? { recordVideo: { dir: path.join(out, 'video'), size: { width: 1280, height: 800 } } } : {}),
    });
    page = await app.firstWindow();
    pageRef = page;
    if (TICK) {
      const p = page;
      (async () => {
        while (!p.isClosed()) {
          await p.evaluate(() => window.__fooTest?.clock.advance(100)).catch(() => {});
          await new Promise((r) => setTimeout(r, 100));
        }
      })();
    }
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
    return path.basename(f);
  };
  // What the user sees on their newest message and below it while foo answers: the status badge (👀 is "seen"),
  // reaction chips, the Thinking row and how many of foo's rows have arrived.
  const watchState = () =>
    page.evaluate(() => {
      const me = [...document.querySelectorAll('[data-testid="thread-log"] [data-testid="bubble-me"]')].pop();
      // The badge and reaction chips sit beside the bubble in its row, not inside it.
      const mine = me ? me.closest('[data-side]') || me.parentElement : null;
      const all = (q) => (mine ? [...mine.querySelectorAll(q)] : []);
      return {
        badges: all('[data-testid="bubble-badge"]').map((b) => b.getAttribute('data-state')),
        reactions: all('[data-testid="bubble-reaction"]').map((b) => (b.innerText || '').trim()),
        thinking: !!document.querySelector('[data-testid="thread-thinking"]'),
        streaming: document.querySelectorAll('[data-testid="thread-log"] [data-testid="bubble-foo"][data-state="streaming"]').length,
      };
    });
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
  // CR-0046: foo's replies that hold a fence (```a2ui, ```page), as the AI wrote them, so a kit piece that drew only
  // "Couldn't show part of this" can become a cassette (test/fixtures/kit-replies). The drawn thread keeps only the words.
  const rawFences = () =>
    page.evaluate(async () => {
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
    page.evaluate(() => {
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
      const n = await page.locator(q).count();
      if (s.count !== undefined ? n !== s.count : n === 0) return false;
    }
    if (s.expectJs && !(await page.evaluate(s.expectJs))) return false;
    return true;
  };

  // The sweep's view of the page, compared before and after each click (the QA crawler's signature, test/qa-explore).
  const signature = () =>
    page.evaluate(() => ({
      overlays: window.__qa
        .overlays()
        .filter((o) => o.role !== 'listbox' && o.role !== 'tooltip')
        .map((o) => `${o.role}:${o.text.slice(0, 40)}`),
      screens: [...document.querySelectorAll('[data-testid^="screen-"]')].map((e) => e.dataset.testid || ''),
      theme: document.documentElement.dataset.theme || '',
      // A hover tooltip is not an effect of the click: leave its words out, or a dead button with a tooltip passes.
      text: [...document.querySelectorAll('[role=tooltip]')].reduce((t, tip) => t.split(tip.innerText).join(''), document.body.innerText),
      focus: (() => {
        const f = document.activeElement;
        return f && /^(INPUT|TEXTAREA)$/.test(f.tagName) ? f.getAttribute('aria-label') || f.getAttribute('placeholder') || f.tagName : '';
      })(),
      pressed: [...document.querySelectorAll('[aria-pressed="true"],[aria-checked="true"],[aria-selected="true"]')]
        .map((e) => `${e.dataset.testid || ''}:${e.getAttribute('aria-label') || e.innerText.slice(0, 20)}`)
        .join('|'),
    }));
  const effectOf = (a, b) => {
    const fx = [];
    const opened = b.overlays.filter((o) => !a.overlays.includes(o));
    if (opened.length) fx.push(`opened ${opened.join(' | ')}`);
    if (b.screens.join() !== a.screens.join()) fx.push(`screen: ${b.screens.join(',') || 'chat'}`);
    if (b.theme !== a.theme) fx.push(`theme: ${b.theme}`);
    if (b.pressed !== a.pressed) fx.push('selection changed');
    if (b.focus && b.focus !== a.focus) fx.push(`typing in ${b.focus}`);
    if (b.text !== a.text) {
      const was = new Set(a.text.split('\n'));
      const added = b.text.split('\n').filter((l) => l.trim() && !was.has(l));
      fx.push(`content changed${added.length ? `: "${added.slice(0, 2).join(' / ').slice(0, 60)}"` : ''}`);
    }
    return fx;
  };
  const backTo = async (s) => {
    // A suggestion chip fills the message box and hides the other chips; empty it so the next control is on screen again.
    const box = page.locator('[data-testid="composer-field"]');
    if ((await box.count()) && (await box.inputValue().catch(() => ''))) await box.fill('').catch(() => {});
    for (let k = 0; k < 6; k++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      if (!(await page.locator('[role=dialog],[role=alertdialog],[role=menu]').count())) break;
    }
    if (s.openTid) {
      const back = page.locator('[data-testid="screen-back"]');
      if (!(await page.locator(`[data-testid="${s.openTid}"]`).count()) && (await back.count())) await back.click().catch(() => {});
      // Still not there (a click took the user to another screen): walk the way in again, e.g. ⋯ menu → Settings.
      if (!(await page.locator(`[data-testid="${s.openTid}"]`).count()))
        for (const tid of s.openVia || [])
          await page
            .locator(`[data-testid="${tid}"]`)
            .first()
            .click({ timeout: 5_000 })
            .catch(() => {});
      await page
        .locator(`[data-testid="${s.openTid}"]`)
        .first()
        .click({ timeout: 5_000 })
        .catch(() => {});
    }
    await page.waitForTimeout(300);
  };
  const sweep = async (s) => {
    if (!fs.existsSync(INPAGE_FILE)) return { blocked: `crawler helpers not found at ${INPAGE_FILE}`, controls: [] };
    await page.evaluate(fs.readFileSync(INPAGE_FILE, 'utf8'));
    await backTo(s);
    const skip = new Set([
      ...REFUSED_TIDS,
      ...(s.skip || []),
      'sidebar-menu-quit',
      'composer-field',
      'thread-log',
      'sidebar-resize',
      'composer-send',
    ]);
    const scope = s.within || null;
    const listed = await page.evaluate((sc) => {
      const box = sc ? document.querySelector(sc) : null;
      return window.__qa.controls().filter((c) => {
        if (!box) return true;
        const el = document.elementFromPoint(c.box[0] + c.box[2] / 2, c.box[1] + c.box[3] / 2);
        return !!el && box.contains(el);
      });
    }, scope);
    const controls = [];
    const seen = new Set();
    const cap = s.max ?? 60;
    const truncated = listed.length > cap ? listed.length - cap : 0;
    for (const c of listed.slice(0, cap)) {
      const key = `${c.tid}|${c.name}`;
      if (seen.has(key) || (!c.tid && !c.name)) continue;
      seen.add(key);
      const e = { tid: c.tid, role: c.role, name: c.name, status: 'pass', effect: [], issues: [] };
      controls.push(e);
      if (skip.has(c.tid) || REFUSED_WORDS.test(c.name)) {
        e.status = 'skipped';
        e.reason = REFUSED_WORDS.test(c.name) || REFUSED_TIDS.has(c.tid) ? 'safety: money or outbound' : 'own journey covers it';
        continue;
      }
      if (c.disabled) {
        e.status = 'skipped';
        e.reason = 'disabled here';
        continue;
      }
      await backTo(s);
      // Clicking the tab or option that is already chosen correctly does nothing (the QA crawler skips it the same way).
      if (
        /radio|checkbox|switch|tab/.test(c.role) &&
        (await page.evaluate((b) => {
          const el = document.elementFromPoint(b[0] + b[2] / 2, b[1] + b[3] / 2)?.closest('[role]');
          return el?.getAttribute('aria-checked') === 'true' || el?.getAttribute('aria-selected') === 'true';
        }, c.box))
      ) {
        e.status = 'skipped';
        e.reason = 'already chosen';
        continue;
      }
      const loc = c.tid
        ? page.locator(`[data-testid="${c.tid}"]`).filter({ hasText: c.name.length < 40 ? c.name : '' })
        : page.getByRole(c.role, { name: c.name, exact: true });
      const target = (await loc.count()) ? loc.first() : page.locator(`[data-testid="${c.tid}"]`).first();
      let before;
      try {
        await target.hover({ timeout: 2_000 });
        await page.waitForTimeout(500);
        before = await signature();
        await target.click({ timeout: 3_000 });
      } catch (err) {
        e.status = 'not-tested';
        // Say why: gone from the screen after an earlier click, or something else sits on top of it.
        const why = await target
          .evaluate((el) => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return 'no longer on screen';
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return top && !el.contains(top) ? `covered by ${top.getAttribute('data-testid') || top.tagName.toLowerCase()}` : '';
          })
          .catch(() => 'no longer on screen');
        if (why) e.effect.push(why);
        e.effect.push(
          `could not click: ${String(err && err.message ? err.message : err)
            .split('\n')[0]
            .slice(0, 120)}`,
        );
        continue;
      }
      await page.waitForTimeout(800);
      let after = await signature();
      // Some controls answer slowly (testing the AI); 4 s more before calling one dead.
      if (!effectOf(before, after).length) {
        await page.waitForTimeout(4_000);
        after = await signature();
      }
      e.effect = effectOf(before, after);
      e.issues = await page.evaluate(() => window.__qa.invariants()).catch(() => []);
      e.shot = await shot(`sweep-${(c.tid || c.name).replace(/[^a-z0-9-]+/gi, '_').slice(0, 40)}`).catch(() => undefined);
      if (!e.effect.length) {
        e.effect.push('NO VISIBLE EFFECT');
        e.status = s.noEffectOk?.includes(c.tid) ? 'pass' : 'fail';
      } else if (e.issues.length) e.status = 'fail';
    }
    await backTo(s);
    return { controls, truncated };
  };

  try {
    await launch();
  } catch (e) {
    log({ step: 'launch', ok: false, error: String(e && e.stack ? e.stack : e).slice(0, 3000) });
    throw e;
  }
  // A web job left stuck by an earlier journey blocks every later reply in the chat
  // (reported product bug). Clear it with a typed "stop" so this journey can still be judged.
  const stuck = page.locator('[data-testid="thread-log"] [data-testid="card-stuck"]');
  if (await stuck.count().catch(() => 0)) {
    const t0 = Date.now();
    const field = page.locator('[data-testid="composer-field"]');
    const ok = await field
      .fill('stop')
      .then(() => field.press('Enter'))
      .then(() => page.waitForTimeout(8_000))
      .then(() => true)
      .catch(() => false);
    log({ step: 'cleanup', stoppedStuckJob: ok, stuckLeft: await stuck.count().catch(() => -1), ms: Date.now() - t0 });
  }
  const results = [];
  for (const [i, s] of journey.steps.entries()) {
    const t0 = Date.now();
    const rec = { i, do: s.do, note: s.note, expect: s.expect, soft: s.soft, ref: s.ref, feature: s.feature, typed: s.text };
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
          // "env" names a variable whose value is typed (a real key into the Secret box); only the name is logged.
          // pick() honours nth / last; .first() ignored them, so U13 typed the key into the Name box (real-AI run 47fea16).
          await pick(s).fill(s.env ? process.env[s.env] || '' : s.value);
          break;
        case 'key':
          await page.keyboard.press(s.key);
          break;
        case 'send': {
          const field = page.locator('[data-testid="composer-field"]');
          await field.waitFor({ state: 'visible', timeout: 30_000 });
          const ME = '[data-testid="thread-log"] [data-testid="bubble-me"]';
          await field.click();
          await field.fill(s.text);
          // Mark the newest bubble-me, send, and wait for a newer unmarked one (the same text sent twice still counts).
          await page.evaluate((q) => {
            const b = [...document.querySelectorAll(q)].pop();
            if (b) b.setAttribute('data-drv-seen', '1');
          }, ME);
          await page.keyboard.press('Enter');
          rec.sentAt = Date.now();
          rec.sent = await page
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
          const prevSend = lastSend > results.findLastIndex((r) => r.do === 'waitReply') ? results[lastSend] : null;
          const before = s.before ?? prevSend?.before ?? (await afterMe()).n;
          const quiet = s.quietMs ?? 6_000;
          let cur = await afterMe();
          let lastChange = Date.now();
          let first = null;
          // The wait as the user saw it: each change of the badge, reactions or Thinking row, timed from the send, and a
          // picture at each FOO_WATCH_MS mark while foo had not finished. forbidBadge names a badge (e.g. "seen", 👀) that
          // must never show on this message.
          const sentAt = prevSend?.sentAt ?? start;
          const marks = [...WATCH_MS];
          rec.timeline = [];
          rec.watchShots = [];
          const watch = async (done) => {
            const w = await watchState().catch(() => null);
            if (!w) return;
            const at = Date.now() - sentAt;
            const last = rec.timeline[rec.timeline.length - 1];
            const key = JSON.stringify(w);
            if (!last || last.key !== key) rec.timeline.push({ at, ...w, key });
            if (s.forbidBadge && w.badges.includes(s.forbidBadge) && !rec.forbidden) rec.forbidden = { badge: s.forbidBadge, at };
            while (!done && marks.length && at >= marks[0]) {
              const m = marks.shift();
              const f = await shot(`${s.shot || 'reply'}-wait-${(m / 1000).toFixed(1)}s`).catch(() => undefined);
              if (f) rec.watchShots.push({ at, mark: m, shot: f, ...w });
            }
          };
          await watch(false);
          while (Date.now() - start < (s.timeoutMs ?? 120_000)) {
            await page.waitForTimeout(WATCH_MS.length || s.forbidBadge ? 250 : 500);
            const now = await afterMe();
            await watch(settled({ n: now.n, before, items: now.items.slice(before), quietFor: 0, quietMs: 0 }));
            if (now.n > before && first === null) first = Date.now() - start;
            // neverCss: something that must not show at any point while foo answers (CR-0066: 👀 on a plain message).
            if (s.neverCss && rec.neverSeenMs === undefined && (await page.locator(s.neverCss).count()) > 0) {
              rec.neverSeenMs = Date.now() - start;
            }
            if (now.n !== cur.n || now.texts.join() !== cur.texts.join()) lastChange = Date.now();
            cur = now;
            if (settled({ n: now.n, before, items: now.items.slice(before), quietFor: Date.now() - lastChange, quietMs: quiet })) break;
          }
          rec.firstReplyMs = first;
          rec.newBubbles = cur.n - before;
          rec.ok = cur.n > before && rec.neverSeenMs === undefined;
          for (const t of rec.timeline) delete t.key;
          if (rec.forbidden) rec.ok = false;
          // Timed out with foo still writing: not an answer (and closing now would cut the reply off).
          if (stillWorking(cur.items.slice(before))) {
            rec.stillWorking = true;
            rec.ok = false;
          }
          const texts = cur.texts.slice(before);
          rec.duplicates = texts.filter((x, k) => x && texts.indexOf(x) !== k).length;
          rec.lastReply = texts.join('\n---\n').slice(0, 2000);
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
          if (rec.ok && (s.expectTid || s.expectJs)) {
            rec.endState = await endState(s);
            rec.ok = rec.endState;
          }
          break;
        }
        case 'sweep': {
          // Every visible control in this place, clicked like a user: each must visibly do something and leave the
          // screen whole (QA crawler invariants). The controls list and a picture of each result go to the evidence.
          Object.assign(rec, await sweep(s));
          // No controls found (a wrong scope) or a control that could not be clicked is a failure, not a pass.
          if (!rec.blocked && !rec.controls.some((c) => c.status === 'pass' || c.status === 'fail'))
            rec.blocked = 'no control found to click';
          rec.ok = !rec.blocked && rec.controls.every((c) => c.status !== 'fail' && c.status !== 'not-tested');
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
      rec.errorShot = await shot(`error-step${i}`).catch(() => undefined);
    }
    rec.ms = Date.now() - t0;
    if (s.shot) rec.shot = await shot(s.shot).catch(() => undefined);
    results.push(rec);
    log(rec);
  }
  // Closing foo mid-reply cuts that reply off, and the next journey (same profile) would find "That reply got cut off".
  // Let any reply still streaming, or page still building, finish first, for up to 3 minutes.
  const busy =
    '[data-testid="thread-log"] :is([data-testid="bubble-foo"][data-state="streaming"], [data-testid="ai-page"][data-state="building"])';
  const t1 = Date.now();
  while (
    Date.now() - t1 < 180_000 &&
    (await page
      .locator(busy)
      .count()
      .catch(() => 0))
  )
    await page.waitForTimeout(1_000);
  if (Date.now() - t1 > 1_000) log({ step: 'drain', ms: Date.now() - t1 });
  // Some outcomes land after the step gave up (a saved fact, an AI page that opens late). Before calling a step failed,
  // look again at the end state it names; a late pass is kept as ok with late: true.
  for (const r of results) {
    const s = journey.steps[r.i];
    // A measured failure (👀 seen, foo still writing, a dropped kit piece) is never undone by a late end state.
    if (r.ok !== false || r.didntGetThat || r.refused || r.forbidden || r.neverSeenMs !== undefined || r.stillWorking || r.kitDropped)
      continue;
    const named = s.do === 'check' || s.do === 'waitFor' ? { tid: s.tid, css: s.css, count: s.count } : s;
    if (!(named.tid || named.css || named.expectTid || named.expectJs)) continue;
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
  const videoDir = path.join(out, 'video');
  const summary = {
    journey: journey.id,
    title: journey.title,
    feature: journey.feature,
    videos: fs.existsSync(videoDir) ? fs.readdirSync(videoDir).map((f) => `video/${f}`) : [],
    steps: results.length,
    failed: results.filter((r) => r.ok === false && !r.soft).length,
    out,
  };
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ ...summary, results }, null, 2));
  console.log(JSON.stringify(summary));
  // A required journey (first run: picking the AI) stops the batch, since every later journey needs it. A gate journey (a
  // batch's acceptance journey, like B1-batch1) does not stop it, but any failed step turns the run red: the workflow ends
  // the part with the exit status, so a batch is never reported green with its own acceptance steps failing.
  if ((journey.required || journey.gate) && summary.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
