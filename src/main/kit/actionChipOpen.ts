// Spec: 04-2 §21.7 "Action chips" (X-180, CR-0022: stored as `ActionChip[]` in the reply's `messages.actions`; an action
// chip that acts for the user goes through the normal gates, Article 6), 08-1 §3.2 `app:openExternal` (URL_NOT_ALLOWED),
// 04 §13.6 / 06-3 §14 C-26 (the renderer asks "This opens {domain}. Open it?" first), AT-367. R1 T7.
// The renderer names a chip by its reply and place; main reads the stored chip and opens only the URL `chipUrl` builds.
import { fail, ok, type Result } from '../../shared/errors';
import { chipUrl } from '../../shared/kit/actionChips';
import type { ActionChip } from '../../shared/types';
import { parseJson } from '../db/rows';
import type { Db } from '../store/db';

/** The URL of the `index`-th action chip of a live foo or helper reply, or null. */
export function actionChipUrl(db: Db, messageId: string | undefined, index: number | undefined): string | null {
  if (!messageId || index === undefined) return null;
  const row = db
    .prepare("SELECT actions FROM messages WHERE id = ? AND author_kind IN ('foo', 'helper') AND deleted_at IS NULL")
    .get(messageId) as { actions: string | null } | undefined;
  const chips = parseJson<ActionChip[] | null>(row?.actions ?? null, null);
  const chip = Array.isArray(chips) ? chips[index] : undefined;
  return chip ? chipUrl(chip) : null;
}

/** `app:openExternal` target `action_chip`. */
export async function openActionChip(
  db: Db,
  req: { messageId?: string; index?: number },
  open: (url: string) => Promise<void>,
): Promise<Result<void>> {
  const url = actionChipUrl(db, req.messageId, req.index);
  if (!url) return fail('URL_NOT_ALLOWED');
  await open(url);
  return ok(undefined);
}
