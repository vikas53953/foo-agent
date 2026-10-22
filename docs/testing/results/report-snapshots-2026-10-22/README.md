# Lead report bundle - 2026-10-22

This staging bundle contains only sanitized Markdown and TSV judgments and candidate rows. It excludes screenshots, PNGs, raw JSON/JSONL logs, downloaded artifacts, and source/spec files. MANIFEST.tsv records each original relative path plus application/evidence commit provenance.

The staging scan rejected credential-shaped values. Synthetic email and local Windows paths found in source reports were redacted in the copied files and recorded in the manifest. Phone-pattern matches in reports were treated as timestamps, commit IDs, costs, or AT numbers after review; no contact number was copied as personal data.

The report text remains evidence-led: immutable screenshot links are retained, and pass/partial/blocked wording is preserved. This bundle does not promote driver ok:true to product acceptance.

These are historical report snapshots, not a replacement for codex-status.md or the canonical real-ai-results.tsv. Some report claims were corrected later in evidence-consolidation-2026-10-22/matrix-changes.md; use the canonical ledger for current totals.
