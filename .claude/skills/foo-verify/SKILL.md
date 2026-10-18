---
name: foo-verify
description: Drive the real foo Electron app (FOO_TEST build, seeded world, fake AI) and keep before/after proof for a PR. Use before saying any ticket, fix or milestone is done, to reproduce a bug, or when a reviewer asks "show me it works".
---

# foo-verify

Adapted for foo-agent from pstack `create-verification-skill` and the `principle-prove-it-works` skill (MIT, Lauren Tan; see `.claude/skills/NOTICE.md`).

A green build is not proof. Proof is the real app, driven the way Vikas would use it, with pictures and checked facts pasted into the PR. **No builder reports a ticket, fix or milestone as done without a foo-verify proof block.**

The approved spec is the bar. foo-verify shows what the app does; whether that is right is decided against `spec/constitution/` and the frozen drawings (`spec/refs/`), never against the previous build.

## 1. Launch

```bash
pnpm install --frozen-lockfile --ignore-scripts   # once per checkout
node node_modules/electron/install.js            # once: fetches the Electron binary
pnpm build                                       # after every code change: the helper runs out/, not src/
xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/<name>.journey.ts
```

- The helper starts `electron .` with `FOO_TEST=1` and fresh temp data folders (`FOO_DATA_DIR`, `FOO_LOCAL_DIR`, `FOO_OUT_DIR`), so runs never share state and never touch a real profile.
- Ready means usable: the journey waits for `TID.titlebarStrip`, then seeds. Every app it launched is closed at the end and its temp folders deleted.
- `better-sqlite3` ships an N-API prebuild that loads in Electron. **Do not run `pnpm rebuild:electron` in the cloud container**: the proxy blocks the Electron headers download (403) and the prebuild already works.
- No AI or network is reached: replies come from the fake AI (`v.launch({ fakeAi: [...] })`, lines built with `intake()` / `envelope()` from `test/e2e/fakeAi.ts`).

## 2. Doctor (run first, and whenever anything looks off)

```bash
xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/doctor.journey.ts
```

PASS means: the window opens, `window.__fooTest` exists (a FOO_TEST build), the ux-world seed loads chat rows, light and dark both paint. If it fails, fix the build before driving anything else.

## 3. Drive

Write the journey as `test/verify/<ticket-or-bug>.journey.ts` and commit it with the change, so the proof can be re-run by anyone. Copy `test/verify/send-and-reply.journey.ts`. A journey default-exports `async (v: Verify) => void`:

| Call | What it does |
| --- | --- |
| `v.launch({ fakeAi?, args?, env? })` | starts the app, returns `{ app, page }` |
| `v.shot(name, selector?)` | saves `NN-<name>.<theme>.png` of the window or one element |
| `v.note(text)` | one checked fact, printed and kept in `run.json` |
| `v.fakeTurns()` | what the fake AI was asked (purpose, prompt, matched line) |

Use the shared helpers in `test/fidelity/capture.ts`: `openWorld` (fake clock 09:41 IST + ux-world seed + 1280×800), `openChat(page, name)`, `setTheme(page, 'light'|'dark')`, `settle`, `rest`, `frameAt`, `windowSize`. Find elements only by test id from `TID` (`src/shared/testids.ts`) and words only through `t(key)`; never by coordinates or hand-typed copy. Throw when a fact is wrong: a journey that cannot fail proves nothing.

Proof standards:
- Exercise the real user path (click, type, press keys). `window.__fooTest` is for setup only (seed, clock, theme, online), never to fake the result being proven.
- Capture the action and the result, and check side effects too (the fake AI's turns, the row in the list, the badge), not only the last screen.
- Light and dark for anything visual.
- If the seed lacks a precondition, the journey fails and the reason goes in the feature file's Gotchas. Never weaken the journey to pass.

## 4. Before and after

For a bug or a visible change, prove both sides on the same journey:

```bash
git fetch origin main
git worktree add --detach ../foo-base origin/main
(cd ../foo-base && pnpm install --frozen-lockfile --ignore-scripts && node node_modules/electron/install.js && pnpm build)
xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/<name>.journey.ts --label before --app-dir ../foo-base
xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/<name>.journey.ts            # --label after, this checkout
pnpm tsx scripts/foo-verify.ts --compare qa-evidence/verify/<name>              # pixel change per shot + compare.html
git worktree remove --force ../foo-base
```

A bug fix shows **before FAIL, after PASS** on the same journey (the `tdd` and bug-fix playbook order). Same app code gives 0.00 % change per shot (checked 2026-10-18), so any non-zero number is a real change to explain.

## 5. Evidence into the PR

```bash
bash scripts/push-verify-evidence.sh qa-evidence/verify/<name>
```

It pushes the folder to the `evidence` branch at `verify/<branch>/<sha7>/<name>/` (the repo is public, so the pictures render) and prints the proof block: verdict, commit, every `v.note`, console errors, and a before | after picture table. Paste it into the PR body under **Proof**. `qa-evidence/verify/` itself is not committed.

## 6. Fidelity is a separate, stricter check

foo-verify runs on Linux fonts in the container; it proves behaviour and gives Vikas pictures. Pixel fidelity against the frozen Blueprint and walkthrough stays with the golden lane on windows-latest (Tier R/B, `11-fidelity.md`), read with `git fetch origin evidence` (`<branch>/<sha7>/fidelity.html`). Never bless goldens, mask, or change thresholds to make a picture pass (FID-06).

## 7. Cleanup

The helper closes what it launched and deletes its temp data. It never kills Electron by name. Evidence stays in `qa-evidence/verify/<name>/{before,after}/` (PNGs + `run.json`) and on the `evidence` branch. Remove `../foo-base` worktrees you made.

## Feature map

`features/README.md` lists the user features with how to reach and drive each one. When a ticket adds a feature, add or update its file there in the same PR.
