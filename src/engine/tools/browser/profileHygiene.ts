// Spec: 01-articles Art. 8 and 10-acceptance-2 §D ART-08a (a site password or card number the person types in foo's browser is
// in no file foo wrote, the browser profile included), 08-2 §8.3.1 (the persistent profile `{DATA}\browser\profile\`; its
// launch arguments are unchanged). CR-0034: Chromium kept typed form values in the profile: each tab's form state in
// `Sessions/Session_*` and closed tabs in `Sessions/Tabs_*` (saved on a 2.5 s timer), typed text in autocomplete (`Web Data`),
// and GET form values in `History` and the HTTP cache. Sign-ins (cookies) stay; everything else that can hold a typed value
// is turned off before launch, or blocked, or wiped before launch and after close.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Folders Chromium cannot create when a plain file holds the name: it then saves no session files and keeps no disk cache. */
export const BLOCKED_DIRS = ['Sessions', 'Cache'] as const;

/** Wiped before launch and after close: session storage, the pre-M86 session files, and Chromium's crash dumps. */
export const WIPED_PATHS = [
  'Default/Session Storage',
  'Default/Current Session',
  'Default/Current Tabs',
  'Default/Last Session',
  'Default/Last Tabs',
  'Crashpad',
] as const;

/** Profile preferences that stop Chromium saving typed values: passwords, autocomplete, addresses, cards and history. */
export const PROFILE_PREFS = {
  credentials_enable_service: false,
  profile: { password_manager_enabled: false },
  autofill: { enabled: false, profile_enabled: false, credit_card_enabled: false },
  history: { saving_disabled: true },
} as const;

type Json = Record<string, unknown>;

function merge(into: Json, from: Json): Json {
  for (const [k, v] of Object.entries(from)) {
    const have = into[k];
    into[k] = v && typeof v === 'object' && have && typeof have === 'object' && !Array.isArray(have) ? merge(have as Json, v as Json) : v;
  }
  return into;
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Wipes what can hold a typed value; a session or cache folder left by an older foo becomes the blocking file. */
export function scrubProfile(userDataDir: string): void {
  const profile = join(userDataDir, 'Default');
  for (const p of WIPED_PATHS) rmSync(join(userDataDir, p), { recursive: true, force: true });
  if (!existsSync(profile)) return;
  for (const name of BLOCKED_DIRS) {
    const path = join(profile, name);
    if (isDir(path)) rmSync(path, { recursive: true, force: true });
    if (!existsSync(path)) writeFileSync(path, '');
  }
}

/** Before launch: the scrub above, then the preferences merged into `Default/Preferences` (Chromium keeps other keys). */
export function prepareProfile(userDataDir: string): void {
  const profile = join(userDataDir, 'Default');
  mkdirSync(profile, { recursive: true });
  scrubProfile(userDataDir);
  const file = join(profile, 'Preferences');
  let prefs: Json = {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) prefs = parsed as Json;
  } catch {
    // Missing or unreadable: Chromium would start from defaults too.
  }
  writeFileSync(`${file}.foo-tmp`, JSON.stringify(merge(prefs, structuredClone(PROFILE_PREFS) as Json)));
  renameSync(`${file}.foo-tmp`, file);
}
