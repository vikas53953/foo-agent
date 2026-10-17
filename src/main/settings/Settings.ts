// Spec: 08-0 §A (schema, repair, atomic write), 08-1 §2.2 step 2, 02 F7 X-150 (first-run animation level).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { dirname } from 'node:path';
import { settingsSchema, type Settings } from '../../shared/settings';
import { settingsDefaults } from '../../shared/settingsDefaults';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keeps every valid value from `raw`, falls back to the default for each invalid or missing key, drops unknown keys. */
export function repair(raw: unknown): { settings: Settings; repaired: string[] } {
  const repaired: string[] = [];
  const walk = (def: unknown, value: unknown, schema: unknown, path: string): unknown => {
    const s = schema as { shape?: Record<string, unknown>; safeParse: (v: unknown) => { success: boolean } };
    if (s.shape && isObject(def)) {
      const src = isObject(value) ? value : {};
      if (!isObject(value) && value !== undefined) repaired.push(path);
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(s.shape)) {
        const v = walk(def[key], src[key], s.shape[key], path ? `${path}.${key}` : key);
        if (v !== undefined) out[key] = v;
      }
      return out;
    }
    if (value === undefined) return def;
    if (s.safeParse(value).success) return value;
    repaired.push(path);
    return def;
  };
  const settings = settingsSchema.parse(walk(settingsDefaults, raw, settingsSchema, ''));
  return { settings, repaired };
}

export function firstRunDefaults(): Settings {
  const lowEnd = cpus().length <= 4 || totalmem() < 8 * 1024 ** 3;
  return { ...settingsDefaults, appearance: { ...settingsDefaults.appearance, animations: lowEnd ? 'basic' : 'full' } };
}

export class SettingsStore {
  private current: Settings;

  constructor(private readonly file: string) {
    if (!existsSync(file)) {
      this.current = firstRunDefaults();
      this.write();
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      raw = {};
    }
    const { settings, repaired } = repair(raw);
    this.current = settings;
    if (repaired.length > 0) {
      console.warn('settings.repaired', repaired);
      this.write();
    }
  }

  get(): Settings {
    return this.current;
  }

  update(patch: (s: Settings) => Settings): void {
    this.current = settingsSchema.parse(patch(this.current));
    this.write();
  }

  /** Atomic: write a temp file, then rename over the old one. */
  private write(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.current, null, 2));
    renameSync(tmp, this.file);
  }
}
