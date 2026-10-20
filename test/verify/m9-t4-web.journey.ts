// Spec: 08-2 §8.2 web.search, §8.3.12, 08-4 §27.3, AT-138 (the ticket's proof: a fake Exa key, "search for Italian places in
// Bandra" → one fake-Exa call, results wrapped untrusted; fake Exa answers 429 → the Bing page is used silently), AT-139
// (Readability on this PC). The job runner that will call these tools is M4 T2's, not on this branch yet, so the journey runs
// the BUILT engine web module (out/main/engine/tools/web) inside the real foo Electron main process, with the fake network and
// the fake job window defined in that process. No real host and no real key is reached. Run:
//   pnpm build && xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m9-t4-web.journey.ts
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';

interface RunOut {
  okVia: string;
  exaCalls: number;
  exaHeader: string | null;
  exaQuery: string;
  forAiHead: string;
  titles: string[];
  fallbackVia: string;
  fallbackLoads: string[];
  fallbackFirst: string;
  turns: { provider: string; outcome: string; error: string | null; paise: number | null }[];
  newsVia: string;
  newsTitle: string;
  hosts: string[];
  electron: string;
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const pages = join(__dirname, '../fakes/web/pages');
  const fixtures = { bing: readFileSync(join(pages, 'bing.html'), 'utf8'), news: readFileSync(join(pages, 'news.html'), 'utf8') };
  const modulePath = resolve('out/main/engine/tools/web/index.js');

  // tsx keeps function names with an `__name` helper that the Electron main process does not have.
  await app.evaluate('globalThis.__name = (f) => f');
  const out = (await app.evaluate(
    async (_e, a: { modulePath: string; fixtures: { bing: string; news: string } }) => {
      const req = (process as unknown as { mainModule: NodeJS.Module }).mainModule.require.bind(
        (process as unknown as { mainModule: NodeJS.Module }).mainModule,
      );
      const { WebTools } = req(a.modulePath) as typeof import('../../src/engine/tools/web');
      const exa = {
        results: [
          { title: 'Trattoria Uno, Bandra West', url: 'https://example-food.test/trattoria-uno', highlights: ['Wood-fired pizza.'] },
          { title: 'Pasta Corner', url: 'https://example-guide.test/pasta-corner', highlights: [] },
        ],
      };
      let exaStatus = 200;
      const requests: { host: string; headers: Record<string, string>; body: string }[] = [];
      const fakeFetch = async (url: string, init: RequestInit): Promise<Response> => {
        const u = new URL(url);
        const headers: Record<string, string> = {};
        new Headers(init.headers).forEach((val, k) => (headers[k] = val));
        requests.push({ host: u.host, headers, body: typeof init.body === 'string' ? init.body : '' });
        if (u.host === 'api.exa.ai')
          return new Response(JSON.stringify(exaStatus === 200 ? exa : { error: 'rate' }), { status: exaStatus });
        if (u.host === 'news.example.test') return new Response(a.fixtures.news, { status: 200, headers: { 'content-type': 'text/html' } });
        throw new TypeError('fetch failed');
      };
      const loads: string[] = [];
      const turns: { provider_id: string; outcome: string; error_kind: string | null; cost_paise: number | null }[] = [];
      let now = Date.UTC(2026, 9, 16, 3, 30);
      const clock = { now: () => now, setTimeout: () => 0, clearTimeout: () => undefined };
      const tools = new WebTools({
        clock,
        sleep: async (ms: number) => void (now += ms),
        fetch: fakeFetch,
        resource: {
          version: '2026.10',
          exa: { base: 'https://api.exa.ai' },
          tavily: { base: 'https://api.tavily.com' },
          firecrawl: { base: 'https://api.firecrawl.dev/v2' },
          browseruse: { base: 'https://api.browser-use.com/api/v2' },
        },
        pricing: { usdToInr: 88, web: { exa: { perCallUsd: 0.005 } } },
        settings: () => ({
          search: 'exa',
          read: 'this_pc',
          cloudBrowser: false,
          refused: { exa: false, tavily: false, firecrawl: false, browseruse: false },
        }),
        keys: { use: async (p: string) => (p === 'exa' ? 'fake-exa-key' : null) },
        meter: { wouldCross: () => false },
        recordTurn: (r: (typeof turns)[number]) => void turns.push(r),
        online: () => true,
        scrub: (t: string) => ({ text: t, hits: 0 }),
        isHandback: () => false,
        routeOrder: () => null,
        urlAllowed: () => true,
        isBillerSite: () => false,
        page: { load: async (url: string) => (loads.push(url), { url, html: a.fixtures.bing }) },
        newId: () => `t_${turns.length + 1}`,
        log: () => undefined,
      } as never);
      const ctx = { chatId: 'c_foo', jobId: 'j_demo', toolCallId: 'tc_demo' };
      const r1 = await tools.search({ query: 'Italian places in Bandra' }, ctx);
      const exaReq = requests.filter((x) => x.host === 'api.exa.ai');
      exaStatus = 429;
      const r2 = await tools.search({ query: 'Italian places in Bandra' }, ctx);
      const r3 = await tools.fetch({ url: 'https://news.example.test/city' }, ctx);
      return {
        okVia: r1.ok ? r1.via : r1.errorKind,
        exaCalls: exaReq.length,
        exaHeader: exaReq[0]?.headers['x-api-key'] ?? null,
        exaQuery: exaReq[0] ? (JSON.parse(exaReq[0].body) as { query: string }).query : '',
        forAiHead: r1.ok ? r1.forAi.slice(0, 60) : '',
        titles: r1.ok ? r1.data.map((x) => x.title) : [],
        fallbackVia: r2.ok ? r2.via : r2.errorKind,
        fallbackLoads: loads,
        fallbackFirst: r2.ok ? (r2.data[0]?.url ?? '') : '',
        turns: turns.map((t) => ({ provider: t.provider_id, outcome: t.outcome, error: t.error_kind, paise: t.cost_paise })),
        newsVia: r3.ok ? r3.via : r3.errorKind,
        newsTitle: r3.ok ? (r3.data.title ?? '') : '',
        hosts: [...new Set(requests.map((x) => x.host))],
        electron: process.versions.electron ?? '',
      };
    },
    { modulePath, fixtures },
  )) as RunOut;

