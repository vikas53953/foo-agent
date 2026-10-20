// Spec: 02-3 §F28.3 (binding: main applies `deriveAccent` with `webContents.insertCSS()` on window `did-finish-load`, on
// `accent-color-changed` and on a change of `appearance.useWindowsAccent`, removing the previous sheet first, for every foo
// window; off → the sheet is removed and tokens.css brand values apply; a failed `getAccentColor()` keeps the brand indigo),
// 06-2 §6.2 (accent applies instantly to every open window). CR-0021 pick 22.
import { app, systemPreferences, webContents, type WebContents } from 'electron';
import { accentCss, deriveAccent } from '../../shared/accent';
import type { SettingsStore } from '../settings/Settings';
import { isTrustedUrl } from '../windows/protocol';

const inserted = new WeakMap<WebContents, string>();
/** One apply at a time per window, so a quick on → off never orphans a sheet. */
const queue = new WeakMap<WebContents, Promise<void>>();
let wired = false;

/** The sheet for the current setting and Windows accent, or null for the brand values. */
function sheet(settings: SettingsStore): string | null {
  if (!settings.get().appearance.useWindowsAccent) return null;
  let raw: string | boolean;
  try {
    raw = systemPreferences.getAccentColor();
  } catch {
    return null;
  }
  const derived = typeof raw === 'string' ? deriveAccent(raw) : null;
  return derived ? accentCss(derived) : null;
}

function applyTo(wc: WebContents, css: string | null): Promise<void> {
  const next = (queue.get(wc) ?? Promise.resolve()).then(() => swap(wc, css)).catch(() => undefined);
  queue.set(wc, next);
  return next;
}

async function swap(wc: WebContents, css: string | null): Promise<void> {
  if (wc.isDestroyed() || !isTrustedUrl(wc.getURL())) return;
  const prev = inserted.get(wc);
  inserted.delete(wc);
  if (prev) await wc.removeInsertedCSS(prev).catch(() => undefined);
  if (css && !wc.isDestroyed()) inserted.set(wc, await wc.insertCSS(css));
}

function applyAll(settings: SettingsStore): void {
  const css = sheet(settings);
  for (const wc of webContents.getAllWebContents()) void applyTo(wc, css).catch(() => undefined);
}

/** Wires the accent sheet into every foo window, now and later. Safe to call more than once. */
export function applyAccentEverywhere(settings: SettingsStore): void {
  if (wired) return;
  wired = true;
  app.on('web-contents-created', (_e, wc) => {
    wc.on('did-finish-load', () => void applyTo(wc, sheet(settings)).catch(() => undefined));
  });
  for (const wc of webContents.getAllWebContents()) {
    wc.on('did-finish-load', () => void applyTo(wc, sheet(settings)).catch(() => undefined));
  }
  let on = settings.get().appearance.useWindowsAccent;
  settings.onChange((s) => {
    if (s.appearance.useWindowsAccent === on) return;
    on = s.appearance.useWindowsAccent;
    applyAll(settings);
  });
  if (process.platform === 'win32') systemPreferences.on('accent-color-changed', () => applyAll(settings));
}
