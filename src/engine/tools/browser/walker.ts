// Spec: 08-2 §8.3.4 (the injected script walks the DOM including open shadow roots, returns ≤ 300 interactive elements and
// ≤ 8,000 chars of visible text; refs are `data-foo-ref` attributes; AT SOURCE the value of any input that is type=password, has
// autocomplete in cc-* / one-time-code / current-password / new-password, matches /pass|pwd|cvv|cvc|otp|pin|card.?num|security.?code/i
// in name/id/label, or carries data-foo-secret is emitted as [hidden]; frames are walked one by one and each ref routed to the frame
// that owns it), §8.3.6 (mask stylesheet present while foo controls the page, removed on take-over; per-frame computed-style check,
// cached per DOM mutation), §8.2.1 (the facts the click classifier needs), §11.6 (OTP fields and 3-D Secure words make a page
// no-capture). The page side is plain JavaScript held as a string (the engine is compiled without DOM types, and a string survives
// any bundler); it is run per frame with `frame.evaluate`. It never returns the value of a masked field.

/** 08-2 §8.3.6, exactly. */
export const MASK_CSS =
  '[data-foo-secret], input[type=password], input[autocomplete^="cc-"], input[autocomplete="one-time-code"] { filter: blur(10px) !important; }';

export const MASK_STYLE_ID = '__foo_mask';

/** Page-side commands. */
export type WalkerCmd =
  | { cmd: 'walk'; prefix: string; maxElements: number; maxText: number }
  | { cmd: 'facts'; ref: string }
  | { cmd: 'mark' }
  | { cmd: 'inject'; css: string; id: string }
  | { cmd: 'remove'; id: string }
  | { cmd: 'verify'; css: string; id: string }
  | { cmd: 'probe' }
  | { cmd: 'keyTarget'; ref: string | null };

export interface WalkedFacts {
  tag: string;
  type: string;
  role: string;
  name: string;
  nearbyText: string;
  inForm: boolean;
  formHasSensitive: boolean;
}
export interface WalkedElement {
  ref: string;
  role: string;
  name: string;
  /** Value or state as printed; `[hidden]` for a masked field (the value never leaves the page). */
  value: string;
  masked: boolean;
  facts: WalkedFacts;
}
export interface WalkResult {
  elements: WalkedElement[];
  text: string;
  /** Interactive elements seen (before the cap). */
  interactive: number;
  canvasFillsMain: boolean;
  /** 08-2 §11.6: an OTP field or 3-D Secure words on the page. */
  noCapture: boolean;
}
export interface VerifyResult {
  ok: boolean;
  sensitive: number;
  cached: boolean;
}
/** A key press on `target` may submit its form: the engine classifies the target and every submit control of that form. */
export interface KeyTargetResult {
  target: WalkedFacts | null;
  formControls: WalkedFacts[];
}
export interface ProbeResult {
  /** A password or OTP field is on the page (08-2 §8.3.3 sign-in poll; §11.6). */
  secretField: boolean;
  noCapture: boolean;
}

