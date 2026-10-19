// Spec: 08-1 §3.2 `ai:choose` (J2, J21), `app:openExternal` (target `maker_page` with the `providerId`, URL from
// `resources/maker-pages.json`; any other target or provider → URL_NOT_ALLOWED until its milestone), 06-1 §2.2, 06-2 §6.1.
// CR-0020 (c): `ai:openFinder` and `ai:askKey` post the J2 card and the key's Secret box in foo's chat. The writes are in
// aiFinder.ts (no Electron, unit-tested); this file only emits what they wrote.
import { shell } from 'electron';
import { fail, ok } from '../../shared/errors';
import { deps } from '../deps';
import { resourcesDir } from '../engine-supervisor/EngineSupervisor';
import { cardRow, type DbRow } from '../db/rows';
import { chatRowById, messageGet } from '../store/queries';
import { emit, listContext, type AppContext, type IpcHandlers } from '../ipc/IpcRouter';
import { loadMakerPages, makerPageUrl, openFinder, postKeyBox, type FinderWrite, type MakerPages } from './aiFinder';

/** Pushes the cards, messages and chat a finder write touched to the windows. */
export function emitFinderWrite(ctx: AppContext, w: FinderWrite | null): void {
  if (!w) return;
  for (const id of w.messageIds) {
    const m = messageGet(ctx.db, id);
    if (m) emit('message:upsert', m);
  }
  for (const id of w.cardIds) {
    const c = ctx.db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as DbRow | undefined;
    if (c) emit('card:upsert', cardRow(c));
  }
  const chat = chatRowById(ctx.db, listContext(ctx.settings.get()), w.chatId);
  if (chat) emit('chat:upsert', chat);
}

let pages: MakerPages | null = null;

/** FOO_TEST runs never open a browser: the pages foo would have opened are kept here for the E2E (08-3 §22.3). */
export const openedForTest: string[] = [];
(globalThis as { __fooOpenedExternal?: string[] }).__fooOpenedExternal = openedForTest;

export function aiFinderIpc(ctx: AppContext): IpcHandlers<'ai:openFinder' | 'ai:askKey' | 'app:openExternal'> {
  const now = () => deps.clock.now();
  return {
    'ai:openFinder': () => {
      const w = openFinder(ctx.db, now(), ctx.dataDir);
      if (!w) return fail('NOT_FOUND');
      emitFinderWrite(ctx, w);
      return ok({ chatId: w.chatId, cardId: w.cardIds[w.cardIds.length - 1]! });
    },
    'ai:askKey': ({ providerId }) => {
      const r = postKeyBox(ctx.db, providerId, now(), ctx.dataDir);
      if (!r) return fail('NOT_FOUND');
      emitFinderWrite(ctx, r.write);
      return ok(r.card);
    },
    'app:openExternal': async ({ target, providerId }) => {
      if (target !== 'maker_page') return fail('URL_NOT_ALLOWED');
      pages ??= loadMakerPages(resourcesDir());
      const url = makerPageUrl(pages, providerId);
      if (!url) return fail('URL_NOT_ALLOWED');
      if (process.env.FOO_TEST === '1') openedForTest.push(url);
      else await shell.openExternal(url);
      return ok(undefined);
    },
  };
}
