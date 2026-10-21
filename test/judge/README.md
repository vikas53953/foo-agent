# AI judge (promptfoo)

About 30 real asks, sent to the real foo app on a real AI and judged by another AI. It catches what a plain text
check misses: an ask routed to the wrong kind of reply, vague plan steps ("Work on it"), a robotic tone, or foo
claiming it sent, booked, paid or read something through an app that is not connected.

- `promptfooconfig.yaml`: the asks, in five groups (`route-`, `plan-`, `tone-`, `honest-`, `safety-`). Every ask
  also gets the shared checks in `defaultTest` (no "didn't get that", a reply arrived, a natural chat tone).
- `foo-provider.cjs`: copies a signed-in test profile, starts foo, sends the ask, waits until nothing new arrived
  for 8 s (cap 150 s), returns every bubble and card foo added (cards as `[card-…] text`), saves a screenshot.
- `summary.cjs`: turns `results.json` into the Markdown table shown on the run page.

## Run it

GitHub: Actions → **AI judge** → Run workflow (owner only). It uses the `ANTHROPIC_API_KEY` secret for foo's own
AI (the Claude Code CLI) and for the judge, both Sonnet-class by default. Inputs: `filter` (regex on the ask
names, for example `honest-`), `max_asks` (cost cap). Results, the HTML report and one screenshot per ask go to the
`evidence` branch under `judge/<short-sha>/` and `judge/latest/`.

Cost: a full run is about 32 foo turns plus about 64 judge calls on Sonnet, roughly ₹150–300. Run it when the
chat, routing or prompts change, not on every push.

Locally (Linux, dev build, after `pnpm build`): make a signed-in profile with the real-PC kit's
`J01-J02-first-run` journey, then

```bash
FOO_EXE=$(readlink -f node_modules/electron)/dist/electron FOO_ARGS="$PWD --no-sandbox" \
FOO_JUDGE_PROFILE=<profile folder> NODE_PATH=$PWD/node_modules \
xvfb-run -a npx promptfoo@0.123.1 eval -c test/judge/promptfooconfig.yaml --grader anthropic:messages:claude-sonnet-5-5
```

Never point it at a Claude login that is not the key meant for foo testing.
