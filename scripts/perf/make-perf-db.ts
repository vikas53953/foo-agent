// Spec: G-M14-25 (the generator writes the perf data once in a FOO_TEST build; the runner copies it into the real {DATA}),
// 08-3 §22.9 (`perf` seed set), 10-acceptance-2 §E.1 (200 chats, 50,000 messages with one chat of 5,000, 300 memory facts,
// 25 routines, 8 helpers). Memory facts and routines arrive with M6 and M7: the manifest says so until their seeds exist.
// Usage: pnpm exec tsx scripts/perf/make-perf-db.ts [outDir]   (needs `pnpm build` and better-sqlite3 built for Electron)
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, testDirs } from '../../test/e2e/launch';
import { TID } from '../../src/shared/testids';

export const PERF_DATA_DIR = join('test-results', 'perf', 'perf-data');

export interface PerfDataManifest {
  set: 'perf';
  generatedAt: string;
  chats: number;
  messages: number;
  /** E.1 parts the perf seed cannot hold yet, with the milestone that adds them. */
  pending: Record<string, string>;
}

export async function makePerfData(outDir = PERF_DATA_DIR): Promise<PerfDataManifest> {
  const dirs = testDirs();
  const app = await launch(dirs);
  try {
    const page = await app.firstWindow();
    await page.getByTestId(TID.titlebarStrip).waitFor();
    const r = await page.evaluate(() => window.__fooTest!.seed('perf'));
    if (!r.loaded) throw new Error('the perf seed did not load');
    await page.getByTestId(TID.chatlistRow).first().waitFor();
    const manifest: PerfDataManifest = {
      set: 'perf',
      generatedAt: new Date().toISOString(),
      chats: r.chats ?? 0,
      messages: r.messages ?? 0,
      pending: { memoryFacts: 'M6 (300 facts)', routines: 'M7 (25 routines)' },
    };
    await app.close();
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    cpSync(join(dirs.FOO_DATA_DIR, 'data'), join(outDir, 'data'), { recursive: true });
    if (existsSync(join(dirs.FOO_DATA_DIR, 'settings.json')))
      cpSync(join(dirs.FOO_DATA_DIR, 'settings.json'), join(outDir, 'settings.json'));
    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
  } finally {
    await app.close().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  makePerfData(process.argv[2]).then(
    (m) => console.log(`perf data: ${m.chats} chats, ${m.messages} messages → ${process.argv[2] ?? PERF_DATA_DIR}`),
    (e: unknown) => {
      console.error(e);
      process.exit(1);
    },
  );
}