/** The page script: `(${WALKER_SOURCE})(cmd)`. */
export const WALKER_SOURCE = String.raw`function fooWalker(c) {
  var SECRET_NAME = /pass|pwd|cvv|cvc|otp|pin|card.?num|security.?code/i;
  var OTP_NAME = /otp|one.?time|verification.?code|passcode/i;
  var SECURE_WORDS = /3D Secure|Verified by Visa|Mastercard ID Check|SafeKey/i;
  var INTERACTIVE_ROLES = { button: 1, link: 1, checkbox: 1, radio: 1, switch: 1, textbox: 1, searchbox: 1, combobox: 1, listbox: 1,
    option: 1, menuitem: 1, menuitemcheckbox: 1, menuitemradio: 1, tab: 1, slider: 1, spinbutton: 1 };
  var SKIP_TEXT = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1, IFRAME: 1 };
  var w = window;

  function squash(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return n && s.length > n ? s.slice(0, n) : s; }
  function attr(el, a) { return (el.getAttribute && el.getAttribute(a)) || ''; }

  function roots() {
    var out = [document];
    for (var i = 0; i < out.length; i++) {
      var all = out[i].querySelectorAll('*');
      for (var j = 0; j < all.length; j++) if (all[j].shadowRoot) out.push(all[j].shadowRoot);
    }
    return out;
  }
  function all(sel) {
    var rs = roots(), out = [];
    for (var i = 0; i < rs.length; i++) { var l = rs[i].querySelectorAll(sel); for (var j = 0; j < l.length; j++) out.push(l[j]); }
    return out;
  }
  function byRef(ref) { var l = all('[data-foo-ref="' + ref.replace(/"/g, '') + '"]'); return l[0] || null; }

  function labelText(el) {
    var parts = [];
    var lb = attr(el, 'aria-labelledby');
    if (lb) lb.split(/\s+/).forEach(function (id) { var t = document.getElementById(id); if (t) parts.push(t.textContent); });
    if (attr(el, 'aria-label')) parts.push(attr(el, 'aria-label'));
    if (el.labels) for (var i = 0; i < el.labels.length; i++) parts.push(el.labels[i].textContent);
    return squash(parts.join(' '));
  }
  function nameOf(el) {
    var n = labelText(el);
    if (n) return squash(n, 100);
    var tag = el.tagName;
    if (tag === 'INPUT') {
      var t = (attr(el, 'type') || '').toLowerCase();
      if (t === 'submit' || t === 'button' || t === 'reset') return squash(el.value || (t === 'submit' ? 'Submit' : ''), 100);
      if (t === 'image') return squash(attr(el, 'alt'), 100);
      return squash(attr(el, 'placeholder') || attr(el, 'title'), 100);
    }
    if (tag === 'TEXTAREA' || tag === 'SELECT') return squash(attr(el, 'placeholder') || attr(el, 'title'), 100);
    var txt = squash(el.innerText || el.textContent, 100);
    if (txt) return txt;
    var img = el.querySelector && el.querySelector('img[alt]');
    return squash((img && attr(img, 'alt')) || attr(el, 'title'), 100);
  }
  function roleOf(el) {
    var r = attr(el, 'role');
    if (r) return r.split(/\s+/)[0];
    var tag = el.tagName;
    if (tag === 'A') return el.hasAttribute('href') ? 'link' : 'generic';
    if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
    if (tag === 'SELECT') return el.multiple ? 'listbox' : 'combobox';
    if (tag === 'TEXTAREA') return 'textbox';
    if (tag === 'INPUT') {
      var t = (attr(el, 'type') || 'text').toLowerCase();
      if (t === 'checkbox' || t === 'radio') return t;
      if (t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return 'button';
      if (t === 'range') return 'slider';
      if (t === 'number') return 'spinbutton';
      if (t === 'search') return 'searchbox';
      return 'textbox';
    }
    if (el.isContentEditable) return 'textbox';
    return 'generic';
  }
  function isField(el) { return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'; }
  function sensitive(el) {
    if (!el || !el.getAttribute) return false;
    if (el.hasAttribute('data-foo-secret')) return true;
    if (!isField(el)) return false;
    if ((attr(el, 'type') || '').toLowerCase() === 'password') return true;
    var ac = (attr(el, 'autocomplete') || '').toLowerCase().split(/\s+/);
    for (var i = 0; i < ac.length; i++) {
      if (ac[i].indexOf('cc-') === 0 || ac[i] === 'one-time-code' || ac[i] === 'current-password' || ac[i] === 'new-password') return true;
    }
    return SECRET_NAME.test(attr(el, 'name')) || SECRET_NAME.test(el.id || '') || SECRET_NAME.test(labelText(el) || attr(el, 'placeholder'));
  }
  function otpField(el) {
    if (!isField(el)) return false;
    if ((attr(el, 'autocomplete') || '').toLowerCase().split(/\s+/).indexOf('one-time-code') >= 0) return true;
    return OTP_NAME.test(attr(el, 'name')) || OTP_NAME.test(el.id || '') || OTP_NAME.test(labelText(el) || attr(el, 'placeholder'));
  }
  function visible(el) {
    if (el.checkVisibility) return el.checkVisibility({ visibilityProperty: true });
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function interactive(el) {
    var tag = el.tagName;
    if (tag === 'A') return el.hasAttribute('href');
    if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'SUMMARY') return true;
    if (tag === 'INPUT') return (attr(el, 'type') || '').toLowerCase() !== 'hidden';
    if (INTERACTIVE_ROLES[attr(el, 'role')]) return true;
    if (el.isContentEditable && (!el.parentElement || !el.parentElement.isContentEditable)) return true;
    if (el.hasAttribute('onclick')) return true;
    var ti = attr(el, 'tabindex');
    return ti !== '' && ti !== '-1';
  }
  function formOf(el) { return el.form || (el.closest && el.closest('form, [role=form]')) || null; }
  function formSensitive(f) {
    if (!f) return false;
    var l = f.querySelectorAll('input, textarea, select');
    for (var i = 0; i < l.length; i++) if (sensitive(l[i])) return true;
    if (f.elements) for (var j = 0; j < f.elements.length; j++) if (sensitive(f.elements[j])) return true;
    return false;
  }
  function factsOf(el) {
    var f = formOf(el);
    var near = el.parentElement ? squash(el.parentElement.innerText || el.parentElement.textContent, 160) : '';
    return { tag: el.tagName.toLowerCase(), type: (attr(el, 'type') || '').toLowerCase(), role: roleOf(el), name: nameOf(el),
      nearbyText: near, inForm: !!f, formHasSensitive: formSensitive(f) };
  }
  function valueOf(el, masked) {
    var states = [];
    var tag = el.tagName, t = (attr(el, 'type') || '').toLowerCase();
    if (masked) states.push('[hidden]');
    else if (tag === 'INPUT' && (t === 'checkbox' || t === 'radio')) states.push(el.checked ? 'checked' : 'unchecked');
    else if (tag === 'SELECT') { var o = el.options[el.selectedIndex]; if (o) states.push('"' + squash(o.textContent, 80) + '"'); }
    else if ((tag === 'INPUT' && t !== 'submit' && t !== 'button' && t !== 'reset' && t !== 'image') || tag === 'TEXTAREA') {
      if (el.value) states.push('"' + squash(el.value, 200) + '"');
    } else if (attr(el, 'aria-checked')) states.push(attr(el, 'aria-checked') === 'true' ? 'checked' : 'unchecked');
    if (el.disabled || attr(el, 'aria-disabled') === 'true') states.push('disabled');
    return states.join(' ');
  }
  function insideSecret(node) {
    for (var p = node.parentElement; p; p = p.parentElement) if (p.hasAttribute('data-foo-secret')) return true;
    return false;
  }

  function walk(o) {
    if (typeof w.__fooRefSeq !== 'number') w.__fooRefSeq = 0;
    var elements = [], text = [], textLen = 0, seen = 0, otp = false;
    var stack = [document.documentElement];
    while (stack.length) {
      var node = stack.pop();
      if (!node) continue;
      if (node.nodeType === 3) {
        var p = node.parentElement;
        if (!p || SKIP_TEXT[p.tagName] || insideSecret(node) || !visible(p)) continue;
        var s = squash(node.textContent);
        if (s && textLen < o.maxText) { s = s.slice(0, o.maxText - textLen); text.push(s); textLen += s.length + 1; }
        continue;
      }
      if (node.nodeType !== 1 && node.nodeType !== 11) continue;
      var el = node;
      if (el.nodeType === 1) {
        if (SKIP_TEXT[el.tagName] && !isField(el)) continue;
        if (otpField(el)) otp = true;
        if (interactive(el) && visible(el)) {
          seen++;
          if (elements.length < o.maxElements) {
            var ref = attr(el, 'data-foo-ref');
            if (!ref || ref.indexOf(o.prefix + 'e') !== 0) { w.__fooRefSeq += 1; ref = o.prefix + 'e' + w.__fooRefSeq; el.setAttribute('data-foo-ref', ref); }
            var m = sensitive(el);
            elements.push({ ref: ref, role: roleOf(el), name: nameOf(el), value: valueOf(el, m), masked: m, facts: factsOf(el) });
          }
        }
      }
      var kids = [];
      if (el.shadowRoot) kids.push(el.shadowRoot);
      if (el.childNodes) for (var k = 0; k < el.childNodes.length; k++) kids.push(el.childNodes[k]);
      for (var q = kids.length - 1; q >= 0; q--) stack.push(kids[q]);
    }
    var vw = w.innerWidth * w.innerHeight, big = false;
    all('canvas').forEach(function (cv) { var r = cv.getBoundingClientRect(); if (visible(cv) && r.width * r.height >= 0.5 * vw) big = true; });
    var words = SECURE_WORDS.test(document.title) || SECURE_WORDS.test(text.join(' '));
    return { elements: elements, text: text.join(' '), interactive: seen, canvasFillsMain: big, noCapture: otp || words };
  }

  function mark() {
    var n = 0;
    all('input, textarea, select').forEach(function (el) {
      if (!el.hasAttribute('data-foo-secret') && sensitive(el)) { el.setAttribute('data-foo-secret', ''); n++; }
    });
    return n;
  }
  function inject(css, id) {
    mark();
    ensureStyles(css, id);
    if (!w.__fooMaskObs) {
      w.__fooMaskObs = new MutationObserver(function () { w.__fooMaskDirty = true; });
      roots().forEach(function (r) { w.__fooMaskObs.observe(r, { subtree: true, childList: true, attributes: true }); });
    }
    w.__fooMaskOn = true;
    w.__fooMaskDirty = true;
    return true;
  }
  function remove(id) {
    roots().forEach(function (r) { var l = r.querySelectorAll('style#' + id); for (var i = 0; i < l.length; i++) l[i].remove(); });
    w.__fooMaskOn = false;
    w.__fooMaskDirty = true;
    return true;
  }
  function ensureStyles(css, id) {
    roots().forEach(function (r) {
      var host = r === document ? (document.head || document.documentElement) : r;
      if (host.querySelector(':scope > style#' + id)) return;
      var st = document.createElement('style');
      st.id = id;
      st.textContent = css;
      host.appendChild(st);
    });
  }
  function verify(css, id) {
    if (!w.__fooMaskOn) return { ok: false, sensitive: 0, cached: false };
    if (!w.__fooMaskDirty && w.__fooMaskLast) return { ok: w.__fooMaskLast.ok, sensitive: w.__fooMaskLast.sensitive, cached: true };
    mark();
    ensureStyles(css, id);
    var ok = true, count = 0;
    roots().forEach(function (r) {
      var l = r.querySelectorAll('input, textarea, select, [data-foo-secret]');
      for (var i = 0; i < l.length; i++) {
        if (!sensitive(l[i])) continue;
        count++;
        if (String(getComputedStyle(l[i]).filter).indexOf('blur(10px)') < 0) ok = false;
      }
    });
    w.__fooMaskDirty = false;
    w.__fooMaskLast = { ok: ok, sensitive: count };
    return { ok: ok, sensitive: count, cached: false };
  }
  function probe() {
    var secret = false, otp = false;
    all('input').forEach(function (el) { if (visible(el) && sensitive(el)) secret = true; if (otpField(el)) otp = true; });
    return { secretField: secret, noCapture: otp || SECURE_WORDS.test(document.title) || SECURE_WORDS.test((document.body && document.body.innerText) || '') };
  }

  function keyTarget(ref) {
    var el = ref ? byRef(ref) : document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return { target: null, formControls: [] };
    var f = formOf(el), controls = [];
    if (f) {
      var l = f.querySelectorAll('button, input[type=submit], input[type=image], input[type=button], [role=button]');
      for (var i = 0; i < l.length; i++) {
        var t = (attr(l[i], 'type') || '').toLowerCase();
        if (l[i].tagName === 'BUTTON' && t && t !== 'submit') continue;
        controls.push(factsOf(l[i]));
      }
      if (f.elements) for (var j = 0; j < f.elements.length; j++) {
        var e = f.elements[j];
        if ((e.tagName === 'BUTTON' && (!attr(e, 'type') || attr(e, 'type') === 'submit')) || (e.tagName === 'INPUT' && /^(submit|image)$/i.test(attr(e, 'type')))) controls.push(factsOf(e));
      }
    }
    return { target: factsOf(el), formControls: controls };
  }

  switch (c.cmd) {
    case 'keyTarget': return keyTarget(c.ref);
    case 'walk': return walk(c);
    case 'facts': var el = byRef(c.ref); return el ? factsOf(el) : null;
    case 'mark': return mark();
    case 'inject': return inject(c.css, c.id);
    case 'remove': return remove(c.id);
    case 'verify': return verify(c.css, c.id);
    case 'probe': return probe();
  }
  return null;
}`;

/** The expression `frame.evaluate` runs for one command. */
export function walkerCall(c: WalkerCmd): string {
  return `(${WALKER_SOURCE})(${JSON.stringify(c)})`;
}
