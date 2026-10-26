# CR-0061: the batch-1 QA re-test fixes (F24, F25, F07)

- **Asked by:** the QA re-test of PR #155 (26 Oct, 16:13Z), with QA's own unedited tests (`test/qa-explore/findings.spec.ts`
  on PR #156), relayed by the coordinator under Vikas's 06:00Z "fix all the bugs … one baseline of the full app".
- **Why:** three findings were still broken on the #155 head:
  - **F24**: a table answer shows raw `| Plan | Price |` and `|---|` markdown in the chat-list preview.
  - **F25**: the chat header's private-chat button ("Start a private chat") does nothing.
  - **F07**: Settings → About shows only "Version 0.0.1"; 06-2 §6.11 draws six rows.
- **Spec sections:** 03-shell-1 §3.4.6 (preview: "Markdown is stripped"); 03-shell-1 chat header private toggle, CR-0054
  (feature switches; `private` is batch 7); 06-2 §6.11 (About), §6.6 `leaves` row, 06-1 §2.1 (Privacy details dialog),
  06-3 §16 (What's new) and §18.2 (Send a report), 08-3 §19.1 and §19.5 (tech log, `app:reportSave`), 09 §9.20 (updates),
  X-44 (tester builds); DECISIONS X-218; 10-acceptance-2 AT-451.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (independent reviews, every check green; no spec clash, Fable
  2026-10-26), DECISIONS X-218.

## (a) Picks

1. **F24, a table in the preview.** A table is markdown, so the preview strips it like the rest. The `|---|` line goes, and
   each row reads as its cells joined by " · " ("Plan · Price · Data Airtel · ₹649 · 75 GB"). A lone `|` in a sentence
   stays as it is.
2. **F25, the private toggle.** Private chats are the `private` feature (batch 7, CR-0054). Starting one was never built
   (no channel in 08-1 §3.2). While `private` is off the header shows no toggle, as every off feature leaves no trace. An
   already-private chat keeps its toggle so it can always be ended (C-23). Building the start itself waits for batch 7.
3. **F07, the batch-1 About page.** The version line, plus each row whose pieces work in batch 1:
   - **What's new with me** (06-3 §16 dialog): notes ship inside the app (`resources/whats-new.json`, by version). A
     version with no notes shows "Small fixes to keep things running smoothly."
   - **Send a report** (06-3 §18.2 dialog): the preview is the redacted tech log of the last 7 days (08-3 §19.1, already
     redacted when written; 7 days is a pick). The optional note goes through the redaction rules. Save report runs the
     R9 final secret scan (08-3 §19.5) and writes a .zip to `{OUT}\reports\` (`Documents\foo\reports\`), then shows
     it in File Explorer. The header time and the file name use `locale.timeZone`. A key found by the scan shows "I
     found a key in the export, so I stopped. Nothing was saved." and Save stays off; a preview that fails can be asked
     for again. Two channels are added to 08-1 §3.2: `app:reportPreview` and `app:reportSave`. Nothing is
     uploaded (X-12).
   - **What leaves this PC** (06-1 §2.1 `dialog-privacy`): the §6.6 `leaves` list for the services that exist in this
     build: the AI line, then the voice, search, reading and browsing lines only once their feature is on (each with
     " (when you turn it on)" while setup is not complete), "Nothing else leaves this PC." and the never-secrets line.
   - **Open-source parts** (`dialog-licences`): "{name} · {licence}" for every production package in the lockfile plus a
     hand-kept list (Electron, Chromium, Node.js, SQLite, Fluent Emoji 3D), written by `pnpm licences:write` into
     `resources/licences.json`; a unit test fails when a production dependency is missing from it.
   - **Hidden until their part exists:** **Updates** (09 §9.20 needs `electron-updater` and a release feed; setting that
     up is a release change for Vikas) and **Repair foo** (it repairs foo's browser and files; the browser is `web`,
     batch 3).
   - **Version line:** "Version {v} · tester build" while builds are unsigned (X-44, `UNSIGNED_BUILD` in
     `src/main/about/report.ts`, flipped by the release that signs the installer).
4. **X-217 item 4 is replaced** by X-218 item 3. Both deferrals (Updates, Repair) and the private-start channel are logged in
   GAPS.

## (b) Trace rows

`AT-451` → `test/e2e/qa-b1-about.spec.ts`, the sweep `QA-B1-084`: no raw table markdown in the preview, no private toggle,
"Privacy details" opens `dialog-privacy` with batch-1 lines only, About has the version and its four rows (no Updates or
Repair row) and each opens its dialog with content, Save report writes one zip, and 👍 survives a restart (AT-452's e2e
half). With the three fixes reverted the sweep reports the toggle and the raw table (run on the follow-up branch, 26 Oct).

Neighbours re-tested: Copy and the action row (c1-bubbles), the chat-list search and preview rules (unit), the setup
welcome (p1-first-run, cr-0026), Clear and Delete (qa-b1-pages), the QA-B1-080 and QA-B1-083 sweeps.

## (c) Review

Tier **high**: two independent reviewers (Fable and Opus), same diff (`git diff de28289`), read-only. Round 1, fixes in the
same commit:

| #   | Finding                                                                                                  | Outcome                                                                              |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Tables without outer pipes (`A \| B` / `--- \| ---`) and one-column tables kept raw `\|` or `---` (both) | Fixed: `plainLine` reads the rows around a separator as cells; three more unit cases |
| 2   | Every save failure said "Try again", though a found key can never save (both)                            | Fixed: the 08-3 §19.5 key line, Save off                                             |
| 3   | A failed preview left Save off with nowhere to go (Opus)                                                 | Fixed: Save asks for the preview again, with its own line                            |
| 4   | Header time and zip name were UTC (both)                                                                 | Fixed: `locale.timeZone`, as the memory export; tested in India time                 |
| 5   | R9 was pattern-only; 08-2 §11.4 says registry or pattern (Fable)                                         | Fixed: the registry Redactor also runs; any hit refuses                              |
| 6   | No test opened `note.txt` or proved a key in the note is redacted (both)                                 | Fixed: the unit test reads every zip entry                                           |
| 7   | The " (when you turn it on)" sentence did not match the code (both)                                      | Fixed: CR text and X-218 (5) now say what the code does                              |
| 8   | Hand-kept licence parts not all asserted (Opus)                                                          | Fixed: Node.js and Fluent Emoji 3D added to the test                                 |
| 9   | Two saves in one minute share a name; header shows the Windows build number; no spinner (nits)           | Not changed: the spec names the file by minute; noted                                |
