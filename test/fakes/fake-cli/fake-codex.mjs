#!/usr/bin/env node
// Fake `codex` CLI for adapter tests (08-3 §22.3). See fake-cli-core.mjs for the env switches.
import { runFakeCli } from './fake-cli-core.mjs';

runFakeCli('codex').then((code) => process.exit(code));
