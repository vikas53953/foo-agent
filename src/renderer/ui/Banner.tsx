// Spec: 06 §0.6 page banners (tones Info `--accent-soft` + `Info` 20 `--accent`, Warn `--warn-soft` + `Warning` 20
// `--warn`, Bad `--bad-soft` + `ErrorCircle` 20 `--bad`; text `--fg-1`; the 03 §3.3.1 anatomy: min-height 40, icon 20,
// text `--t-small`, 32px outlined pill buttons; `--r-md` corners and 16px below; `role="status"`, Bad `role="alert"`),
// 06 §0.1 (a page banner sits at the top of that page's content column; app-wide conditions use only 03's strip), 08-0
// §E.3 (Banner is a primitive). The Control tone belongs to foo's browser window (§11) and is not drawn here.
import { TID } from '../../shared/testids';
import { Button, type ButtonTone } from './Button';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import styles from './Banner.module.css';

export type BannerTone = 'info' | 'warn' | 'bad';

export interface BannerAction {
  label: string;
  onClick: () => void;
  tid?: keyof typeof TID;
}

export interface BannerProps {
  tone: BannerTone;
  text: string;
  actions?: BannerAction[];
  tid?: keyof typeof TID;
}

const ICON: Record<BannerTone, IconName> = { info: 'Info', warn: 'Warning', bad: 'ErrorCircle' };
const BUTTON_TONE: Record<BannerTone, ButtonTone> = { info: 'accent', warn: 'warn', bad: 'bad' };

export function Banner({ tone, text, actions = [], tid }: BannerProps) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cx(styles.banner, styles[tone])}
      data-state={tone}
      {...(tid ? { 'data-testid': TID[tid] } : {})}
    >
      <Icon name={ICON[tone]} size={20} className={styles.icon} />
      <span className={styles.text}>{text}</span>
      {actions.length > 0 && (
        <span className={styles.actions}>
          {actions.map((a) => (
            <Button
              key={a.label}
              variant="outline"
              size="sm"
              tone={BUTTON_TONE[tone]}
              onClick={a.onClick}
              {...(a.tid ? { 'data-testid': TID[a.tid] } : {})}
            >
              {a.label}
            </Button>
          ))}
        </span>
      )}
    </div>
  );
}
