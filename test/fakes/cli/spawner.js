// Fake AI CLI for the Job Object tests (M11 pack §5, CR-0007 §(e)): reads its stdin to the end (the prompt), then
// starts two grandchildren and prints `PIDS <self> <grandchild1> <grandchild2>`, then waits forever.
// SPAWNER_EARLY=1 starts the first grandchild before reading stdin (the race the taskkill sweep covers, pack §7).
'use strict';
const { spawn } = require('node:child_process');

const sleeper = () => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e6)'], { stdio: 'ignore', windowsHide: true }).pid;

const pids = [];
if (process.env.SPAWNER_EARLY === '1') pids.push(sleeper());
process.stdin.on('data', () => undefined);
process.stdin.on('end', () => {
  while (pids.length < 2) pids.push(sleeper());
  process.stdout.write(`PIDS ${process.pid} ${pids.join(' ')}\n`);
});
setInterval(() => undefined, 1e6);
