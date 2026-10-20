// Spec: 05-1 §5.4 Option tiles: §5.4.1 anatomy (`--card-w-wide`; inner width ≥ 520: one row of tiles, 2 → 2 columns, 3 → 3,
// 4 → 2 × 2, gap 8; narrower: tiles stack as rows of min 88 = the 72 `--thumb` + 2 × `--s1`, thumb left `--r-sm`, text 12
// to its right; a tile is one button, 1px `--line`, `--r-md`, padding 8, `--bg-raised`, rows 4 apart; photo 4:3 cover `--r-sm`
// shown from disk (never hot-linked), loading / missing `--bg-sunken` with Image 24 `--fg-3`; Best fit 1.5px `--accent` and the
// "Best fit" line above the name; name `--t-body-strong` one line; price `--t-small` `--fg-1` tabular; facts `--t-small`
// `--fg-2` 2 lines, "No free cancellation" in `--bad`), §5.4.2 copy (Something else / Skip / summaries as §5.3.2), §5.4.3
// states (hover `--shadow-4` + `--line-strong`; pressed 0.97; Submitting strip "Checking it's still free…" with a 16 spinner
// under the photo, other tiles disabled; answered summary with the chosen photo's 40 thumb), §5.4.4 (radiogroup; arrows move,
// 1–4 pick, Enter picks; tile label "{n} of {total}, {name}, {price}, {facts}{, best fit}", the image `alt=""`).
// implementation-notes M5-T5: ChoicePayload (08-1 §4.5) carries `label`, `detail` and `photoRef` only, so the price is the
// detail's first "·" part and the facts the rest; the context menu ("Open on {site}", "Copy link") needs a link the payload
// does not carry and waits for the browser milestone (M9).
import { useState } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { CardRow } from '../../shared/types';
import { mediaUrl } from '../messages/bubbleContext';
import { useStore } from '../store/index';
import { selectConnection } from '../store/live';
import { Icon } from '../ui/Icon';
import { Spinner } from '../ui/Spinner';
import { cx } from '../ui/cx';
import { CardButton } from './CardButton';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import { byOf, ChoiceSummary, choiceKeys, hasBestFit, showsSkip, showsSomethingElse, useChoice } from './Choice';
import { chosenIds, type ChoiceOption, type ChoiceView } from './choiceText';
import styles from './Card.module.css';
import cs from './Choice.module.css';
import ts from './OptionTiles.module.css';

const FOLDED = new Set(['answered', 'auto_picked', 'skipped', 'expired', 'superseded', 'withdrawn']);

/** The detail as the tile draws it: the price, then the facts. */
export function tileParts(o: ChoiceOption): { price: string; facts: string[] } {
  const [price = '', ...facts] = (o.detail ?? '').split(' · ').map((s) => s.trim());
  return { price, facts: facts.filter(Boolean) };
}

