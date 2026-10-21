# Lane D visual, motion and accessibility review

Date: 2026-10-22
Lane: `codex/lane-d-2026-10-22`
Source build under review: `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` (rebased origin/main)
Real-AI evidence build: `7e1ada4a7e93d72a23bc6c4d16920b7c376d23fb`
Immutable evidence commit: `8edc3c6dea861c8742bad4f614f6b5a349811bfa`
Historical evidence tree pin: `d2280c5aaf94910edecdac6c3a332ea575af912d`
Cost: `$0`; no AI key or user login was used by this lane.

The reviewed historical real-AI run is [39651682359](https://github.com/vikas53953/foo-agent/actions/runs/39651682359), against historical `cc8d73015121e1d70ab5c52f75d562097c2b76a6`. The separate historical regression/golden run is [39651682314](https://github.com/vikas53953/foo-agent/actions/runs/39651682314); its three failing tests and twelve unfinished audit items are not attributed to the real-AI run. Root later advanced `origin/main` to `0665cf67d2ab6cf0515f6d3198df6dfc35357e82`; these lane checks were rerun against that current source build where the bounded gates below completed.

This lane adds browser-observable witnesses in [lane-d-motion.spec.ts](../../../test/e2e/lane-d-motion.spec.ts) and [lane-d-a11y.spec.ts](../../../test/e2e/lane-d-a11y.spec.ts). The checks read computed styles, animation objects, rendered state, focus targets and accessible names. They do not bless or edit golden images, and they do not claim native Narrator behavior from a Chromium emulation.

## Tool choice

| Option                                        | Evidence and cost                                                                                                                                                                                                      | Decision     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Playwright Electron already in the repository | `@playwright/test` 1.64.1 launches the built Electron app, exposes `ElectronApplication`, computed CSS, animation and keyboard APIs, and uses the existing isolated `FOO_TEST` folders. No dependency or paid service. | **Selected** |
| Spectron                                      | Deprecated and absent from `package.json`; adding it would create a new Electron harness with no maintained advantage.                                                                                                 | Rejected     |
| WebdriverIO Electron service                  | Would add dependencies and a second profile/driver lifecycle; it does not improve the existing Electron, focus, forced-colour or zoom assertions.                                                                      | Rejected     |

## Runtime checks

Each row has six fields required by the lane report: feature/check, test type, result, build, direct evidence, and note. A source link identifies the executable witness; an unrun check remains blocked even when the source is present.

| Feature or check                                                   | Test type                        | Result      | Build sha                                  | Evidence link                                                                                                                                                                               | Note                                                                                                                                                                                    |
| ------------------------------------------------------------------ | -------------------------------- | ----------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AT-300 spring tokens and shell transition                          | Browser computed-style/animation | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L79)                                                                                                                               | Diagnostic flags passed in `16.2s`; default Electron path timed out at `windowSize`, so no default-motion acceptance is claimed.                                                        |
| AT-304 resting face bob/blink and motion-off state                 | Fake-AI Electron                 | **pass**    | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L124)                                                                                                                              | Earlier isolated fixture run: `1 passed (1.4m)`. A later diagnostic run also passed; GPU flags mean current default-path acceptance remains blocked.                                    |
| AT-305 in-flight 26px Thinking face                                | Fake-AI Electron                 | **pass**    | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L124)                                                                                                                              | Earlier isolated fixture run: `1 passed (1.4m)`; face observed during delayed request and removed after reply. GPU-flag rerun is diagnostic only.                                       |
| AT-309 delivery checkmark and microphone level ring                | Fake microphone Electron         | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L230)                                                                                                                              | Diagnostic run reached recording, but no level ring appeared with the Windows fake device; default acceptance remains blocked.                                                          |
| AT-310 checklist spring and live shimmer                           | Fake-AI Electron                 | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L285)                                                                                                                              | Diagnostic run covered the live checklist fixture in `1.5m`; flags alter GPU, so default acceptance remains blocked.                                                                    |
| AT-311 approval shadow/amount and no celebration                   | Fake-AI Electron                 | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L285)                                                                                                                              | Diagnostic run covered approval shadow/amount in `1.5m`; flags alter GPU, so default acceptance remains blocked.                                                                        |
| AT-312 saved-time proof gating                                     | Fake-AI Electron                 | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L285)                                                                                                                              | Diagnostic checklist/proof witness ran in `1.5m`; both outcomes are still blocked on a standard Electron run.                                                                           |
| AT-313 first-run 96px splash wake                                  | First-run Electron               | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L256)                                                                                                                              | Diagnostic first-run witness passed in `43.6s`; flags alter GPU, so default acceptance remains blocked.                                                                                 |
| AT-314 finder stripes, shimmer and checkmark                       | First-run Electron               | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L256)                                                                                                                              | Diagnostic first-run witness passed in `43.6s`; flags alter GPU, so default acceptance remains blocked.                                                                                 |
| AT-323 chat-list Full/Basic/Off movement                           | Browser animation                | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L165) · [local error context](../../../test-results/e2e-lane-d-motion-AT-323-a-57964-s-movement-at-Basic-and-Off/error-context.md) | Electron launch hit Windows cache error `Unable to move the cache: Access is denied (0x5)` while other Electron lanes were active. Infrastructure evidence, not an application failure. |
| AT-324 message row-grow across motion levels                       | Browser animation                | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L193)                                                                                                                              | Diagnostic witness passed in `1.1m`; flags alter GPU, so default acceptance remains blocked.                                                                                            |
| AT-325 composer transition across motion levels                    | Browser computed-style           | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L193)                                                                                                                              | Diagnostic witness passed in `1.1m`; flags alter GPU, so default acceptance remains blocked.                                                                                            |
| AT-353 streaming complete surface and held-back incomplete surface | Fake-AI streaming Electron       | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [motion witness](../../../test/e2e/lane-d-motion.spec.ts#L323)                                                                                                                              | Diagnostic streaming fixture passed in `1.2m`; flags alter GPU, so default acceptance remains blocked.                                                                                  |

The following motion cells remain **blocked/uncovered** by Lane D: `AT-301`, `AT-302`, `AT-303`, `AT-326` and `AT-327`. No lane-D witness or result row claims coverage for those rules; the shared matrix should retain them as partial/uncovered.

## Accessibility checks

The a11y spec adds four checks beyond PR97's axe pass. Individual diagnostic runs used `LANE_D_DIAGNOSTIC_FLAGS=1` (`--no-sandbox --disable-gpu --force-device-scale-factor=1`); these flags are not default visual/motion acceptance:

| Feature or check                                      | Test type                        | Result      | Build sha                                  | Evidence link                                              | Note                                                                                                   |
| ----------------------------------------------------- | -------------------------------- | ----------- | ------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| F6 pane focus order and reverse traversal             | Keyboard Electron                | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [a11y witness](../../../test/e2e/lane-d-a11y.spec.ts#L46)  | Individual diagnostic run passed in `13.2s`; standard Electron path still fails before viewport setup. |
| Narrator-facing names, landmarks, meters and headings | DOM accessibility contract       | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [a11y witness](../../../test/e2e/lane-d-a11y.spec.ts#L71)  | Individual diagnostic run passed in `20.6s`; native Narrator speech output needs Windows CI.           |
| Forced colours and decorative shimmer                 | Chromium forced-colour emulation | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [a11y witness](../../../test/e2e/lane-d-a11y.spec.ts#L120) | Individual diagnostic run passed in `30.5s`; OS High Contrast needs Windows CI.                        |
| 200% zoom on chat, Memory and Settings                | App zoom plus layout assertions  | **blocked** | `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` | [a11y witness](../../../test/e2e/lane-d-a11y.spec.ts#L154) | Individual diagnostic run passed in `1.1m`; real Windows text scaling needs Windows CI.                |

Native Windows Narrator speech output, OS High Contrast switching and a real 200% Windows text-scale session remain **needs Windows CI**; the browser contract is not a substitute for those observations.

## Real-AI visual evidence

The local evidence is read-only. The historical screenshots below are immutable evidence from `7e1ada4`; the reviewed screenshots were inspected locally under `audit-evidence-current-d2280` (historical evidence ref `d2280c5aaf94910edecdac6c3a332ea575af912d`). These findings are observations of recorded builds and do not constitute blanket acceptance of the current source build.

- [U16 notifications](https://github.com/vikas53953/foo-agent/blob/d2280c5aaf94910edecdac6c3a332ea575af912d/real-ai/7e1ada4-claude/s3/2026-10-21T18-03-57-388Z-U16-settings-all/04-settings-notifications.png), [permissions](https://github.com/vikas53953/foo-agent/blob/d2280c5aaf94910edecdac6c3a332ea575af912d/real-ai/7e1ada4-claude/s3/2026-10-21T18-03-57-388Z-U16-settings-all/05-settings-permissions.png) and [keyboard shortcuts](https://github.com/vikas53953/foo-agent/blob/d2280c5aaf94910edecdac6c3a332ea575af912d/real-ai/7e1ada4-claude/s3/2026-10-21T18-03-57-388Z-U16-settings-all/11-settings-shortcuts.png) show the heading with a blank content pane. Account, Appearance, Connections and About show content. The first Settings frame captures a transition overlay from the chat shell. This is **wrong vs the Blueprint/UX Settings walkthrough**, which has page content for each nav target. The historical cc8 rerun at `2026-10-21T18-41-27-602Z-U16-settings-all` shows the same blank-pane pattern locally.
- [B09 EMI](https://github.com/vikas53953/foo-agent/blob/d2280c5aaf94910edecdac6c3a332ea575af912d/real-ai/7e1ada4-claude/s3/2026-10-21T17-49-05-681Z-B09-kit/01-emi.png), [map](https://github.com/vikas53953/foo-agent/blob/d2280c5aaf94910edecdac6c3a332ea575af912d/real-ai/7e1ada4-claude/s3/2026-10-21T17-49-05-681Z-B09-kit/02-map.png), [chart](https://github.com/vikas53953/foo-agent/blob/d2280c5aaf94910edecdac6c3a332ea575af912d/real-ai/7e1ada4-claude/s3/2026-10-21T17-49-05-681Z-B09-kit/03-chart.png) and [compare](https://github.com/vikas53953/foo-agent/blob/d2280c5aaf94910edecdac6c3a332ea575af912d/real-ai/7e1ada4-claude/s3/2026-10-21T17-49-05-681Z-B09-kit/04-compare.png) show the visible `Couldn't show part of this` fallback or plain prose in place of the requested interactive kit surface. [Timer](https://github.com/vikas53953/foo-agent/blob/d2280c5aaf94910edecdac6c3a332ea575af912d/real-ai/7e1ada4-claude/s3/2026-10-21T17-49-05-681Z-B09-kit/05-timer.png) and [form](https://github.com/vikas53953/foo-agent/blob/d2280c5aaf94910edecdac6c3a332ea575af912d/real-ai/7e1ada4-claude/s3/2026-10-21T17-49-05-681Z-B09-kit/06-form.png) render interactive controls; the [AI-page capture](https://github.com/vikas53953/foo-agent/blob/d2280c5aaf94910edecdac6c3a332ea575af912d/real-ai/7e1ada4-claude/s3/2026-10-21T17-49-05-681Z-B09-kit/07-ai-page.png) begins below the visible viewport. The first four are **wrong vs the Blueprint/UX kit journeys** and should not be counted as component coverage. The historical cc8 rerun at `2026-10-21T18-29-54-305Z-B09-kit` shows the same fallback for EMI/map locally.

## Required gates

The lane dependency tree was installed separately under `lane-d/node_modules`; Electron 44.9.0 is present and the Electron rebuild command completed. The following gates are required before a draft PR:

```text
corepack.cmd pnpm spec:verify
corepack.cmd pnpm check:copy
corepack.cmd pnpm lint
corepack.cmd pnpm format:check
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm trace:check
corepack.cmd pnpm fid:guard --base origin/main
```

The lane will report native Windows CI observations separately from browser emulation and will not mark an unrun check as PASS.

## Gate results

All required gates were run after rebasing to `0665cf67d2ab6cf0515f6d3198df6dfc35357e82`:

- **PASS** `corepack.cmd pnpm spec:verify` (`spec verified`)
- **PASS** `corepack.cmd pnpm check:copy` (`copy ok`)
- **PASS** `corepack.cmd pnpm lint` (two pre-existing warnings in `Composer.tsx` and `MessageList.tsx`)
- **PASS** `corepack.cmd pnpm format:check` (all files matched)
- **PASS** `corepack.cmd pnpm typecheck`
- **BLOCKED** `corepack.cmd pnpm test --maxWorkers=2` (bounded run exposed `test/integration/browser/actions.test.ts` popup retry failure; process was stopped after the failure while the remaining suite was still running)
- **PASS** `corepack.cmd pnpm build` (Vite warnings only)
- **PASS** `corepack.cmd pnpm trace:check` (`FID-18: trace.csv consistent with the test titles`)
- **PASS** `corepack.cmd pnpm fid:guard --base origin/main` (`0 changed files checked`)

Fidelity-CR: none
