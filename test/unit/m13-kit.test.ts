// M13 T1 screen kit: 06 §0.4 controls (Toggle role="switch" + aria-checked, Enter/Space; Stepper never beyond its range,
// ends disabled; Chip onRemove → xs remove button), 06-2 §6.10 / 02-3 §F30.2 (Kbd: one cap per key, no "+", Narrator
// "Control plus K"), 06 §0.5 (EmptyState data-state + one action, filter-empty "Clear filters"; Loading: nothing before
// 150 ms, skeleton after, "Still loading…" after 2 s; Saving retry line), 06 §0.4 Settings row (test id from TID,
// data-row-id), 02-3 §F21.3 (undo bar 5 s life that pauses; Ctrl+Z outside text fields).
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TID } from '../../src/shared/testids';
import { Chip } from '../../src/renderer/ui/Chip';
import { EmptyState, emptyAction } from '../../src/renderer/ui/EmptyState';
import { Kbd, kbdName } from '../../src/renderer/ui/Kbd';
import { Stepper, stepValue } from '../../src/renderer/ui/Stepper';
import { Toggle, togglesOnKey } from '../../src/renderer/ui/Toggle';
import { Banner } from '../../src/renderer/ui/Banner';
import { isUndoKey, pausableTimer } from '../../src/renderer/ui/undoTimer';
import { startLoadingClock, type LoadingPhase } from '../../src/renderer/screens/shared/loadingClock';
import { PageStates } from '../../src/renderer/screens/shared/PageStates';
import { SettingsRow } from '../../src/renderer/screens/shared/SettingsRow';

const html = (el: ReactElement) => renderToStaticMarkup(el);
const keyEvent = (key: string) => ({ key, defaultPrevented: false, preventDefault: vi.fn() });

describe('Toggle (06 §0.4, §0.8)', () => {
  it('is a switch whose aria-checked follows `checked`', () => {
    const off = html(h(Toggle, { checked: false, onChange: () => {}, label: 'Quiet hours' }));
    expect(off).toContain('role="switch"');
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('data-state="off"');
    expect(html(h(Toggle, { checked: true, onChange: () => {}, label: 'Quiet hours' }))).toContain('aria-checked="true"');
  });

  it('Space and Enter flip it; other keys do nothing; a disabled switch never flips', () => {
    expect(togglesOnKey(' ')).toBe(true);
    expect(togglesOnKey('Enter')).toBe(true);
    expect(togglesOnKey('a')).toBe(false);
    const onChange = vi.fn();
    const el = Toggle({ checked: false, onChange }) as ReactElement<{ onKeyDown: (e: unknown) => void }>;
    const space = keyEvent(' ');
    el.props.onKeyDown(space);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(space.preventDefault).toHaveBeenCalled();
    el.props.onKeyDown(keyEvent('Tab'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const off = vi.fn();
    const dis = Toggle({ checked: true, onChange: off, disabled: true }) as ReactElement<{ onKeyDown: (e: unknown) => void }>;
    dis.props.onKeyDown(keyEvent('Enter'));
    expect(off).not.toHaveBeenCalled();
  });
});

describe('Stepper (06-2 §6.3 unprompted, AT-156)', () => {
  const props = { min: 0, max: 3, onChange: () => {}, label: 'Messages I start on my own', decreaseLabel: 'd', increaseLabel: 'i' };

  it('never goes beyond its range', () => {
    expect(stepValue(3, 1, 0, 3)).toBe(3);
    expect(stepValue(0, -1, 0, 3)).toBe(0);
    expect(stepValue(1, 1, 0, 3)).toBe(2);
    expect(html(h(Stepper, { ...props, value: 4 }))).toContain('data-state="3"'); // an out-of-range value shows the max
  });

  it('[+] is disabled at the max and [−] at the min', () => {
    const top = html(h(Stepper, { ...props, value: 3 }));
    expect(top).toMatch(/aria-disabled="true" data-step="up"/);
    expect(top).not.toMatch(/aria-disabled="true" data-step="down"/);
    const bottom = html(h(Stepper, { ...props, value: 0 }));
    expect(bottom).toMatch(/aria-disabled="true" data-step="down"/);
    expect(bottom).not.toMatch(/aria-disabled="true" data-step="up"/);
  });
});

describe('Kbd (06-2 §6.10, 02-3 §F30.2)', () => {
  it('draws one cap per key and no "+"; Narrator reads "Control plus K"', () => {
    expect(kbdName(['Ctrl', 'K'])).toBe('Control plus K');
    expect(kbdName(['Ctrl', 'Shift', 'D'])).toBe('Control plus Shift plus D');
    const out = html(h(Kbd, { keys: ['Ctrl', 'K'] }));
    expect(out).toContain('aria-label="Control plus K"');
    expect(out.match(/<kbd[^>]*aria-hidden="true"/g)).toHaveLength(2);
    expect(out).not.toContain('+');
  });
});

describe('EmptyState (06 §0.5)', () => {
  it('carries screen-empty with data-state and one screen-empty-action button', () => {
    const onClick = vi.fn();
    const out = html(h(EmptyState, { state: 'first_time', icon: 'Brain', title: 'T', body: 'B', action: { label: 'Go', onClick } }));
    expect(out).toContain(`data-testid="${TID.screenEmpty}"`);
    expect(out).toContain('data-state="first_time"');
    expect(out.match(new RegExp(`data-testid="${TID.screenEmptyAction}"`, 'g'))).toHaveLength(1);
  });

  it('a filter that matches nothing offers "Clear filters" as a Link button', () => {
    const clear = vi.fn();
    const a = emptyAction({ state: 'filter_empty', onClearFilters: clear });
    expect(a?.label).toBe('Clear filters');
    expect(a?.variant).toBe('link');
    a?.onClick();
    expect(clear).toHaveBeenCalled();
    expect(emptyAction({ state: 'empty' })).toBeNull();
    expect(html(h(EmptyState, { state: 'filter_empty', icon: 'Search', title: 'T', onClearFilters: clear }))).toContain('Clear filters');
  });
});

describe('PageStates loading timing (06 §0.5, 02-3 §F20.1)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('nothing before 150 ms, the skeleton after, "Still loading…" after 2 s', () => {
    const seen: LoadingPhase[] = [];
    const stop = startLoadingClock((p) => seen.push(p));
    vi.advanceTimersByTime(149);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['skeleton']);
    vi.advanceTimersByTime(1849);
    expect(seen).toEqual(['skeleton']);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['skeleton', 'still']);
    stop();
  });

  it('stopping the clock (data arrived) draws nothing more', () => {
    const seen: LoadingPhase[] = [];
    startLoadingClock((p) => seen.push(p))();
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual([]);
  });

  it('the first paint of a loading page is empty; error and empty states carry their ids', () => {
    expect(html(h(PageStates, { state: 'loading' }))).toBe('');
    const err = html(
      h(PageStates, { state: 'error', error: { whatHappened: 'W', whatIsSafe: 'S', action: { label: 'Fix', onClick: () => {} } } }),
    );
    expect(err).toContain(`data-testid="${TID.screenError}"`);
    expect(err).not.toContain('card-error');
    const empty = html(h(PageStates, { state: 'empty', empty: { icon: 'Brain', title: 'T' } }));
    expect(empty).toContain('data-state="empty"');
    expect(html(h(PageStates, { state: 'ready' }, h('p', null, 'x')))).toBe('<p>x</p>');
  });
});