function Photo({ photoRef, small }: { photoRef?: string; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = photoRef ? mediaUrl(photoRef) : null;
  const body =
    src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <Icon name="Image" size={24} className={ts.missing} />;
  return small ? (
    <span className={cx(ts.photo, ts.thumbSmall)}>{body}</span>
  ) : (
    <span className={ts.photo} data-testid={TID.cardTilesPhoto}>
      {body}
    </span>
  );
}

function Tile({
  o,
  index,
  total,
  bestFit,
  checked,
  busy,
  disabled,
  onPick,
}: {
  o: ChoiceOption;
  index: number;
  total: number;
  bestFit: boolean;
  checked: boolean;
  busy: boolean;
  disabled: boolean;
  onPick?: (e: React.MouseEvent) => void;
}) {
  const { price, facts } = tileParts(o);
  const noFree = t('cards.tiles.fact.no_free_cancellation');
  const label = t('cards.tiles.option_label', {
    n: index + 1,
    total,
    name: o.label,
    price,
    facts: facts.join(', '),
    bestFit: bestFit ? 'yes' : 'no',
  });
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={onPick ? undefined : -1}
      className={cx(ts.tile, bestFit && ts.best)}
      data-testid={TID.cardTilesOption}
      data-index={index + 1}
      data-picked={busy || undefined}
      onClick={disabled || !onPick ? undefined : onPick}
    >
      <span className={ts.media}>
        <Photo photoRef={o.photoRef} />
        {checked && !onPick && <Icon name="CheckmarkCircle" size={16} className={ts.tick} />}
      </span>
      {busy && (
        <span className={ts.checking}>
          <Spinner size={16} />
          {t('cards.tiles.checking')}
        </span>
      )}
      <span className={ts.text}>
        {bestFit && <span className={cs.tag}>{t('cards.tiles.tag')}</span>}
        <span className={ts.name} data-copy="external">
          {o.label}
        </span>
        {price && (
          <span className={ts.price} data-copy="external">
            {price}
          </span>
        )}
        {facts.length > 0 && (
          <span className={ts.facts} data-copy="external">
            {facts.map((f, i) => (
              <span key={i} className={f === noFree ? ts.bad : undefined}>
                {i > 0 ? ' · ' : ''}
                {f}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

function ReadOnlyTiles({ card }: { card: CardRow }) {
  const p = card.payload as unknown as ChoiceView;
  const ids = chosenIds(card.answer);
  return (
    <div className={cx(ts.grid, ts[`n${p.options.length}`])}>
      {p.options.map((o, i) => (
        <Tile
          key={o.id}
          o={o}
          index={i}
          total={p.options.length}
          bestFit={i === 0 && hasBestFit(p)}
          checked={ids.includes(o.id)}
          busy={false}
          disabled
        />
      ))}
    </div>
  );
}

export function OptionTiles({ card, time }: { card: CardRow; time: CardTime }) {
  if (FOLDED.has(card.state)) {
    const p = card.payload as unknown as ChoiceView;
    const chosen = p.options.find((o) => chosenIds(card.answer).includes(o.id));
    return (
      <ChoiceSummary
        card={card}
        time={time}
        tid="cardTiles"
        wide
        thumb={chosen && card.state !== 'expired' ? <Photo photoRef={chosen.photoRef} small /> : undefined}
        expanded={<ReadOnlyTiles card={card} />}
      />
    );
  }
  return <AskingTiles card={card} time={time} />;
}

function AskingTiles({ card, time }: { card: CardRow; time: CardTime }) {
  const c = useChoice(card);
  const offline = useStore(selectConnection) === 'offline';
  const { p, q, busy } = c;
  return (
    <CardFrame
      tid="cardTiles"
      card={card}
      state={card.state}
      wide
      data={{ 'data-purpose': p.purpose }}
      label={t('cards.tiles.label', { title: q.question })}
      busy={busy !== null}
      onKeyDown={choiceKeys(c, `[data-testid="${TID.cardTilesOption}"]`, true)}
    >
      <div className={styles.head}>
        <span className={styles.title} data-copy="external">
          {q.question}
        </span>
      </div>
      <div
        className={cx(ts.grid, ts[`n${q.options.length}`])}
        role="radiogroup"
        aria-label={q.question}
        data-picking={busy !== null || undefined}
      >
        {q.options.map((o, i) => (
          <Tile
            key={o.id}
            o={o}
            index={i}
            total={q.options.length}
            bestFit={i === 0 && hasBestFit(p)}
            checked={false}
            busy={busy === o.id}
            disabled={busy !== null && busy !== o.id}
            onPick={(e) => c.pick(o.id, byOf(e))}
          />
        ))}
      </div>
      {offline && (
        <div className={cs.offline}>
          <Icon name="Globe" size={16} className={cs.dim} />
          {t('cards.common.offline_line')}
        </div>
      )}
      <div className={styles.foot}>
        {showsSomethingElse(p) && (
          <button type="button" className={ts.elseButton} data-testid={TID.cardTilesSomethingElse} onClick={c.somethingElse}>
            {t('cards.choice.something_else')}
          </button>
        )}
        <span className={styles.footSpacer} />
        {showsSkip(p) && (
          <CardButton tid="cardTilesSkip" kind="link" busy={busy === 'skip'} disabled={busy !== null} onClick={c.skip}>
            {t('cards.choice.skip')}
          </CardButton>
        )}
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}
