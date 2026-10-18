// Spec: 06-1 §2.0 (a typed answer answers the current setup card exactly like a tap), §2.4 ("8 is fine" → "8:00 AM"),
// 08-4 §26.6 (Choice typed-answer rules). CR-0016 pick G-M12-13: one pure module per card kind so no two tickets edit one
// file — `name.ts` is T4's, `choice.ts` and `apps.ts` are T5's. This file holds only the shared signatures.
import type { SetupApp } from '../types';

/** What a typed message does while a setup card is open. */
export type TypedAnswer<T> = { kind: 'answer'; value: T } | { kind: 'message' };

/** Card 2a: text ≤ 20 graphemes with a letter and no do-verb is the name; anything else is a message (rule 4). */
export type ParseNameAnswer = (text: string) => TypedAnswer<string>;
/** Card C: §26.6 rule 6 against the chip labels; "none" is the exclusive chip. */
export type ParseAppsAnswer = (text: string) => TypedAnswer<SetupApp[] | 'none'>;
/** Interview Choice cards: §26.6 exactly, plus Card G's clock-time match (one option's hour). Value = option index. */
export type ParseChoiceAnswer = (text: string, options: readonly string[], card?: 'G') => TypedAnswer<number>;

/** 06-1 line 79 / GEM §9.6 (G-M12-14): typed outside setup, this runs step 3 only, with no AI call. */
export const INTERVIEW_ME = /^(interview me|set me up)[.!]*$/i;
