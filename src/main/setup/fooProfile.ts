// Spec: 06-1 §4.2 foo profile "Name and look" (name max 20, face, "How I talk": the same choices and lines as setup Card 2a–2c,
// §2.3), writing `identity.agentName`, the face on foo's chat, `identity.vibe` / `identity.vibeLine` (08-0 §A); CR-0060 (X-217):
// the batch-1 part of the page, so "You can change any of this in Settings" (§2.0 Skip the rest) has somewhere to go.
import { t } from '../../shared/copy/t';
import type { Db } from '../store/db';
import { fooChatId } from '../store/queries';
import type { FinderWrite, SettingsPort } from './aiFinder';
import { checkName, cutWords, FACES, faceColour, setFooChat, VIBES, type NameError } from './firstRun';

export function setFooName(
  db: Db,
  settings: SettingsPort,
  raw: string,
): { ok: true; write: FinderWrite } | { ok: false; error: NameError | 'stale' } {
  const chatId = fooChatId(db);
  if (!chatId) return { ok: false, error: 'stale' };
  const checked = checkName(raw);
  if (!checked.ok) return checked;
  try {
    settings.update((cur) => ({ ...cur, identity: { ...cur.identity, agentName: checked.name } }));
  } catch {
    return { ok: false, error: 'too_long' };
  }
  setFooChat(db, chatId, { title: checked.name });
  return { ok: true, write: { chatId, cardIds: [], messageIds: [] } };
}

export function setFooFace(db: Db, face: string, colour?: string): FinderWrite | null {
  const chatId = fooChatId(db);
  if (!chatId || !FACES.has(face)) return null;
  setFooChat(db, chatId, { avatar_ref: face, color_token: faceColour(face, colour) });
  return { chatId, cardIds: [], messageIds: [] };
}

/** A setup choice id (o1–o3), or the "Something else…" words. */
export function setFooVibe(settings: SettingsPort, choice: { optionId: string } | { words: string }): boolean {
  if ('optionId' in choice) {
    if (!Object.hasOwn(VIBES, choice.optionId)) return false;
    const v = VIBES[choice.optionId as keyof typeof VIBES];
    settings.update((cur) => ({ ...cur, identity: { ...cur.identity, vibe: v.vibe, vibeLine: v.line() } }));
    return true;
  }
  const words = cutWords(choice.words.trim());
  if (!words) return false;
  settings.update((cur) => ({ ...cur, identity: { ...cur.identity, vibe: 'custom', vibeLine: t('setup.vibe.line.custom', { words }) } }));
  return true;
}
