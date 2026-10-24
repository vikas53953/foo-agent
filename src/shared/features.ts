// Spec: CR-0054 (DECISIONS X-211, feature batches): every spec feature has an id and a batch; a build switches on the ids in
// `resources/features.json` and hides the rest (no entry point shows, and an ask for one gets one fixed line). FOO_FEATURES
// overrides the file ("all", "shipped" or a comma list); a FOO_TEST run and a build with no file switch everything on.
// The batches and their order are the feature menu Vikas picks from each Monday.

/** Every feature, in menu order (batch 1 first). */
export const FEATURES = [
  { id: 'install', batch: 1 },
  { id: 'ai', batch: 1 },
  { id: 'name', batch: 1 },
  { id: 'chat', batch: 1 },
  { id: 'settings', batch: 1 },
  { id: 'choice', batch: 2 },
  { id: 'jobs', batch: 2 },
  { id: 'live', batch: 2 },
  { id: 'errors', batch: 2 },
  { id: 'spend', batch: 2 },
  { id: 'memory', batch: 3 },
  { id: 'web', batch: 3 },
  { id: 'pages', batch: 3 },
  { id: 'signin', batch: 3 },
  { id: 'restaurant', batch: 3 },
  { id: 'connections', batch: 4 },
  { id: 'drafts', batch: 4 },
  { id: 'helpers', batch: 4 },
  { id: 'groups', batch: 4 },
  { id: 'catch_up', batch: 4 },
  { id: 'brief', batch: 5 },
  { id: 'routines', batch: 5 },
  { id: 'notify', batch: 5 },
  { id: 'voice', batch: 5 },
  { id: 'search', batch: 5 },
  { id: 'bills', batch: 6 },
  { id: 'hotel', batch: 6 },
  { id: 'recharges', batch: 6 },
  { id: 'trains', batch: 6 },
  { id: 'photos', batch: 6 },
  { id: 'ideas', batch: 7 },
  { id: 'send_to', batch: 7 },
  { id: 'private', batch: 7 },
  { id: 'data', batch: 7 },
] as const;

export type FeatureId = (typeof FEATURES)[number]['id'];

export const FEATURE_IDS: readonly FeatureId[] = FEATURES.map((f) => f.id);

const isFeatureId = (v: unknown): v is FeatureId => typeof v === 'string' && (FEATURE_IDS as readonly string[]).includes(v);

/** `{ "on": [ids] }`; null when the text is not that shape or names an unknown id. */
export function parseFeatureFile(text: string): FeatureId[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const on = (raw as { on?: unknown } | null)?.on;
  if (!Array.isArray(on) || !on.every(isFeatureId)) return null;
  return FEATURE_IDS.filter((id) => on.includes(id));
}

/** The switched-on ids, in menu order. `readFile` gives `resources/features.json`, or null when there is none. */
export function resolveFeatures(env: Record<string, string | undefined>, testRun: boolean, readFile: () => string | null): FeatureId[] {
  const pick = env.FOO_FEATURES?.trim();
  if (pick === 'all') return [...FEATURE_IDS];
  if (pick && pick !== 'shipped') {
    const ids = pick.split(',').map((s) => s.trim());
    return FEATURE_IDS.filter((id) => ids.includes(id));
  }
  if (testRun && pick !== 'shipped') return [...FEATURE_IDS];
  const text = readFile();
  if (text === null) return [...FEATURE_IDS];
  // A broken file must not hide everything: it switches only batch 1 on.
  return parseFeatureFile(text) ?? FEATURES.filter((f) => f.batch === 1).map((f) => f.id);
}
