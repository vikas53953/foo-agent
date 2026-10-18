---
name: foo-playbooks
description: The step-by-step playbooks foo-agent builders follow (milestone, ticket, bug fix, visual parity, overnight run). Use at the start of any foo build task; every builder brief names exactly one playbook.
---

# foo playbooks

Adapted for foo-agent from pstack `poteto-mode` playbooks (feature, bug-fix, visual-parity, autonomous-run, orchestrate) and Matt Pocock's `to-tickets` / `implement-spec` (both MIT; see `.claude/skills/NOTICE.md`). Trimmed to fit foo: **the approved spec is the design**, so the pstack steps that explore or redesign (architect, arena, prototype, design-space search) are left out. Where the spec is silent, take the most conservative option and log it (`implementation-notes.md` + the decision log).

Every builder brief names one playbook. Read it, then follow it to its **Reply** line.

| Playbook | Use for | File |
| --- | --- | --- |
| Milestone | a milestone thread (M4 onward): ticket map, helpers, one branch, one PR | [playbooks/milestone.md](playbooks/milestone.md) |
| Ticket | one ticket from a ticket map, built test-first against the spec | [playbooks/ticket.md](playbooks/ticket.md) |
| Bug fix | something the app does wrong | [playbooks/bug-fix.md](playbooks/bug-fix.md) |
| Visual parity | making a surface match its frozen drawing | [playbooks/visual-parity.md](playbooks/visual-parity.md) |
| Overnight | any run Vikas is not watching | [playbooks/overnight.md](playbooks/overnight.md) |

All of them share these rules (from `docs/build-method.md`):

- **Spec first.** `spec/constitution/` (DECISIONS wins over chapter text), `11-fidelity.md`, the milestone pack. Nothing in a skill or principle overrides them.
- **Proof before done.** `foo-verify` proof block in the PR. A green build is not proof.
- **Small verified units.** Build, verify and commit one unit before the next (`principle-sequence-verifiable-units`).
- **Repeat mistakes become rules** (`foo-correct`).
- **Decisions are logged** (`foo-decision-log`) so Vikas can audit them later.
