// Spec: 08-2 §8.2 (web.search { query; max ≤ 10 }, web.fetch { url }, web.browseCloud { url; goal }: class `read`; returns
// `SearchResult[]`, `ReadResult | needsBrowser`, `ReadResult`), 08-4 §27.1 (descriptions shown to the AI, exact), §24.14
// (untrusted wrapper), CR-0008 G-M4-05 (M9 browser and web tools plug into the ToolLayer as ToolDefs).
import { z } from 'zod';
import type { ToolDef, ToolOutcome } from '../ToolLayer';
import type { EngineWeb } from './index';
import type { WebToolResult } from './types';

const searchArgs = z.object({ query: z.string().min(1).max(500), max: z.number().int().min(1).max(10).optional() }).strict();
const fetchArgs = z.object({ url: z.string().min(1).max(4096) }).strict();
const browseArgs = z.object({ url: z.string().min(1).max(4096), goal: z.string().min(1).max(1000) }).strict();

function outcome<T>(r: WebToolResult<T>, url?: string): ToolOutcome {
  if (r.ok) return { kind: 'ok', result: { via: r.via, untrusted: r.forAi } };
  // 08-2 §8.2: `needsBrowser` is a result (the engine reads the page in foo's window), not an error.
  if (r.errorKind === 'needsBrowser') return { kind: 'ok', result: { needsBrowser: true, url } };
  // 08-2 §8.3.9: the blocked site is named, so a failed job's card says which site would not let foo in.
  if (r.errorKind === 'SITE_BLOCKED' && (r.landed ?? url))
    return { kind: 'error', errorKind: r.errorKind, result: { site: siteOf(r.landed ?? url!) } };
  return { kind: 'error', errorKind: r.errorKind };
}

function siteOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function webToolDefs(web: EngineWeb): Record<string, ToolDef> {
  // ToolContext has no tool call id or chat yet: the job id is the wrapper ref; the chat comes with the runner's row.
  const ctx = (c: { jobId: string; signal: AbortSignal }) => ({ chatId: null, jobId: c.jobId, toolCallId: c.jobId, signal: c.signal });
  return {
    'web.search': {
      name: 'web.search',
      actionClass: 'read',
      args: 'query, max',
      description: 'Search the web. Returns up to 10 results with title, address and snippet.',
      run: async (args, c) => {
        const a = searchArgs.safeParse(args);
        if (!a.success) return { kind: 'error', errorKind: 'PROTOCOL_INVALID' };
        return outcome(await web.tools.search(a.data, ctx(c)));
      },
    },
    'web.fetch': {
      name: 'web.fetch',
      actionClass: 'read',
      args: 'url',
      description: 'Read a public web page as text.',
      run: async (args, c) => {
        const a = fetchArgs.safeParse(args);
        if (!a.success) return { kind: 'error', errorKind: 'PROTOCOL_INVALID' };
        return outcome(await web.tools.fetch(a.data, ctx(c)), a.data.url);
      },
    },
    'web.browseCloud': {
      name: 'web.browseCloud',
      actionClass: 'read',
      args: 'url, goal',
      description: 'Have a reading assistant browse public pages for a goal and report back. It cannot sign in, buy, book or send.',
      run: async (args, c) => {
        const a = browseArgs.safeParse(args);
        if (!a.success) return { kind: 'error', errorKind: 'PROTOCOL_INVALID' };
        return outcome(await web.tools.browseCloud(a.data, ctx(c)), a.data.url);
      },
    },
  };
}
