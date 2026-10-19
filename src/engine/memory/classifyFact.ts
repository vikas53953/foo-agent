// Spec: 08-3 §12.4 last paragraph (manual add: one `classify` turn whose `<act>` is `{ category: MemoryCategory; kind:
// MemoryKind; person?: string }` (strict); on any AI failure or offline → kind `fact`, category `other`), §12.4 (`kind='person'`
// needs `person`; category from the closed list), CR-0010 G-M6-03 (chat "remember …" takes the same path).
// 08-4 §24 has no prompt file for this turn yet (only `stuck.md` for purpose `classify`), so the engine passes no turn and every
// add takes the fallback until a CR adds the prompt (implementation-notes.md, M6 T3).
import { z } from 'zod';
import type { MemoryCategory, MemoryKind } from '../../shared/types';
import { MEMORY_CATEGORIES, MEMORY_KINDS } from './fileFormat';

export const classifyFactActSchema = z
  .object({
    category: z.enum(MEMORY_CATEGORIES as [MemoryCategory, ...MemoryCategory[]]),
    kind: z.enum(MEMORY_KINDS as [MemoryKind, ...MemoryKind[]]),
    person: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export interface FactClass {
  category: MemoryCategory;
  kind: MemoryKind;
  person?: string;
}

export const FACT_CLASS_FALLBACK: FactClass = { category: 'other', kind: 'fact' };

/** One classify turn: the `<act>` value it returned, or null when the turn failed. */
export type ClassifyTurn = (text: string) => Promise<unknown>;

export async function classifyFact(text: string, turn: ClassifyTurn | null): Promise<FactClass> {
  if (!turn) return FACT_CLASS_FALLBACK;
  const act = await turn(text).catch(() => null);
  const parsed = classifyFactActSchema.safeParse(act);
  if (!parsed.success) return FACT_CLASS_FALLBACK;
  const { category, kind, person } = parsed.data;
  if (kind === 'person' && !person) return FACT_CLASS_FALLBACK;
  return person ? { category, kind, person } : { category, kind };
}
