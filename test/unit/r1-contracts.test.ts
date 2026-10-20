// Spec: 04 §13.5 (kit surface: A2UI v0.9.1 messages in foo's catalog; complete messages draw at once, an incomplete one is
// held back; an unknown or invalid component is dropped with a caption), 04 §13.6 (AI page ≤ 512 KB; bridge calls),
// 08-1 §2.4 / §3.2 / §4.3 (kit.action, side.question, kit:* page:rpc keep:* channels, migration 0004), 08-0 §A
// (appearance.visuals), CR-0022 picks 2 and 8, X-180.
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { mainToEngineSchema } from '../../src/engine/protocol';
import { CARD_STATES } from '../../src/shared/cards';
import {
  FOO_COMPONENT_NAMES,
  KIT_BLOCK_MAX_BYTES,
  KIT_COMPONENT_NAMES,
  KIT_IMAGE_MAX_CHARS,
  KitComponentSchema,
  KitImageSrcSchema,
} from '../../src/shared/kit/catalog';
import { PAGE_MAX_BYTES, parseKitBlock, parsePageBlock } from '../../src/shared/kit/parse';
import { PageRpcCallSchema } from '../../src/shared/kit/page';
import { catalogText, kitPromptSection } from '../../src/shared/kit/prompt';
import { INVOKE_CHANNELS } from '../../src/shared/ipc';
import { settingsSchema } from '../../src/shared/settings';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import { migrate } from '../../src/main/store/db';
import { SCHEMAS } from '../../src/main/ipc/IpcRouter';
import { parseBlocks, plainText } from '../../src/renderer/messages/markdownParse';

const create = '{"version":"v0.9.1","createSurface":{"surfaceId":"s1","catalogId":"foo.kit.v1"}}';
const chart =
  '{"updateComponents":{"surfaceId":"s1","components":[{"id":"root","component":"Column","children":["c"]},{"id":"c","component":"LineChart","variant":"line","series":[{"label":"Goa","points":[{"x":"Mon","y":4200},{"x":"Tue","y":3900}]}]}]}}';

