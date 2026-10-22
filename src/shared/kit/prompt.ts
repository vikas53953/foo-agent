// Spec: 08 engine (CR-0022 §(b) "08 engine": the system prompt carries the catalog generated from the zod schemas and the
// visuals level), pick 2 (generated, never hand-written), pick 8 (Balanced is the default; Mostly words = no kit pieces and
// no AI pages unless the user asks), 06-2 §6.2 "Visuals", 08-0 §A `appearance.visuals`, X-180. CR-0046 AT-442, X-204: each
// line names the limits the checker uses (text length, list counts, the input-name pattern), and the section says to use
// only the keys shown.
// Prompt text is for the AI, not UI words, so it is not in en-IN.json (08-4 §24.0 keeps prompts out of copy too).
import { z } from 'zod';
import type { Visuals } from '../settings';
import { CATALOG_ID, FOO_PARTS, STANDARD_PARTS } from './catalog';

type Json = { [k: string]: unknown };

/** A list's item count: `2–3`, `≤12` or `≥1`. */
function count(s: Json): string {
  const min = typeof s.minItems === 'number' && s.minItems > 0 ? s.minItems : undefined;
  const max = typeof s.maxItems === 'number' ? s.maxItems : undefined;
  if (min !== undefined && max !== undefined) return ` ${min}–${max}`;
  if (max !== undefined) return ` ≤${max}`;
  return min !== undefined ? ` ≥${min}` : '';
}

/** A JSON Schema node as one short type line: `{a: string ≤80, b?: "x"|"y", c: [{…}] 1–3}`. */
function typeLine(s: Json): string {
  if ('const' in s) return JSON.stringify(s.const);
  if (Array.isArray(s.enum)) return (s.enum as unknown[]).map((v) => JSON.stringify(v)).join('|');
  const any = (s.anyOf ?? s.oneOf) as Json[] | undefined;
  if (any) return any.map(typeLine).join(' or ');
  if (s.type === 'array') {
    return `[${typeLine((s.items ?? {}) as Json)}]${count(s)}`;
  }
  if (s.type === 'object' && s.properties) {
    const req = new Set((s.required as string[] | undefined) ?? []);
    const props = Object.entries(s.properties as Record<string, Json>).map(([k, v]) => `${k}${req.has(k) ? '' : '?'}: ${typeLine(v)}`);
    return `{${props.join(', ')}}`;
  }
  if (s.type === 'object') return '{…}';
  if ((s.type === 'integer' || s.type === 'number') && typeof s.minimum === 'number' && typeof s.maximum === 'number' && s.maximum < 1e6) {
    return `${s.type} ${s.minimum}–${s.maximum}`;
  }
  if (s.type === 'string') {
    const pattern = typeof s.pattern === 'string' && !s.pattern.startsWith('^(data:') ? ` matching ${s.pattern}` : '';
    return `string${pattern}${typeof s.maxLength === 'number' ? ` ≤${s.maxLength}` : ''}`;
  }
  return typeof s.type === 'string' ? s.type : 'any';
}

/** One catalog line per component: `Name {props} — what it is for`. `id`, `component` and `weight` are left out. */
function componentLine(p: z.ZodObject): string {
  const schema = z.toJSONSchema(p, { target: 'draft-7', unrepresentable: 'any' }) as Json;
  const props = { ...(schema.properties as Record<string, Json>) };
  const name = (props.component as Json).const as string;
  delete props.id;
  delete props.component;
  delete props.weight;
  const shape = typeLine({ ...schema, properties: props });
  return `- ${name} ${shape} — ${p.description ?? ''}`;
}

/** The catalog lines, generated once (the schemas do not change at run time). */
let catalogLines: string | undefined;
export function catalogText(): string {
  catalogLines ??= [...STANDARD_PARTS, ...FOO_PARTS].map((p) => componentLine(p as unknown as z.ZodObject)).join('\n');
  return catalogLines;
}

const LEVEL: Record<Visuals, string> = {
  words:
    'The user chose "Mostly words": answer in words and tables. Do not write ```a2ui or ```page blocks unless the user asks for a chart, map, picture or tool in this message.',
  balanced:
    'Use an ```a2ui block only when a picture helps more than words (numbers over time, places, choices side by side, a quick sum). Most replies need none.',
  visuals: 'The user chose "Show me visuals": when an answer has numbers, places, times or options, show them with an ```a2ui block.',
};

/** The kit section of intake part 4 (after the suggestions line). */
export function kitPromptSection(level: Visuals): string {
  if (level === 'words') return LEVEL.words;
  return [
    'Rich replies. Besides the formatting above, inside <say> you may add pieces the app draws itself:',
    `- An \`\`\`a2ui block: A2UI v0.9.1 messages, one JSON object per line, catalogId "${CATALOG_ID}". First {"createSurface":{"surfaceId":"s1","catalogId":"${CATALOG_ID}"}}, then {"updateComponents":{"surfaceId":"s1","components":[…]}} with exactly one component whose id is "root", then {"updateDataModel":{"surfaceId":"s1","path":"/x","value":…}} when values bind to {"path":"/x"}. Children are lists of ids.`,
    '- A ```page block: one small HTML page (no network, no forms, no links that open by themselves; under 512 KB). Only when no piece fits or the user asks for a tool.',
    'Words still come first and must make sense alone. Buttons that send, book, pay, delete or share ask the user first, as everything else does. Never ask for passwords, codes, card numbers or keys in a form.',
    LEVEL[level],
    'Components: (≤N is the most characters or items; N–M is how many items, or the range of a number)',
    'Use only the keys shown (? marks optional ones); leave an optional key out instead of writing null.',
    catalogText(),
  ].join('\n');
}
