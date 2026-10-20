// Spec: 08-2 §8.5 (v1 screen rung: `screen.open` only; the AI is told it cannot click or type there; X-47), §8.2 `screen.open
// { target: path | url | app }` read (`shell.openPath` / `openExternal`), 08-4 §27.1 (description, exact). The engine runs in a
// utility process without Electron's `shell`, so the opener is injected by whoever wires it (main, through a protocol kind the M9
// lead adds); until then the tool is not registered. Only http/https links and non-program files are opened: a program, script or
// shortcut could act on the PC, which the screen rung must never do in v1 (conservative reading, implementation-notes).
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import type { ToolDef } from '../ToolLayer';

export interface ScreenOpener {
  /** `shell.openPath`: resolves '' on success, else the error text. */
  openPath(path: string): Promise<string>;
  /** `shell.openExternal`. */
  openExternal(url: string): Promise<void>;
}

const PROGRAM = /\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|lnk|url|reg|cpl|hta|jar|appref-ms)$/i;

export type ScreenTarget =
  { kind: 'url'; url: string } | { kind: 'path'; path: string } | { kind: 'refused'; reason: 'URL_NOT_ALLOWED' | 'PATH_NOT_ALLOWED' };

export function screenTarget(target: string): ScreenTarget {
  const drive = /^[a-z]:[\\/]/i.test(target);
  if (!drive && /^[a-z][a-z0-9+.-]*:/i.test(target)) {
    try {
      const u = new URL(target);
      return u.protocol === 'http:' || u.protocol === 'https:'
        ? { kind: 'url', url: u.toString() }
        : { kind: 'refused', reason: 'URL_NOT_ALLOWED' };
    } catch {
      return { kind: 'refused', reason: 'URL_NOT_ALLOWED' };
    }
  }
  if (!isAbsolute(target) && !drive) return { kind: 'refused', reason: 'PATH_NOT_ALLOWED' };
  if (PROGRAM.test(target)) return { kind: 'refused', reason: 'PATH_NOT_ALLOWED' };
  return { kind: 'path', path: target };
}

const args = z.object({ target: z.string().min(1).max(2048) }).strict();

export function screenOpenTool(opener: ScreenOpener): ToolDef {
  return {
    name: 'screen.open',
    actionClass: 'read',
    args: 'target: string',
    description: "Open a file, app or link on the user's PC for them. It cannot click or type there.",
    async run(raw) {
      const a = args.safeParse(raw);
      if (!a.success) return { kind: 'error', errorKind: 'VALIDATION' };
      const t = screenTarget(a.data.target);
      if (t.kind === 'refused') return { kind: 'error', errorKind: t.reason };
      if (t.kind === 'url') {
        await opener.openExternal(t.url);
        return { kind: 'ok', result: { opened: t.url } };
      }
      const err = await opener.openPath(t.path);
      return err ? { kind: 'error', errorKind: 'PATH_NOT_ALLOWED' } : { kind: 'ok', result: { opened: t.path } };
    },
  };
}