describe('R1 contracts: catalog (CR-0022 §(c))', () => {
  it('has the 15 standard parts and the 13 foo components', () => {
    expect(KIT_COMPONENT_NAMES).toHaveLength(28);
    expect(FOO_COMPONENT_NAMES).toEqual([
      'LineChart',
      'MapStops',
      'Stepper',
      'Compare',
      'Timeline',
      'WeekCalendar',
      'TimedChecklist',
      'Calculator',
      'GoalRing',
      'ListPick',
      'TimePick',
      'ShortForm',
      'LiveStamp',
    ]);
    expect(KIT_COMPONENT_NAMES).not.toContain('Modal');
  });

  it('images take only data: images or chat files (04 §13.5)', () => {
    const img = (url: string) => KitComponentSchema.safeParse({ id: 'i', component: 'Image', url, alt: 'x' }).success;
    expect(img('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(img('file:fl_0192')).toBe(true);
    expect(img('https://example.com/a.png')).toBe(false);
    expect(img('data:text/html;base64,PGI+')).toBe(false);
  });

  it('the prompt section is generated from the schemas and follows the visuals level (picks 2, 8)', () => {
    for (const name of KIT_COMPONENT_NAMES) expect(catalogText()).toContain(`- ${name} `);
    expect(kitPromptSection('balanced')).toContain('foo.kit.v1');
    expect(kitPromptSection('visuals')).toContain('Show me visuals');
    expect(kitPromptSection('words')).not.toContain('Components:');
  });
});

describe('R1 contracts: reply parser (04 §13.5)', () => {
  it('AT-354 parser half: an unknown component is dropped, the rest and the words stay', () => {
    const bad =
      '{"updateComponents":{"surfaceId":"s1","components":[{"id":"root","component":"Column","children":[]},{"id":"x","component":"Hologram"}]}}';
    const p = parseKitBlock(`${create}\n${bad}`, false);
    expect(p.dropped).toBe(1);
    expect(p.messages).toHaveLength(2);
    const blocks = parseBlocks(`Here you go.\n\n\`\`\`a2ui\n${create}\n${bad}\n\`\`\`\n`);
    expect(blocks.map((b) => b.t)).toEqual(['p', 'kit']);
    expect(plainText(blocks)).toBe('Here you go.');
  });

  it('a stream draws each complete message and holds the unfinished one back', () => {
    const half = chart.slice(0, 60);
    expect(parseKitBlock(`${create}\n${half}`, true)).toEqual({
      messages: [{ createSurface: { surfaceId: 's1', catalogId: 'foo.kit.v1' } }],
      dropped: 0,
      pending: true,
    });
    // The same text once the reply ended: the cut message is dropped.
    expect(parseKitBlock(`${create}\n${half}`, false).dropped).toBe(1);
    expect(parseKitBlock(`${create}\n${chart}`, true).messages).toHaveLength(2);
  });

  it('pretty-printed messages and an outer array parse; other catalogs and junk do not', () => {
    const pretty = JSON.stringify(JSON.parse(chart), null, 2);
    expect(parseKitBlock(`[${create},\n${pretty}]`, false)).toMatchObject({ dropped: 0, pending: false });
    expect(parseKitBlock('{"createSurface":{"surfaceId":"s","catalogId":"https://a2ui.org/basic"}}', false).dropped).toBe(1);
    expect(parseKitBlock('hello {"deleteSurface":{"surfaceId":"s1"}}', false)).toMatchObject({ dropped: 1 });
  });

  it('an unclosed fence is a kit block still open; the user’s own fences stay code', () => {
    const open = parseBlocks(`\`\`\`a2ui\n${create}`);
    expect(open).toEqual([{ t: 'kit', body: create, closed: false }]);
    expect(parseBlocks('```page\n<p>x</p>\n```', { side: 'me' })[0]?.t).toBe('code');
    expect(parseBlocks('```page\n<p>x</p>\n```')[0]).toEqual({ t: 'page', body: '<p>x</p>', closed: true });
  });

  it('a page over 512 KB is too large; an open fence is still building', () => {
    expect(parsePageBlock('x'.repeat(PAGE_MAX_BYTES + 1), true, false).tooLarge).toBe(true);
    expect(parsePageBlock('<p>x</p>', false, true)).toMatchObject({ complete: false, tooLarge: false });
  });
});

describe('R1 contracts: bridge, engine messages, channels, settings, store', () => {
  it('the page bridge takes only the four calls, https links only', () => {
    const ok = (c: unknown) => PageRpcCallSchema.safeParse(c).success;
    expect(ok({ jsonrpc: '2.0', id: 1, method: 'reportSize', params: { height: 420 } })).toBe(true);
    expect(ok({ jsonrpc: '2.0', id: 2, method: 'openLink', params: { url: 'https://example.com/a' } })).toBe(true);
    expect(ok({ jsonrpc: '2.0', id: 3, method: 'openLink', params: { url: 'javascript:alert(1)' } })).toBe(false);
    expect(ok({ jsonrpc: '2.0', id: 4, method: 'fetch', params: { url: 'https://example.com' } })).toBe(false);
  });

  it('kit.action, kit.refresh and side.question validate', () => {
    const ok = (kind: string, payload: unknown) => mainToEngineSchema.safeParse({ id: 'm1', kind, payload }).success;
    const action = {
      chatId: 'c_1',
      messageId: 'm_1',
      surfaceId: 's1',
      name: 'compare',
      sourceComponentId: 'b1',
      context: {},
      timestamp: '2026-10-20T10:00:00Z',
    };
    expect(ok('kit.action', action)).toBe(true);
    expect(ok('kit.action', { ...action, cardId: 'k_1' })).toBe(false);
    expect(ok('kit.refresh', { chatId: 'c_1', messageId: 'm_1', surfaceId: 's1' })).toBe(true);
    expect(ok('side.question', { chatId: 'c_1', messageId: 'm_2' })).toBe(true);
    for (const c of ['kit:action', 'kit:refresh', 'page:rpc', 'keep:save', 'keep:list']) expect(INVOKE_CHANNELS).toContain(c);
  });

  it('appearance.visuals defaults to balanced; kit and ai_page have their states', () => {
    expect(settingsSchema.parse(settingsDefaults).appearance.visuals).toBe('balanced');
    expect(CARD_STATES.kit).toEqual(['shown', 'kept']);
    expect(CARD_STATES.ai_page).toEqual(['building', 'ready', 'failed', 'kept']);
  });

  it('migration 0004 adds the card types, messages.side and kept_items', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrate(db);
    const cardsSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'cards'").pluck().get() as string;
    expect(cardsSql).toContain("'kit','ai_page'");
    const cols = db.prepare('PRAGMA table_info(messages)').all() as { name: string; dflt_value: string }[];
    expect(cols.find((c) => c.name === 'side')?.dflt_value).toBe('0');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'cards'").pluck().all()).toEqual(
      expect.arrayContaining(['cards_open', 'cards_chat', 'cards_message', 'cards_job']),
    );
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'kept_items'").pluck().get()).toBe('kept_items');
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['understood', 'actions']));
  });

  it('side questions, page:open and the keep channels validate (review fixes)', () => {
    expect(INVOKE_CHANNELS).toEqual(expect.arrayContaining(['page:open', 'keep:open', 'keep:showInFolder']));
    const send = { chatId: 'c_1', clientId: '0b5d1f9e-4a63-4c1e-9d6e-1f2a3b4c5d6e', text: 'what is this?' };
    expect(SCHEMAS['message:send'].safeParse({ ...send, side: true, replyToId: 'm_1' }).success).toBe(true);
    expect(SCHEMAS['message:send'].safeParse({ ...send, side: true }).success).toBe(false);
    expect(SCHEMAS['message:send'].safeParse({ ...send, side: true, replyToId: 'm_1', quote: 'Goa fares' }).success).toBe(true);
    expect(SCHEMAS['message:send'].safeParse({ ...send, replyToId: 'm_1', quote: 'Goa fares' }).success).toBe(false);
    expect(SCHEMAS['page:open'].safeParse({ chatId: 'c_1', messageId: 'm_1', index: 0 }).success).toBe(true);
    expect(SCHEMAS['page:open'].safeParse({ chatId: 'c_1', messageId: 'm_1', keptId: 'ki_1' }).success).toBe(false);
    expect(SCHEMAS['page:open'].safeParse({ chatId: 'c_1' }).success).toBe(false);
    expect(SCHEMAS['keep:open'].safeParse({ id: 'ki_1' }).success).toBe(true);
  });

  it('a block over 512 KB draws nothing; a data image over 256 KB is refused; createSurface ignores theme', () => {
    expect(parseKitBlock(`${create}\n${' '.repeat(KIT_BLOCK_MAX_BYTES)}`, false)).toEqual({ messages: [], dropped: 1, pending: false });
    expect(KitImageSrcSchema.safeParse(`data:image/png;base64,${'A'.repeat(KIT_IMAGE_MAX_CHARS)}`).success).toBe(false);
    const themed = '{"createSurface":{"surfaceId":"s1","catalogId":"foo.kit.v1","theme":{"primaryColor":"#ff0000"}}}';
    expect(parseKitBlock(themed, false)).toEqual({
      messages: [{ createSurface: { surfaceId: 's1', catalogId: 'foo.kit.v1' } }],
      dropped: 0,
      pending: false,
    });
  });
});
