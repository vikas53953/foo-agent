---
name: foo-decision-log
description: Keep the committed decision log Vikas audits later (docs/decisions/<milestone>.tsv, one row per decision with why, evidence and result), including every fork approved on his behalf. Use in any milestone, overnight or unattended run, and whenever a fork is decided without Vikas.
---

# foo-decision-log

Adapted for foo-agent from pstack `show-me-your-work` (MIT, Lauren Tan; see `.claude/skills/NOTICE.md`). In foo the log is **committed**, because Vikas is often away and reviews decisions afterwards, and because the approve-on-his-behalf rule says every such decision is logged for his later review.

## Where

`docs/decisions/<scope>.tsv`, one file per milestone or workstream: `M4.tsv`, `M5.tsv`, `build-method.tsv`. Columns (tab-separated, one line per row): `ts phase decision why evidence result`.

## How

```bash
bash .claude/skills/foo-decision-log/scripts/log.sh docs/decisions/M4.tsv <phase> "<decision>" "<why>" "<evidence>" "<result>"
```

The helper stamps the UTC time, writes the header on first use, keeps cells on one line, and quotes cells a spreadsheet would read as formulas.

- **phase**: `contract` (the overnight contract), `start` (a new session picking up the log), `map`, a ticket id (`T03`), `review`, `ci`, `merge`, `approve`.
- **decision**: what was chosen or done, in plain words Vikas reads at a glance.
- **why**: the reason in plain words; the spec line or principle if one drove it.
- **evidence**: a pointer, never prose: commit SHA, PR number, `file:line`, a reviewer's verdict link, an evidence-branch path.
- **result**: `merged`, `tests green`, `PASS`, `reverted`, `open`, `approved on Vikas's behalf`.

Log decision points, not every action: a fork chosen, a ticket landed with its proof result, a revert and its trigger, a blocker, an approval on his behalf. **Every approval on Vikas's behalf gets a row** with phase `approve`, the reviewer's verdict as evidence, and the message where he set the rule (2026-10-18 14:56Z / 14:59Z).

## Rules

- Append only. A wrong call gets a new row that supersedes it; never edit or delete history.
- A new session adding to an existing log first reads its last rows; its first row has phase `start` and names the session.
- Before handing back, check the rows against what really happened (every row maps to a real action, every evidence pointer resolves). Fix by adding rows, not editing.
- Plain words (`unslop` applies to log text).

## Morning view

GitHub renders the TSV as a table. The thread's reply links it and lists the `approve` rows first.
