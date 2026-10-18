// Fake main for the Job Object tests: loads foo-native, spawns the fake CLI, puts it in a Job Object, writes the prompt
// and prints the CLI's PIDS line. Killing this process closes the job handle: KILL_ON_JOB_CLOSE takes the tree.
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const native = require('../../../native/foo-native/index.js');

const cli = spawn(process.execPath, [path.join(__dirname, 'spawner.js')], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
native.assignToJobObject(cli.pid);
cli.stdout.on('data', (b) => process.stdout.write(b));
cli.stdin.end('prompt');
setInterval(() => undefined, 1e6);
