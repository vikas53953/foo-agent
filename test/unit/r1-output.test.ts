// Spec: 04-2 §21.7 "Action chips" (X-180, CR-0022: ≤ 3 `{ kind: 'call' | 'map' | 'calendar' | 'link'; label; value }` from
// the reply, stored in `messages.actions`, never shown after an Approval or Payment card), CR-0022 pick 9 (Keep: a
// `kept_items` row; kit surfaces as A2UI JSON, pages as a `.foopage` blob, both with a PNG; never a plain `.html` file; a kept
// page reopens only in the sealed box), pick 15, 08-1 §3.2 `keep:*`, `kit:refresh`, AT-352, AT-367, AT-368, AT-369. R1 T7.
// The seams below the real-app runs in test/e2e/r1-output.spec.ts.
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { actionsLineStart, cleanActions, splitActions } from '../../src/engine/prompt/actions';
import { ReleaseGate } from '../../src/engine/prompt/releaseGate';
import { refreshForAi } from '../../src/engine/kit/kitAction';
import { actionChipUrl } from '../../src/main/kit/actionChipOpen';
import { kitRefreshHandler, type KitDeps } from '../../src/main/kit/kitIpc';
import { keepList, keepOpen, keepSave, type KeepDeps } from '../../src/main/keep/keep';
import { openPage } from '../../src/main/page/pageIpc';
import { PageRegistry } from '../../src/main/page/pages';
import { migrate, type Db } from '../../src/main/store/db';
import { SeedWriter, ist } from '../../src/main/test/seed/writer';
import { actionsFor, type ActionFacts } from '../../src/renderer/composer/suggestions';
import { FakeClock } from '../../src/shared/clock';
import { chipDomain, chipUrl } from '../../src/shared/kit/actionChips';
import { keptSurfaceId, pageTitle, surfaceBody, surfaceTitle } from '../../src/shared/kit/keep';
import { foldFence, kitMessagesOf } from '../../src/shared/kit/surface';

const NOW = ist(2026, 10, 20, 18, 0);
const create = '{"version":"v0.9.1","createSurface":{"surfaceId":"s1","catalogId":"foo.kit.v1"}}';
const comps = JSON.stringify({
  updateComponents: {
    surfaceId: 's1',
    components: [
      { id: 'root', component: 'Column', children: ['t', 'live'] },
      { id: 't', component: 'Text', variant: 'title', text: { path: '/title' } },
      { id: 'live', component: 'LiveStamp', asOf: NOW, refreshable: true },
    ],
  },
});
const data = JSON.stringify({ updateDataModel: { surfaceId: 's1', path: '/title', value: 'Goa fares today' } });
const KIT_TEXT = `Fares now.\n\n\`\`\`a2ui\n${create}\n${comps}\n${data}\n\`\`\``;
const PAGE = '<!doctype html><title>Food budget</title><p>Rice ₹400</p>';
const PAGE_TEXT = `Here is your planner.\n\n\`\`\`page\n${PAGE}\n\`\`\``;

