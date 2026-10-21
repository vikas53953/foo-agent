// Spec: 07 journeys, 10 acceptance (AI-judged chat quality on a real AI; Vikas picked "full stack" 2026-10-21).
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS run by node in the workflow */
// Prints a promptfoo results.json as a Markdown table: one row per ask, with the judge's reason for any failed check.
'use strict';
const fs = require('fs');

const [file, label = ''] = process.argv.slice(2);
const r = JSON.parse(fs.readFileSync(file, 'utf8')).results;
const cell = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .slice(0, 300);
const s = r.stats;
const lines = [
  `### AI judge on ${label}: ${s.successes} passed, ${s.failures} failed, ${s.errors} errors`,
  '',
  '| Ask | Result | First reply | Why it failed |',
  '|---|---|---|---|',
];
for (const x of r.results) {
  const failed = (x.gradingResult?.componentResults ?? []).filter((c) => !c.pass);
  const isError = x.failureReason === 2; // promptfoo: 1 = a check failed, 2 = the run itself errored
  const why = isError ? x.error : failed.map((c) => `${c.assertion?.metric || c.assertion?.type}: ${c.reason}`).join(' / ');
  const ms = x.response?.metadata?.firstReplyMs;
  lines.push(
    `| ${cell(x.testCase?.description)} | ${x.success ? 'pass' : isError ? 'error' : 'FAIL'} | ${ms == null ? '-' : `${(ms / 1000).toFixed(1)} s`} | ${cell(why)} |`,
  );
}
console.log(lines.join('\n'));
