// Spec: 04-2 §22.4 (paste catcher "Move to secret box": the span leaves the field, a Secret box card is posted in this chat
// with the value already in its masked field and the suggested name "OpenAI key"), 05-2 §5.8 (Save securely → saved row
// "{Name} · saved {date}" [ Replace ] [ Remove ]; the value is never in foo.db, logs or the AI; Remove → 06-3 §14 C-22, then
// "Removed. {agentName} can't use it any more."), AT-008. M5 T2 proof: type a made-up sk-proj- key, Move, Save, see the saved
// row, Remove through C-22, then search every file the app wrote for the key: 0 hits.
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t2-secret.journey.ts
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const KEY = 'sk-proj-FAKE0t2vault0journey00000000000';

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

export default async function journey(v: Verify): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'foo-t2-proof-'));
  const dirs = { FOO_DATA_DIR: join(base, 'data'), FOO_LOCAL_DIR: join(base, 'local') };
  const { app, page } = await v.launch({ env: dirs });
  await settleSeededJobs(page, await openWorld(app, page));
  await openChat(page, 'foo');
  await setTheme(page, 'light');
  await rest(page);
  await settle(page);

  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(`here is my key ${KEY}`);
  await page.keyboard.press('Enter');
  await page.getByTestId(TID.composerPaste).waitFor();
  v.note('typing the key and pressing Enter opened the paste catch');

  await page.getByTestId(TID.composerPasteMove).click();
  const card = page.locator(byTid(TID.cardSecret)).last();
  await card.waitFor();
  const field = card.getByTestId(TID.cardSecretField);
  await field.waitFor();
  const [type, value, title, composer, focused] = await Promise.all([
    field.getAttribute('type'),
    field.inputValue(),
    card.innerText(),
    page.getByTestId(TID.composerField).innerText(),
    field.evaluate((el) => el === document.activeElement),
  ]);
  if (type !== 'password' || value !== KEY) throw new Error(`field type ${type}, holds the moved key: ${value === KEY}`);
  if (!title.includes('OpenAI key') || title.includes(KEY)) throw new Error(`card text: ${title}`);
  if (composer.includes(KEY) || composer.includes('••••')) throw new Error(`composer still holds: ${composer}`);
  v.note(
    `Move to secret box: a Secret box "OpenAI key" was posted with the key in its password field (focused: ${focused}); the composer kept "${composer.trim()}"`,
  );
  await rest(page);
  await settle(page);
  await v.shot('secret-box-moved');

  await card.getByTestId(TID.cardSecretSave).click();
  const saved = card.getByTestId(TID.cardSecretSaved);
  await saved.waitFor();
  const row = (await saved.innerText()).replace(/\s+/g, ' ').trim();
  if (!row.includes('OpenAI key · saved Fri 16 Oct')) throw new Error(`saved row: ${row}`);
  if ((await page.content()).includes(KEY)) throw new Error('the key is still in the page after Save');
  v.note(`Save securely: the card shows the saved row "${row}" and the page holds the key nowhere`);
  await rest(page);
  await settle(page);
  await v.shot('secret-saved');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('secret-saved');
  await setTheme(page, 'light');

  await card.getByTestId(TID.cardSecretRemove).click();
  const dialog = page.getByTestId(TID.dialogC22);
  await dialog.waitFor();
  const dialogText = (await dialog.innerText()).replace(/\s+/g, ' ');
  if (!dialogText.includes('Remove your saved OpenAI key?')) throw new Error(`C-22: ${dialogText}`);
  await settle(page);
  await v.shot('c-22-remove');
  await dialog.getByTestId(TID.dialogPrimary).click();
  await card.getByText('can’t use it any more').waitFor();
  v.note(`C-22 "Remove your saved OpenAI key?" → Remove: the card reads "${(await card.innerText()).split('\n').find((l) => l.startsWith('Removed'))}"`);
  await rest(page);
  await settle(page);
  await v.shot('secret-removed');

  await app.close();
  const written = [...files(dirs.FOO_DATA_DIR), ...files(dirs.FOO_LOCAL_DIR)];
  const db = written.filter((f) => /foo\.db/.test(f));
  if (!db.length) throw new Error(`no database among ${written.length} files`);
  const hits = written.filter((f) => readFileSync(f).includes(KEY));
  if (hits.length) throw new Error(`key found in ${hits.join(', ')}`);
  const activity = readFileSync(join(dirs.FOO_DATA_DIR, 'activity.jsonl'), 'utf8');
  if (!activity.includes('Saved your OpenAI key') || !activity.includes('Removed your OpenAI key')) throw new Error('activity rows missing');
  v.note(`searched ${written.length} files the app wrote (foo.db, logs, activity.jsonl): 0 hits for the key; activity has "Saved your OpenAI key" and "Removed your OpenAI key"`);
}
