// Spec: 04 §6.1 (user bubble: Reply · Copy (has text) · Edit (§6.2 rules) · Select · Delete), §17.4 (foo / helper bubble:
// Reply · React · Copy · Try again (latest answer, §17.1 rule) · Good answer / Not a good answer · Select · Delete), §9.1
// (cards: Reply, Copy, Select only; voice notes add "Keep this voice note" / "Don't keep"), §9.3 (no React on an Approval or
// Payment card), §10.4 (a deleted row: only Delete), §13.2 ("Copy table" on a table), R1 T6 (§17.4 "Ask about this" after Copy, X-180). Pure: entries for ui/Menu.
import { t } from '../../shared/copy/t';
import type { MenuEntry } from '../ui/menuTypes';

export type MenuAction =
  'reply' | 'react' | 'copy' | 'copyTable' | 'ask' | 'edit' | 'tryAgain' | 'good' | 'bad' | 'select' | 'delete' | 'keep' | 'unkeep';

export interface MenuFacts {
  side: 'me' | 'them' | 'card';
  deleted: boolean;
  hasText: boolean;
  canEdit: boolean;
  /** §17.1: foo's latest text answer whose job ran no outward step. */
  canTryAgain: boolean;
  /** Voice note: kept (pinned) or not; undefined for other rows. */
  voiceKept?: boolean;
  /** §9.3: Approval / Payment cards have no React. */
  noReact?: boolean;
  /** §13.2: the bubble holds a table. */
  hasTable?: boolean;
  /** The Copy item shows "Copied" for 2 s while the menu is open. */
  copied?: boolean;
}

export function menuActions(f: MenuFacts): MenuAction[] {
  if (f.deleted) return ['delete'];
  const out: MenuAction[] = ['reply'];
  if (f.side === 'them' && !f.noReact) out.push('react');
  if (f.hasText || f.side === 'card') out.push('copy');
  if (f.hasTable) out.push('copyTable');
  // R1 T6 (04 §17.4, X-180): "Ask about this" on a foo or helper bubble with words in it.
  if (f.side === 'them' && f.hasText) out.push('ask');
  if (f.side === 'me' && f.canEdit) out.push('edit');
  if (f.side === 'them') {
    if (f.canTryAgain) out.push('tryAgain');
    out.push('good', 'bad');
  }
  if (f.voiceKept !== undefined) out.push(f.voiceKept ? 'unkeep' : 'keep');
  out.push('select');
  if (f.side !== 'card') out.push('delete');
  return out;
}

export function menuEntries(f: MenuFacts, run: (a: MenuAction) => void): MenuEntry[] {
  return menuActions(f).map((a): MenuEntry => {
    const item = (label: string, tid: Extract<MenuEntry, { kind: 'item' }>['tid'], extra = {}) => ({
      kind: 'item' as const,
      id: a,
      label,
      tid,
      onSelect: () => run(a),
      ...extra,
    });
    switch (a) {
      case 'reply':
        return item(t('bubble.menu.reply'), 'bubbleMenuReply');
      case 'react':
        return item(t('bubble.menu.react'), 'bubbleMenuReact');
      case 'copy':
        return item(f.copied ? t('bubble.menu.copied') : t('bubble.menu.copy'), 'bubbleMenuCopy');
      case 'copyTable':
        return item(t('bubble.table.copy'), undefined);
      case 'ask':
        return item(t('bubble.menu.ask'), 'bubbleMenuAsk');
      case 'edit':
        return item(t('bubble.menu.edit'), 'bubbleMenuEdit');
      case 'tryAgain':
        return item(t('bubble.menu.try_again'), 'bubbleMenuTryAgain');
      case 'good':
        return item(t('bubble.menu.good'), 'bubbleMenuGood');
      case 'bad':
        return item(t('bubble.menu.bad'), 'bubbleMenuBad');
      case 'keep':
        return item(t('bubble.menu.keep_voice'), undefined);
      case 'unkeep':
        return item(t('bubble.menu.unkeep_voice'), undefined);
      case 'select':
        return item(t('bubble.menu.select'), 'bubbleMenuSelect');
      case 'delete':
        return item(t('bubble.menu.delete'), 'bubbleMenuDelete', { destructive: true });
    }
  });
}
