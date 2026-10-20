// Spec: 08-1 §3.2 `keep:save` (→ `KeptItem`, DISK_FULL), `keep:list` (newest first; the chat's Files tab), `keep:open`
// (`{ kind; body }`; never `shell.openPath`), `keep:showInFolder` (Explorer selects the body file under {DATA}), CR-0022
// pick 9 (a PNG snapshot beside the body), AT-369, X-180. R1 T7. The PNG is the main window's pixels inside the rect the
// renderer names (a sealed page frame cannot be read from the renderer, so main takes the picture).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BrowserWindow, shell } from 'electron';
import { fail, ok } from '../../shared/errors';
import { deps } from '../deps';
import { emit, type AppContext, type IpcHandlers } from '../ipc/IpcRouter';
import { insideDir } from '../windows/protocol';
import { keepList, keepOpen, keepSave, keptGet } from './keep';

/** FOO_TEST runs never open Explorer: the files foo would have shown are kept here for the E2E (08-3 §22.3). */
export const shownForTest: string[] = [];
if (process.env.FOO_TEST === '1') (globalThis as { __fooShownInFolder?: string[] }).__fooShownInFolder = shownForTest;

type Rect = { x: number; y: number; width: number; height: number };

const mainWindow = () =>
  BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !w.webContents.getURL().includes('/windows/')) ?? null;

async function capture(rect: Rect | undefined): Promise<Uint8Array | null> {
  const win = mainWindow();
  if (!win || !rect || rect.width < 1 || rect.height < 1) return null;
  // The rect is CSS px; capturePage takes the window's own units, so the zoom scales it (09 §9.14.3).
  const z = win.webContents.getZoomFactor();
  const img = await win.webContents.capturePage({
    x: Math.round(rect.x * z),
    y: Math.round(rect.y * z),
    width: Math.round(rect.width * z),
    height: Math.round(rect.height * z),
  });
  return img.isEmpty() ? null : img.toPNG();
}

async function write(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

export function keepIpc(ctx: AppContext): IpcHandlers<'keep:save' | 'keep:list' | 'keep:open' | 'keep:showInFolder'> {
  const files = { readFile: (p: string) => readFile(p, 'utf8') };
  return {
    'keep:save': async (req) => {
      const { png, rect, ...save } = req;
      const r = await keepSave(
        {
          db: ctx.db,
          dataDir: ctx.dataDir,
          now: () => deps.clock.now(),
          writeFile: write,
          ...files,
          snapshot: async () => (png ? new Uint8Array(png instanceof ArrayBuffer ? png : png.buffer) : capture(rect)),
        },
        save,
      );
      if (!r.ok) return r;
      if (r.value.card) emit('card:upsert', r.value.card);
      return ok(r.value.item);
    },
    'keep:list': ({ chatId }) => ok(keepList(ctx.db, chatId)),
    'keep:open': ({ id }) => keepOpen({ db: ctx.db, ...files }, id),
    'keep:showInFolder': ({ id }) => {
      const k = keptGet(ctx.db, id);
      const file = k && insideDir(ctx.dataDir, k.bodyPath);
      if (!file) return fail('NOT_FOUND');
      if (process.env.FOO_TEST === '1') shownForTest.push(file);
      else shell.showItemInFolder(file);
      return ok(undefined);
    },
  };
}