  v.note(`ran the built engine web module inside foo's Electron ${out.electron} main process`);
  if (out.okVia !== 'exa' || out.exaCalls !== 1) throw new Error(`expected one fake-Exa call, got via=${out.okVia} calls=${out.exaCalls}`);
  if (out.exaHeader !== 'fake-exa-key' || out.exaQuery !== 'Italian places in Bandra')
    throw new Error(`Exa request: ${JSON.stringify(out)}`);
  v.note(
    `"search for Italian places in Bandra" with a fake Exa key → exactly 1 call to api.exa.ai (x-api-key header), results: ${out.titles.join(' | ')}`,
  );
  if (!out.forAiHead.startsWith('<untrusted source="web" ref="tc_demo">')) throw new Error(`not wrapped: ${out.forAiHead}`);
  v.note(`the AI sees the results wrapped untrusted: ${out.forAiHead}…`);
  if (
    out.fallbackVia !== 'this_pc' ||
    out.fallbackLoads.length !== 1 ||
    !out.fallbackLoads[0]!.startsWith('https://www.bing.com/search?q=')
  )
    throw new Error(`fallback: ${JSON.stringify(out)}`);
  v.note(
    `fake Exa answers 429 → the same search ran on Bing in foo's window (${out.fallbackLoads[0]}), first result ${out.fallbackFirst}; nothing was posted to the user`,
  );
  const t = out.turns;
  if (t.length !== 2 || t[0]!.outcome !== 'ok' || t[0]!.paise !== 44 || t[1]!.error !== 'CLOUD_QUOTA')
    throw new Error(`ai_turns rows: ${JSON.stringify(t)}`);
  v.note(`ai_turns web rows: ${t.map((x) => `${x.provider} ${x.outcome}${x.error ? ` ${x.error}` : ''} ${x.paise} paise`).join('; ')}`);
  if (out.newsVia !== 'this_pc' || out.newsTitle !== 'Cycle lanes for the sea front')
    throw new Error(`news read: ${out.newsVia} ${out.newsTitle}`);
  v.note(`with no Firecrawl key the news page was read on this PC by Readability inside Electron: "${out.newsTitle}"`);
  v.note(`hosts contacted: ${out.hosts.join(', ')} (no other cloud host)`);
  await v.shot('app-running');
}
