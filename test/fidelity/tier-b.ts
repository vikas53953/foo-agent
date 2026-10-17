// 11-fidelity §11.2.4 Tier B (baseline lock, app vs blessed app): Playwright toHaveScreenshot with threshold 0.1,
// maxDiffPixelRatio 0.001, animations disabled, caret hidden, CSS scale, fonts ready, no retries; plus FID-05 (fail when
// any 16×16 block has more than 25 % of its pixels changed, even under the ratio). Baselines live in golden/app/ and are
// written only by scripts/golden-bless.ts (FID-06).
import { expect, type Locator, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { clusterViolations, decodePng, diff, readPng } from '../../scripts/golden/pixels';

export const GOLDEN_APP_DIR = join('golden', 'app');

export const TIER_B = {
  threshold: 0.1,
  maxDiffPixelRatio: 0.001,
  animations: 'disabled',
  caret: 'hide',
  scale: 'css',
} as const;

export const blessing = () => process.env.FOO_GOLDEN_BLESS === '1';

/** Tier B check of the whole window for one golden step and theme. Masks only from the step JSON (§11.2.5). */
export async function expectGolden(page: Page, id: string, theme: 'light' | 'dark', mask: Locator[] = []): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const name = `${id}.${theme}.png`;
  const baseline = join(GOLDEN_APP_DIR, name);
  if (existsSync(baseline) && !blessing()) {
    const actual = await page.screenshot({ animations: TIER_B.animations, caret: TIER_B.caret, scale: TIER_B.scale, mask });
    const clusters = clusterViolations(diff(readPng(baseline), decodePng(actual), TIER_B.threshold).mask);
    expect(clusters, `FID-05 ${id} ${theme}: 16×16 blocks with more than 25 % of pixels changed`).toEqual([]);
  }
  await expect(page).toHaveScreenshot(name, { ...TIER_B, mask });
}
