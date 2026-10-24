# CR-0058: a setting ask is a setting, never a memory

- **Asked by:** Vikas's standing burn-down rule ("fix the top product bugs one PR at a time, red test first; approve on my
  behalf after an independent review and all checks green"). The real-AI runs on main 47fea16 and 8abcdbd found it.
- **Why:** journey R-dark-hi sends "Remember that I am vegetarian on Tuesdays", "Remember my favourite cricket team is
  Punjab Kings" (then Undo), then "Switch to dark mode". In both runs, intake decided `memory` for the last message
  (`chat.intake_kind memory` in the app log), so foo posted "Not saving this one." and the theme never changed. On fbb4901
  the same journey was clean, so the prompt leaves room for the AI to follow the earlier messages.
- **Spec sections:** 08-4 §24.5 (`intake.md`, the "memory" and "setting" lines); DECISIONS X-215; 10-acceptance-2 AT-448.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (independent review and every check green), DECISIONS X-215.
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit; `resources/prompts/MANIFEST.json` updated.

## (a) Trace rows

`AT-448` → `test/unit/prompt/intake-setting-not-memory.test.ts`, status `live`. The real-AI journey R-dark-hi is the
behaviour proof on main.

## (b) Spec before → after

| #   | What the run saw                                   | Spec before                                   | Spec after                                                                                                       |
| --- | -------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | "Switch to dark mode" after memory talk → `memory` | "memory": "remember …" or "forget …"          | "memory": only when the message itself asks to remember or forget, in any words ("note that …", "yaad rakhna …") |
| 2   | The theme stayed light; "Not saving this one."     | "setting" line names paths, silent on context | adds: asking to change one, like "switch to dark mode", is always "setting", even right after memory messages    |

## (c) Picks where the spec is silent

1. **Prompt only, no engine guess.** A word list in the engine ("dark", "theme") would second-guess the AI on every
   message; the prompt is where intake kinds are defined (08-4 §24.5), so the fix stays there.

## (d) Review

Result (2026-10-24): two independent reviews (AI behaviour change). Reviewer A (prompt risk): PASS with one act item:
"only when … \"remember …\" or \"forget …\"" read like a keyword match, so "note that …", "keep in mind …", "don't forget …"
or "yaad rakhna …" could stop being memory. Applied: the line says "in any words" with two examples, "note that …" and
"yaad rakhna …" (kept short: the prompt budget tests in m3-prompt-builder leave little room); the test checks them. No conflict with job, ask or reply; the 900 → 880 fixture keeps its assertions. Reviewer B (process):
PASS; trace, manifests and spec mirror match, and the test fails on the old prompt. Approved on Vikas's behalf.
