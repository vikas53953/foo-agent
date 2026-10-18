# CR-0007: M3 trace rows, and the picks the M3 build made where the spec forks

- **Asked by:** the M3 builder, 2026-10-18, while building M3 (foo-plan §5 M3).
- **Spec sections:** 08-1 §2.1–§2.4, 08-2 §6, §7, §11.4, 08-4 §25, §30, 04 §3.3, §4, §12.3, §14.4, 10-acceptance-1 §B (AT-005,
  AT-006, AT-027, AT-030, AT-031), 10-acceptance-2 §D (ART-02b, ART-12a, ART-23a), 11-fidelity §11.4 (FID-18).
- **Status:** Approved by Vikas, DECISIONS X-160 (2026-10-18 15:58Z, after the independent review in §(e))
- **Change:** `spec/trace.csv` only (rows below). No other `spec/` or `golden/` file changes.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows (`spec/trace.csv`)

| Id                              | Test file                             | Milestone | Status  |
| ------------------------------- | ------------------------------------- | --------- | ------- |
| AT-005, AT-006 (J2)             | `test/unit/m3-engine.test.ts`         | M3        | live    |
| AT-027, AT-031 (J7)             | `test/unit/m3-engine.test.ts`         | M3        | live    |
| ART-12a, ART-23a                | `test/unit/m3-engine.test.ts`         | M3        | live    |
| AT-030 (J7)                     | `test/unit/m3-chunks.test.ts`         | M3        | live    |
| AT-031 (J7)                     | `test/unit/m3-prompt-filters.test.ts` | M3        | live    |
| ART-02b                         | `test/articles/ART-02b.test.ts`       | M3        | live    |
| AT-006, AT-027, AT-030, ART-23a | `test/e2e/m3-replies.spec.ts`         | M3        | pending |

"live" rows run in `pnpm test`; "pending" rows run on the Windows lanes (Electron E2E).

## (b) Picks where the spec forks or is silent (each is in implementation-notes "M3")

1. **Job Object deferred.** `foo-native/jobobject.cc` is not built in M3; a turn's process tree is killed with
   `taskkill /T /F` on Windows (a process group on POSIX). The native Job Object comes with the other native parts in M11.
2. **Engine crash count and safe mode** (08-1 §2.2) are M11. M3 restarts the engine up to 3 times.
3. **No vault before M5.** Key providers (OpenAI, Anthropic, Google keys) have no key yet, so their check fails as "key not
   valid" until M5.
4. **Reactions are writable by the engine.** 08-1's list of tables the engine may write has no `reactions`; the 👍 reply
   (AT-027) needs it.
5. **Extra channels** not in 08-1 §3.2 / §2.4: `ai:detect`, `ai:choose`, event `ai:detectRow`, `message:stopReply`; engine
   kinds `reply.retry`, `reply.stop`; reads `messageById`, `messagesQueued`.
6. **Acts built later.** Until M4–M8 build them, an AI answer that asks for a job, brief or setup gets "I didn’t get that.
   Say it another way?" instead.
7. **Tests never reach a real AI.** A test run starts the engine only with the fake AI, and then every turn goes to it.
8. **Read tick.** ✓✓ Read shows only while 👀 is on (M2 derives read from the badge); kept so the M2 goldens hold (CR-0003 P5).
9. **Chunking by content.** Every finished foo reply up to 600 characters splits at blank lines (history too); the pacing
   delays apply only to replies arriving while the chat is open.
10. **Stop.** A stopped reply keeps its text with "Stopped." under it (stored as the message's `stopped` badge, no new
    column). Esc in the message list is not wired yet; Esc in the typing box is.
11. **👀 while foo thinks.** 04 §3.3 ties Read to the first byte, but 04 §4.2 wants 👀 within 1 s of send and UX-08-02 draws
    it beside the Thinking row; 👀 now shows when foo accepts the message.
12. **Rich answers are one bubble.** A heading, table or sources answer under 600 characters is not split (04 §12.3
    "anything else"; UX-08-07 shows one bubble).
13. **Fake AI `chunks`** (08-3 §22.3 extension): a script line may stream `chunks: [{ text, delayMs }]`, so tests can show a
    reply that is still coming in (Stop, BP-COMP-03).
14. **Composer copy for AT-006** stays 04-2's "Connect your AI first"; 06-1's longer line belongs to the M12 setup screen.

## (c) Adapter and prompt picks (builders A and B)

- A `.cmd` shim that names no script fails as "AI app not compatible"; foo never falls back to running it through a shell.
- Codex resume keeps the read-only sandbox switch (the spec's resume line leaves it out).
- Codex `file_change` / `mcp_tool_call`, Claude `tool_use` and Ollama `tool_calls` all count as tool use and stop the turn.
- The Claude no-tools fallback uses a seed list of built-in tools; it is pinned by the PC capture.
- `retry-after` is read in seconds only; "resets 5pm" resolves in the user's time zone (past today → tomorrow).
- Pricing seeds (gpt-5, claude-sonnet-4-5, gemini-2.5-pro) are placeholders until re-pinned.
- Every CLI fixture is a seed written from the spec until the PC capture replaces it.
- The Redactor's pattern scrub adds §11.4's Bearer, URL-parameter, URL-login and OTP-near-its-word rows on top of the paste
  catcher's patterns (in the engine, not in the shared paste catcher, so M2's catcher is unchanged).
- Banned-word filter: Hindi inflections beyond the listed forms are not caught yet (ART-02b passes on its 300 fixtures).
- Ollama: cloud models (`remote_host`) and embedding models are not offered as your AI (they need a paid plan or cannot
  chat); a cloud model's "not included in your free usage" counts as the plan limit.
- Codex on Windows: a shell attempt that the read-only sandbox blocked shows only on stderr (`exec_command failed`); foo
  treats it as tool use too.
- A tool-use answer runs the turn once more; two in a row, or a CLI that cannot turn its tools off, mark that AI unusable
  until it is tested again.

## (d) Test seed for the live UX-08 run

- A test-only seed set `ux-world-ch8-live` (08-3 §22.9 lists `demo`, `perf`): the walkthrough world at 8:05 AM with foo's
  chat ending at the cake line, so the live run sends "thanks!" and the holiday question at the walkthrough's own times and
  UX-08-02 is captured on the walkthrough's frame (no Tier R dispute needed).

## (e) Independent review (Fable, 2026-10-18) and what it asks the spec keeper

- Pick 1: add `foo-native/jobobject.cc` to M11's Create list (plan §5); until then an engine crash can orphan a CLI child
  that `taskkill /T` would not reach.
- Picks 4 and 5: 08-1 §2.4.1 says a new query or writable table is a constitution change: amend 08-1 §2.4.1 (`reactions`
  writable; `messageById`, `messagesQueued`) and §2.4 / §3.2 (the new channels and engine kinds).
- Pick 9: a reply that streamed as one bubble shows as 2–3 bubbles when the chat is reopened (04 §12.3 says stream mode
  never splits). Follow-up: split only replies that finished inside the 1.5 s hold.
- Pick 11: 04 §3.3 (Read on first byte) and 04 §4.2 (👀 within 1 s) disagree; the spec keeper picks one.
- Pick 14: revisit the AT-006 composer line with the M12 setup screen.
