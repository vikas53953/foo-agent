// Spec: 06-1 §2.1 (the Welcome card: 96px living face waking up once, "Hi, I'm foo.", two body lines, [ Let's go ] Primary
// 40px with default focus, the privacy line under the card; `role="group"` named "Welcome"), §2.3 Card 2a (name field, max
// 20, counter from 16, That's it / Keep "foo" / 🎲 Surprise me, two errors) and Card 2b (2×2 radiogroup of 104px tiles,
// tile 1 the living face "Living face · Default", tiles 2–4 glyph faces, Use this face / 🎲 Surprise me), §2.0 rule 5
// (answered cards collapse to "{question} → {answer}"). CR-0026 picks 3–5: the privacy dialog, per-card Skip and "Use my
// own picture" are not built yet.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { t } from '../../../shared/copy/t';
import { FIRST_TILES, glyphRef, surpriseName, surpriseTiles, type GlyphTile } from '../../../shared/firstRunPools';
import { TID } from '../../../shared/testids';
import type { CardRow, SetupCardPayload } from '../../../shared/types';
import { invoke } from '../../ipc/client';
import { Face } from '../../ui/Face';
import { Icon } from '../../ui/Icon';
import { TextField } from '../../ui/TextField';
import { cx } from '../../ui/cx';
import { CardButton } from '../CardButton';
import { CardFrame, CardTimeLabel, type CardTime } from '../CardFrame';
import styles from './FirstRunCards.module.css';

const NAME_MAX = 20;
const COUNTER_FROM = 16;
const graphemes = (s: string) => [...new Intl.Segmenter('en-IN', { granularity: 'grapheme' }).segment(s)].map((g) => g.segment);
/** Names "Surprise me" already offered this session (06-1 §2.3: no repeat within the session). */
const offered = new Set<string>();

