#!/usr/bin/env node
// Fake `gemini` CLI for adapter tests (08-3 §22.3). See fake-cli-core.mjs for the env switches.
import { runFakeCli } from './fake-cli-core.mjs';

runFakeCli('gemini').then((code) => process.exit(code));
