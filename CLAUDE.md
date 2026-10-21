# foo-agent: rules for every builder session

foo is a WhatsApp-style personal agent for Windows (Electron, React 19, SQLite). The approved spec is the boss: `spec/constitution/` (start at `00-README.md`; DECISIONS wins over chapter text) and `11-fidelity.md`. Nothing below, and nothing in `.claude/skills/`, overrides it. A gap or clash goes to a CR in `docs/cr/`, never into code.

How we build, from M4 on: **[docs/build-method.md](docs/build-method.md)**. Read it once per session.

## Skills

| Skill              | Use it for                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `foo-playbooks`    | the step list for your task; every brief names one (milestone, ticket, bug fix, visual parity, overnight) |
| `foo-tickets`      | a milestone pack → 4 to 8 vertical tickets with blocking edges, before any code                           |
| `foo-verify`       | drive the real app and paste before/after proof; required before "done"                                   |
| `foo-review`       | Opus + Sonnet review sorted act / consider / noted / dismissed; two-axis close-out                        |
| `foo-correct`      | a mistake seen twice becomes a lint, type, check or test                                                  |
| `foo-decision-log` | the committed log Vikas audits, including approvals on his behalf                                         |

The principles and helper skills in `.claude/skills/` are not loaded automatically. When a skill or brief names "the **X** principle skill", read `.claude/skills/principle-X/SKILL.md`. Steps in vendored text that need skills foo does not carry (`poteto-mode`, `architect`, `arena`, `how`, `why`, `swarm`, Cursor-only tools) are skipped; foo's playbooks already cover them.

- **Principles (15):** prove-it-works, fix-root-causes, attack-the-premise, encode-lessons-in-structure, sequence-verifiable-units, test-behavior-not-implementation, type-system-discipline, boundary-discipline, make-operations-idempotent (M4, M7, M10), separate-before-serializing-shared-state (parallel lanes), laziness-protocol, subtract-before-you-add, build-the-lever, guard-the-context-window, never-block-on-the-human.
- **Subordinate to the spec (5):** model-the-domain, foundational-thinking, minimize-reader-load, explain-the-number (M14), migrate-callers-then-delete-legacy-apis. They shape code behind the spec, never what the spec fixes.
- **Not adopted (4):** exhaust-the-design-space, experience-first, redesign-from-first-principles, outcome-oriented-execution. They redesign approved screens or bypass the CR process.
- **Helpers:** `typescript-best-practices` (TS rulebook), `unslop` (plain words), `matt-tdd`, `matt-to-tickets`, `matt-implement-spec`, `matt-code-review` (sources for foo-tickets / foo-review).

Sources and licences: `.claude/skills/NOTICE.md`.

## Before every push

```bash
pnpm spec:verify && pnpm check:copy && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm trace:check && pnpm spec:coverage
pnpm fid:guard --base origin/main
```

Commit trailer `Fidelity-CR: none|CR-nnnn`. PRs open as drafts (Windows CI runs only on non-draft PRs); mark ready when the work is proven.

## Rules and what enforces them

The correction ladder (`foo-correct`) keeps this table: each rule and the strongest thing that enforces it. Prefer moving a rule up a rung over adding words.

| Rule                                                                              | Enforced by                                                                                    |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| UI words only through `t(key)` from `src/shared/copy/en-IN.json`                  | lint `foo/no-literal-copy`; `pnpm check:copy`                                                  |
| Test ids only from `TID` (`src/shared/testids.ts`)                                | lint `foo/testid-from-registry`                                                                |
| Colours, sizes, radii only from tokens (`design/tokens.json`)                     | lint `foo/no-raw-design-values`                                                                |
| Every source file opens with its spec section                                     | lint `foo/spec-header` (FID-20)                                                                |
| `spec/` and `golden/` change only with a CR; no skip/only/mask/threshold changes  | `pnpm fid:guard` (FID-02, FID-06)                                                              |
| Every changed path has an owner                                                   | `pnpm fid:guard` (FID-19, `OWNERS.yml`)                                                        |
| Every traced spec id has a test with that title                                   | `pnpm trace:check` (FID-18)                                                                    |
| Every screen and row of a built milestone is live, or a listed gap (list shrinks) | `pnpm spec:coverage` (FID-21, `docs/fidelity/coverage-gaps.json`)                              |
| Check files stay put; tests are not removed without a CR                          | `pnpm fid:guard` (FID-22, `LOCKED`); Claude Code hook `.claude/hooks/locked-checks.mjs`        |
| The AI's plan uses catalogue keys                                                 | code: `planKeyIssues` + one repair turn (CR-0031)                                              |
| `spec/` equals its manifest                                                       | `pnpm spec:verify` (FID-01)                                                                    |
| Baselines change only through the bless workflow                                  | `playwright.config.ts` refuses snapshot updates; `golden-bless.ts` needs a CR or signed report |
| No "done" without proof from the real app                                         | words only (rung 5): foo-verify proof block in the PR, checked by `foo-review`                 |
| Repeat mistakes become rules                                                      | words only (rung 5): `foo-correct`                                                             |
