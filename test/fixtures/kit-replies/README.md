# Kit reply cassettes (CR-0046, CR-0050)

Each `.txt` file is the text of one foo reply as the AI writes it inside `<say>`, with its ```a2ui block. The test
`test/unit/kit-real-replies.test.ts` parses each one the way the bubble does.

- `real-*.txt`: copied from a real-AI run's raw dump (`<journey>/<name>-raw.json` on the `evidence` branch), the AI's text as
  written. `real-run30-b09-*`: run 30 on main 04f01dd, Claude CLI,
  `real-ai/04f01dd-claude/s3/2026-10-22T00-30-31-763Z-B09-kit/thread-raw.json` (CR-0050: the EMI, map and chart ones have
  wrong or missing closing brackets).
- `rebuilt-*.txt`: rebuilt from a real run's drawn words and screenshot (the words outside the block are the real ones);
  the block holds the slips CR-0046 mends. Swap each for a `real-*` file once a run records the raw reply.
