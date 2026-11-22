// Spec: 02-3 §F24 (reply in the language and script of the user's last message; ≥ 30 % of letters decides the script),
// 02-3 tone table ("thanks!" → react, send nothing), 04 §4.2 (a reaction is an answer), QA-X-F31 (never raw <say> tags);
// project testing rule 10. Gate 10 (a52aa85) passed steps whose reply was wrong because waitReply only counted bubbles:
// "are you still there?" answered with the earlier sleep tips, "reply OK" answered with a copy of an older answer, a
// settings ask answered twice. This judges the words of the step's own new reply, so a check can no longer pass without
// reading what foo said.
'use strict';

/** A bubble's time line ("9:02 PM") is chrome, not foo's words. */
const TIME_LINE = /^\s*\d{1,2}:\d{2}(\s?[AP]M)?\s*$/i;
/** Raw protocol tags never reach the user (QA-X-F31). */
const RAW_TAGS = /<\/?say\b[^>]*>/i;

/** foo's words in the new reply rows, one row per entry, time lines dropped. */
function replyWords(texts) {
  return texts
    .map((t) =>
      String(t || '')
        .split('\n')
        .filter((l) => !TIME_LINE.test(l))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

/** Share of letters in each script, as 02-3 §F24 counts them (Devanagari, Gurmukhi, everything else). */
function scriptShare(text) {
  const letters = [...String(text)].filter((c) => /\p{L}|\p{M}/u.test(c));
  if (!letters.length) return { deva: 0, guru: 0, latin: 0 };
  const n = (re) => letters.filter((c) => re.test(c)).length / letters.length;
  return { deva: n(/[ऀ-ॿ]/), guru: n(/[਀-੿]/), latin: n(/[A-Za-z]/) };
}

/** The 02-3 §F24 script of a reply: deva or guru at ≥ 30 % of letters, otherwise latin. */
function scriptOf(text) {
  const s = scriptShare(text);
  if (s.deva >= 0.3) return 'deva';
  if (s.guru >= 0.3) return 'guru';
  return 'latin';
}

const re = (src) => new RegExp(src, 'iu');
const norm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Why a step's new reply is wrong, or [] when it is right. Pure, so the unit test feeds it replies.
 * step: replyRe (must match), replyNot (must not match), maxBubbles, maxChars, script ('latin'|'deva'|'guru'),
 *   notEcho (must not repeat an earlier foo reply of this journey), allowReaction (a reaction with no words is an answer).
 * reply: { texts: the new rows' text, reactions: reaction chips on the user's message }.
 * earlier: foo's earlier replies in this journey (words only).
 */
function replyFaults(step, reply, earlier = []) {
  const rows = replyWords(reply.texts || []);
  const words = rows.join('\n');
  const reacted = (reply.reactions || []).length > 0;
  const out = [];
  if (!rows.length) {
    if (step.allowReaction && reacted) return out;
    out.push(step.allowReaction ? 'no reply and no reaction' : 'no reply words');
    return out;
  }
  if (RAW_TAGS.test(words)) out.push('raw <say> tags on screen');
  if (step.replyRe && !re(step.replyRe).test(words)) out.push(`reply does not match /${step.replyRe}/`);
  if (step.replyNot) {
    const m = words.match(re(step.replyNot));
    if (m) out.push(`reply has what must not show: "${m[0].slice(0, 60)}"`);
  }
  if (step.maxBubbles !== undefined && rows.length > step.maxBubbles)
    out.push(`${rows.length} replies where at most ${step.maxBubbles} belong`);
  if (step.maxChars !== undefined && words.length > step.maxChars) out.push(`reply is ${words.length} characters, over ${step.maxChars}`);
  if (step.script && scriptOf(words) !== step.script) out.push(`reply is in ${scriptOf(words)} script, not ${step.script}`);
  if (step.notEcho) {
    const same = earlier.find((e) => e && norm(e) === norm(words));
    if (same) out.push(`reply repeats an earlier answer word for word: "${same.slice(0, 60)}"`);
  }
  return out;
}

module.exports = { replyWords, scriptOf, scriptShare, replyFaults, TIME_LINE, RAW_TAGS };
