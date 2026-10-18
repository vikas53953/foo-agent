# CLI and API stream captures (seeds)

Every file here is a **spec-derived seed**, written by hand from the formats named in
08-2 §6.4 and 08-4 §30.3 (and the public docs those rows cite). None of them was captured
from a real CLI or a real vendor API.

They are to be **replaced by real captures from the M3 spike on Vikas's PC** (08-2 §6.5:
"Every adapter ships fixture tests from real captured output"; 08-4 §30.3: "the fixtures
captured then are binding"). `capture.md` lists the exact commands to run for each file.
When a real capture differs from a seed, the capture wins: update the parser in
`src/engine/ai/parsers.ts` (or the regexes in `src/engine/ai/classify.ts`) until
`test/unit/m3-adapters*.test.ts` pass on the real file, and log the change in
implementation-notes.

Rules for captures:

- Redact before committing: account e-mails, API keys, session ids that could identify the
  account (replace with the same-shaped fake), and any user content.
- Keep the file names; the tests read them by name.
- `*.jsonl` / `*.ndjson`: stdout exactly as the CLI printed it (CRLF kept if present).
- `*.sse`: the raw HTTP response body.
- `*.stderr.txt`: stderr of a failing run. `help*.txt` / `version.txt`: `--help` / `--version` stdout.
