// Spec: 05-3 §5.10 Sign-in-here card: §5.10.1 anatomy (Globe 20 + title; favicon 16 or Globe 16 `--fg-3` + domain; "● LIVE"
// `card-signin-live` only while Edge is in front with the banner; buttons I'm done Primary, Take over Secondary, Skip Link),
// §5.10.2 lanes and states (signinView.ts), §5.10.4 (Tab order I'm done → Take over → Skip; Ctrl+Enter = the Primary, so
// Take over on the CAPTCHA lane; card label "Sign-in needed: {title}"; LIVE reads "live window open"; ids `card-signin`,
// `card-signin-done`, `-take-over`, `-skip`, `-use-code-box`, `-live`), 05-1 §0.5 (submitting: aria-busy, every button
// disabled; summary row for terminal states), 08-1 §3.2 (signin:done, job:takeOver, signin:skip: one engine message each,
// X-124), CR-0013 G-M9-11 (no Watch button); "Use the code box" opens the §5.8 Code box (05-2, M5's secret:offer + code:submit).
import { useState, type KeyboardEvent } from 'react';
import { cardTitle } from '../../shared/cards';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { CardRow } from '../../shared/types';
import { invoke } from '../ipc/client';
import { useStore } from '../store/index';
import { selectConnection } from '../store/live';
import { requestRevealCard } from '../messages/reveal';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { cx } from '../ui/cx';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import styles from './Card.module.css';
import own from './SignIn.module.css';
import { openCodeBox, parseSignIn, signInView, type SignInAction } from './signinView';

const BUTTON_TID: Record<SignInAction, keyof typeof TID> = {
  done: 'cardSigninDone',
  take_over: 'cardSigninTakeOver',
  skip: 'cardSigninSkip',
  use_code_box: 'cardSigninUseCodeBox',
};

const CHANNEL = { done: 'signin:done', take_over: 'job:takeOver', skip: 'signin:skip' } as const;

export function SignInCard({ card, time }: { card: CardRow; time: CardTime }) {
  const offline = useStore(selectConnection) === 'offline';
  const [busy, setBusy] = useState(false);
  const view = signInView(card, { offline, timeZone: time.timeZone });
  // A payload the card cannot draw (an unknown lane, a bank check without its number): the site, read-only.
  if (!view)
    return (
      <CardFrame tid="cardSignin" state={card.state} label={cardTitle(card.payload)} className={cx(own.frame, own.summary, own.grey)}>
        <span className={own.summaryText} data-copy="external">
          {cardTitle(card.payload)}
        </span>
      </CardFrame>
    );
  if (view.kind === 'summary')
    return (
      <CardFrame tid="cardSignin" state={card.state} label={view.text} className={cx(own.frame, own.summary, own[view.tone])}>
        {view.tone === 'grey' && <Icon name="Dismiss" size={16} />}
        <span className={own.summaryText} data-copy="ui">
          {view.text}
        </span>
        {/* The signed-in copy carries its own time ("· 9:32 AM"). */}
        {view.tone !== 'ok' && <CardTimeLabel {...time} />}
      </CardFrame>
    );

  const jobId = parseSignIn(card.payload)!.jobId;
  const act = (action: SignInAction) => {
    if (busy) return;
    setBusy(true);
    const sent =
      action === 'use_code_box'
        ? openCodeBox(card, { offer: (req) => invoke('secret:offer', req), reveal: requestRevealCard })
        : invoke(CHANNEL[action], { jobId });
    void sent.catch(() => undefined).finally(() => setBusy(false));
  };
  const primary = view.buttons[0]!;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey && !primary.disabled) {
      e.preventDefault();
      act(primary.action);
    }
  };
  return (
    <CardFrame tid="cardSignin" state={card.state} label={view.label} className={own.frame}>
      <div className={styles.head} aria-busy={busy || undefined} onKeyDown={onKeyDown}>
        <Icon name="Globe" size={20} className={styles.headIcon} />
        <span className={styles.title} data-copy="ui">
          {view.title}
        </span>
      </div>
      <div className={own.domainRow}>
        <Icon name="Globe" size={16} className={own.favicon} />
        <span className={own.domain} data-copy="external">
          {view.domain}
        </span>
        {view.live && (
          <span className={own.live} data-testid={TID.cardSigninLive} aria-label={t('cards.signin.live.accessible_name')}>
            <span className={own.liveDot} aria-hidden="true" />
            {t('cards.signin.live.pill')}
          </span>
        )}
      </div>
      {view.line && (
        <div className={own.line} data-copy="ui">
          {view.line}
        </div>
      )}
      {view.offlineLine && (
        <div className={own.offline} data-copy="ui">
          <Icon name="Globe" size={16} />
          {view.offlineLine}
        </div>
      )}
      <div className={styles.foot} onKeyDown={onKeyDown}>
        <div className={styles.buttons}>
          {view.buttons.map((b) => (
            <Button
              key={b.action}
              variant={b.variant}
              size="md"
              disabled={b.disabled || busy}
              data-testid={TID[BUTTON_TID[b.action]]}
              onClick={() => act(b.action)}
            >
              {b.label}
            </Button>
          ))}
        </div>
        <span className={styles.footSpacer} />
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}
