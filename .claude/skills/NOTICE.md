# Third-party skill sources

foo-agent copies and adapts skills from two MIT-licensed projects. pstack is **not** installed as a plugin; only the files listed here are in this repo. Copies are verbatim unless marked "adapted" or "foo note added".

## pstack, by Lauren Tan (@poteto)

- Source: https://github.com/cursor/plugins/tree/main/pstack, version 0.15.26, commit `0b8e952052d482ee6de06deebf14d590d77b1b34` (2026-10-18).
- Verbatim: `principle-*` (20 folders: prove-it-works, fix-root-causes, attack-the-premise, encode-lessons-in-structure, sequence-verifiable-units, test-behavior-not-implementation, type-system-discipline, boundary-discipline, make-operations-idempotent, separate-before-serializing-shared-state, laziness-protocol, subtract-before-you-add, build-the-lever, guard-the-context-window, never-block-on-the-human, model-the-domain, foundational-thinking, minimize-reader-load, explain-the-number, migrate-callers-then-delete-legacy-apis), `typescript-best-practices`, `unslop`, `foo-review/references/*` (from `interrogate/references`), `foo-decision-log/scripts/log.sh` (from `show-me-your-work`).
- foo note added (subordinate to the spec): principle-model-the-domain, principle-foundational-thinking, principle-minimize-reader-load, principle-explain-the-number, principle-migrate-callers-then-delete-legacy-apis.
- Adapted: `foo-verify` (create-verification-skill + principle-prove-it-works), `foo-correct` (correct), `foo-playbooks` (poteto-mode playbooks feature, bug-fix, visual-parity, autonomous-run, orchestrate; docs/guide/07 and 10), `foo-review` (interrogate), `foo-decision-log` (show-me-your-work).
- Not copied: the other principles (exhaust-the-design-space, experience-first, redesign-from-first-principles, outcome-oriented-execution: they would redesign approved screens), poteto-mode itself and its scripts, babysit (foo has its own PR rules), no-comments (needs pstack's comment-sicko agent and would fight foo's spec headers; foo-review carries a trimmed comment clean-up instead).

## Matt Pocock skills

- Source: https://github.com/mattpocock/skills, commit `49dd158d1076134a641b33efb035946536778336` (2026-10-09).
- Copied with a foo note and renamed (`matt-` prefix, model invocation off, so they do not clash with built-in skills): `matt-to-tickets`, `matt-implement-spec`, `matt-tdd` (with `tests.md`, `mocking.md`), `matt-code-review`.
- Adapted: `foo-tickets` (to-tickets + implement-spec), `foo-review` close-out (code-review).

## Licences

### pstack

```
MIT License

Copyright (c) 2026 Lauren Tan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### mattpocock/skills

```
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
