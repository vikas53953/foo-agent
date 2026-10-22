# Run 39727432127: s0/s1 conservative evidence review

Scope: real-AI Claude run `39727432127`, workflow/app `9f429f8022c6c7b7ba989463ccbc2390b0fd5f6d`, shards s0 and s1 only. Evidence was downloaded from immutable commit `f1f1e8ab207c567290bcc903b115d771c25ae0ce`. The lane-A report was used as context, then the four owned journey folders were independently read and judged from their summary/thread/app-log/AI-turn/tool-call artifacts where present.

The run headline `420 steps / 119 failed` is a step count, not a feature count. A `blocked` result means the required state/precondition was absent; it is not a product failure. A `partial` result means some predicate is visible or exercised but the complete acceptance predicate is not proven. Rendering alone was not counted as interaction proof. Full candidate rows with exact screenshot and log URLs are in `R-s0-s1-candidates.tsv`.

## Candidate result counts

- Pass: AT-344, AT-366.
- Partial: AT-342, AT-109, AT-110, AT-345, AT-348, AT-363, AT-364, AT-367, AT-420, AT-424, AT-425, AT-426, AT-432, AT-435.
- Blocked: AT-106, AT-114, AT-120, AT-121, AT-126, AT-128, AT-349.
- Not exercised in these two shards: AT-368 and AT-369. Other ATs outside the four s0/s1 journeys were not inferred.

## Material findings

- AT-342, AT-345, AT-348, and AT-367 have visible widgets/chips and some matching DOM/log evidence, but their full predicates were not exercised: AT-342 lacks minus/arrow-key/bounds/shared-binding checks; AT-345 lacks Narrator/read-each-slot evidence; AT-348 lacks direct role=meter/proportional assertions; AT-367 lacks chip-click/composer/gate checks. These remain partial. AT-344 has date-ordered timeline items and money-formatted amounts with matching TID/text evidence.
- AT-363 visibly shows `foo read:` with Jaipur, 2 people, Sat 14 Nov and INR 4,000, with no secret. The runner expected `card-plan` but a choice card rendered, so the feature line is proven while the full expected selector predicate is not.
- AT-364 passes the side-answer behavior in clean/messy/Hinglish screenshots, while Hindi visibly re-plans and Punjabi remains at a choice state. This is cross-locale partial.
- AT-366 has ordinary answers without kit/AI-page output and the DOM predicate passes across variants. AT-367 only proves visible <=3 chips in this journey; no chip click/composer-fill or approval/payment gate was exercised.
- AT-420 does not prove the required one-answer/two-fold semantics: clean does not reach end state, messy emits extra plan/stuck state, and Hinglish lacks the fold acknowledgment.
- AT-424 clean leads with the wrong comparison and self-corrects; the other four locale screenshots lead correctly. This is partial.
- AT-425/426 visibly render the capabilities/safety card and footer, and AT-425 Try-it fill is logged, but the runner's `kit-capabilities` TID is absent. These are proof-qualified partials, not automatic product failures.
- AT-435 reaches a `Connect Gmail` card explicitly saying Gmail is unavailable in this build. This is a disconnected integration precondition; no draft/send claim is made and it is not scored as a product failure.
- AT-106/114/120/121/126/128/349 did not reach their required continuation/pending/list-pick states. No missing precondition was relabeled as a feature fail.

## PNG inspection inventory

Every PNG in the following six evidence folders was opened with `view_image`; s0/s1 inspected total: **138**.

Independent immutable-evidence file inventory across all four shards (unique relative PNG paths, counted from the evidence trees): s0 = 71, s1 = 67, s2 = 39, s3 = 26, all shards = **203**. Only s0/s1 are judged in this report; s2/s3 are counted here and were not used to infer AT results.

- `real-ai\9f429f8-claude\s0\2026-10-22T05-23-52-950Z-J01-J02-first-run`: 8 PNGs
  01-splash.png, 02-welcome.png, 03-finder-testing.png, 04-finder-tested.png, 05-after-claude-retest.png, 06-after-use.png, 07-step2.png, 08-first-chat.png
- `real-ai\9f429f8-claude\s0\2026-10-22T05-24-43-747Z-R-ai-pages`: 23 PNGs
  01-at-366-clean.png, 02-at-366-messy-typo.png, 03-at-366-Hinglish.png, 04-at-366-Hindi.png, 05-at-366-Punjabi.png, 06-at-367-clean.png, 07-at-367-messy-typo.png, 08-at-367-Hinglish.png, 09-at-424-clean.png, 10-at-424-messy-typo.png, 11-at-424-Hinglish.png, 12-at-424-Hindi.png, 13-at-424-Punjabi.png, 14-at-425-clean-capabilities.png, 15-at-425-messy-typo-capabilities.png, 16-at-425-Hinglish-capabilities.png, 17-at-425-Hindi-capabilities.png, 18-at-425-Punjabi-capabilities.png, 19-at-426-clean.png, 20-at-426-messy-typo.png, 21-at-426-Hinglish.png, 22-at-426-Hindi.png, 23-at-426-Punjabi.png
