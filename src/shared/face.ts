// Spec: 02-2 §F15.5 (glyph faces: helper colour fill, symbol in --on-helper, stored with U+FE0E), 06-1 §2.3 Card 2b (tiles
// 2–4 first show ✿ terracotta, ◐ green, ★ violet; "Surprise me" redraws from the glyph pool × helper palette; Narrator
// "Face {n} of 4, {glyph name} on {colour name}"). CR-0016 pick G-M12-16 fixes the pool. `Mood` (02-2 §F15.9.3) is added
// here by the LF ticket (merge decision A).

/** The 12 text-presentation glyphs; `name` is the copy key suffix under `setup.face.glyph.*`. */
export const GLYPH_POOL = [
  { glyph: '✿', name: 'flower' },
  { glyph: '◐', name: 'half_moon' },
  { glyph: '★', name: 'star' },
  { glyph: '✈', name: 'plane' },
  { glyph: '☀', name: 'sun' },
  { glyph: '☂', name: 'umbrella' },
  { glyph: '♪', name: 'note' },
  { glyph: '✦', name: 'spark' },
  { glyph: '☘', name: 'clover' },
  { glyph: '⚑', name: 'flag' },
  { glyph: '✎', name: 'pencil' },
  { glyph: '♥', name: 'heart' },
] as const;

/** The ten 02 F2 helper colours in order; `name` is the copy key suffix under `setup.face.colour.*`. */
export const HELPER_COLOURS = ['terracotta', 'green', 'violet', 'raspberry', 'steel', 'teal', 'brown', 'slate', 'purple', 'ochre'] as const;
export type HelperColour = (typeof HELPER_COLOURS)[number];

/** Text presentation selector (02-2 §F15.5 type 2). */
export const TEXT_PRESENTATION = '︎';

/** 06-1 §2.3: tiles 2–4 on first showing, so the first screen matches the walkthrough. */
export const FIRST_TILES: readonly { glyph: string; colour: HelperColour }[] = [
  { glyph: '✿', colour: 'terracotta' },
  { glyph: '◐', colour: 'green' },
  { glyph: '★', colour: 'violet' },
];

/** `glyph:{emoji}` FaceRef for a pool glyph (08-0 §E.7), stored with U+FE0E. */
export function glyphFaceRef(glyph: string): string {
  return `glyph:${glyph}${TEXT_PRESENTATION}`;
}
