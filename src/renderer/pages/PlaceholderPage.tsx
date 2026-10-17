// Spec: 03-shell-2 §3.9.6 (`settings` and `screen` views replace the main and right shells), 06 §0 (each page root is
// `screen-{slug}`). The pages arrive with their milestones (Settings, Memory, Routines, Ideas, Activity, Spend, profiles);
// until then the shell shows the empty page root so navigation, Esc and back() can be built and tested.
import type { ScreenId, View } from '../../shared/types';
import { TID } from '../../shared/testids';
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
  const tid = view.kind === 'settings' ? 'screenSettings' : SCREEN_TID[view.id];
  return (
    <div
      className={styles.page}
      data-testid={TID[tid]}
      data-page={view.kind === 'settings' ? view.page : view.id}
      data-params={view.kind === 'screen' && view.params ? JSON.stringify(view.params) : undefined}
      tabIndex={-1}
    />
  );
}