- `real-ai\9f429f8-claude\s0\2026-10-22T05-29-13-735Z-R-jobs`: 40 PNGs
  01-at-106-clean.png, 02-error-step2.png, 03-at-106-messy-typo.png, 04-error-step5.png, 05-at-106-Hinglish.png, 06-error-step8.png, 07-at-114-clean.png, 08-error-step11.png, 09-at-114-messy-typo.png, 10-error-step14.png, 11-at-114-Hinglish.png, 12-error-step17.png, 13-at-120-clean-plan.png, 14-at-120-clean-stopped.png, 15-error-step22.png, 16-at-120-messy-typo-plan.png, 17-at-120-messy-typo-stopped.png, 18-error-step28.png, 19-at-120-Hinglish-plan.png, 20-at-120-Hinglish-stopped.png, 21-error-step34.png, 22-at-364-clean-flight-job.png, 23-at-364-clean-arithmetic-while-working.png, 24-at-364-messy-typo-flight-job.png, 25-at-364-messy-typo-arithmetic-while-working.png, 26-at-364-Hinglish-flight-job.png, 27-at-364-Hinglish-arithmetic-while-working.png, 28-at-364-Hindi-flight-job.png, 29-at-364-Hindi-arithmetic-while-working.png, 30-at-364-Punjabi-flight-job.png, 31-at-364-Punjabi-arithmetic-while-working.png, 32-at-420-clean-initial-job.png, 33-at-420-clean-vistara-follow-up.png, 34-at-432-clean-morning-follow-up.png, 35-at-420-messy-typo-initial-job.png, 36-at-420-messy-typo-vistara-follow-up.png, 37-at-432-messy-typo-morning-follow-up.png, 38-at-420-Hinglish-initial-job.png, 39-at-420-Hinglish-vistara-follow-up.png, 40-at-432-Hinglish-morning-follow-up.png
- `real-ai\9f429f8-claude\s1\2026-10-22T05-23-55-758Z-J01-J02-first-run`: 8 PNGs
  01-splash.png, 02-welcome.png, 03-finder-testing.png, 04-finder-tested.png, 05-after-claude-retest.png, 06-after-use.png, 07-step2.png, 08-first-chat.png
- `real-ai\9f429f8-claude\s1\2026-10-22T05-24-46-578Z-R-approvals`: 41 PNGs
  01-at-109-clean-choice.png, 02-at-109-messy-typo-choice.png, 03-at-109-Hinglish-choice.png, 04-at-110-clean-approval.png, 05-error-step14.png, 06-at-110-clean-refusal.png, 07-at-110-messy-typo-approval.png, 08-at-110-messy-typo-refusal.png, 09-at-110-Hinglish-approval.png, 10-at-110-Hinglish-refusal.png, 11-at-121-clean.png, 12-error-step37.png, 13-at-121-messy-typo.png, 14-error-step42.png, 15-at-121-Hinglish.png, 16-error-step47.png, 17-at-126-clean-approval.png, 18-error-step52.png, 19-error-step53.png, 20-at-126-messy-typo-approval.png, 21-error-step58.png, 22-error-step59.png, 23-at-126-Hinglish-approval.png, 24-error-step64.png, 25-error-step65.png, 26-at-128-clean-approval.png, 27-error-step68.png, 28-at-128-clean-stopped-approval.png, 29-error-step72.png, 30-at-128-messy-typo-approval.png, 31-at-128-messy-typo-stopped-approval.png, 32-error-step79.png, 33-at-128-Hinglish-approval.png, 34-at-128-Hinglish-stopped-approval.png, 35-error-step86.png, 36-at-363-clean.png, 37-at-363-messy-typo.png, 38-at-363-Hinglish.png, 39-at-435-clean.png, 40-at-435-messy-typo.png, 41-at-435-Hinglish.png
- `real-ai\9f429f8-claude\s1\2026-10-22T05-40-59-307Z-R-kit-1`: 18 PNGs
  01-at-342-clean.png, 02-at-342-messy-typo.png, 03-at-342-Hinglish.png, 04-at-344-clean.png, 05-at-344-messy-typo.png, 06-at-344-Hinglish.png, 07-at-345-clean.png, 08-at-345-messy-typo.png, 09-at-345-Hinglish.png, 10-at-348-clean.png, 11-at-348-messy-typo.png, 12-at-348-Hinglish.png, 13-at-349-clean.png, 14-error-step38.png, 15-at-349-messy-typo.png, 16-error-step42.png, 17-at-349-Hinglish.png, 18-error-step46.png

## Provenance and safety

Only this run's pinned s0/s1 evidence was downloaded. No additional paid AI run was made. No approval, send, booking, payment, or other external action was taken. No repository/source files were changed.
