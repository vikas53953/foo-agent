// Spec: 08-1 §0.7.1 (`safeName()`, 08-0 §E.7): NFC; `< > : " / \ | ? *`, U+00B7 and U+0000–U+001F → `-`; runs of spaces
// and of `-` collapse to one; spaces and dots trimmed at both ends; a reserved Windows stem gets a `_` prefix; cut to 120
// characters keeping the extension; empty → `file`. Inbox files are `{attachmentId}-{safeName(original name)}`.
const MAX = 120;

export function safeName(name: string): string {
  let s = name
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*·\u0000-\u001F]/g, '-')
    .replace(/ {2,}/g, ' ')
    .replace(/-{2,}/g, '-')
    .replace(/^[ .]+|[ .]+$/g, '');
  if (!s) return 'file';
  const dot = s.lastIndexOf('.');
  const stem = dot > 0 ? s.slice(0, dot) : s;
  const ext = dot > 0 ? s.slice(dot) : '';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem)) s = `_${s}`;
  if (s.length > MAX) {
    const e = ext.length < MAX ? ext : '';
    s = s.slice(0, MAX - e.length) + e;
  }
  return s;
}
