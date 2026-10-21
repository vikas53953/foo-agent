// Spec: 06-1 §2.3 Card 2a ("Surprise me" fills the name from a built-in list of short friendly names, no repeat within the
// session) and Card 2b (tiles 2–4 are glyph faces from the 02 §F15.5 pool on the 02 helper palette; the first showing is
// ✿ on terracotta, ◐ on green, ★ on violet; "Surprise me" never repeats a glyph/colour pair on screen). CR-0026 pick 4: the
// list holds 100 names, not 200.
export const SURPRISE_NAMES = [
  'Jarvis',
  'Sunny',
  'Pixel',
  'Nova',
  'Milo',
  'Kiwi',
  'Juno',
  'Bolt',
  'Echo',
  'Ziggy',
  'Coco',
  'Buddy',
  'Rafi',
  'Tara',
  'Neel',
  'Kavi',
  'Mira',
  'Ravi',
  'Asha',
  'Dev',
  'Leo',
  'Luna',
  'Max',
  'Ollie',
  'Pip',
  'Remy',
  'Sky',
  'Tiki',
  'Uma',
  'Vik',
  'Wren',
  'Yuki',
  'Zara',
  'Bodhi',
  'Chiku',
  'Dhruv',
  'Ella',
  'Fizz',
  'Gogo',
  'Hari',
  'Indi',
  'Jojo',
  'Kai',
  'Lumi',
  'Moksh',
  'Noor',
  'Ojas',
  'Pari',
  'Queeny',
  'Rumi',
  'Sona',
  'Tenzin',
  'Ujjwal',
  'Vayu',
  'Wally',
  'Xena',
  'Yash',
  'Zen',
  'Appu',
  'Bunty',
  'Champ',
  'Dino',
  'Eeshu',
  'Fable',
  'Guddu',
  'Honey',
  'Ishu',
  'Jugnu',
  'Kittu',
  'Laddoo',
  'Mintu',
  'Nemo',
  'Oscar',
  'Pinku',
  'Quill',
  'Rocky',
  'Sparky',
  'Tuffy',
  'Uday',
  'Vinny',
  'Whiz',
  'Yoyo',
  'Zippy',
  'Arya',
  'Bella',
  'Cleo',
  'Dash',
  'Ember',
  'Finn',
  'Gizmo',
  'Hazel',
  'Iggy',
  'Jazz',
  'Koko',
  'Lexi',
  'Mango',
  'Nimbu',
  'Orbit',
  'Peppy',
  'Robo',
] as const;

/** Glyph faces (§F15.5 type 2), stored with U+FE0E so Windows draws them monochrome. `id` names the copy key. */
export const FACE_GLYPHS = [
  { glyph: '✿', id: 'flower' },
  { glyph: '◐', id: 'half_moon' },
  { glyph: '★', id: 'star' },
  { glyph: '✈', id: 'plane' },
  { glyph: '☀', id: 'sun' },
  { glyph: '♪', id: 'note' },
  { glyph: '☂', id: 'umbrella' },
  { glyph: '◆', id: 'diamond' },
] as const;

/** The 02 helper palette tokens a glyph tile sits on. `id` names the copy key. */
export const FACE_COLOURS = [
  { token: '--h-terracotta', id: 'terracotta' },
  { token: '--h-green', id: 'green' },
  { token: '--h-violet', id: 'violet' },
  { token: '--h-teal', id: 'teal' },
  { token: '--h-raspberry', id: 'raspberry' },
  { token: '--h-ochre', id: 'ochre' },
] as const;

export interface GlyphTile {
  glyph: (typeof FACE_GLYPHS)[number];
  colour: (typeof FACE_COLOURS)[number];
}

/** Tiles 2–4 on first showing (06-1 §2.3, matches the walkthrough). */
export const FIRST_TILES: GlyphTile[] = [
  { glyph: FACE_GLYPHS[0], colour: FACE_COLOURS[0] },
  { glyph: FACE_GLYPHS[1], colour: FACE_COLOURS[1] },
  { glyph: FACE_GLYPHS[2], colour: FACE_COLOURS[2] },
];

/** "Surprise me": three new pairs, none equal to a pair on screen, no two with the same glyph. */
export function surpriseTiles(shown: GlyphTile[], rand: () => number = Math.random): GlyphTile[] {
  const key = (t: GlyphTile) => `${t.glyph.id}|${t.colour.id}`;
  const taken = new Set(shown.map(key));
  const out: GlyphTile[] = [];
  for (let guard = 0; out.length < 3 && guard < 500; guard++) {
    const tile = {
      glyph: FACE_GLYPHS[Math.floor(rand() * FACE_GLYPHS.length)]!,
      colour: FACE_COLOURS[Math.floor(rand() * FACE_COLOURS.length)]!,
    };
    if (taken.has(key(tile)) || out.some((o) => o.glyph.id === tile.glyph.id)) continue;
    out.push(tile);
  }
  return out.length === 3 ? out : shown;
}

/** "Surprise me" for the name: a name not yet offered this session. */
export function surpriseName(offered: Set<string>, rand: () => number = Math.random): string {
  const left = SURPRISE_NAMES.filter((n) => !offered.has(n));
  const pool = left.length ? left : SURPRISE_NAMES;
  return pool[Math.floor(rand() * pool.length)]!;
}

/** The FaceRef a glyph tile stores (08-0 §E.7 `glyph:{emoji}`; U+FE0E text presentation). */
export const glyphRef = (t: GlyphTile) => `glyph:${t.glyph.glyph}︎`;
