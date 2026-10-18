# How to capture the real files (M3 spike, Vikas's PC, Windows 11, PowerShell)

Run each command from an empty folder (`mkdir $env:TEMP\foo-cap; cd $env:TEMP\foo-cap`), with
`$env:NO_COLOR=1; $env:TERM='dumb'`, and with `CLAUDECODE` / `CLAUDE_CODE_ENTRYPOINT` removed
(`Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue`). The prompt always goes on stdin.
Save stdout with `> file` (PowerShell 7: `| Out-File -Encoding utf8NoBOM file`) and stderr with `2> file`.

`sys.md` below is a one-line file: `Answer in one short sentence.`

## claude (Claude Code CLI)

| File | Command |
|---|---|
| `claude/version.txt` | `claude --version` |
| `claude/help.txt` | `claude --help` |
| `claude/stream-partial.jsonl` | `"Say hello to Vikas inside <say></say>" \| claude -p --output-format stream-json --verbose --include-partial-messages --append-system-prompt-file sys.md --max-turns 1 --tools "" --strict-mcp-config --mcp-config '{"mcpServers":{}}' --setting-sources "" --settings '{"disableAllHooks":true}'` |
| `claude/stream-no-partial.jsonl` | same without `--include-partial-messages`, prompt `Reply with the word ready` |
| `claude/result-missing-usage.jsonl` | keep only if a real run ever omits a usage field; else delete the file and its test |
| `claude/usage-limit.jsonl` | the same command while the plan limit is used up (keep the run that shows "resets …") |
| `claude/overloaded.jsonl` | any run that returns a 529 / "Overloaded" (keep when it happens) |
| `claude/tool-use.jsonl` | `"Run dir and tell me the result" \| claude -p --output-format stream-json --verbose --max-turns 1` (tools left ON on purpose, to see the tool_use shape) |
| `claude/signed-out.stderr.txt` | run the stream command after `claude auth logout` (or with `%USERPROFILE%\.claude\.credentials.json` renamed); stderr + stdout |
| `claude/unknown-flag.stderr.txt` | `claude -p --no-such-flag` (stderr) |
| `claude/help-old-no-sysfile-no-tools.txt` | from an older CLI without `--append-system-prompt-file` / `--tools` if one is at hand; else keep the seed |
| `claude/help-no-tool-switch.txt` | seed only (no real CLI lacks both switches); keep |
| also | `claude auth status` exit code signed in / out; whether `claude auth login` exists (08-2 §6.6 `[verify]`) |

## codex (Codex CLI, signed in with ChatGPT)

| File | Command |
|---|---|
| `codex/version.txt` | `codex --version` |
| `codex/help.txt` | `codex --help` |
| `codex/exec-help.txt` | `codex exec --help` |
| `codex/exec-json.jsonl` | `"Say hello to Vikas inside <say></say>" \| codex exec --json --skip-git-repo-check -C . -c sandbox_mode="read-only" -` |
| `codex/command-execution.jsonl` | `"Run dir and tell me what is here" \| codex exec --json --skip-git-repo-check -C . -c sandbox_mode="read-only" -` |
| `codex/turn-failed-limit.jsonl` | the exec command while the plan limit is used up |
| `codex/unknown-model.jsonl` | the exec command with `-m gpt-5-mini -c model_reasoning_effort="low"` (keep whatever the ChatGPT plan answers; if it works, keep the success too as `exec-json-cheap.jsonl`) |
| `codex/signed-out.stderr.txt` | the exec command after `codex logout` (stderr) |
| also | `"hi" \| codex exec resume <thread_id> --json --skip-git-repo-check -c sandbox_mode="read-only" -` → `codex/resume.jsonl` (checks that resume accepts `-c`) |

## gemini (Gemini CLI, signed in with Google)

| File | Command |
|---|---|
| `gemini/version.txt` | `gemini --version` |
| `gemini/help.txt` | `gemini --help` |
| `gemini/stream-json.jsonl` | `"Answer in one short sentence.`n`nSay hello to Vikas inside <say></say>" \| gemini --output-format stream-json` |
| `gemini/tool-use.jsonl` | `"Run dir and tell me the result" \| gemini --output-format stream-json` |
| `gemini/text-mode.txt` | `"Say hello" \| gemini` (no `--output-format`) |
| `gemini/quota.stderr.txt` | any run that hits the free-tier quota (stderr) |
| `gemini/help-no-json.txt` | seed only; keep |

## ollama (if installed)

| File | Command |
|---|---|
| `ollama/tags.json` | `curl.exe -s http://127.0.0.1:11434/api/tags` |
| `ollama/chat-stream.ndjson` | `curl.exe -s http://127.0.0.1:11434/api/chat -d '{"model":"<model>","messages":[{"role":"system","content":"Answer in one short sentence."},{"role":"user","content":"Say hello to Vikas inside <say></say>"}],"stream":true,"options":{"num_ctx":16384,"temperature":0.4}}'` |
| `ollama/chat-length.ndjson` | same with `"options":{"num_ctx":16384,"num_predict":5}` |
| `ollama/error.ndjson` | same with `"model":"llama9"` |

## Key APIs (only with a test key Vikas agrees to spend a few paise on)

Body files are the requests of 08-4 §30.3; keep `-N` so the stream is saved as it arrives.

| File | Command |
|---|---|
| `openai/responses-stream.sse` | `curl.exe -sN https://api.openai.com/v1/responses -H "Authorization: Bearer $env:OPENAI_API_KEY" -H "content-type: application/json" -d '{"model":"gpt-5","instructions":"Answer in one short sentence.","input":[{"role":"user","content":"Say hello to Vikas inside <say></say>"}],"max_output_tokens":200,"store":false,"stream":true}'` |
| `openai/responses-incomplete.sse` | same with `"max_output_tokens":16` |
| `openai/401.json` | same with a wrong key |
| `openai/429.json`, `openai/responses-error.sse` | keep when they happen |
| `anthropic/messages-stream.sse` | `curl.exe -sN https://api.anthropic.com/v1/messages -H "x-api-key: $env:ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" -d '{"model":"claude-sonnet-4-5","system":"Answer in one short sentence.","messages":[{"role":"user","content":"Say hello to Vikas inside <say></say>"}],"max_tokens":200,"stream":true}'` |
| `anthropic/messages-max-tokens.sse` | same with `"max_tokens":3` |
| `anthropic/401.json` | same with a wrong key |
| `anthropic/overloaded.sse`, `anthropic/529.json` | keep when they happen |
| `google/stream.sse` | `curl.exe -sN "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse" -H "x-goog-api-key: $env:GEMINI_API_KEY" -H "content-type: application/json" -d '{"systemInstruction":{"parts":[{"text":"Answer in one short sentence."}]},"contents":[{"role":"user","parts":[{"text":"Say hello to Vikas inside <say></say>"}]}],"generationConfig":{"maxOutputTokens":200}}'` |
| `google/stream-max-tokens.sse` | same with `"maxOutputTokens":3` |
| `google/403.json` | same with a wrong key |
| `google/stream-safety.sse` | keep when it happens |

Also record, for implementation-notes: the exact retry-after header seen on a 429, the HTTP status of a
signed-out plan call, and whether gpt-5 accepts `temperature` on `/v1/responses`.
