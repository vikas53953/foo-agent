// Spec: 11-fidelity §11.2 (evidence beside every result); Vikas 2026-10-26 "autonomous exploratory, visual, functional
// testing of the running product". Injected into foo's renderer by test/qa-explore: lists every visible control and checks
// spatial invariants a user would notice (a control covered by something else, two controls overlapping, text painted
// over by another part, clipped text, sideways page scroll, a menu or popover leaving the window). Plain JS on purpose:
// it runs inside the page through page.evaluate, which the app's CSP allows (an injected <script> tag is blocked).
window.__qa = {
  sel: 'button, a[href], input, textarea, select, [role=button], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=option], [role=link], [contenteditable=true], [tabindex]:not([tabindex="-1"])',
  visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    // clipped away by a scrolling/overflow-hidden ancestor, or faded out by an ancestor
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (Number(s.opacity) < 0.05 || s.visibility === 'hidden') return false;
      if (/(auto|scroll|hidden|clip)/.test(s.overflow + s.overflowY + s.overflowX)) {
        const ar = a.getBoundingClientRect();
        if (r.bottom <= ar.top + 1 || r.top >= ar.bottom - 1 || r.right <= ar.left + 1 || r.left >= ar.right - 1) return false;
      }
    }
    return true;
  },
  name(el) {
    return (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.value || el.getAttribute('placeholder') || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 60);
  },
  path(el) {
    const parts = [];
    let e = el;
    while (e && e !== document.body && parts.length < 4) {
      const tid = e.getAttribute && e.getAttribute('data-testid');
      parts.unshift(tid ? `[${tid}]` : e.tagName.toLowerCase());
      e = e.parentElement;
    }
    return parts.join('>');
  },
  controls() {
    const seen = new Set();
    const out = [];
    for (const el of document.querySelectorAll(this.sel)) {
      if (seen.has(el) || !this.visible(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      out.push({
        tid: el.getAttribute('data-testid') || '',
        role: el.getAttribute('role') || el.tagName.toLowerCase(),
        name: this.name(el),
        path: this.path(el),
        disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
        box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        hasAccessibleName: !!(
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          el.innerText.trim() ||
          el.getAttribute('title')
        ),
      });
    }
    return out;
  },
  // Text-bearing leaf blocks that are visible.
  textBlocks() {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const els = new Set();
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (el && this.visible(el)) els.add(el);
    }
    for (const el of els) out.push(el);
    return out;
  },
  // Spatial invariants: overlapping controls, controls covering text of another component, clipped text, off-viewport.
  invariants() {
    const issues = [];
    const all = [...document.querySelectorAll(this.sel)].filter((e) => this.visible(e) && e.type !== 'file');
    const ctrls = all.filter(
      (e) =>
        !['log', 'listbox', 'separator', 'grid', 'list'].includes(e.getAttribute('role')) && !all.some((o) => o !== e && e.contains(o)),
    );
    const topAt = (x, y) => document.elementFromPoint(x, y);
    // A modal dialog covers the page on purpose: only its own controls must be usable.
    const modal = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].find((d) => this.visible(d));
    // 1) control whose centre is covered by something unrelated (not usable / overlapped)
    for (const c of ctrls) {
      if (modal && !modal.contains(c)) continue;
      const r = c.getBoundingClientRect();
      const cx = r.x + r.width / 2,
        cy = r.y + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      const t = topAt(cx, cy);
      if (
        t &&
        t !== c &&
        !c.contains(t) &&
        !t.contains(c) &&
        !t.closest('[data-testid=chat-header],[data-testid=composer],[role=menu],[role=dialog],[role=alertdialog],[role=tooltip]')
      ) {
        issues.push({
          kind: 'control-covered',
          control: this.path(c) + ' "' + this.name(c) + '"',
          by: this.path(t) + ' "' + this.name(t).slice(0, 30) + '"',
        });
      }
    }
    // 2) two visible controls overlapping each other (not nested)
    for (let i = 0; i < ctrls.length; i++)
      for (let j = i + 1; j < ctrls.length; j++) {
        const a = ctrls[i],
          b = ctrls[j];
        if (a.contains(b) || b.contains(a)) continue;
        // A menu, popover or dialog covers the page on purpose.
        const ov = '[role=menu],[role=dialog],[role=alertdialog],[role=tooltip]';
        if (!a.closest(ov) !== !b.closest(ov)) continue;
        if (a.closest('[data-testid=chat-header]') && !b.closest('[data-testid=chat-header]')) continue;
        if (b.closest('[data-testid=chat-header]') && !a.closest('[data-testid=chat-header]')) continue;
        const ra = a.getBoundingClientRect(),
          rb = b.getBoundingClientRect();
        const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ox > 2 && oy > 2)
          issues.push({
            kind: 'controls-overlap',
            a: this.path(a) + ' "' + this.name(a) + '"',
            b: this.path(b) + ' "' + this.name(b) + '"',
            px: [Math.round(ox), Math.round(oy)],
          });
      }
    // 3) clipped text: overflow hidden, content wider/taller, no ellipsis
    for (const el of this.textBlocks()) {
      const cs = getComputedStyle(el);
      const clipsX =
        el.scrollWidth > el.clientWidth + 1 && (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && cs.textOverflow !== 'ellipsis';
      const clipsY =
        el.scrollHeight > el.clientHeight + 2 &&
        (cs.overflowY === 'hidden' || cs.overflowY === 'clip') &&
        !cs.webkitLineClamp?.match(/\d/) &&
        cs.webkitLineClamp !== undefined &&
        Number(cs.webkitLineClamp) > 0 === false;
      if (clipsX || clipsY)
        issues.push({ kind: 'text-clipped', el: this.path(el), text: el.innerText.slice(0, 50), axis: clipsX ? 'x' : 'y' });
    }
    // 4) page horizontal overflow
    if (document.documentElement.scrollWidth > innerWidth + 1)
      issues.push({ kind: 'page-h-overflow', scrollWidth: document.documentElement.scrollWidth, innerWidth });
    // 5) visible popover/menu/dialog extends beyond viewport
    for (const el of document.querySelectorAll('[role=menu],[role=dialog],[role=listbox],[role=tooltip],[data-popover],[popover]')) {
      if (!this.visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
        issues.push({ kind: 'overlay-off-viewport', el: this.path(el), box: [r.x, r.y, r.width, r.height].map(Math.round) });
    }
    return issues.concat(this.coveredText(), this.controlOverText());
  },

  // Text covered by something that is not its own ancestor/descendant (e.g. hover controls painted over the next bubble).
  // The part of the window an element can actually paint in: the window cut by every scrolling or clipping ancestor.
  clipRect(el) {
    let r = { l: 0, t: 0, r: innerWidth, b: innerHeight };
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (/(auto|scroll|hidden|clip)/.test(s.overflow + s.overflowY + s.overflowX)) {
        const ar = a.getBoundingClientRect();
        r = { l: Math.max(r.l, ar.left), t: Math.max(r.t, ar.top), r: Math.min(r.r, ar.right), b: Math.min(r.b, ar.bottom) };
      }
    }
    return r;
  },
  coveredText() {
    const issues = [];
    // A modal dialog covers the page on purpose: only text inside it must be readable.
    const modal = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].find((d) => this.visible(d));
    const overlay =
      '[data-testid=thread-date-sticky],[role=menu],[role=dialog],[role=alertdialog],[role=tooltip],[data-testid$="-picker"],[data-testid=chat-header],[data-testid=composer],[data-testid=titlebar-strip]';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || !this.visible(el) || el.closest(overlay)) continue;
      if (modal && !modal.contains(el)) continue;
      const clip = this.clipRect(el);
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width < 4 || r.height < 4) continue;
        const y = r.top + r.height / 2;
        if (y < clip.t || y > clip.b) continue;
        for (const fx of [0.15, 0.5, 0.85]) {
          const x = r.left + r.width * fx;
          if (x < clip.l + 2 || x > clip.r - 2) continue;
          const t = document.elementFromPoint(x, y);
          if (!t || t === el || el.contains(t) || t.contains(el)) continue;
          if (getComputedStyle(t).pointerEvents === 'none') continue;
          // Menus, popovers and pickers cover the page on purpose; a field's own placeholder sits under the field.
          if (t.closest(overlay) || t.matches('input,textarea,[contenteditable],[contenteditable] *')) continue;
          issues.push({
            kind: 'text-covered',
            text: n.textContent.trim().slice(0, 40),
            textEl: this.path(el),
            by: this.path(t) + ' "' + this.name(t).slice(0, 30) + '"',
            at: [Math.round(x), Math.round(y)],
          });
          break;
        }
      }
    }
    const seen = new Set();
    return issues.filter((i) => {
      const k = i.textEl + i.by;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  },
  // Geometric check, independent of paint order: a visible control whose box overlaps a line of text it does not own
  // (for example a reply's action row drawn over the next bubble's words).
  controlOverText() {
    const issues = [];
    const ov =
      '[role=menu],[role=dialog],[role=alertdialog],[role=tooltip],[data-testid$="-picker"],[data-testid=chat-header],[data-testid=composer]';
    const ctrls = [...document.querySelectorAll(this.sel)].filter(
      (e) =>
        this.visible(e) &&
        e.type !== 'file' &&
        !e.closest(ov) &&
        !['log', 'listbox', 'separator', 'list', 'grid'].includes(e.getAttribute('role')),
    );
    const lines = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent.trim() || !n.parentElement || !this.visible(n.parentElement) || n.parentElement.closest(ov)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects())
        if (r.width > 4 && r.height > 4) lines.push({ el: n.parentElement, r, text: n.textContent.trim() });
    }
    for (const c of ctrls) {
      const cr = c.getBoundingClientRect();
      // The control's own drawn icon, inset 8 px from its 40 px hit area.
      const box = { l: cr.left + 8, t: cr.top + 8, r: cr.right - 8, b: cr.bottom - 8 };
      for (const { el, r, text } of lines) {
        if (c.contains(el) || el.contains(c)) continue;
        const ox = Math.min(box.r, r.right) - Math.max(box.l, r.left);
        const oy = Math.min(box.b, r.bottom) - Math.max(box.t, r.top);
        if (ox > 3 && oy > 3) {
          issues.push({
            kind: 'control-over-text',
            control: this.path(c) + ' "' + this.name(c) + '"',
            text: text.slice(0, 40),
            textEl: this.path(el),
          });
          break;
        }
      }
    }
    return issues;
  },
  overlays() {
    return [...document.querySelectorAll('[role=menu],[role=dialog],[role=listbox],[role=tooltip],[role=alertdialog]')]
      .filter((e) => this.visible(e))
      .map((e) => ({
        role: e.getAttribute('role'),
        tid: e.getAttribute('data-testid'),
        text: e.innerText.slice(0, 120),
        box: (({ x, y, width, height }) => [x, y, width, height].map(Math.round))(e.getBoundingClientRect()),
      }));
  },
};
