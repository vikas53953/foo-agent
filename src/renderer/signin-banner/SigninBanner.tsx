// Spec: 05-3 §5.10.3 (the docked banner window: address row `signin-banner-address`; Warn banner "{agentName} is waiting.
// It can't see what you type here." + "I'm done" `signin-banner-done` (Alt+D); success "Looks like you're in. Carrying on…"
// `signin-banner-success`; take-over Control bar "You're in control. {agentName} is paused." + "Hand back to {agentName}"
// `signin-banner-hand-back` (Alt+D), no Stop (X-121); root `signin-banner` with `data-state` waiting / in_control /
// signed_in; Narrator: window name "{domain}, sign in, {agentName}", the banner `role="status"`, success announced "Signed
// in. Carrying on."; Tab moves address row → button), 09 §9.27.3 (the banner takes focus when shown), 08-1 §3.1.1 (this
// window calls only signin:done, signin:skip, job:handBack).
import { useEffect, useRef, useState } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { announce } from '../a11y/announce';
import { invoke } from '../ipc/client';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { cx } from '../ui/cx';
import { addressOf, parseBannerHash, type BannerPage } from './bannerView';
import styles from './SigninBanner.module.css';

function useBannerPage(): BannerPage | null {
  const [page, setPage] = useState(() => parseBannerHash(location.hash));
  useEffect(() => {
    const on = () => setPage(parseBannerHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return page;
}

export function SigninBanner() {
  const page = useBannerPage();
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const address = page ? addressOf(page.url) : null;

  const state = page?.state;
  const agentName = page?.agentName;
  const domain = address?.domain ?? '';
  useEffect(() => {
    if (!state || !agentName) return;
    document.title = t('signin_banner.window.title', { domain, agentName });
    if (state === 'signed_in') announce(t('signin_banner.success.announce'), 'polite');
    else button.current?.focus();
  }, [state, agentName, domain]);

  if (!page) return null;
  const act = (channel: 'signin:done' | 'job:handBack') => {
    if (busy) return;
    setBusy(true);
    void invoke(channel, { jobId: page.jobId })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  return (
    <div className={styles.root} data-testid={TID.signinBanner} data-state={page.state}>
      <div className={styles.address} data-testid={TID.signinBannerAddress} tabIndex={0}>
        {address?.secure ? (
          <Icon name="LockClosed" size={16} className={styles.lock} />
        ) : (
          <span className={styles.notSecure}>{t('signin_banner.not_secure.text')}</span>
        )}
        <span className={styles.domain} data-copy="external">
          {address?.domain}
        </span>
        <span className={styles.path} data-copy="external">
          {address && address.path !== '/' ? address.path : ''}
        </span>
      </div>
      {page.state === 'signed_in' ? (
        <div className={cx(styles.band, styles.success)} data-testid={TID.signinBannerSuccess}>
          <Icon name="CheckmarkCircle" size={16} />
          <span className={styles.text}>{t('signin_banner.success.text')}</span>
        </div>
      ) : page.state === 'in_control' ? (
        <div className={cx(styles.band, styles.control)} role="status">
          <Icon name="HandRight" size={16} />
          <span className={styles.text}>{t('signin_banner.in_control.text', { agentName: page.agentName })}</span>
          <Button
            ref={button}
            variant="secondary"
            size="sm"
            accessKey="d"
            disabled={busy}
            data-testid={TID.signinBannerHandBack}
            onClick={() => act('job:handBack')}
          >
            {t('signin_banner.hand_back.label', { agentName: page.agentName })}
          </Button>
        </div>
      ) : (
        <div className={cx(styles.band, styles.warn)} role="status">
          <Icon name="Warning" size={16} />
          <span className={styles.text}>{t('signin_banner.waiting.text', { agentName: page.agentName })}</span>
          <Button
            ref={button}
            variant="secondary"
            size="sm"
            accessKey="d"
            disabled={busy}
            data-testid={TID.signinBannerDone}
            onClick={() => act('signin:done')}
          >
            {t('signin_banner.done.label')}
          </Button>
        </div>
      )}
    </div>
  );
}
