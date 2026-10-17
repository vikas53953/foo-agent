import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(p) ? [p] : [];
  });
}

export const read = (p: string) => readFileSync(p, 'utf8');

/** Every user-visible string foo ships (M0: the copy file). Later milestones add tray, toasts, installer strings. */
export function uiStrings(): { key: string; text: string }[] {
  const copy = JSON.parse(read('src/shared/copy/en-IN.json')) as Record<string, string>;
  return Object.entries(copy).map(([key, text]) => ({ key, text }));
}
