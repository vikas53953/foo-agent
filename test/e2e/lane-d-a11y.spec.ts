// Spec: 03-shell-2 §3.9.2 (F6 focus order and keyboard panes), 01-articles Art. 26 (named controls and landmarks),
// 10-acceptance-2 §D (Narrator contract), §F28.6 (forced colours), and §G (200% zoom). Lane-D checks go beyond axe:
// they exercise keyboard navigation and inspect the accessible names, focus target and rendered high-contrast/zoom state.
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { openChat, openMemory, openWorld, windowSize } from '../fidelity/capture';
import { launch, testDirs } from './launch';

test.describe.configure({ timeout: 180_000 });

const profileArg = (dirs: ReturnType<typeof testDirs>) => `--user-data-dir=${join(dirs.FOO_LOCAL_DIR, 'electron-profile')}`;
/** Diagnostic-only launch flags for the Windows host's Electron cache/GPU failure; never enabled by default. */
const diagnosticArgs = () =>
  process.env.LANE_D_DIAGNOSTIC_FLAGS === '1' ? ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'] : [];

async function startWorld(): Promise<{ app: Awaited<ReturnType<typeof launch>>; page: Page }> {
  const dirs = testDirs();
  const app = await launch(dirs, [profileArg(dirs), ...diagnosticArgs()]);
  const page = await app.firstWindow();
  await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  return { app, page };
}

const paneOf = (page: Page) =>
  page.evaluate(
    (ids) => {
      const node = document.activeElement;
      if (!node) return null;
      if (node.closest(`[data-testid="${ids.chatlistRow}"]`)) return 'chatlist';
      if (node.closest(`[data-testid="${ids.composerField}"]`)) return 'composer';
      if (node.closest(`[data-testid="${ids.thread}"]`)) return 'messages';
      if (node.closest(`[data-testid="${ids.appPanel}"]`)) return 'panel';
      return null;
    },
    {
      chatlistRow: TID.chatlistRow,
      thread: TID.thread,
      composerField: TID.composerField,
      appPanel: TID.appPanel,
    },
  );

test('keyboard focus order visits every live pane and returns with reverse F6', async () => {
  const { app, page } = await startWorld();
  try {
    await openChat(page, 'foo');
    await expect(page.getByTestId(TID.appPanel)).toHaveAttribute('data-state', 'open');
    const selected = page.locator(`[data-testid="${TID.chatlistRow}"][aria-selected="true"]`);
    await selected.focus();
    expect(await paneOf(page)).toBe('chatlist');
    const expected =
      (await page.getByTestId(TID.composerField).count()) > 0
        ? ['messages', 'composer', 'panel', 'chatlist']
        : ['messages', 'panel', 'chatlist'];
    const visited: (string | null)[] = [];
    for (let i = 0; i < expected.length; i++) {
      await page.keyboard.press('F6');
      visited.push(await paneOf(page));
    }
    expect(visited).toEqual(expected);
    await page.keyboard.press('Shift+F6');
    expect(await paneOf(page)).toBe('panel');
  } finally {
    await app.close();
  }
});

test('Narrator-facing labels cover every interactive control, landmark, meter and heading across chat, memory and settings', async () => {
  const { app, page } = await startWorld();
  try {
    await openChat(page, 'foo');
    await page.getByTestId(TID.sidebarMore).click();
    await page.getByTestId(TID.sidebarMenuMemory).click();
    await expect(page.getByTestId(TID.screenMemory)).toBeVisible();
    await page.keyboard.press('Control+,');
    await expect(page.getByRole('navigation', { name: t('settings.page.nav_label') })).toBeVisible();
    const findings = await page.evaluate(() => {
      const name = (element: Element): string => {
        const label = element.getAttribute('aria-label');
        if (label) return label.trim();
        const labelledBy = element.getAttribute('aria-labelledby');
        if (labelledBy)
          return labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ')
            .trim();
        return (element.getAttribute('title') || element.textContent || element.getAttribute('placeholder') || '').trim();
      };
      const out: string[] = [];
      for (const element of Array.from(document.querySelectorAll('button, [role="button"], input, [role="radio"], [role="switch"]'))) {
        if (!name(element)) out.push(`unnamed control ${element.getAttribute('data-testid') ?? element.tagName.toLowerCase()}`);
      }
      for (const element of Array.from(document.querySelectorAll('main, aside, nav, [role="log"], [role="region"]'))) {
        if (!name(element)) out.push(`unnamed landmark ${element.tagName.toLowerCase()}`);
      }
      for (const element of Array.from(document.querySelectorAll('[role="meter"]'))) {
        if (!name(element) || !element.getAttribute('aria-valuenow') || !element.getAttribute('aria-valuemax'))
          out.push(`unnamed meter ${element.getAttribute('data-testid') ?? ''}`);
      }
      const visibleH1 = Array.from(document.querySelectorAll('h1')).filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
      });
      if (visibleH1.length === 0) out.push('no visible h1');
      for (const heading of visibleH1) if (!name(heading)) out.push('unnamed visible h1');
      const ids = Array.from(document.querySelectorAll('[id]')).map((element) => element.id);
      for (const id of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) out.push(`duplicate id ${id}`);
      return out;
    });
    expect(findings).toEqual([]);
  } finally {
    await app.close();
  }
});

test('forced colours use system tokens and remove decorative shimmer while controls retain names', async () => {
  const { app, page } = await startWorld();
  try {
    await page.emulateMedia({ forcedColors: 'active' });
    await expect.poll(() => page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    const result = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const shimmer = document.createElement('div');
      shimmer.dataset.shimmer = '';
      document.body.append(shimmer);
      const style = getComputedStyle(shimmer);
      const named = [...document.querySelectorAll('button, [role="button"], input, [role="radio"], [role="switch"]')].filter((el) => {
        const label =
          el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent || (el as HTMLInputElement).placeholder;
        return !(label ?? '').trim();
      }).length;
      const out = {
        canvas: root.getPropertyValue('--bg-app').trim(),
        text: root.getPropertyValue('--fg-1').trim(),
        shimmerAnimation: style.animationName,
        unnamed: named,
      };
      shimmer.remove();
      return out;
    });
    expect(result.canvas).toBe('Canvas');
    expect(result.text).toBe('CanvasText');
    expect(result.shimmerAnimation).toBe('none');
    expect(result.unnamed).toBe(0);
  } finally {
    await app.close();
  }
});

test('200% zoom keeps the shell usable without horizontal overflow on chat, memory and settings', async () => {
  const { app, page } = await startWorld();
  try {
    await windowSize(app, page, 1440, 900);
    await page.evaluate(() => window.foo.invoke('settings:set', { path: 'zoom', value: 200 }));
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor())).toBe(2);
    for (const screen of ['chat', 'memory', 'settings'] as const) {
      if (screen === 'memory') await openMemory(page);
      if (screen === 'settings') {
        await page.keyboard.press('Control+,');
        await expect(page.getByRole('heading', { name: t('settings.page.title') })).toBeVisible();
      }
      if (screen === 'chat') await openChat(page, 'foo');
      const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
      expect(bounds.width).toBeLessThanOrEqual(bounds.viewport + 2);
      if (screen === 'chat') {
        await expect(page.getByTestId(TID.composerField)).toBeVisible();
        await expect(page.getByTestId(TID.chatHeaderName)).toBeVisible();
      } else if (screen === 'memory') {
        await expect(page.getByTestId(TID.screenMemory)).toBeVisible();
      } else {
        await expect(page.getByRole('navigation', { name: t('settings.page.nav_label') })).toBeVisible();
      }
    }
  } finally {
    await app.close();
  }
});