function Collapsed({ card, question, answer, time }: { card: CardRow; question: string; answer: string; time: CardTime }) {
  const p = card.payload as unknown as SetupCardPayload;
  return (
    <CardFrame
      tid="cardSetup"
      card={card}
      state={card.state}
      label={question}
      muted={card.state === 'skipped'}
      className={styles.setup}
      data={{ 'data-row-id': p.setupCard }}
    >
      <div className={styles.summary}>
        <span>{card.state === 'skipped' ? t('setup.card.skipped', { question }) : t('setup.card.answered', { question, answer })}</span>
        <span className={styles.spacer} />
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}

/** §2.1 Welcome. */
export function WelcomeCard({ card, time }: { card: CardRow; time: CardTime }) {
  const [busy, setBusy] = useState(false);
  const start = useRef<HTMLDivElement>(null);
  useEffect(() => start.current?.querySelector('button')?.focus(), []);
  if (card.state !== 'shown')
    return <Collapsed card={card} question={t('setup.welcome.title')} answer={t('setup.welcome.start')} time={time} />;
  return (
    <div className={styles.welcomeWrap}>
      <CardFrame
        tid="cardSetup"
        card={card}
        state={card.state}
        label={t('setup.welcome.aria')}
        className={cx(styles.setup, styles.welcome)}
        data={{ 'data-row-id': 'welcome' }}
      >
        <div className={styles.welcomeFace} data-testid={TID.setupWelcomeFace} aria-hidden="true">
          <Face faceRef="living:default" size={96} mood="waking" ring={false} />
        </div>
        <h2 className={styles.welcomeTitle} data-testid={TID.setupWelcomeTitle}>
          {t('setup.welcome.title')}
        </h2>
        <div className={styles.welcomeBody} data-testid={TID.setupWelcomeBody}>
          <p>{t('setup.welcome.body_1')}</p>
          <p>{t('setup.welcome.body_2')}</p>
        </div>
        <div ref={start} className={styles.welcomeActions}>
          <CardButton
            tid="setupWelcomeStart"
            kind="primary"
            busy={busy}
            onClick={() => {
              setBusy(true);
              void invoke('setup:welcome', {}).finally(() => setBusy(false));
            }}
          >
            {t('setup.welcome.start')}
          </CardButton>
        </div>
      </CardFrame>
      <p className={styles.privacy}>{t('setup.welcome.privacy')}</p>
    </div>
  );
}

/** §2.3 Card 2a · Name. */
export function NameCard({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as SetupCardPayload;
  const [value, setValue] = useState('');
  const [error, setError] = useState<'too_long' | 'no_letter' | null>(null);
  const [busy, setBusy] = useState<'done' | 'keep' | null>(null);
  if (card.state !== 'shown') return <Collapsed card={card} question={t('setup.name.question')} answer={p.answer ?? ''} time={time} />;

  const send = (name: string, which: 'done' | 'keep') => {
    if (name.trim() !== '' && !/[\p{L}\p{N}]/u.test(name)) return setError('no_letter');
    setBusy(which);
    void invoke('setup:name', { name })
      .then((r) => {
        if (!r.ok && (r.error.message === 'too_long' || r.error.message === 'no_letter')) setError(r.error.message);
      })
      .finally(() => setBusy(null));
  };
  const count = graphemes(value).length;
  return (
    <CardFrame
      tid="cardSetup"
      card={card}
      state={card.state}
      label={t('setup.name.question')}
      className={styles.setup}
      busy={busy !== null}
      data={{ 'data-row-id': 'name' }}
    >
      <p className={styles.question}>{t('setup.name.question')}</p>
      <div className={styles.fieldRow}>
        <TextField
          data-testid={TID.setupNameField}
          className={styles.field}
          placeholder={t('setup.name.placeholder')}
          aria-label={t('setup.name.question')}
          aria-invalid={error !== null || undefined}
          value={value}
          onChange={(e) => {
            const g = graphemes(e.target.value);
            setValue(g.slice(0, NAME_MAX).join(''));
            setError(g.length > NAME_MAX ? 'too_long' : null);
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && busy === null) send(value, 'done');
          }}
        />
        {count >= COUNTER_FROM && <span className={styles.counter}>{t('setup.name.counter', { n: count })}</span>}
      </div>
      {error && (
        <p className={styles.error} role="alert" data-testid={TID.setupNameError}>
          {error === 'too_long' ? t('setup.name.error.too_long') : t('setup.name.error.no_letter')}
        </p>
      )}
      <div className={styles.actions}>
        <CardButton tid="setupNameDone" kind="primary" busy={busy === 'done'} onClick={() => send(value, 'done')}>
          {t('setup.name.done')}
        </CardButton>
        <CardButton tid="setupNameKeep" kind="secondary" busy={busy === 'keep'} onClick={() => send('', 'keep')}>
          {t('setup.name.keep')}
        </CardButton>
        <CardButton
          tid="setupNameSurprise"
          kind="secondary"
          label={t('setup.name.surprise_aria')}
          onClick={() => {
            const name = surpriseName(offered);
            offered.add(name);
            setValue(name);
            setError(null);
          }}
        >
          {t('setup.name.surprise')}
        </CardButton>
      </div>
    </CardFrame>
  );
}

const GLYPH_NAME: Record<GlyphTile['glyph']['id'], () => string> = {
  flower: () => t('setup.face.glyph.flower'),
  half_moon: () => t('setup.face.glyph.half_moon'),
  star: () => t('setup.face.glyph.star'),
  plane: () => t('setup.face.glyph.plane'),
  sun: () => t('setup.face.glyph.sun'),
  note: () => t('setup.face.glyph.note'),
  umbrella: () => t('setup.face.glyph.umbrella'),
  diamond: () => t('setup.face.glyph.diamond'),
};
const COLOUR_NAME: Record<GlyphTile['colour']['id'], () => string> = {
  terracotta: () => t('setup.face.colour.terracotta'),
  green: () => t('setup.face.colour.green'),
  violet: () => t('setup.face.colour.violet'),
  teal: () => t('setup.face.colour.teal'),
  raspberry: () => t('setup.face.colour.raspberry'),
  ochre: () => t('setup.face.colour.ochre'),
};
const glyphAria = (tile: GlyphTile, n: number) =>
  t('setup.face.tile_glyph_aria', { n, glyph: GLYPH_NAME[tile.glyph.id](), colour: COLOUR_NAME[tile.colour.id]() });

/** §2.3 Card 2b · Face (2×2 picker). */
export function FaceCard({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as SetupCardPayload;
  const [tiles, setTiles] = useState<GlyphTile[]>(FIRST_TILES);
  const [picked, setPicked] = useState(0);
  const [busy, setBusy] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  if (card.state !== 'shown') {
    const a = p.answer ?? '';
    const answer = a.startsWith('glyph:') ? t('setup.face.answer_glyph', { glyph: a.slice(6) }) : t('setup.face.answer_living');
    return <Collapsed card={card} question={t('setup.face.question')} answer={answer} time={time} />;
  }
  const refOf = (i: number) => (i === 0 ? 'living:default' : glyphRef(tiles[i - 1]!));
  const move = (i: number) => {
    setPicked(i);
    grid.current?.querySelectorAll<HTMLElement>('[role="radio"]')[i]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = { Home: 0, End: 3 }[e.key];
    const step = { ArrowRight: 1, ArrowDown: 2, ArrowLeft: -1, ArrowUp: -2 }[e.key];
    if (to === undefined && step === undefined) return;
    e.preventDefault();
    move(to ?? (picked + step! + 4) % 4);
  };
  return (
    <CardFrame
      tid="cardSetup"
      card={card}
      state={card.state}
      label={t('setup.face.question')}
      className={styles.setup}
      busy={busy}
      data={{ 'data-row-id': 'face' }}
    >
      <p className={styles.question}>{t('setup.face.question')}</p>
      <div
        ref={grid}
        className={styles.grid}
        role="radiogroup"
        aria-label={t('setup.face.grid_aria')}
        data-testid={TID.setupFaceGrid}
        onKeyDown={onKey}
      >
        {[0, 1, 2, 3].map((i) => {
          const tile = i === 0 ? null : tiles[i - 1]!;
          const on = picked === i;
          return (
            <div key={i} className={styles.tileCell}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={tile ? glyphAria(tile, i + 1) : t('setup.face.tile_living_aria')}
                tabIndex={on ? 0 : -1}
                className={cx(styles.tile, on && styles.tileOn)}
                data-testid={TID.setupFaceTile}
                data-index={i + 1}
                data-state={on ? 'selected' : 'idle'}
                onClick={() => setPicked(i)}
              >
                {tile ? (
                  <span className={styles.glyph} style={{ background: `var(${tile.colour.token})` }} aria-hidden="true">
                    {tile.glyph.glyph}
                  </span>
                ) : (
                  <Face faceRef="living:default" size={72} ring={false} />
                )}
                <span className={styles.tileNo} aria-hidden="true">
                  {i + 1}
                </span>
                {on && (
                  <span className={styles.check} aria-hidden="true">
                    <Icon name="Checkmark" size={16} />
                  </span>
                )}
              </button>
              {!tile && (
                <span className={styles.tileLabel} aria-hidden="true">
                  <span>{t('setup.face.living_label')}</span>
                  <span className={styles.tileSub}>{t('setup.face.living_default')}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.actions}>
        <CardButton
          tid="setupFaceUse"
          kind="primary"
          busy={busy}
          onClick={() => {
            setBusy(true);
            void invoke('setup:face', { face: refOf(picked) }).finally(() => setBusy(false));
          }}
        >
          {t('setup.face.use')}
        </CardButton>
        <CardButton
          tid="setupFaceSurprise"
          kind="secondary"
          label={t('setup.face.surprise_aria')}
          onClick={() => {
            setTiles((cur) => surpriseTiles(cur));
            if (picked !== 0) setPicked(0);
          }}
        >
          {t('setup.face.surprise')}
        </CardButton>
      </div>
    </CardFrame>
  );
}
