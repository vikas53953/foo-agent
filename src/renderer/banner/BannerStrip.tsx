// Spec: 03-shell-1 §3.3 banner strip: one strip under the title bar, full width, at most one banner (highest priority);
// §3.3.1 anatomy (40 min-height, padding 0 `--s3`, icon 20, `--t-small` text, one outline pill button 32h in the type's
// colour, Dismiss on dismissible types, 1px `--line` bottom edge, enter/exit `--m-normal`); §3.3.2 the seven types, their
// copy, buttons and actions; §3.3.3 (`role="status"` for types 1–3 and 5–7, `role="alert"` for the cap; first F6 stop);
// Article 29 (offline: one line with one fix button). Test ids `banner-strip` (data-state = BannerType), `banner-action`,
// `banner-dismiss`.
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '../../shared/copy/t';
import { formatInr } from '../../shared/format';
import { TID } from '../../shared/testids';
import type { BannerType } from '../../shared/types';
import { invoke } from '../ipc/client';
import { navigate, update, useStore } from '../store/index';
import { selectFooChatId } from '../store/chats';
import { selectTimeZone } from '../store/settings';
import { Button, type ButtonTone } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { absoluteTime } from '../ui/time';
import { DISMISSIBLE, pickBanner } from './selectBanner';
import styles from './BannerStrip.module.css';

const ICON: Record<BannerType, IconName> = {
  offline: 'CloudOff',
  ai_not_answering: 'Warning',
  ai_signed_out: 'Key',
  ai_cap: 'Money',
  plan_limit: 'Clock',
  notifications_blocked: 'Alert',
  update_ready: 'ArrowSync',
};

const TONE: Record<BannerType, ButtonTone> = {
  offline: 'warn',
  ai_not_answering: 'warn',
  ai_signed_out: 'warn',
  ai_cap: 'bad',
  plan_limit: 'warn',
  notifications_blocked: 'warn',
  update_ready: 'accent',
};

function dismiss(type: BannerType): void {
  update((s) => {
    if (!s.ui.dismissed.includes(type)) s.ui.dismissed.push(type);
  });
}

/** Re-asks Windows whether foo may show toasts (at start and whenever the window gets focus). */
function useNotificationStatus(): void {
  useEffect(() => {
    const check = () =>
      invoke('notifications:status', {})
        .then((r) => {
          if (r.ok)
            update((s) => {
              s.live.notificationsAllowed = r.value.windowsAllowed;
            });
        })
        .catch(() => undefined);
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);
}

export function BannerStrip() {
  useNotificationStatus();
  const facts = useStore(
    useShallow((s) => ({
      connection: s.live.connection,
      ai: s.live.ai,
      spend: s.spend.summary,
      notificationsAllowed: s.live.notificationsAllowed,
      updateReady: s.live.updateReady,
      dismissed: s.ui.dismissed,
    })),
  );
  const now = useStore((s) => s.live.now);
  const tz = useStore(selectTimeZone);
  const fooChatId = useStore(selectFooChatId);
  const type = pickBanner(facts);

  useEffect(() => {
    update((s) => {
      s.ui.banner = type;
    });
  }, [type]);

  if (!type) return null;
  const ai = facts.ai?.displayName ?? '';
  const resetAt = facts.ai?.resetAt;
  const time = resetAt !== undefined ? absoluteTime(resetAt, now, tz) : null;
  const cap = facts.spend ? formatInr(facts.spend.aiCapPaise) : '';
  const providerId = facts.ai?.primary ?? 'claude-cli';
  const retry = () => void invoke('ai:verify', { providerId }).catch(() => undefined);
  const openFoo = () => fooChatId && navigate({ kind: 'chat', chatId: fooChatId });

  const content: Record<BannerType, { text: string; action: string | null; run: () => void }> = {
    offline: { text: t('banner.offline.text'), action: t('banner.offline.action'), run: retry },
    ai_not_answering: { text: t('banner.ai_not_answering.text', { AI: ai }), action: t('banner.ai_not_answering.action'), run: retry },
    ai_signed_out: { text: t('banner.ai_signed_out.text', { AI: ai }), action: t('banner.ai_signed_out.action'), run: openFoo },
    ai_cap: {
      text: t('banner.ai_cap.text', { cap }),
      action: t('banner.ai_cap.action'),
      run: () => navigate({ kind: 'settings', page: 'money', row: 'ai_spend' }),
    },
    plan_limit: time
      ? { text: t('banner.plan_limit.text', { AI: ai, time }), action: t('banner.plan_limit.action', { time }), run: openFoo }
      : { text: t('banner.plan_limit.text.no_time', { AI: ai }), action: null, run: () => undefined },
    notifications_blocked: {
      text: t('banner.notifications_blocked.text'),
      action: t('banner.notifications_blocked.action'),
      run: () => void invoke('app:openWindowsSettings', { page: 'notifications' }).catch(() => undefined),
    },
    update_ready: { text: t('banner.update_ready.text'), action: t('banner.update_ready.action'), run: () => undefined },
  };
  const c = content[type];

  return (
    <div
      className={styles.strip}
      data-testid={TID.bannerStrip}
      data-state={type}
      data-tone={TONE[type]}
      role={type === 'ai_cap' ? 'alert' : 'status'}
      aria-live={type === 'ai_cap' ? 'assertive' : 'polite'}
    >
      <Icon name={ICON[type]} size={20} className={styles.icon} />
      <p className={styles.text}>{c.text}</p>
      {c.action && (
        <Button variant="outline" tone={TONE[type]} onClick={c.run} data-testid={TID.bannerAction}>
          {c.action}
        </Button>
      )}
      {DISMISSIBLE.includes(type) &&
        (type === 'update_ready' ? (
          <Button variant="subtle" onClick={() => dismiss(type)} data-testid={TID.bannerDismiss}>
            {t('banner.update_ready.dismiss')}
          </Button>
        ) : (
          <IconButton icon="Dismiss" label={t('banner.strip.dismiss')} onClick={() => dismiss(type)} data-testid={TID.bannerDismiss} />
        ))}
    </div>
  );
}
