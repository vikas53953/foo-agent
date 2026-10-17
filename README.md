# foo

foo is a personal agent for Windows: a WhatsApp-style chat app where foo and its helpers do jobs for you.

The build follows the frozen spec in [`spec/`](spec/) (start at `spec/constitution/00-README.md`) and the plan in the project files (`foo-plan.md`). Every source file names the spec section it implements.

## Develop

```sh
pnpm install
pnpm build        # tokens → main → renderer
pnpm start        # runs the built app (app://foo/index.html)
pnpm test         # unit, article (ART-*) and fidelity (FID-*) tests
pnpm rebuild:electron && pnpm test:e2e   # Playwright for Electron (rebuild:node to go back to unit tests)
```

`design/tokens.json` is the only hand-edited style source; run `pnpm build:tokens` after changing it.
