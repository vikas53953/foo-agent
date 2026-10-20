// Spec: 06-2 §6.2 Appearance as amended by X-179 (rows theme, accent, zoom, animations, then sounds, mica, face-motion, then
// the preview tile; every row writes its setting and applies live; high contrast disables Theme and accent and shows the
// Info banner; Animations disabled and "Off · set by Windows" while Windows animation effects are off), 09 §9.14.3 (the
// Zoom menu and Ctrl+= / Ctrl+- / Ctrl+0 share `zoom`), 02 §F7.1 (theme switch cross-fades, accent change sweeps; nothing
// moves at Off), CR-0021 picks 20–22, AT-320, AT-321.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { t } from '../../../shared/copy/t';
import { ZOOM_STEPS, type WritablePath } from '../../../shared/settings';
import { TID } from '../../../shared/testids';
import type { PublicSettings } from '../../../shared/types';
import { setMotionLevel } from '../../a11y/motion';
import { invoke } from '../../ipc/client';
import { update, useStore } from '../../store/index';
import { selectSettings } from '../../store/settings';
import { Banner } from '../../ui/Banner';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import type { MenuEntry } from '../../ui/menuTypes';
import { Segmented } from '../../ui/Segmented';
import { Toggle } from '../../ui/Toggle';
import { cx } from '../../ui/cx';
import bubble from '../../messages/Bubble.module.css';
import { RowGroup } from '../shared/RowGroup';
import styles from './SettingsPage.module.css';
import own from './AppearancePage.module.css';

type Appearance = PublicSettings['appearance'];
type Theme = Appearance['theme'];
type Animations = Appearance['animations'];
type MicaRow = 'hidden' | 'disabled' | 'enabled';

const root = () => document.documentElement;

/** A media query as React state (Windows animation effects, high contrast). */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const fn = () => setOn(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return on;
}

/** Main marks `<html data-mica-row>` (settings/appearance.ts): hidden on Windows 10, disabled without transparency. */
function subscribeMicaRow(fn: () => void): () => void {
  const obs = new MutationObserver(fn);
  obs.observe(root(), { attributes: true, attributeFilter: ['data-mica-row'] });
  return () => obs.disconnect();
}
const micaRow = (): MicaRow => (root().dataset.micaRow as MicaRow | undefined) ?? 'enabled';

async function write(path: WritablePath, value: unknown): Promise<void> {
  const r = await invoke('settings:set', { path, value }).catch(() => null);
  if (r?.ok)
    update((s) => {
      s.settings.value = r.value.settings;
    });
}

/**
 * Resolves when `ready()` holds or after `ms` (the change may not move anything, e.g. Light while Windows is light). Polls
 * with timers: rendering, and so requestAnimationFrame, is paused inside a View Transition's update callback.
 */
function until(ready: () => boolean, ms: number): Promise<void> {
  const end = performance.now() + ms;
  return new Promise((resolve) => {
    const tick = () => (ready() || performance.now() >= end ? resolve() : setTimeout(tick, POLL_MS));
    tick();
  });
}

const POLL_MS = 16;
const SETTLE_MS = 250;

/**
 * 02 §F7.1: Theme cross-fades and accent sweeps, as a View Transition (CSS keyframes in AppearancePage.module.css). Off: the
 * change lands at once; Basic: a gentle fade for both.
 */
function withTransition(kind: 'theme' | 'accent', change: () => Promise<void>): void {
  const motion = root().dataset.motion;
  if (motion === 'off' || typeof document.startViewTransition !== 'function') {
    void change();
    return;
  }
  const before = kind === 'theme' ? root().dataset.theme : getComputedStyle(root()).getPropertyValue('--accent');
  const moved = () =>
    kind === 'theme' ? root().dataset.theme !== before : getComputedStyle(root()).getPropertyValue('--accent') !== before;
  root().dataset.vt = kind === 'accent' && motion === 'full' ? 'accent' : 'theme';
  const vt = document.startViewTransition(async () => {
    await change();
    await until(moved, SETTLE_MS);
  });
  void vt.finished.finally(() => delete root().dataset.vt);
}

function Row({
  tid,
  label,
  second,
  children,
  disabled,
}: {
  tid: keyof typeof TID;
  label: string;
  second?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <li className={cx(styles.row, own.row)} data-testid={TID[tid]} aria-disabled={disabled || undefined}>
      <span className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {second && <span className={styles.rowSecond}>{second}</span>}
      </span>
      {children}
    </li>
  );
}

