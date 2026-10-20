// Spec: 08-1 §3.2 `app:openExternal` rules (only `https:`; target `handback_site` — `url` for which `handback.check(url)` is
// true (08-4 §27.4, the one matcher in src/shared/handback.ts, 08-0 §E.9, X-129), and only with the `cardId` + `nonce` of the
// card that offers it; anything else → URL_NOT_ALLOWED), 08-2 §8.3.10 (the hand-back card's [ Open {site} ] opens the page in
// the user's default browser, not foo's window), AT-142. No Electron here: aiFinderIpc.ts's one `app:openExternal` handler
// calls this with `shell.openExternal` (FOO_TEST runs record the address instead).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type Result } from '../../shared/errors';
import { createHandback, handbackSitesSchema, type HostMatcher } from '../../shared/handback';
import type { Db } from '../store/db';

export function loadHandback(resourcesDir: string): HostMatcher {
  return createHandback(handbackSitesSchema.parse(JSON.parse(readFileSync(join(resourcesDir, 'handback-sites.json'), 'utf8'))));
}

interface CardLite {
  type: string;
  nonce: string;
  payload: string;
}

/** Checks the request against 08-1 §3.2 and the card that offered it; opens the page only when every rule holds. */
export async function openExternalHandback(
  db: Db,
  handback: HostMatcher,
  req: { url?: string; cardId?: string; nonce?: string },
  open: (url: string) => Promise<void> | void,
): Promise<Result<undefined>> {
  const { url, cardId, nonce } = req;
  if (!url || !cardId || !nonce) return fail('URL_NOT_ALLOWED');
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return fail('URL_NOT_ALLOWED');
  }
  if (u.protocol !== 'https:' || !handback.check(url)) return fail('URL_NOT_ALLOWED');
  const card = db.prepare('SELECT type, nonce, payload FROM cards WHERE id = ?').get(cardId) as CardLite | undefined;
  if (!card || card.type !== 'error' || card.nonce !== nonce) return fail('URL_NOT_ALLOWED');
  const p = JSON.parse(card.payload) as { kind?: unknown; button?: { action?: { kind?: unknown; url?: unknown } } };
  if (p.kind !== 'SITE_HANDBACK' || p.button?.action?.kind !== 'open_url' || p.button.action.url !== url) return fail('URL_NOT_ALLOWED');
  await open(url);
  return ok(undefined);
}
