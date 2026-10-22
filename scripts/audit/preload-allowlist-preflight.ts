// Spec: 08-1 §3.1 and §3.3 (sandboxed preload allow-lists), 08-3 §22.8 (bounded audit preflight).
// The source-shape check stays outside Stryker: preload.ts is retained as an explicit NO_COVERAGE mutation target,
// while this deterministic check proves the handwritten lists still match the shared IPC contract.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WINDOW_CHANNELS } from '../../src/main/ipc/guard';
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../../src/shared/ipc';

const repoRoot = path.resolve(__dirname, '../..');
const LIVE_ONLY_EVENTS = ['live:frame', 'live:state'];

function setOf(file: string, name: string): string[] {
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  const match = source.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`));
  if (!match) throw new Error(`${file} is missing the ${name} allow-list declaration`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]!).sort();
}

const errors: string[] = [];
const same = (actual: readonly string[], expected: readonly string[]) => actual.join('\n') === [...expected].sort().join('\n');
const check = (label: string, actual: readonly string[], expected: readonly string[]) => {
  if (!same(actual, expected)) errors.push(`${label} does not match the expected channel list`);
};

for (const file of ['src/preload/preload.ts', 'src/preload/preloadTest.ts']) {
  check(`${file} invokes`, setOf(file, 'INVOKES'), INVOKE_CHANNELS);
  check(
    `${file} events`,
    setOf(file, 'EVENTS'),
    EVENT_CHANNELS.filter((event) => !LIVE_ONLY_EVENTS.includes(event)),
  );
}
check('src/preload/preloadLive.ts invokes', setOf('src/preload/preloadLive.ts', 'INVOKES'), WINDOW_CHANNELS['/windows/live.html'] ?? []);
const liveEvents = setOf('src/preload/preloadLive.ts', 'EVENTS');
for (const event of [...LIVE_ONLY_EVENTS, 'job:upsert', 'settings:changed']) {
  if (!liveEvents.includes(event)) errors.push(`src/preload/preloadLive.ts events is missing ${event}`);
}
for (const event of liveEvents) {
  if (!EVENT_CHANNELS.includes(event as (typeof EVENT_CHANNELS)[number]))
    errors.push(`src/preload/preloadLive.ts has unknown event ${event}`);
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: 'blocked', errors }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      { status: 'pass', files: ['src/preload/preload.ts', 'src/preload/preloadTest.ts', 'src/preload/preloadLive.ts'] },
      null,
      2,
    ),
  );
}
