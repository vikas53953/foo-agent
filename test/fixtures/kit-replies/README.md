# Kit reply cassettes (CR-0046)

Each `.txt` file is the text of one foo reply as the AI writes it inside `<say>`, with its ```a2ui block. The test
`test/unit/kit-real-replies.test.ts` parses each one the way the bubble does.

- `real-*.txt`: copied from a real-AI run's raw dump (`<journey>/<name>-raw.json` on the `evidence` branch). None yet: runs
  before CR-0046 saved only the drawn words, not the raw block.
- `rebuilt-*.txt`: rebuilt from a real run's drawn words and screenshot (the words outside the block are the real ones);
  the block holds the slips CR-0046 mends. Swap each for a `real-*` file once a run records the raw reply.
