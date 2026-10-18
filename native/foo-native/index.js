// Spec: 09 §9.19.2 (loaded as require('foo-native') in main only; every export falls back so foo runs without the
// addon), 08-5 §6. Exports the compiled addon's functions where it has them and the fallback for every other name (M9's
// wintrack, M10's hello and ocr arrive later), plus `available`.
'use strict';

const fallback = require('./fallback.js');

let native = null;
if (process.platform === 'win32') {
  try {
    native = require('./build/Release/foo_native.node');
  } catch {
    native = null;
  }
}

const out = { available: native !== null };
for (const name of Object.keys(fallback)) {
  out[name] = native && typeof native[name] === 'function' ? native[name] : fallback[name];
}
module.exports = out;
