// Spec: 08-5 §6 (every foo-native export has a JS fallback returning the "unsupported" value named, literally), 09 §9.19.2
// (foo runs without the addon). Loaded by index.js when the compiled .node is missing (Linux, macOS, or a broken build).
'use strict';

function voiceUnavailable() {
  const e = new Error('VOICE_UNAVAILABLE');
  e.code = 'VOICE_UNAVAILABLE';
  return e;
}

module.exports = {
  assignToJobObject(_pid) {},
  killJobObject(_pid) {},
  verifyUser(_message, _hwnd) {
    return Promise.resolve('unavailable');
  },
  synthesize(_text, _lang, _outPath) {
    return Promise.reject(voiceUnavailable());
  },
  networkCost() {
    return 'unknown';
  },
  toastRemove(_tag, _group) {},
  toastRemoveGroup(_group) {},
  toastClear() {},
  toastSetting() {
    return 'enabled';
  },
  textScaleFactor() {
    return 1;
  },
  watchTextScale(_cb) {},
  keyboardLayouts() {
    return [];
  },
  focusActive() {
    return null;
  },
  trackWindow(_hwnd, _cb) {
    return -1;
  },
  untrackWindow(_id) {},
  findWindowByPid(_pid, _titlePrefix) {
    return null;
  },
  ocrRead(_path) {
    return Promise.resolve({ status: 'unavailable', lines: [] });
  },
  blackout(_inPath, _outPath, _rects) {
    return Promise.reject(new Error('OCR_UNAVAILABLE'));
  },
};
