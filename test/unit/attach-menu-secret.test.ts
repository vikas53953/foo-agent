// Spec: 04-2 §21.1 "+" menu row "Password or key": posts a Secret box card (C7, 05-2 §5.8) in this chat; groups never get
// one (05-2 §5.8.6). Real-AI run 62d419e U13-secret-box: the row was still disabled from before M5, so no box could open.
import { describe, expect, it, vi } from 'vitest';
import { attachMenuEntries } from '../../src/renderer/composer/AttachMenu';
import type { MenuEntry } from '../../src/renderer/ui/Menu';

const secretRow = (entries: MenuEntry[]) => entries.find((e) => e.kind === 'item' && e.id === 'secret');

describe('Real-AI run 62d419e U13 · the + menu "Password or key" row', () => {
  it('is choosable and asks for a Secret box in this chat', () => {
    const onSecret = vi.fn();
    const row = secretRow(attachMenuEntries({ onFiles: vi.fn(), onEmoji: vi.fn(), onSecret }));
    expect(row).toMatchObject({ kind: 'item', tid: 'composerAttachMenuSecret' });
    expect(row && 'disabled' in row && row.disabled).toBeFalsy();
    if (row?.kind === 'item') row.onSelect?.();
    expect(onSecret).toHaveBeenCalledTimes(1);
  });

  it('stays shown but disabled where no Secret box may be posted (a group)', () => {
    const row = secretRow(attachMenuEntries({ onFiles: vi.fn(), onEmoji: vi.fn() }));
    expect(row).toMatchObject({ kind: 'item', disabled: true });
  });
});