export function AppearancePage() {
  const settings = useStore(selectSettings);
  const reducedByWindows = useMedia('(prefers-reduced-motion: reduce)');
  const highContrast = useMedia('(forced-colors: active)');
  const mica = useSyncExternalStore(subscribeMicaRow, micaRow);
  const [zoomMenu, setZoomMenu] = useState<HTMLElement | null>(null);
  if (!settings) return null;

  const a = settings.appearance;
  const agentName = settings.identity.agentName;
  const zoomLabel = (n: number) => t('settings.appearance.zoom.value', { n });

  const setTheme = (v: Theme) => withTransition('theme', () => write('appearance.theme', v));
  const setAccent = (on: boolean) => withTransition('accent', () => write('appearance.useWindowsAccent', on));
  const setAnimations = (v: Animations) =>
    void write('appearance.animations', v).then(() => setMotionLevel(useStore.getState().settings.value?.appearance.animations ?? v));

  const zoomEntries: MenuEntry[] = ZOOM_STEPS.map((n) => ({
    kind: 'item',
    id: `zoom-${n}`,
    label: zoomLabel(n),
    onSelect: () => void write('zoom', n),
  }));

  return (
    <div className={own.page}>
      {highContrast && <Banner tone="info" text={t('settings.appearance.high_contrast', { agentName })} />}
      <RowGroup>
        <Row tid="settingsRowAppearanceTheme" label={t('settings.appearance.theme.label')} disabled={highContrast}>
          <fieldset className={own.fieldset} disabled={highContrast}>
            <Segmented<Theme>
              label={t('settings.appearance.theme.label')}
              value={a.theme}
              options={[
                { value: 'system', label: t('settings.appearance.theme.system') },
                { value: 'light', label: t('settings.appearance.theme.light') },
                { value: 'dark', label: t('settings.appearance.theme.dark') },
              ]}
              onChange={setTheme}
            />
          </fieldset>
        </Row>
        <Row
          tid="settingsRowAppearanceAccent"
          label={t('settings.appearance.accent.label')}
          second={
            <>
              {t('settings.appearance.accent.second')}
              <span className={own.swatch} aria-hidden="true" />
            </>
          }
          disabled={highContrast}
        >
          <Toggle checked={a.useWindowsAccent} label={t('settings.appearance.accent.label')} disabled={highContrast} onChange={setAccent} />
        </Row>
        <Row
          tid="settingsRowAppearanceZoom"
          label={t('settings.appearance.zoom.label')}
          second={t('settings.appearance.zoom.second', { agentName })}
        >
          <button
            type="button"
            className={styles.menuButton}
            aria-haspopup="menu"
            aria-expanded={zoomMenu !== null}
            aria-label={t('settings.appearance.zoom.label')}
            onClick={(e) => setZoomMenu(e.currentTarget)}
          >
            {zoomLabel(settings.zoom)}
            <Icon name="ChevronDown" size={16} />
          </button>
          {zoomMenu && (
            <Menu
              entries={zoomEntries}
              anchor={{ el: zoomMenu, align: 'end' }}
              label={t('settings.appearance.zoom.label')}
              onClose={() => setZoomMenu(null)}
            />
          )}
        </Row>
        <Row
          tid="settingsRowAppearanceAnimations"
          label={t('settings.appearance.animations.label')}
          second={reducedByWindows ? t('settings.appearance.animations.by_windows') : t('settings.appearance.animations.second')}
          disabled={reducedByWindows}
        >
          <fieldset className={own.fieldset} disabled={reducedByWindows}>
            <Segmented<Animations>
              label={t('settings.appearance.animations.label')}
              value={reducedByWindows ? 'off' : a.animations}
              options={[
                { value: 'full', label: t('settings.appearance.animations.full') },
                { value: 'basic', label: t('settings.appearance.animations.basic') },
                { value: 'off', label: t('settings.appearance.animations.off') },
              ]}
              onChange={setAnimations}
            />
          </fieldset>
        </Row>
        <Row
          tid="settingsRowAppearanceSounds"
          label={t('settings.appearance.sounds.label')}
          second={t('settings.appearance.sounds.second')}
        >
          <Toggle checked={a.sounds} label={t('settings.appearance.sounds.label')} onChange={(on) => void write('appearance.sounds', on)} />
        </Row>
        {mica !== 'hidden' && (
          <Row
            tid="settingsRowAppearanceMica"
            label={t('settings.appearance.mica.label')}
            second={t('settings.appearance.mica.second')}
            disabled={mica === 'disabled'}
          >
            <Toggle
              checked={a.mica}
              label={t('settings.appearance.mica.label')}
              disabled={mica === 'disabled'}
              onChange={(on) => void write('appearance.mica', on)}
            />
          </Row>
        )}
        <Row
          tid="settingsRowAppearanceFaceMotion"
          label={t('settings.appearance.face_motion.label', { agentName })}
          second={t('settings.appearance.face_motion.second')}
        >
          <Toggle
            checked={a.faceMotion}
            label={t('settings.appearance.face_motion.label', { agentName })}
            onChange={(on) => void write('appearance.faceMotion', on)}
          />
        </Row>
        <li className={own.preview} data-testid={TID.settingsRowAppearancePreview} aria-hidden="true">
          <span className={cx(bubble.bubble, bubble.them, own.previewThem)}>{t('settings.appearance.preview.foo')}</span>
          <span className={cx(bubble.bubble, bubble.me, own.previewMe)}>{t('settings.appearance.preview.me')}</span>
        </li>
      </RowGroup>
    </div>
  );
}