describe('SettingsRow (06 §0.4, §0.5)', () => {
  it('takes its test id from TID and carries data-row-id', () => {
    const out = html(h(SettingsRow, { page: 'notifications', rowId: 'unprompted', tid: 'screenEmpty', label: 'L', description: 'D' }));
    expect(out).toContain(`data-testid="${TID.screenEmpty}"`);
    expect(out).toContain('data-row-id="unprompted"');
    expect(out).toContain('role="listitem"');
  });

  it('shows "Saved", and on a failed write the retry line with screen-saving-retry', () => {
    expect(html(h(SettingsRow, { page: 'p', rowId: 'r', label: 'L', saved: true }))).toContain('Saved');
    const failed = html(h(SettingsRow, { page: 'p', rowId: 'r', label: 'L', saveFailed: true, onRetry: () => {} }));
    expect(failed).toContain('That didn’t save. Try again.');
    expect(failed).toContain(`data-testid="${TID.screenSavingRetry}"`);
    expect(failed).toContain('data-state="save_failed"');
  });

  it('the chevron variant makes the whole row one button', () => {
    const out = html(h(SettingsRow, { page: 'p', rowId: 'r', label: 'L', chevron: true, control: 'Value', onClick: () => {} }));
    expect(out.match(/<button/g)).toHaveLength(1);
    expect(out).toContain('data-icon="ChevronRight"');
  });
});

describe('Chip (06 §0.4, 08-0 §E.3)', () => {
  it('onRemove adds one remove button that calls it; without it there is none', () => {
    const onRemove = vi.fn();
    const with_ = html(h(Chip, { label: 'Money', onRemove, removeLabel: 'Remove Money' }));
    expect(with_).toContain('aria-label="Remove Money"');
    expect(with_.match(/<button/g)).toHaveLength(2);
    expect(html(h(Chip, { label: 'Money' })).match(/<button/g)).toHaveLength(1);
    const el = Chip({ label: 'Money', onRemove }) as ReactElement<{ children: ReactElement[] }>;
    const remove = el.props.children[1] as ReactElement<{ onClick: () => void }>;
    remove.props.onClick();
    expect(onRemove).toHaveBeenCalled();
  });

  it('a selected chip shows the leading Checkmark and aria-pressed', () => {
    const out = html(h(Chip, { label: 'Travel', selected: true, onClick: () => {} }));
    expect(out).toContain('aria-pressed="true"');
    expect(out).toContain('data-icon="Checkmark"');
  });
});

describe('Banner (06 §0.6)', () => {
  it('is a status for info / warn and an alert for bad', () => {
    expect(html(h(Banner, { tone: 'warn', text: 'x' }))).toContain('role="status"');
    expect(html(h(Banner, { tone: 'bad', text: 'x' }))).toContain('role="alert"');
  });
});

describe('UndoBar life and keys (02-3 §F21.3)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ends after 5 s of un-paused time; pausing holds the clock', () => {
    const fire = vi.fn();
    const tm = pausableTimer(fire);
    vi.advanceTimersByTime(3000);
    tm.pause();
    vi.advanceTimersByTime(10_000);
    expect(fire).not.toHaveBeenCalled();
    tm.resume();
    vi.advanceTimersByTime(1999);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Z is Undo only outside text fields', () => {
    const z = { key: 'z', ctrlKey: true, shiftKey: false, altKey: false };
    const el = (tagName: string, attrs: Record<string, string> = {}) =>
      ({ tagName, getAttribute: (n: string) => attrs[n] ?? null }) as unknown as Element;
    expect(isUndoKey(z, el('BUTTON'))).toBe(true);
    expect(isUndoKey(z, null)).toBe(true);
    expect(isUndoKey(z, el('TEXTAREA'))).toBe(false);
    expect(isUndoKey(z, el('INPUT'))).toBe(false);
    expect(isUndoKey(z, el('INPUT', { type: 'checkbox' }))).toBe(true);
    expect(isUndoKey({ ...z, shiftKey: true }, el('BUTTON'))).toBe(false);
  });
});
