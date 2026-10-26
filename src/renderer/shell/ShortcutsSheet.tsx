// Spec: 06-3 §19 keyboard shortcuts sheet (Ctrl+/, left shell ⋯ → "Keyboard shortcuts", Settings → Keyboard shortcuts → "Show
// as a sheet"; Dialog md `dialog-shortcuts`, body scrolls, filter `dialog-shortcuts-filter`, rows `dialog-shortcuts-row` with
// `data-row-id`; no match → "No shortcut matches "{query}"."; each group a heading + table, a row reads "{action}, Control
// plus N"), 06-2 §6.10 (the same list as Settings page rows, key caps with no "+" drawn between them, footer Link "Show as a
// sheet (Ctrl+/)"), CR-0060 (X-217): only the rows whose feature is on in this build.
import { useState } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { closeDialog, openDialog, useStore } from '../store/index';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { TextField } from '../ui/TextField';
import { CARDS_LINE_FEATURE, shortcutGroups, type ShortcutRow } from './shortcutList';
import styles from './ShortcutsSheet.module.css';

/** Narrator words for a key cap. */
const SPOKEN: Record<string, () => string> = {
  Ctrl: () => t('shortcuts.key.ctrl'),
  Shift: () => t('shortcuts.key.shift'),
};
const spoken = (row: ShortcutRow) =>
  `${row.label()}, ${row.keys.map((alt) => alt.map((c) => SPOKEN[c]?.() ?? c).join(` ${t('shortcuts.key.plus')} `)).join(', ')}`;

function Caps({ row }: { row: ShortcutRow }) {
  return (
    <span className={styles.keys} aria-hidden="true">
      {row.keys.map((alt, i) => (
        <span key={i} className={styles.alt}>
          {i > 0 && <span className={styles.or}>/</span>}
          {alt.map((cap) => (
            <kbd key={cap} className={styles.cap}>
              {cap}
            </kbd>
          ))}
        </span>
      ))}
      {row.hold && <span className={styles.hold}>{t('shortcuts.sheet.hold')}</span>}
    </span>
  );
}

/** The grouped list, shared by the sheet and the Settings page. */
export function ShortcutList({ query = '', rowTid }: { query?: string; rowTid: 'dialogShortcutsRow' | 'settingsRowShortcuts' }) {
  const features = useStore((s) => s.live.features);
  const groups = shortcutGroups(features, query);
  const cardsLine = features === null || features.includes(CARDS_LINE_FEATURE);
  if (!groups.length) return <p className={styles.none}>{t('shortcuts.sheet.none', { query })}</p>;
  return (
    <div className={styles.list}>
      {groups.map((g) => (
        <section key={g.id} className={styles.group}>
          <h3 className={styles.groupTitle}>{g.label()}</h3>
          <table className={styles.table}>
            <tbody>
              {g.rows.map((r) => (
                <tr
                  key={r.id}
                  className={styles.row}
                  data-testid={TID[rowTid]}
                  data-row-id={r.id}
                  data-press={r.press}
                  aria-label={spoken(r)}
                >
                  <td className={styles.action}>{r.label()}</td>
                  <td className={styles.keysCell}>
                    <Caps row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {cardsLine && !query && <p className={styles.cardsLine}>{t('shortcuts.sheet.cards_line')}</p>}
    </div>
  );
}

/** Mounted once by the shell; shows while `ui.dialog` is 'shortcuts'. */
export function ShortcutsSheet() {
  const open = useStore((s) => s.ui.dialog === 'shortcuts');
  const [query, setQuery] = useState('');
  if (!open) return null;
  const close = () => {
    setQuery('');
    closeDialog();
  };
  return (
    <Dialog
      tid="dialogShortcuts"
      size="md"
      title={t('shortcuts.sheet.title')}
      primary={t('dialog.common.close')}
      onPrimary={close}
      onClose={close}
    >
      <TextField
        shape="search"
        size="sm"
        className={styles.filter}
        data-testid={TID.dialogShortcutsFilter}
        aria-label={t('shortcuts.sheet.filter')}
        placeholder={t('shortcuts.sheet.filter')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={styles.scroll}>
        <ShortcutList query={query} rowTid="dialogShortcutsRow" />
      </div>
    </Dialog>
  );
}

/** 06-2 §6.10: the Settings page. */
export function ShortcutsPage() {
  return (
    <div className={styles.page}>
      <ShortcutList rowTid="settingsRowShortcuts" />
      <Button variant="link" className={styles.sheetLink} onClick={() => openDialog('shortcuts')}>
        {t('shortcuts.page.show_sheet')}
      </Button>
    </div>
  );
}
