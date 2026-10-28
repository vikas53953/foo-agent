// Spec: CR-0069 (X-226): the cheap word checks that decide when intake gets a second look at its kind while a feature is
// off. A `memory` answer to a message with no remember, note or forget word (English, Hinglish, Hindi, Punjabi) is likely a
// mislabel (QA-X-F30: "Switch to dark mode" after a memory ask); a `reply` to a message that names a task while jobs are off
// is likely one too (QA-X-F32: "Book a table…" answered in words). The words only pick the turns worth a second look; the AI
// decides the kind both times.

const REMEMBER = /\b(remember|note|noted|forget|forgot|save|keep in mind|memori[sz]e)\b|yaad|bhool|bhul|bhoolna|याद|भूल|नोट|ਯਾਦ|ਭੁੱਲ|ਨੋਟ/iu;
const TASK =
  /\b(book|booking|order|buy|purchase|pay|send|email|reserve|reservation|cancel|schedule|transfer)\b|bhej|mangwa|kharid|बुक|भेज|खरीद|मंगवा|ऑर्डर|ਬੁੱਕ|ਭੇਜ|ਖਰੀਦ/iu;

/** Whether the message itself asks to remember, note or forget something. */
export function asksToRemember(text: string): boolean {
  return REMEMBER.test(text);
}

/** Whether the message names a task (booking, buying, sending, paying). */
export function namesTask(text: string): boolean {
  return TASK.test(text);
}
