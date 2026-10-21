// Spec: 08-2 §11.2, 09 §9.18 (secrets in Windows Credential Manager through foo's own keyring adapter).
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS run by the installed foo.exe as Node */
// Run by test/windows/run-checks.ps1 with the INSTALLED foo.exe as Node (ELECTRON_RUN_AS_NODE=1): loads foo's own
// compiled keyring adapter from app.asar (the same code foo runs), writes a throwaway value, reads it back, and leaves it
// for PowerShell to find with cmdkey. `delete` as the first argument removes it again. Prints one JSON line.
'use strict';
const path = require('path');

const RES = process.env.FOO_RESOURCES;
const TARGET = 'foo/test/ci-check';
const { napiKeyring } = require(path.join(RES, 'app.asar', 'out', 'main', 'main', 'vault', 'keyring.js'));

const k = napiKeyring();
if (!k) {
  console.log(JSON.stringify({ ok: false, why: 'foo could not load @napi-rs/keyring from its install' }));
  process.exit(1);
}
if (process.argv[2] === 'delete') {
  const removed = k.delete(TARGET);
  const after = k.get(TARGET);
  console.log(JSON.stringify({ ok: removed && after === null, removed, readAfterDelete: after }));
  process.exit(removed && after === null ? 0 : 1);
}
const value = `ci-${Date.now()}-${Math.random().toString(36).slice(2)}`;
k.set(TARGET, value);
const back = k.get(TARGET);
console.log(JSON.stringify({ ok: back === value, target: TARGET, readBackMatches: back === value }));
process.exit(back === value ? 0 : 1);
