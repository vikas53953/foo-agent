// Spec: 06-1 §1 Splash and cold start: the first paint is the splash, replaced by the shell when the chat list query returns
// (§1.2), cross-fade `--m-normal` (§1.4 Normal); window content below the 32px title bar, `--bg-app`, the block centred at 45%
// of the content height (§1.3); [X-179] foo's face at `--avatar-hero` 96px 16px above the wordmark, its eyes open from a line
// once (Waking up, `--m-face-wake`) then rest; reduced motion / Off: already open (the face's own still pose, §F15.9.5).
// The face stays on Waking up: its keyframes end on the open pose and nothing loops, so the eyes rest there; switching to
// Resting would cross-fade the eyes away and back right after they opened;
// wordmark "foo" `--t-display` lowercase `--fg-1`; status line `--t-small` `--fg-3`, `role="status"`, hidden for the first
// 3.0 s ("Getting things ready…", §1.4 Slow); nothing focusable (§1.5); Narrator hears "{agentName} is starting" once (§1.5).
// CR-0021 pick 9, AT-313. The Upgrading and Disk full states (§1.4) ship with M12 (no upgrade or disk signal exists yet).
import { useEffect, useState } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { announce } from '../a11y/announce';
import { useStore } from '../store/index';
import { selectLoaded } from '../store/live';
import { selectAgentName } from '../store/settings';
import { Face } from '../ui/Face';
import { Presence } from '../ui/Presence';
import styles from './Splash.module.css';

/** §1.4 Slow: the status line waits 3.0 s. */
export const SLOW_AFTER_MS = 3_000;
/** foo's face before settings load: the default living face (08-0 §E.7). */
const FOO_FACE = 'living:default';
/** One "{agentName} is starting" per app start, also under StrictMode's doubled dev effects. */
let announced = false;

export function Splash() {
  const loaded = useStore(selectLoaded);
  return (
    <Presence show={!loaded}>
      <SplashView />
    </Presence>
  );
}

function SplashView(props: { 'data-exit'?: '' }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!announced) {
      announced = true;
      // Read once at mount: the name is foo's own until settings load (they rarely beat the splash).
      announce(t('app.splash.starting', { agentName: selectAgentName(useStore.getState()) }));
    }
    const late = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(late);
  }, []);
  // §1.5: nothing under the splash is focusable or read while it covers the shell; the shell wakes as the fade starts.
  const leaving = props['data-exit'] === '';
  useEffect(() => {
    const shell = document.getElementById('root');
    if (!shell || leaving) return;
    shell.inert = true;
    return () => {
      shell.inert = false;
    };
  }, [leaving]);
  return (
    <div className={styles.splash} data-testid={TID.screenSplash} aria-hidden={leaving || undefined} {...props}>
      <div className={styles.block}>
        <Face faceRef={FOO_FACE} size={96} mood="waking" ring={false} data-testid={TID.splashFace} />
        <p className={styles.wordmark} data-testid={TID.screenSplashWordmark}>
          {t('app.window.title')}
        </p>
        <p className={styles.status} role="status" data-testid={TID.screenSplashStatus}>
          {slow ? t('app.splash.loading') : ''}
        </p>
      </div>
    </div>
  );
}
