// Spec: 08-2 §7.3 (reply envelope FOO/1: <say>…</say> then <act>{JSON}</act>; <act> parsed with zod, unknown fields
// rejected), §7.5 (missing or invalid <act> → one repair turn with repair.md), 08-4 §25.5 item 1 (untagged text: no <say> tag
// → everything before the first <act>, or the whole reply, is the say; text between </say> and <act> or after </act> is
// dropped and logged PROTOCOL_STRAY_TEXT), 08-4 §24.8 ({zodIssues} = zod issue messages joined by "; ", cut to 400 chars),
// 08-4 §25.2/§25.4 (the act schema per purpose).
import type { z } from 'zod';
import type { AiPurpose } from '../ai/types';
import { IntakeActSchema, RewriteActSchema, SecondLookActSchema, StepActSchema, StuckActSchema } from '../../shared/schemas';
import type { LogFn } from '../redact/Redactor';

export interface Envelope {
  /** The `<say>` text, or the untagged text (§25.5 item 1). */
  say: string;
  /** Whether a `<say>` tag was present. */
  sayTagged: boolean;
  /** The raw text inside `<act>`, or null when there is no `<act>`. */
  actRaw: string | null;
  /** The parsed JSON of `<act>`; undefined when missing or not JSON (see `actError`). */
  act: unknown;
  /** Why `<act>` could not be read: missing, or not JSON. */
  actError: string | null;
  /** Characters dropped as stray text (outside the two blocks). */
  strayChars: number;
}

const SAY_OPEN = '<say>';
const SAY_CLOSE = '</say>';
const ACT_OPEN = '<act>';
const ACT_CLOSE = '</act>';

/**
 * Parses a whole FOO/1 reply (08-2 §7.3, 08-4 §25.5 item 1). Stray text is dropped; when `log` is given it writes
 * `PROTOCOL_STRAY_TEXT` with the number of characters (never the text).
 */
export function parseEnvelope(text: string, opts: { log?: LogFn } = {}): Envelope {
  const actStart = text.indexOf(ACT_OPEN);
  const sayStart = text.indexOf(SAY_OPEN);
  let say: string;
  let sayTagged = false;
  const stray: string[] = [];
  let afterSay: number;

  if (sayStart !== -1 && (actStart === -1 || sayStart < actStart)) {
    sayTagged = true;
    stray.push(text.slice(0, sayStart));
    const bodyStart = sayStart + SAY_OPEN.length;
    const close = text.indexOf(SAY_CLOSE, bodyStart);
    const sayEnd = close !== -1 && (actStart === -1 || close < actStart) ? close : actStart !== -1 ? actStart : text.length;
    say = text.slice(bodyStart, sayEnd);
    afterSay = sayEnd === close ? close + SAY_CLOSE.length : sayEnd;
  } else {
    say = actStart === -1 ? text : text.slice(0, actStart);
    afterSay = actStart === -1 ? text.length : actStart;
  }

  let actRaw: string | null = null;
  let act: unknown = undefined;
  let actError: string | null = null;
  if (actStart === -1) {
    actError = 'There is no <act> block.';
    stray.push(text.slice(afterSay));
  } else {
    stray.push(text.slice(afterSay, actStart));
    const bodyStart = actStart + ACT_OPEN.length;
    const close = text.indexOf(ACT_CLOSE, bodyStart);
    actRaw = text.slice(bodyStart, close === -1 ? text.length : close).trim();
    if (close !== -1) stray.push(text.slice(close + ACT_CLOSE.length));
    try {
      act = JSON.parse(actRaw);
    } catch {
      actError = 'The <act> block is not one JSON object.';
    }
  }

  const strayChars = stray.reduce((n, s) => n + s.trim().length, 0);
  if (strayChars > 0) opts.log?.('PROTOCOL_STRAY_TEXT', { chars: strayChars });
  return { say: sayTagged ? say : say.trim(), sayTagged, actRaw, act, actError, strayChars };
}

/** Purposes whose `<act>` schema exists in M3 (others arrive with their milestone). */
const SCHEMAS: Partial<Record<AiPurpose, z.ZodType>> = {
  intake: IntakeActSchema,
  step: StepActSchema, // M4
  second_look: SecondLookActSchema,
  rewrite: RewriteActSchema,
  classify: StuckActSchema,
};

/** The zod schema of a purpose's `<act>`, or undefined when M3 has none. */
export function actSchemaFor(purpose: AiPurpose): z.ZodType | undefined {
  return SCHEMAS[purpose];
}

/** 08-4 §24.8 `{zodIssues}`: issue messages joined by "; ", cut to 400 chars. */
export function formatIssues(messages: readonly string[]): string {
  return messages.join('; ').slice(0, 400);
}

export type ActCheck<T = unknown> = { ok: true; act: T } | { ok: false; issues: string };

/**
 * Validates a parsed `<act>` against the purpose's strict zod schema (08-2 §7.3). On failure `issues` is ready for
 * repair.md's `{zodIssues}`. A purpose with no schema yet fails with a fixed issue line.
 */
export function validateAct(purpose: AiPurpose, act: unknown): ActCheck {
  const schema = SCHEMAS[purpose];
  if (!schema) return { ok: false, issues: formatIssues([`No act schema for purpose ${purpose}`]) };
  if (act === undefined) return { ok: false, issues: formatIssues(['The <act> block is missing or is not JSON']) };
  const r = schema.safeParse(act);
  return r.success ? { ok: true, act: r.data } : { ok: false, issues: formatIssues(r.error.issues.map((i) => i.message)) };
}
