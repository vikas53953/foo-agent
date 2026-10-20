// Spec: 08-2 §8.2 `web.browseCloud` (only when connections.web.cloudBrowser is on, the domain is not a hand-back domain, the job
// holds no sign-in, saved login, card, personal field or approval for that domain, and the goal is reading: find, compare, list;
// anything that would type, sign in, book, buy, pay, send or post → USE_EDGE), §8.3.12 d (IRCTC, bill and biller sites, and any
// site the job is signed in to always use foo's Edge), AT-141.

/** A goal that acts rather than reads (English, plus the Hindi verbs of the lexicon's do-words). */
const ACTING_GOAL =
  /\b(?:type|enter|fill|sign[\s-]?(?:in|up)|log[\s-]?in|login|register|book|reserve|buy|purchase|order|pay|checkout|send|post|submit|confirm|delete|cancel|subscribe|apply|upload)\b|बुक|खरीद|भुगतान|भेज|पोस्ट|ऑर्डर/iu;

export function goalActs(goal: string): boolean {
  return ACTING_GOAL.test(goal);
}

export function hostMatches(host: string, domain: string): boolean {
  const d = domain.toLowerCase().replace(/^\.+/, '');
  const h = host.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

export function isIrctc(url: URL): boolean {
  return hostMatches(url.hostname, 'irctc.co.in');
}
