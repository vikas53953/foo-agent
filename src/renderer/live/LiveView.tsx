// Spec: 06-3 §11.2 (the Watch live window: title bar 32, foo bar 48 with job avatar 26, "{job} · step n of m", the state
// pill, site domain, [ Take over ] [ Stop ]; the picture, letterboxed on `--bg-sunken`, never interactive: a click only shows
// the tooltip at the pointer; Now line under it; the 48px control bar only in control, X-121; states and words; Narrator name
// and announcements; Esc never stops the job), 09 §9.27.2 (`job:watch` on while shown, off when hidden or minimised; Take over
// = `job:takeOver`, Hand back = `job:handBack`, Stop = `job:stop`, no confirm), AT-079, AT-272.
import { useEffect, useMemo, useReducer, useRef, useState, type MouseEvent } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { announce } from '../a11y/announce';
import { Announcer } from '../a11y/Announcer';
import { invoke, useFooEvent } from '../ipc/client';
import { TitleBar } from '../shell/TitleBar';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { Icon } from '../ui/Icon';
import { Spinner } from '../ui/Spinner';
import { liveNowLine, liveView } from './liveState';
import { initialLiveWindow, liveReducer } from './liveStore';
import styles from './LiveView.module.css';

const quiet = (p: Promise<unknown>) => void p.catch(() => undefined);

/** The frame as a data URL (CSP allows `data:` images; nothing to revoke, frames are never stored). */
function frameUrl(jpeg: ArrayBuffer | null): string | null {
  if (!jpeg) return null;
  const bytes = new Uint8Array(jpeg);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

export function LiveView({ jobId }: { jobId: string }) {
  const [m, dispatch] = useReducer(liveReducer, jobId, initialLiveWindow);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const picture = useMemo(() => frameUrl(m.frame), [m.frame]);

  useFooEvent('job:upsert', (job) => dispatch({ type: 'job', job }));
  useFooEvent('settings:changed', (s) => dispatch({ type: 'agentName', name: s.identity.agentName }));
  useFooEvent('live:frame', (frame) => dispatch({ type: 'frame', frame }));
  useFooEvent('live:state', (s) => dispatch({ type: 'state', jobId: s.jobId, state: s.state }));

  // 09 §9.27.2: frames only while this window is visible.
  useEffect(() => {
    const sync = () => {
      const on = document.visibilityState === 'visible';
      invoke('job:watch', { jobId, on }).then(
        (r) => {
          if (on && !r.ok) dispatch({ type: 'unavailable' });
        },
        () => {
          if (on) dispatch({ type: 'unavailable' });
        },
      );
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [jobId]);

  // Narrator: mode changes and step changes, never per frame.
  const prevShown = useRef(m.shown);
  useEffect(() => {
    if (m.shown === 'in_control' && prevShown.current !== 'in_control') announce(t('live.window.control_bar', { agentName: m.agentName }));
    if (prevShown.current === 'in_control' && m.shown !== 'in_control')
      announce(t('live.window.back_in_control', { agentName: m.agentName }));
    prevShown.current = m.shown;
  }, [m.shown, m.agentName]);
  const step = m.job?.currentStepIdx ?? null;
  const prevStep = useRef(step);
  useEffect(() => {
    if (step !== null && prevStep.current !== null && step !== prevStep.current && m.job)
      announce(t('live.window.step_announce', { n: step + 1, total: m.job.stepCount, step: m.job.nowLine }));
    prevStep.current = step;
  }, [step, m.job]);

  const job = m.job;
  const title = job?.title ?? '';
  const view = liveView({
    state: m.shown,
    nowLine: liveNowLine(m.shown, m.nowLine, job?.nowLine ?? ''),
    waitingReason: job?.waitingReason ?? null,
    agentName: m.agentName,
  });
  const barTitle =
    job && job.stepCount > 0
      ? t('live.window.bar_title', { job: title, n: Math.min((step ?? job.stepsDone) + 1, job.stepCount), total: job.stepCount })
      : title;
  const inControl = m.shown === 'in_control';

  // When the control bar swaps in or out, focus goes to its first button so a keyboard user is never left on a removed one.
  const takeOverRef = useRef<HTMLButtonElement>(null);
  const handBackRef = useRef<HTMLButtonElement>(null);
  const wasInControl = useRef(inControl);
  useEffect(() => {
    if (inControl !== wasInControl.current) (inControl ? handBackRef : takeOverRef).current?.focus();
    wasInControl.current = inControl;
  }, [inControl]);

  const onPicture = (e: MouseEvent) => {
    // The picture is never the page: a click only explains that (06-3 §11.2).
    e.preventDefault();
    setTip({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className={styles.root}
      data-testid={TID.liveRoot}
      data-state={m.shown}
      role="main"
      aria-label={t('live.window.name', { job: title })}
    >
      <TitleBar />
      <header className={styles.bar} data-testid={TID.liveBar}>
        <Avatar face={`letter:${m.agentName.slice(0, 1)}`} name={m.agentName} kind="foo" size="inline" className={styles.avatar} />
        <span className={styles.title}>{barTitle}</span>
        {view.pill && (
          <span className={styles.pill} data-testid={TID.livePill} data-state={m.shown} data-tone={view.pill.tone}>
            {view.pill.tone === 'live' && <span className={styles.dot} aria-hidden />}
            {view.pill.text}
          </span>
        )}
        <span className={styles.site}>{job?.siteDomain ?? ''}</span>
        {view.takeOver && (
          <span className={styles.actions}>
            <Button
              ref={takeOverRef}
              variant={m.shown === 'needs_you' ? 'primary' : 'outline'}
              data-testid={TID.liveTakeOver}
              onClick={() => quiet(invoke('job:takeOver', { jobId }))}
            >
              {t('live.window.take_over')}
            </Button>
            <Button data-testid={TID.liveStop} onClick={() => quiet(invoke('job:stop', { jobId }))}>
              {t('live.window.stop')}
            </Button>
          </span>
        )}
      </header>
      <div
        className={styles.picture}
        data-testid={TID.livePicture}
        data-masked={m.frame || m.blank ? 'true' : undefined}
        onMouseDown={onPicture}
        onMouseLeave={() => setTip(null)}
      >
        {m.shown === 'starting' ? (
          <span className={styles.starting}>
            <Spinner size={20} />
          </span>
        ) : m.shown === 'cant_show' ? null : (
          picture && <img className={styles.img} src={picture} alt="" draggable={false} />
        )}
        {tip && (
          <div className={styles.tip} role="tooltip" style={{ left: tip.x, top: tip.y }}>
            {t('live.window.picture_tooltip')}
          </div>
        )}
      </div>
      {view.line && <p className={cx(styles.line, m.shown === 'cant_show' && styles.lineCentre)}>{view.line}</p>}
      {inControl && (
        <div className={styles.control} data-testid={TID.liveControlBar} role="group" aria-label={view.controlBar ?? undefined}>
          <Icon name="HandRight" size={20} />
          <span className={styles.controlText}>{view.controlBar}</span>
          <button
            type="button"
            ref={handBackRef}
            className={styles.handBack}
            data-testid={TID.liveHandBack}
            onClick={() => quiet(invoke('job:handBack', { jobId }))}
          >
            {view.handBack}
          </button>
          <button
            type="button"
            className={styles.controlStop}
            data-testid={TID.liveStop}
            onClick={() => quiet(invoke('job:stop', { jobId }))}
          >
            {t('live.window.stop')}
          </button>
        </div>
      )}
      <Announcer />
    </div>
  );
}
