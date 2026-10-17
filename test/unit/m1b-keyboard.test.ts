// 03-shell-2 §3.9.4 Esc ladder order (one thing per press), §3.9.2 F6 pane cycle (order, wrap, hidden panes, XS).
import { describe, expect, it } from 'vitest';
import { escRung, type EscState } from '../../src/renderer/a11y/escLadder';
import { f6Next, f6Panes } from '../../src/renderer/a11y/f6';

const idle: EscState = {
  menuOpen: false,
  dialogOpen: false,
  selecting: false,
  findOpen: false,
  rightShellOpen: false,
  focusInRightShell: false,
  rightShellOverlay: false,
  searchHasText: false,
  viewKind: 'chat',
  xsChatView: false,
  focusInComposer: false,
};

describe('Esc ladder (§3.9.4)', () => {
  it('runs the first rung that applies, in spec order', () => {
    const all: EscState = {
      menuOpen: true,
      dialogOpen: true,
      selecting: true,
      findOpen: true,
      rightShellOpen: true,
      focusInRightShell: true,
      rightShellOverlay: true,
      searchHasText: true,
      viewKind: 'settings',
      xsChatView: true,
      focusInComposer: false,
    };
    const order: (keyof EscState)[] = [
      'menuOpen',
      'dialogOpen',
      'selecting',
      'findOpen',
      'rightShellOpen',
      'searchHasText',
      'viewKind',
      'xsChatView',
    ];
    const seen: string[] = [];
    let s: EscState = all;
    for (let i = 0; i < order.length; i++) {
      const rung = escRung(s);
      seen.push(rung!);
      const key = order[i]!;
      s = { ...s, [key]: key === 'viewKind' ? 'chat' : false };
    }
    expect(seen).toEqual(['menu', 'dialog', 'selection', 'find', 'rightShell', 'search', 'pageBack', 'xsBack']);
    expect(escRung(s)).toBeNull();
  });
  it('closes the right shell only when focus is inside it or it is an overlay', () => {
    expect(escRung({ ...idle, rightShellOpen: true })).toBeNull();
    expect(escRung({ ...idle, rightShellOpen: true, focusInRightShell: true })).toBe('rightShell');
    expect(escRung({ ...idle, rightShellOpen: true, rightShellOverlay: true })).toBe('rightShell');
  });
  it('a screen view goes back one step; a chat view never does', () => {
    expect(escRung({ ...idle, viewKind: 'screen' })).toBe('pageBack');
    expect(escRung(idle)).toBeNull();
  });
  it('composer-owned Esc runs first: the ladder yields while focus is in the composer', () => {
    expect(escRung({ ...idle, findOpen: true, focusInComposer: true })).toBe('composer');
  });
});

describe('F6 pane cycle (§3.9.2)', () => {
  const L = { xs: false, xsPane: 'chat' as const, bannerShown: false, rightOpen: true, composerPresent: true };
  it('visits list → messages → composer → panel → list with the panel open and no banner (3.11.8)', () => {
    const panes = f6Panes(L);
    const seen = [];
    let cur = f6Next(panes, 'chatlist', 1);
    for (let i = 0; i < 4; i++) {
      seen.push(cur);
      cur = f6Next(panes, cur, 1);
    }
    expect(['chatlist', ...seen]).toEqual(['chatlist', 'messages', 'composer', 'panel', 'chatlist']);
  });
  it('Shift+F6 goes backward and wraps; the banner is first when shown', () => {
    const panes = f6Panes({ ...L, bannerShown: true });
    expect(panes).toEqual(['banner', 'chatlist', 'messages', 'composer', 'panel']);
    expect(f6Next(panes, 'banner', -1)).toBe('panel');
    expect(f6Next(panes, 'messages', -1)).toBe('chatlist');
  });
  it('skips panes that are not visible', () => {
    expect(f6Panes({ ...L, rightOpen: false, composerPresent: false })).toEqual(['chatlist', 'messages']);
  });
  it('XS: list view cycles banner → list; chat view banner → messages → composer', () => {
    expect(f6Panes({ ...L, xs: true, xsPane: 'list', bannerShown: true })).toEqual(['banner', 'chatlist']);
    expect(f6Panes({ ...L, xs: true, xsPane: 'chat', bannerShown: true, rightOpen: false })).toEqual(['banner', 'messages', 'composer']);
  });
  it('from outside every pane, F6 lands on the first visible pane', () => {
    expect(f6Next(['chatlist', 'messages'], null, 1)).toBe('chatlist');
    expect(f6Next(['chatlist', 'messages'], null, -1)).toBe('messages');
  });
});
