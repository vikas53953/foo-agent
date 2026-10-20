// Spec: 06 §0.6 page banners (tone Info `--accent-soft` + `Info` 20 `--accent`; Warn `--warn-soft` + `Warning` 20 `--warn`;
// Bad `--bad-soft` + `ErrorCircle` 20 `--bad`; the 03 §3.3.1 anatomy: min-height 40, text `--t-small`, 32px outlined pill
// buttons; `--r-md`; 16px below; `role="status"`, Bad `role="alert"`). 08-0 §E.3 component name.
import { TID } from '../../shared/testids';
import { Button } from './Button';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import styles from './Banner.module.css';

export type BannerTone = 'info' | 'warn' | 'bad';
const ICON: Record<BannerTone, IconName> = { info: 'Info', warn: 'Warning', bad: 'ErrorCircle' };

export interface BannerProps {
  tone: BannerTone;
  text: string;
  tid?: keyof typeof TID;
  action?: { label: string; onClick: () => void };
}

export function Banner({ tone, text, tid, action }: BannerProps) {
  return (
    <div
      className={cx(styles.banner, styles[tone])}
      role={tone === 'bad' ? 'alert' : 'status'}
      data-tone={tone}
      {...(tid ? { 'data-testid': TID[tid] } : {})}
    >
      <Icon name={ICON[tone]} size={20} className={styles.icon} />
      <span className={styles.text}>{text}</span>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
