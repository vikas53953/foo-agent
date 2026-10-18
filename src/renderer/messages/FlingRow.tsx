// Spec: 10-acceptance-2 §E PERF-04 (fling scroll at 60 fps), CR-0006 (light rows while the user flings the list). A message
// row drawn while the user's own scrolling runs faster than FLING_PX_PER_MS: the same row, line, hold and bubble boxes and
// classes as the full bubble (04 §1.2 gap, §1.4 tail corners, §2 / §12 fills and widths, §3 meta with the time and the
// tick, `lang`), the 04 §10.1 image tiles as empty boxes in their placeholder fill, the text as plain runs; the 03-shell-2
// §3.6.4 row's role, accessible name (04 §1.8) and data-message-id. It is clipped to the row's known height (measured, else
// the 02-2 §F13.3 estimate) and is not measured. Dropped until the scroll settles (CR-0006 lists them): badges, reaction
// chips, quotes, file chips, link previews, sources, worked line, the voice player, markdown styling, tooltips, the toolbar
// and every control.
import { memo } from 'react';
import { formatTime } from '../../shared/format';
import type { CardRow, MessageRow } from '../../shared/types';
import { Icon } from '../ui/Icon';
import { TickSingle, TicksDouble } from '../ui/icons/Ticks';
import { cx } from '../ui/cx';
import { cornerAttrs, lightFacts, messageAccessibleName, type RowCtx } from './Bubble';
import styles from './Bubble.module.css';
import { MetaSpacer, TimeSpacer, attachmentKind } from './BubbleParts';
import { tickState } from './bubbleState';
import list from './MessageList.module.css';
import type { RowLayout } from './runs';

/** Enough plain text to fill any row's box (the box clips it). */
const LIGHT_CHARS = 600;

export const FlingRow = memo(function FlingRow({
  index,
  start,
  size,
  m,
  layout,
  ctx,
}: {
  index: number;
  start: number;
  size: number;
  m: MessageRow;
  layout: RowLayout;
  ctx: RowCtx;
}) {
  return (
    <div
      data-index={index}
      className={list.row}
      role="listitem"
      data-message-id={m.id}
      tabIndex={-1}
      aria-label={messageAccessibleName(m, ctx)}
      data-light=""
      style={{ top: start, height: size }}
    >
      <Light m={m} layout={layout} ctx={ctx} />
    </div>
  );
});

function Light({ m, layout, ctx }: { m: MessageRow; layout: RowLayout; ctx: RowCtx }) {
  const cards = ctx.cards as Record<string, CardRow>;
  if (m.kind === 'marker')
    return (
      <div className={list.lightMarker} data-gap={layout.gap}>
        {m.text}
      </div>
    );
  const { text, rich, lang } = lightFacts(m, cards);
  if (m.kind === 'card')
    return (
      <div className={list.lightCard} data-gap={layout.gap}>
        <div className={list.lightCardBox}>{text}</div>
      </div>
    );
  const side: 'me' | 'them' = m.authorKind === 'user' ? 'me' : 'them';
  const deleted = m.deletedAt !== null;
  const images = side === 'me' && !deleted ? (m.attachments ?? []).filter((a) => attachmentKind(a) === 'image') : [];
  const n = images.length;
  const time = formatTime(m.createdAt, { timeZone: ctx.timeZone });
  const tick = side === 'me' && !deleted ? tickState(m) : null;
  return (
    <div className={styles.row} data-gap={layout.gap} data-side={side} data-indent={(ctx.isGroup && side === 'them') || undefined}>
      <div className={styles.line}>
        <div className={styles.hold}>
          <div
            className={cx(styles.bubble, deleted ? styles.deleted : side === 'me' ? styles.me : styles.them, rich && styles.rich)}
            lang={lang}
            {...cornerAttrs(layout, side)}
          >
            {n > 0 && (
              <div className={cx(styles.grid, n === 1 && styles.gridOne)}>
                {images.slice(0, 4).map((a, i) => (
                  <span
                    key={a.id}
                    className={cx(
                      styles.tile,
                      n === 1 ? styles.tileOne : n === 2 ? styles.tileTall : n === 3 && i === 0 ? styles.tileWide : styles.tileSquare,
                    )}
                  />
                ))}
              </div>
            )}
            {text && (
              <div className={styles.text} data-side={side === 'me' ? 'me' : 'foo'}>
                {text.slice(0, LIGHT_CHARS)}
                {side === 'me' || deleted ? (
                  <MetaSpacer wide={false} />
                ) : (
                  <TimeSpacer at={m.createdAt} timeZone={ctx.timeZone} mark={false} />
                )}
              </div>
            )}
            <span className={cx(styles.meta, styles.meta_float)}>
              <span className={styles.time}>{time}</span>
              {tick && tick !== 'not_sent' && (
                <span className={styles.tick} data-state={tick} aria-hidden="true">
                  {tick === 'waiting' ? <Icon name="Clock" size={16} /> : tick === 'sent' ? <TickSingle /> : <TicksDouble />}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
