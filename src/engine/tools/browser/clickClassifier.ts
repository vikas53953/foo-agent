// Spec: 08-2 §8.2.1 (click classification: a `browser.click` is `read` unless the snapshot marks the target as a commit control,
// a button/link/input whose accessible name or nearby text matches the commit regex (+ the Hindi equivalents of 5.3.1) inside a
// form, or whose form has payment/password fields; commit clicks are refused with USE_SUBMIT and go through `browser.submit`),
// §8.3.5 (a `confirm()` dialog is treated as a commit control; actions.ts refuses the click that raised it), §9.2 (`browser.click`
// non-commit is `read`). The facts are gathered in the page (walker.ts); the decision is made here, in the engine, never in the page.

/** What the page tells the engine about one element (walker.ts `factsOf`). */
export interface ElementFacts {
  tag: string;
  /** `type` attribute of an input or button, lower case ('' when none). */
  type: string;
  /** ARIA role (explicit or implicit), '' when none. */
  role: string;
  /** Accessible name. */
  name: string;
  /** Text around the control (its label's container), ≤ 160 chars. */
  nearbyText: string;
  inForm: boolean;
  /** The element's form has a password or payment field (the masked-at-source rules of §8.3.4). */
  formHasSensitive: boolean;
}

/** 08-2 §8.2.1, exactly as written (no word boundaries: "Book table" and "Facebook" both match; refusing more is the safe side). */
const COMMIT_LATIN = /(pay|place order|book|confirm|reserve|purchase|buy|send|post|submit|delete|cancel (booking|reservation)|complete|checkout now)/i;
/** The 5.3.1 lexicon's romanised forms of the commit verbs (book, buy, pay, send, post, delete), as whole words. */
const COMMIT_ROMAN =
  /\b(?:book karo|book kar do|buk|kharid\w*|khareed\w*|mangwa\w*|order karo|pay karo|pay kar do|bhar do|bharo|bhej|bhejo|bhej do|post karo|hata do|mita do|delete karo)\b/iu;
/**
 * The 5.3.1 Devanagari and Gurmukhi forms. On a button the verb carries an ending ("भेजें", "ਮਿਟਾਓ"), so the stem is matched
 * with a left boundary only (`(?<![\p{L}\p{M}])`, JS `\b` does not see Indic letters).
 */
const COMMIT_INDIC = /(?<![\p{L}\p{M}])(?:बुक|ਬੁੱਕ|खरीद|ਖਰੀਦ|भुगतान|ਭੁਗਤਾਨ|भेज|ਭੇਜ|डालो|हटाओ|ਮਿਟਾ)/u;

export function isCommitText(text: string): boolean {
  return COMMIT_LATIN.test(text) || COMMIT_ROMAN.test(text) || COMMIT_INDIC.test(text);
}

const CONTROL_ROLES = new Set(['button', 'link', 'menuitem', 'option', 'tab', 'checkbox', 'radio', 'switch']);
const INPUT_CONTROLS = new Set(['submit', 'button', 'image', 'reset']);

/** "a button/link/input": the elements a click can commit through. */
function isControl(f: ElementFacts): boolean {
  if (f.tag === 'button' || f.tag === 'a') return true;
  if (f.tag === 'input') return INPUT_CONTROLS.has(f.type);
  return CONTROL_ROLES.has(f.role);
}

export type ClickClass = 'read' | 'commit';

export function classify(f: ElementFacts): ClickClass {
  if (!isControl(f) || !f.inForm) return 'read';
  if (f.formHasSensitive) return 'commit';
  return isCommitText(f.name) || isCommitText(f.nearbyText) ? 'commit' : 'read';
}
