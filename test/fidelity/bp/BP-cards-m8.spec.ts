// Spec: 11-fidelity §11.2.4 (Tier R app side), 05-3 §5.11 (the Google Connect card, state `offered`: "Connect Google",
// "Not now"). BP-CARD-11 is the card gallery's Connect mini; the app side is the Connect card in foo's chat from the
// ux-world-m8-connect seed (a card row, no connection), light and dark. Fake world only: no account, no Google call.
// Captures land in golden/out/app; the golden lane's Tier R step compares them with golden/ref/bp.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TID } from '../../../src/shared/testids';
import { launch, testDirs } from '../../e2e/launch';
import { googleEnv, openConnectWorld } from '../../e2e/m8-google';
import { byTid, captureBp, openChat, rest, setTheme, settle, THEMES } from '../capture';

const M8_CAPTURED = ['BP-CARD-11'] as const;

test('M8 Blueprint captures for Tier R: BP-CARD-11 (Connect card, offered), light and dark', async () => {
  const manifest = JSON.parse(readFileSync(join('golden', 'manifest.json'), 'utf8')) as {
    bp: { id: string; drawn: boolean; milestone: string }[];
  };
  const due = manifest.bp.filter((b) => b.milestone === 'M8' && b.drawn).map((b) => b.id);
  expect([...M8_CAPTURED].sort()).toEqual([...due].sort());

  const { server, env } = await googleEnv();
  const app = await launch(testDirs(), [], env);
  try {
    const page = await app.firstWindow();
    await openConnectWorld(app, page);
    await openChat(page, 'foo');
    await expect(page.getByTestId(TID.cardConnect)).toHaveAttribute('data-state', 'offered');
    await rest(page);
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await settle(page);
      await captureBp(page, 'BP-CARD-11', byTid(TID.cardConnect), theme);
    }
    expect(server.fake.requests).toEqual([]);
  } finally {
    await app.close();
    await server.close();
  }
});
