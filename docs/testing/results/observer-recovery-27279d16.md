# Lane E observer recovery diagnostic

- **Source:** `27279d164b115211463af11f4f601b0f0b7dd875`
- **Evidence root:** `<RUNNER_TEMP>\\foo-lane-e-soak-27279d16-paired-20261023`
- **Scope:** short synthetic paired negative diagnostic; no eight-hour acceptance claim.

## Commands

```powershell
corepack.cmd pnpm exec tsx test/soak/lane-e-live-producer.ts --out <RUNNER_TEMP>\\producer-out --mode pretend --smoke
corepack.cmd pnpm exec tsx test/soak/lane-e-soak.ts --exe <RUNNER_TEMP>\\source-runtime-provenance.txt --scenario <RUNNER_TEMP>\\producer-out\\lane-e-live-heartbeat.json --out <RUNNER_TEMP>\\observer-out --mode pretend --partial --duration-hours 1
```

The fresh empty `observer-out` directory was removed during the run to exercise recovery. The writer recreated it and produced both reports. Only the fresh empty directory was removed; prior evidence was retained.

## Timings and outcomes

- Producer start event: `2026-10-23T02:04:40.7923353Z`; observer start event: `2026-10-23T02:05:05.1841084Z`.
- Observer report window: `2026-10-23T02:05:07.160Z`–`2026-10-23T02:08:13.015Z`.
- Producer: **PASS**; 2 jobs submitted, 2 expected, 2 completed as `done_unverified`; 2 process samples; 0 nonresponsive samples; 0-byte stderr.
- Producer maxima: 1,095 handles; 181,985,280 working-set bytes.
- Observer: **EXPECTED FAIL-CLOSED**; 5 samples, 0 freezes, 2 jobs submitted and 2 completed as `done_unverified`; failure was `producer heartbeat stale for more than 120s`; 0-byte stderr.
- Report recovery: **PASS**. Both observer reports were valid after the intentionally removed output directory was recreated.

## Report hashes

- `<RUNNER_TEMP>\\observer-out\\lane-e-soak-pretend.json` — SHA256 `49D45A81AD2A0E2FDF8DF3BE27474E392E8AB0409F0E3994481F78BEDFD906A5`
- `<RUNNER_TEMP>\\observer-out\\lane-e-soak-pretend.md` — SHA256 `5FA88536E48B4ED0D958FE7B6168B0C331AC2EF5F94058B6148A8E5E39DDDE5C`

The producer passed its two-job smoke, while the observer correctly failed after the producer stopped and its heartbeat became stale. This proves report-directory recovery only; it does **not** establish combined producer/observer soak acceptance, eight-hour acceptance, child-process-total resource coverage, or packaged-app acceptance.
