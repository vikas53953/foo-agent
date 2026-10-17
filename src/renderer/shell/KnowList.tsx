// Spec: 03-shell-2 §3.7.3.3 (What I know: label per chat kind; up to 3 facts most recently used, then newest; bordered tile with
// "You said · {d Mon}" / "I guessed · {reason}" meta and an "Edit" link → Memory in edit mode; "See all ({n})" → Memory; empty
// line), §3.7.4 (foo: general facts; helper: its notes; group: not shown, GroupMembers takes its place).
import { useEffect, useMemo, useState } from 'react';
import { t } from '../../shared/copy/t';
import { formatDate } from '../../shared/format';
import { TID } from '../../shared/testids';
import type { ChatRow, MemoryFactView } from '../../shared/types';
import { invoke } from '../ipc/client';
import { navigate, useStore } from '../store/index';
import { selectHelper } from '../store/helpers';
import { selectNow } from '../store/live';
import { selectTimeZone } from '../store/settings';
import styles from './KnowList.module.css';
import { knowFacts } from './panelData';
import section from './PanelSection.module.css';

/** F19.3 "d Mon" ("3 Oct"; the year joins when it is not this year): the `date` form without its weekday. */
export function dayMonth(at: number, now: number, timeZone: string): string {
  return formatDate(at, 'date', { now, timeZone }).replace(/^\S+\s/, '');
}

export function KnowList({ chat }: { chat: ChatRow }) {
  const timeZone = useStore(selectTimeZone);
  const helper = useStore(selectHelper(chat.helperId));
  const now = useStore(selectNow);
  const [facts, setFacts] = useState<MemoryFactView[]>([]);

  useEffect(() => {
    let live = true;
    invoke('memory:list', { filter: { chip: 'all' } })
      .then((r) => live && setFacts(r.ok ? r.value : []))
      .catch(() => live && setFacts([]));
    return () => {
      live = false;
    };
  }, [chat.id]);

  const { rows, total } = useMemo(() => knowFacts(facts, chat), [facts, chat]);
  const helperName = helper?.name ?? chat.title;
  const title = chat.kind === 'helper' ? t('app.panel.know.title.helper', { name: helperName }) : t('app.panel.know.title.foo');

  return (
    <section
      className={section.section}
      data-testid={TID.appPanelKnow}
      data-empty={!total || undefined}
      aria-labelledby="app-panel-know-title"
    >
      <h2 className={section.label} id="app-panel-know-title">
        {title}
      </h2>
      {total === 0 ? (
        <p className={section.empty}>{t('app.panel.know.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((f) => (
            <li key={f.id} className={styles.fact} data-testid={TID.appPanelKnowFact} data-row-id={f.id}>
              <span className={styles.text}>{f.text}</span>
              <span className={styles.meta}>
                {f.provenance === 'said'
                  ? t('app.panel.know.meta.said', { date: dayMonth(f.learnedAt, now, timeZone) })
                  : t('app.panel.know.meta.guessed', { reason: f.reason ?? '' })}
                {' · '}
                <button
                  type="button"
                  className={styles.edit}
                  data-testid={TID.appPanelKnowEdit}
                  onClick={() => navigate({ kind: 'screen', id: 'memory', params: { factId: f.id, mode: 'edit' } })}
                >
                  {t('app.panel.know.edit')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {total > rows.length && (
        <button
          type="button"
          className={section.link}
          data-testid={TID.appPanelKnowSeeAll}
          onClick={() => navigate({ kind: 'screen', id: 'memory' })}
        >
          {t('app.panel.know.see_all', { count: total })}
        </button>
      )}
    </section>
  );
}
