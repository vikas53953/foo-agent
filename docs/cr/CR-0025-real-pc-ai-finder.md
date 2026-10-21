# CR-0025: Find your AI on a real PC: helper apps get time to start, an out-of-date helper says so, keys and tests leave a trace

- **Asked by:** Vikas, 2026-10-21 06:02Z (thread "AI setup and onboarding bugs"): on his Windows 11 laptop the combined
  P1 + R1 build (main 501aa1a) marked Claude and ChatGPT "signed in" but "slow to answer" and picked neither; a saved
  Anthropic key read "didn't work"; removing it left the row in place.
- **Why:** every earlier test used the fake AI (CI) and the in-memory keyring. A read-only check on his PC (2026-10-21
  06:14–06:40Z, foo's own exe as Node, foo's exact argv; scripts in the project's `foo/ai-debug/`) found:
  1. **Codex 0.144.4 is refused by its service:** `400 … The 'gpt-6-astra' model requires a newer version of Codex. Please
upgrade to the latest app or CLI`, after 23–32 s. foo classed it `UNKNOWN`, shown as "slow to answer".
  2. **Claude Code works but starts slowly:** its own `duration_ms` was about 2 s, but spawn to exit took 5.7–9.9 s alone
     and 17.9 s while Codex started at the same time; `claude --version` hit the 8 s probe limit (8.6 s). The 20 s verify of
     08-4 §30.1 counts start-up, so a working CLI timed out on a first run.
  3. **The saved key failed in 0.04 s, before any network call** (the API answers in 0.4 s from that PC), so `getKey` came
     back empty although `foo/ai_key/anthropic-key` is in Credential Manager. No log line said why: the engine's `log`
     messages were never written (EngineBridge had no `log` wired) and verify logged nothing.
  4. No `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` in the environment and no proxy; both APIs answer 401 without a key.
- **Spec sections:** 06-1 §2.2 (row states, choice block), 08-2 §6.5 (probe 8 s), §6.6, §6.7 (classification), 08-4 §30.1
  (verify 20 s), 08-3 §19.1 (tech log), 08-2 §11.3 (`vault.use`).
- **Status:** Approved by Vikas, DECISIONS X-183: his approve-on-my-behalf rule (his message 2026-10-18 14:56Z), after
  the independent review in §(d)
- **Change:** code and tests, plus the DECISIONS row X-183.

## (a) Picks

1. **Helper apps get 60 s for their verify** (`CLI_VERIFY_TIMEOUT_MS`, claude-cli, codex-cli, gemini-cli). Keys and the
   local AI keep 20 s. The finder row of a helper stays "Testing…" up to 60 s before it reads "slow to answer"
   (`CLI_VERIFY_LIMIT_MS`); `ai:verify` waits up to 150 s for the engine (three 20 s probes + 60 s).
2. **Probe limit 8 s → 20 s** (08-2 §6.5): a killed `--help` leaves no capabilities and the CLI reads as incompatible.
3. **Helper apps are tested one after another** in ladder order (Claude, ChatGPT, Gemini); keys and the local AI at once.
   Two cold starts at once doubled each one's time on the real PC.
4. **"I couldn't find an AI" waits while a helper is still being tested** (after the 25 s settle time the block stays
   pending); a working AI is offered as soon as it passes, as before.
5. **An out-of-date helper says so.** Text matching `requires a newer version` or `please upgrade|update to the latest`
   classes as `AI_CLI_INCOMPATIBLE` (not "Upgrade to Pro", a plan limit). The finder shows the new row state
   `needs_update`: "needs an update. Update it, then test again." (`setup.ai_finder.status.needs_update`, `--warn`) with
   [ Test again ]. Real capture: `test/fixtures/cli-captures/codex/upgrade-required.jsonl` (+ `.stderr.txt`).
6. **One tech-log line per test and per unreadable key.** `ai.verify` with `{providerId}:{ok|kind}` and `ms`;
   `ai.key_read_failed` with `{providerId}:{vault error}` (also `NO_REPLY` and `EMPTY`; `VAULT_MISSING:value_unreadable`
   when the index row exists but the value cannot be read back; a plain "no key saved" is not logged). Never a value. The
   engine's `log` messages now reach the tech log (08-3 §19.1), which they were meant to.
7. **A removed AI key drops its row.** When an `ai_key` Secret box is removed, the finder asks detection again and drops a
   key row whose key is gone.
8. **Credential Manager round trip on Windows CI.** `test/integration/vault/windows-keyring.test.ts` saves and reads a
   fake `ai_key` through `SecretVault` with the real `@napi-rs/keyring` (Windows CI runners only; it refuses to run over a
   real saved key).
9. **A test never holds up the next one past its slow mark.** The serial chain moves on at 60 s (20 s for keys) even if a
   helper hangs; its late answer still updates its row. Worst case before the block decides: about 60 s per helper.

10. **Credential Manager through `new Entry('foo', target)`** (08-2 §11.2 left the call `[verify exact API in M1]`). Pick 8's
    test found the likely cause of finding 3 on the first Windows CI run (to be confirmed on his PC): with `@napi-rs/keyring` 2.1.1,
    `Entry.withTarget(target, 'foo', name)` saves, then `getPassword` and `getSecret` give back `''` and `[]`; a missing
    entry also reads `''`. `new Entry('foo', target)` reads the value back. An empty read counts as no value. Delete also
    removes an entry left by the old call. Keys and tokens saved by earlier builds never read back, so they are saved again once.

## (b) Not changed

The Welcome card and setup steps 2–4 (06-1 §2.1, §2.3–§2.5) stay with the P2 "Feel" ticket T4 (CR-0023, waiting for
Vikas's go). No migration, no new channel, no settings key.

## (c) Open items for the spec-keeper

06-1 §2.2 row-state list and `data-state` values gain `needs_update`; 08-4 §30.1 verify row gains the CLI 60 s; 08-2 §6.5
probe 20 s; 08-2 §11.2 call `new Entry('foo', target)`; 08-2 §6.7 table gains the out-of-date line → `AI_CLI_INCOMPATIBLE`; 08-3 §19.1 names `ai.verify` and
`ai.key_read_failed`.

## (d) Independent review

Independent reviewer (fresh agent, read-only, 2026-10-21): **PASS WITH FIXES**. Act items applied: the Windows keyring
test runs only on CI and refuses to run when a real `anthropic-key` entry exists; pick 6 says the key failure is
diagnostic only, not fixed. Considers applied: the finder drops removed key rows only when detection returned rows; the
serial helper chain moves on at each row's slow mark (pick 9); fake key strings no longer look like real keys; pick 6
names the `NO_REPLY` and `EMPTY` reasons.

Pick 10 (added after Windows CI) re-checked by a second fresh reviewer, 2026-10-21: **PASS WITH FIXES**. Applied: the
keyring header rewrapped; a Windows test that delete removes a `withTarget` entry; "likely cause" until his PC confirms.
