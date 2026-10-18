# CLI and API stream captures

## Real captures (Vikas's PC, Windows 11, 2026-10-18; claude 2.1.282, codex 0.156.1)

These files are **real** output from the M3 spike (08-2 §6.5, 08-4 §30.3: "the fixtures captured then are binding"):

- `claude/`: `version.txt`, `help.txt` (first 20 KB of `claude --help` only), `stream-partial.jsonl`,
  `stream-no-partial.jsonl`, `tool-use.jsonl` (6 huge `system` lines cut, marked `...[line cut: was N chars]`),
  `unknown-flag.stderr.txt`, `auth-status.txt`, `auth-login-help.txt`.
- `codex/`: `version.txt`, `help.txt`, `exec-help.txt`, `exec-json.jsonl`, `unknown-model.jsonl`, `resume.jsonl`,
  `command-execution-sandbox-failed.jsonl` + `.stderr.txt` (the real "run dir" turn: under the read-only sandbox on
  Windows codex's shell failed to start, so the stream has **no** `command_execution` item; only stderr shows the attempt).
- `ollama/`: `tags.json`, `chat-stream.ndjson`, `chat-length.ndjson`, `error.ndjson`, `not-chat-model.ndjson`,
  `paid-model-error.ndjson`.
- `shims/claude.cmd`: the real npm shim body (stored LF; tests rebuild CRLF). `shims/codex.cmd`: the last line is real;
  the lines above it are npm cmd-shim's standard template.

## Seeds (spec-derived, not captured)

Everything else was written by hand from 08-2 §6.4 / 08-4 §30.3 and is to be replaced when a real capture exists:

- `claude/`: `usage-limit.jsonl`, `overloaded.jsonl`, `result-missing-usage.jsonl`, `signed-out.stderr.txt`,
  `garbage.txt`, `help-old-no-sysfile-no-tools.txt`, `help-no-tool-switch.txt` (the last two are derived from an older
  help text on purpose and stay seeds).
- `codex/`: `command-execution.jsonl` (kept for the `command_execution` violation test; no real run produced that item),
  `turn-failed-limit.jsonl`, `signed-out.stderr.txt`.
- `gemini/`: every file (Gemini CLI is not installed on Vikas's PC).
- `openai/`, `anthropic/`, `google/`: every file (no key captures yet).

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
