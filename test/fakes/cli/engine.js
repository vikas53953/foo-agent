// Fake engine for the Job Object tests: forked with IPC like foo's engine utility process. Spawns the fake CLI, reports
// its pid, writes the prompt once the parent (playing main) says the pid is tracked, then forwards the PIDS line.
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');

const cli = spawn(process.execPath, [path.join(__dirname, 'spawner.js')], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
cli.stdout.on('data', (b) => process.send({ line: String(b).trim() }));
process.on('message', (m) => {
  if (m === 'tracked') cli.stdin.end('prompt');
});
process.send({ pid: cli.pid });
setInterval(() => undefined, 1e6);