describe('R1 T7 · action chips from the reply (04-2 §21.7)', () => {
  it('the Actions line is stripped and only well-formed chips are kept, at most 3', () => {
    const line = JSON.stringify([
      { kind: 'call', label: 'Call Toit', value: '+91 80 0000 0000' },
      { kind: 'map', label: 'Open map', value: 'Toit, Indiranagar' },
      { kind: 'link', label: 'Menu', value: 'http://example.com/menu' },
      { kind: 'calendar', label: 'Add to calendar', value: '2026-10-23T19:00' },
      { kind: 'link', label: 'Website', value: 'https://example.com/' },
    ]);
    const r = splitActions(`Booked for Fri 7 PM.\nActions: ${line}\nSuggestions: Directions | Menu`);
    expect(r.text).toBe('Booked for Fri 7 PM.\nSuggestions: Directions | Menu');
    // http:// is refused; the 4th good chip goes past the cap.
    expect(r.actions).toEqual([
      { kind: 'call', label: 'Call Toit', value: '+91 80 0000 0000' },
      { kind: 'map', label: 'Open map', value: 'Toit, Indiranagar' },
      { kind: 'calendar', label: 'Add to calendar', value: '2026-10-23T19:00' },
    ]);
  });

  it('bad JSON, unknown kinds, a link as a place and an unparseable date give no chips', () => {
    expect(splitActions('Ok.\nActions: [oops').actions).toBeNull();
    expect(cleanActions([{ kind: 'pay', label: 'Pay', value: '100' }])).toBeNull();
    expect(cleanActions([{ kind: 'map', label: 'Map', value: 'javascript:alert(1)' }])).toBeNull();
    expect(cleanActions([{ kind: 'calendar', label: 'Cal', value: '2026-13-45' }])).toBeNull();
    expect(cleanActions([{ kind: 'call', label: 'x'.repeat(41), value: '+91 80 0000 0000' }])).toBeNull();
  });

  it('the release gate never shows the Actions line, even while it streams', async () => {
    const clock = new FakeClock(0);
    const out: string[] = [];
    const gate = new ReleaseGate({ clock, rewrite: async (x) => x, onRelease: (x) => out.push(x), onSayClosed: () => undefined });
    clock.advance(1_500);
    gate.feed('<say>Your table is booked.\nActions: [{"kind":"call","label":"Call');
    await Promise.resolve();
    expect(out.join('')).not.toContain('Actions');
    gate.feed(' Toit","value":"+91 80 0000 0000"}]</say>');
    await gate.done;
    expect(out.join('').trim()).toBe('Your table is booked.');
    expect(actionsLineStart('a\n  actions: []')).toBe(2);
  });

  it('main opens only the URL it builds from the stored chip; the dialog names its domain', () => {
    expect(chipUrl({ kind: 'call', label: 'Call', value: '+91 80 0000 0000' })).toBe('tel:+918000000000');
    expect(chipUrl({ kind: 'map', label: 'Map', value: 'Toit, Indiranagar' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Toit%2C%20Indiranagar',
    );
    expect(chipUrl({ kind: 'calendar', label: 'Cal', value: '2026-10-23' })).toBeNull();
    expect(chipDomain({ kind: 'link', label: 'Menu', value: 'https://menu.example.com/a?b=1' })).toBe('menu.example.com');
    const db = seeded().db;
    const w = new SeedWriter(db, 2);
    const chat = w.chat({ kind: 'foo', title: 'foo', at: NOW }).chatId;
    const id = w.message(chat, { author: 'foo', text: 'Booked.', at: NOW + 1 });
    db.prepare('UPDATE messages SET actions = ? WHERE id = ?').run(
      JSON.stringify([{ kind: 'link', label: 'Menu', value: 'https://example.com/menu' }]),
      id,
    );
    expect(actionChipUrl(db, id, 0)).toBe('https://example.com/menu');
    expect(actionChipUrl(db, id, 1)).toBeNull();
    expect(actionChipUrl(db, 'm_nope', 0)).toBeNull();
  });

  it('chips show for the latest reply only, never after an Approval or Payment card', () => {
    const chip = { kind: 'call' as const, label: 'Call Toit', value: '+91 80 0000 0000' };
    const reply = (o: Partial<ActionFacts['messages'][number]> = {}) => ({
      id: 'm_2',
      authorKind: 'foo' as const,
      kind: 'text' as const,
      cardId: null,
      jobId: null,
      actions: [chip],
      deletedAt: null,
      ...o,
    });
    const user = { ...reply({ id: 'm_1', authorKind: 'user', actions: null }) };
    const base: ActionFacts = { kind: 'foo', private: false, messages: [user, reply()], cards: {}, recording: false, typed: false };
    expect(actionsFor(base)).toEqual({ messageId: 'm_2', items: [chip] });
    expect(actionsFor({ ...base, typed: true })).toBeNull();
    expect(actionsFor({ ...base, kind: 'group' })).toBeNull();
    expect(actionsFor({ ...base, messages: [reply(), user] })).toBeNull();
    const approval = reply({ cardId: 'k_1', kind: 'card' });
    expect(actionsFor({ ...base, messages: [user, approval], cards: { k_1: { type: 'approval', jobId: null } } })).toBeNull();
    const paid = reply({ jobId: 'j_1' });
    expect(actionsFor({ ...base, messages: [user, paid], cards: { k_9: { type: 'payment', jobId: 'j_1' } } })).toBeNull();
  });
});

describe('R1 T7 · LiveStamp Refresh', () => {
  const deps = (text: string | null, sent: unknown[]): KitDeps => ({
    hostText: () => text,
    engine: () => ({ send: (kind: string, payload: unknown) => (sent.push({ kind, payload }), true) }) as never,
    log: () => undefined,
  });

  it('kit:refresh sends exactly one kit.refresh for a surface its host created', () => {
    const sent: unknown[] = [];
    const r = kitRefreshHandler(deps(KIT_TEXT, sent))({ chatId: 'c_1', messageId: 'm_1', surfaceId: 's1' });
    expect(r.ok).toBe(true);
    expect(sent).toEqual([{ kind: 'kit.refresh', payload: { chatId: 'c_1', messageId: 'm_1', surfaceId: 's1' } }]);
  });

  it('an unknown surface or a missing host is refused and nothing is sent', () => {
    const sent: unknown[] = [];
    expect(kitRefreshHandler(deps(KIT_TEXT, sent))({ chatId: 'c_1', messageId: 'm_1', surfaceId: 'nope' }).ok).toBe(false);
    expect(kitRefreshHandler(deps(null, sent))({ chatId: 'c_1', messageId: 'm_1', surfaceId: 's1' }).ok).toBe(false);
    expect(sent).toEqual([]);
  });

  it('the AI is asked for new data and a new asOf for the same surface, without createSurface', () => {
    const line = refreshForAi('Refresh', 's1');
    expect(line.split('\n')[0]).toBe('Refresh');
    expect(line).toContain('surfaceId "s1"');
    expect(line).toContain('LiveStamp');
    expect(line).toContain('without createSurface');
  });
});

function seeded(): { db: Db; chat: string; kitMsg: string; pageMsg: string; kitCard: string; pageCard: string } {
  const db = new Database(':memory:') as Db;
  db.pragma('foreign_keys = ON');
  migrate(db);
  const w = new SeedWriter(db, 1);
  let chat = '';
  let kitMsg = '';
  let pageMsg = '';
  let kitCard = '';
  let pageCard = '';
  db.transaction(() => {
    chat = w.chat({ kind: 'foo', title: 'foo', at: NOW }).chatId;
    kitMsg = w.message(chat, { author: 'foo', text: KIT_TEXT, at: NOW + 1 });
    pageMsg = w.message(chat, { author: 'foo', text: PAGE_TEXT, at: NOW + 2 });
    kitCard = w.card(chat, { type: 'kit', state: 'shown', payload: { body: `${create}\n${comps}` }, at: NOW + 3 }).cardId;
    pageCard = w.card(chat, { type: 'ai_page', state: 'ready', payload: { html: PAGE }, at: NOW + 4 }).cardId;
  })();
  w.finish(NOW + 5);
  return { db, chat, kitMsg, pageMsg, kitCard, pageCard };
}

function keepDeps(db: Db, files: Map<string, string | Uint8Array>, png: Uint8Array | null = new Uint8Array([137, 80, 78, 71])): KeepDeps {
  let now = NOW + 10;
  return {
    db,
    dataDir: '/data',
    now: () => now++,
    writeFile: async (p, d) => void files.set(p, d),
    readFile: async (p) => {
      const v = files.get(p);
      if (typeof v !== 'string') throw new Error('ENOENT');
      return v;
    },
    snapshot: async () => png,
  };
}

describe('R1 T7 · Keep (pick 9, pick 15)', () => {
  const surfaceNow = () => foldFence([kitMessagesOf(KIT_TEXT).messages], 0).surfaces[0]!;

  it('a kept surface body rebuilds the same surface, with the data as the user sees it', () => {
    const s = surfaceNow();
    const body = surfaceBody(s, { title: 'Goa fares (edited)' });
    expect(keptSurfaceId(body)).toBe('s1');
    const again = foldFence([kitMessagesOf(`\`\`\`a2ui\n${body}\n\`\`\``).messages], 0).surfaces[0]!;
    expect(Object.keys(again.components).sort()).toEqual(['live', 'root', 't']);
    expect(again.data).toEqual({ title: 'Goa fares (edited)' });
    expect(surfaceTitle(s)).toBeNull(); // the title Text is bound, so the renderer's fallback name is used
    expect(pageTitle(PAGE)).toBe('Food budget');
  });

  it('keep:save writes the A2UI JSON and a PNG under {DATA}\\kept, lists it newest first and never writes .html', async () => {
    const { db, chat, kitMsg, pageMsg } = seeded();
    const files = new Map<string, string | Uint8Array>();
    const d = keepDeps(db, files);
    const body = surfaceBody(surfaceNow(), { title: 'Goa fares today' });
    const kit = await keepSave(d, { chatId: chat, messageId: kitMsg, kind: 'kit', title: 'Goa fares', body });
    const page = await keepSave(d, { chatId: chat, messageId: pageMsg, kind: 'page', title: 'Food budget', body: PAGE });
    expect(kit.ok && page.ok).toBe(true);
    if (!kit.ok || !page.ok) return;
    expect(kit.value.item).toMatchObject({ chatId: chat, messageId: kitMsg, cardId: null, kind: 'kit', title: 'Goa fares' });
    expect(kit.value.item.pngPath).toMatch(/kept[\\/]ki_[^\\/]+\.png$/);
    const paths = [...files.keys()];
    expect(paths.some((p) => /\.json$/.test(p))).toBe(true);
    expect(paths.some((p) => /\.foopage$/.test(p))).toBe(true);
    expect(paths.some((p) => /\.html?$/i.test(p))).toBe(false);
    expect(keepList(db, chat).map((k) => k.id)).toEqual([page.value.item.id, kit.value.item.id]);
    const opened = await keepOpen(d, page.value.item.id);
    expect(opened.ok && opened.value).toEqual({ kind: 'page', body: PAGE });
  });

  it('keeping the same thing twice keeps it once; no snapshot still keeps it', async () => {
    const { db, chat, pageMsg } = seeded();
    const d = keepDeps(db, new Map(), null);
    const a = await keepSave(d, { chatId: chat, messageId: pageMsg, kind: 'page', title: 'Food budget', body: PAGE });
    const b = await keepSave(d, { chatId: chat, messageId: pageMsg, kind: 'page', title: 'Food budget', body: PAGE });
    expect(a.ok && b.ok && a.value.item.id === b.value.item.id).toBe(true);
    expect(a.ok && a.value.item.pngPath).toBeNull();
    expect(keepList(db, chat)).toHaveLength(1);
  });

  it('only what the host really holds can be kept (a made-up page or surface is refused)', async () => {
    const { db, chat, kitMsg, pageMsg } = seeded();
    const d = keepDeps(db, new Map());
    const other = surfaceBody({ id: 'zz', components: {}, data: {}, deleted: false }, {});
    expect((await keepSave(d, { chatId: chat, messageId: kitMsg, kind: 'kit', title: 'x', body: other })).ok).toBe(false);
    expect((await keepSave(d, { chatId: chat, messageId: pageMsg, kind: 'page', title: 'x', body: '<p>evil</p>' })).ok).toBe(false);
    expect((await keepSave(d, { chatId: 'c_other', messageId: pageMsg, kind: 'page', title: 'x', body: PAGE })).ok).toBe(false);
    expect(keepList(db, chat)).toEqual([]);
  });

  it('a kept card moves to its kept state', async () => {
    const { db, chat, kitCard, pageCard } = seeded();
    const d = keepDeps(db, new Map());
    const kit = await keepSave(d, { chatId: chat, cardId: kitCard, kind: 'kit', title: 'Fares', body: surfaceBody(surfaceNow(), {}) });
    const page = await keepSave(d, { chatId: chat, cardId: pageCard, kind: 'page', title: 'Budget', body: PAGE });
    expect(kit.ok && kit.value.card?.state).toBe('kept');
    expect(page.ok && page.value.card?.state).toBe('kept');
  });

  it('a kept page is served from its .foopage blob through the same registry (pick 15)', async () => {
    const { db, chat, pageMsg } = seeded();
    const files = new Map<string, string | Uint8Array>();
    const saved = await keepSave(keepDeps(db, files), { chatId: chat, messageId: pageMsg, kind: 'page', title: 'Budget', body: PAGE });
    if (!saved.ok) throw new Error('not kept');
    // openPage reads the blob from disk; point the row at a real temp file.
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const file = join(mkdtempSync(join(tmpdir(), 'foo-kept-')), `${saved.value.item.id}.foopage`);
    writeFileSync(file, PAGE);
    db.prepare('UPDATE kept_items SET body_path = ? WHERE id = ?').run(file, saved.value.item.id);
    const registry = new PageRegistry();
    const r = openPage({ db }, registry, { chatId: chat, keptId: saved.value.item.id }, NOW);
    expect('pageId' in r).toBe(true);
    if ('pageId' in r) expect(registry.get(r.pageId)?.html).toBe(PAGE);
    expect(openPage({ db }, registry, { chatId: 'c_other', keptId: saved.value.item.id }, NOW)).toEqual({ failed: 'not_found' });
  });
});
