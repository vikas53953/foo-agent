// Spec: 04-2 §21.1 ("+" button `composer-attach` with aria-expanded: 36 circle, 1px --line, Add 20 --fg-2; open → --bg-pressed
// and Dismiss 20, no rotation; "Add photos, files and more"; its menu, 240 wide, opens upward from the button's left edge:
// "Photos and files" (Attach, Ctrl+U), "Take a screenshot" (Screenshot; Windows' snipping overlay, an image landing on the
// clipboard within 60 s becomes a chip), "Password or key" (Key; a Secret box card, C7), "Emoji" (Emoji, Win+.; the Windows
// emoji panel)), §23.7 (Narrator "Add photos, files and more, button, collapsed/expanded"), §23.3 disabled.
import { useState } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Icon } from '../ui/Icon';
import { Menu, type MenuEntry } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import styles from './Composer.module.css';

export interface AttachMenuProps {
  open: boolean;
  disabled: boolean;
  onOpen: (open: boolean) => void;
  onFiles: () => void;
  onEmoji: () => void;
  /** Left out where no Secret box may be posted (a group). */
  onSecret?: () => void;
}

/**
 * The menu rows. "Password or key" posts a Secret box card (C7, 05-2 §5.8) through `onSecret`; where none may be posted (a
 * group, 05-2 §5.8.6) `onSecret` is left out and the row is shown, not choosable.
 */
export function attachMenuEntries({
  onFiles,
  onEmoji,
  onSecret,
}: {
  onFiles: () => void;
  onEmoji: () => void;
  onSecret?: () => void;
}): MenuEntry[] {
  return [
    {
      kind: 'item',
      id: 'files',
      label: t('composer.attach_menu.files'),
      shortcut: t('composer.attach_menu.files_hint'),
      tid: 'composerAttachMenuFiles',
      onSelect: onFiles,
    },
    // Opening ms-screenclip: and watching the clipboard for 60 s needs a main channel 08-1 does not list; shown, not choosable
    // until then.
    // GAP: GAPS.md 2026-10-17 "Take a screenshot has no channel"
    { kind: 'item', id: 'screenshot', label: t('composer.attach_menu.screenshot'), tid: 'composerAttachMenuScreenshot', disabled: true },
    // Real-AI run 62d419e U13: the row stayed disabled after M5 shipped the Secret box.
    {
      kind: 'item',
      id: 'secret',
      label: t('composer.attach_menu.secret'),
      tid: 'composerAttachMenuSecret',
      disabled: !onSecret,
      onSelect: onSecret,
    },
    {
      kind: 'item',
      id: 'emoji',
      label: t('composer.attach_menu.emoji'),
      shortcut: t('composer.attach_menu.emoji_hint'),
      tid: 'composerAttachMenuEmoji',
      onSelect: onEmoji,
    },
  ];
}

export function AttachMenu({ open, disabled, onOpen, onFiles, onEmoji, onSecret }: AttachMenuProps) {
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const entries = attachMenuEntries({ onFiles, onEmoji, onSecret });
  return (
    <>
      <Tooltip text={disabled ? t('composer.send.tooltip.disabled') : t('composer.attach.tooltip')} side="top">
        <button
          ref={setButton}
          type="button"
          className={`${styles.round} ${styles.plus}`}
          aria-label={t('composer.attach.accessible_name')}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-disabled={disabled || undefined}
          data-testid={TID.composerAttach}
          onClick={() => !disabled && onOpen(!open)}
        >
          <Icon name={open ? 'Dismiss' : 'Add'} size={20} />
        </button>
      </Tooltip>
      {open && button && (
        <Menu
          entries={entries}
          anchor={{ el: button }}
          label={t('composer.attach.accessible_name')}
          onClose={() => {
            onOpen(false);
          }}
        />
      )}
    </>
  );
}
