// Spec: 04 §10.3 (voice player: 36px play / pause, 40 bars 2px wide with 2px gaps, heights 4–24 from the recorded
// loudness, played / unplayed colours, click or drag seeks, time under the waveform (length when stopped, elapsed when
// playing), transcript 2 lines + "more", working / failed states, Narrator "Voice note, 0:14", Space / Enter toggles,
// ←/→ seek 5 s, never auto-plays), §18 (foo's notes: recoloured; speed chip 1× → 1.5× → 2× → 1×; playing one note pauses any
// other), 05-3 §5.25 (a voice note is a message, not a card). Audio comes from {DATA} through the app://media host.
// 02-2 §F15.9.3 #14: while foo's or a helper's note plays, its chat's face is Speaking and its bars follow the audio level.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { t } from '../../shared/copy/t';
import { formatDuration } from '../../shared/format';
import { TID } from '../../shared/testids';
import { update, useStore } from '../store/index';
import { expand, selectExpanded } from '../store/messages';
import { Icon } from '../ui/Icon';
import { cx } from '../ui/cx';
import { setSpeakingLevel } from '../ui/Face';
import { mediaUrl } from './bubbleContext';
import { BARS, nextSpeed, waveform } from './voiceRules';
import styles from './Bubble.module.css';

const SEEK_MS = 5000;

let playing: HTMLAudioElement | null = null;

/** §F15.9.2 `--m-face-level`: the level is sampled every 100 ms, like the live mic level. */
const LEVEL_MS = 100;

/** Marks the note's chat as Speaking and feeds the face the playing audio's level; returns the stop function. */
function speak(messageId: string, a: HTMLAudioElement): () => void {
  const chatId = Object.entries(useStore.getState().messages.byChat).find(([, c]) => c.byId[messageId])?.[0];
  if (!chatId) return () => undefined;
  update((s) => {
    s.live.speaking[chatId] = true;
  });
  let stopMeter: () => void = () => undefined;
  let stopped = false;
  const meter = (stream: MediaStream) => {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const id = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      setSpeakingLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    }, LEVEL_MS);
    stopMeter = () => {
      clearInterval(id);
      void ctx.close();
    };
  };
  try {
    const stream = (a as HTMLAudioElement & { captureStream?: () => MediaStream }).captureStream?.();
    if (stream && stream.getAudioTracks().length > 0) meter(stream);
    else if (stream) {
      // With preload="none" the track arrives once the note starts flowing.
      const onTrack = () => {
        stream.removeEventListener('addtrack', onTrack);
        if (!stopped) meter(stream);
      };
      stream.addEventListener('addtrack', onTrack);
      stopMeter = () => stream.removeEventListener('addtrack', onTrack);
    }
  } catch {
    // No level to read: the bars stay at rest while the note plays.
  }
  return () => {
    stopped = true;
    stopMeter();
    setSpeakingLevel(0);
    update((s) => {
      delete s.live.speaking[chatId];
    });
  };
}

export interface VoiceProps {
  messageId: string;
  path: string | null;
  ms: number;
  transcript: string | null;
  /** Transcript still being written (§10.3 Working) or failed. */
  transcriptState: 'ready' | 'working' | 'failed';
  side: 'me' | 'foo';
}

export function VoicePlayer({ messageId, path, ms, transcript, transcriptState, side }: VoiceProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const stopSpeaking = useRef<(() => void) | null>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const more = useStore(selectExpanded(messageId, 'transcript'));
  const bars = useMemo(() => waveform(messageId), [messageId]);
  const url = path ? mediaUrl(path) : null;
  const length = ms || 0;
  const played = length ? Math.round((at / length) * BARS) : 0;

  useEffect(() => {
    const a = audio.current;
    return () => {
      if (a && playing === a) playing = null;
      a?.pause();
      stopSpeaking.current?.();
    };
  }, []);

  const toggle = () => {
    const a = audio.current;
    if (!a || !url) return;
    if (a.paused) {
      if (playing && playing !== a) playing.pause();
      playing = a;
      a.playbackRate = speed;
      void a.play().catch(() => setPlaying(false));
    } else a.pause();
  };
  const seekTo = (msAt: number) => {
    const a = audio.current;
    const v = Math.min(Math.max(0, msAt), length);
    setAt(v);
    if (a) a.currentTime = v / 1000;
  };
  const seekFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - r.left) / r.width) * length);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      seekTo(at + (e.key === 'ArrowRight' ? SEEK_MS : -SEEK_MS));
    }
  };

  return (
    <div className={cx(styles.voice, side === 'foo' && styles.voiceFoo)}>
      <div className={styles.voiceRow}>
        <button
          type="button"
          className={styles.voicePlay}
          data-testid={TID.bubbleVoicePlay}
          aria-label={t('bubble.voice.accessible_name', { duration: formatDuration(length) })}
          aria-pressed={isPlaying}
          onClick={toggle}
          onKeyDown={onKey}
        >
          <Icon name={isPlaying ? 'Pause' : 'Play'} size={16} filled />
        </button>
        <div className={styles.voiceMid}>
          <div
            className={styles.wave}
            data-testid={TID.bubbleVoiceWave}
            aria-hidden="true"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              seekFromPointer(e);
            }}
            onPointerMove={(e) => e.buttons === 1 && seekFromPointer(e)}
          >
            {bars.map((h, i) => (
              <span key={i} className={cx(styles.bar, i < played && styles.barPlayed)} style={{ height: `${h / 16}rem` }} />
            ))}
          </div>
          <span className={styles.voiceTime} data-testid={TID.bubbleVoiceDuration}>
            {formatDuration(isPlaying || at > 0 ? at : length)}
          </span>
        </div>
        {side === 'foo' && (
          <button
            type="button"
            className={styles.speed}
            data-testid={TID.bubbleVoiceSpeed}
            onClick={() => {
              const s = nextSpeed(speed);
              setSpeed(s);
              if (audio.current) audio.current.playbackRate = s;
            }}
          >
            {t('bubble.voice.speed', { speed })}
          </button>
        )}
      </div>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="none"
          onPlay={(e) => {
            setPlaying(true);
            if (side === 'foo') {
              stopSpeaking.current?.();
              stopSpeaking.current = speak(messageId, e.currentTarget);
            }
          }}
          onPause={() => {
            setPlaying(false);
            stopSpeaking.current?.();
            stopSpeaking.current = null;
          }}
          onEnded={() => {
            setPlaying(false);
            setAt(0);
            stopSpeaking.current?.();
            stopSpeaking.current = null;
          }}
          onTimeUpdate={(e) => setAt(e.currentTarget.currentTime * 1000)}
        />
      )}
      {transcriptState === 'working' && <div className={styles.transcript}>{t('bubble.voice.transcript_working')}</div>}
      {transcriptState === 'failed' && <div className={styles.transcript}>{t('bubble.voice.transcript_failed')}</div>}
      {transcriptState === 'ready' && transcript && (
        <div className={styles.transcriptWrap}>
          <div
            className={cx(styles.transcript, !more && styles.clamp2)}
            data-testid={TID.bubbleVoiceTranscript}
            data-copy={side === 'me' ? 'user' : 'ai'}
          >
            {transcript}
          </div>
          {!more && transcript.length > 90 && (
            <button
              type="button"
              className={styles.linkButton}
              data-testid={TID.bubbleVoiceMore}
              onClick={() => expand(messageId, 'transcript')}
            >
              {t('bubble.voice.more')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
