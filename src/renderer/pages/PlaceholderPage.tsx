// Spec: 03-shell-2 §3.9.6 (`settings` and `screen` views replace the main and right shells), 06 §0 (each page root is
// `screen-{slug}`). The pages arrive with their milestones (Settings, Memory, Routines, Ideas, Activity, Spend, profiles);
// until then the shell shows the empty page root so navigation, Esc and back() can be built and tested. CR-0020: the
// `settings` view draws the Settings frame (06-2 §6.0) with the AI rows of Account & your AI.
import type { ScreenId, View } from '../../shared/types';
import { TID } from '../../shared/testids';
import { SettingsPage } from './lazyPages';
import styles from './PlaceholderPage.module.css';

const SCREEN_TID: Record<ScreenId, keyof typeof TID> = {
  memory: 'screenMemory',
  routines: 'screenRoutines',
  activity: 'screenActivity',
  spend: 'screenSpend',
  ideas: 'screenIdeas',
  'foo-profile': 'screenFooProfile',
  'helper-profile': 'screenHelperProfile',
  'group-profile': 'screenGroupProfile',
};

export function PlaceholderPage({ view }: { view: Exclude<View, { kind: 'chat' }> }) {
  if (view.kind === 'settings') return <SettingsPage page={view.page} />;
  const tid = SCREEN_TID[view.id];
  return (
    <div
      className={styles.page}
      data-testid={TID[tid]}
      data-page={view.id}
      data-params={view.params ? JSON.stringify(view.params) : undefined}
      tabIndex={-1}
    />
  );
}
