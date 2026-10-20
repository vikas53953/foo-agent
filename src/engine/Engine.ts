// Spec: 08-1 §1.2 (the engine box: chat lane, your-AI adapters, prompt assembly, Redactor), §2.4 (MainToEngine kinds the
// engine answers), 08-2 §6 (adapters; detect, verify, choose), §7 (prompt assembly, FOO/1, output filters), §11.4 (the
// Redactor on every AI input), 08-4 §24.9 / §25.5 (the rewrite turn for a held sentence: cheap model, `rewrite.md`),
// §30.8 (on engine start every `sys-*.md` in the scratch folders is deleted), 08-3 §22.3 (FOO_FAKE_AI).
// The +20 s health check of 08-1 §2.2 step 7 runs only outside FOO_TEST runs (tests verify explicitly). Deferred to their
// milestones: M4 T2 wires the JobRunner + ToolLayer (08-2 §5, §8; the job lane's tools come from `tools`, fake in tests
// until M8/M9); the vault for key providers (read through `vault.use`, CR-0020).
// Memory parts 5/5b come from the chat lane (08-4 §24.16, memory/retrieval.ts). M6 T5: the memory chips, the post-turn
// review (08-3 §12.4, one background `memory_review` turn with its ai_turns row in foo's 1:1 chat, 08-4 §30.1, §31), intake
// remember / forget, the `memory_confirm` card answers and the `memory.search` / `memory.propose` step tools (08-2 §8.2).
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { Clock } from '../shared/clock';
import { ok, type Result } from '../shared/errors';
import { newId as mintId, type IdPrefix } from '../shared/ids';
import { settingsSchema, type Settings } from '../shared/settings';
import { settingsDefaults } from '../shared/settingsDefaults';
import type { CardAnswer, CardRow, ProviderId } from '../shared/types';
import type { EngineChat, EngineMessage } from '../main/db/queries';
import { AiRegistry, CliLimiter, createAdapters, loadPricing, nodeAiFs, nodeWhich, sweepSystemFiles } from './ai';
import { AiService } from './AiService';
import { testHomeEnv, testHomeWhich, vaultKeyReader } from './ai/vaultKeys';
import { ChatLane, type IntakeDecisionView, type IntakeInput, type LaneProtocol } from './chat/ChatLane';
import type { DbOp, DbTxReply, MainLink, MainToEngine } from './protocol';
import { MemoryService, UNDO_MS } from './memory/MemoryService';
import { MemoryShare } from './memory/askShare';
import { StyleStatsRunner } from './memory/styleStats';
import { MemoryTidy, TidyActSchema, tidyTurnVia } from './memory/tidy';
import { newNonce } from '../shared/canon';
import { isChipToken, MemoryChips } from './memory/chips';
import { answerOf, resolveCardOp } from './memory/cardAnswer';
import { IntakeMemory } from './memory/intakeMemory';
import { MemoryReview, MemoryReviewActSchema } from './memory/review';
import { memoryTools } from './tools/memoryTools';
import { createParseWorker, type ParseWorker } from './memory/parseWorker';
import { watchMemory, type MemoryWatcher } from './memory/watcher';
import { parseEnvelope, validateAct, formatIssues } from './prompt/envelope';
import { filterSay } from './prompt/filters';
import { PromptBuilder, type ConversationMessage } from './prompt/PromptBuilder';
import { ReleaseGate } from './prompt/releaseGate';
import { Redactor } from './redact/Redactor';
import { createEngineWeb, vaultWebKeys, webToolDefs, type EngineWeb } from './tools/web';
import { findBanned } from './prompt/filters';
import { capRateOf, resolveModel } from './ai/models';
import { createGate } from './gate/GateLogic';
import { JobRunner } from './jobs/JobRunner';
import { JobRecovery } from './jobs/recovery';
import { ToolLayer, type ToolRegistry } from './tools/ToolLayer';
import type { SecondLookAct, StepAct } from '../shared/schemas';
// M9 T3
import { engineBrowserTools, liveTermsReader, type BrowserRuntime } from './tools/browser/tools';
// M8
import { WhatsAppConnector, type WaPortLike } from './tools/connectors/whatsapp';
import { linkWaRecipients, whatsappDraftTool } from './tools/connectors/recipients'; // M8 T7
import { xTools } from './tools/connectors/x'; // M8 T7
import { googleTools, testGoogleAccess, type GoogleConnectors, type GoogleOptions } from './tools/connectors/google-tools';
import { ConnTrouble } from './connections/trouble';
import type { GoogleBases } from './tools/connectors/limiter';
import type { HttpFetch } from './tools/connectors/types';

export interface EngineOptions {
  link: MainLink;
  clock: Clock;
  env: Record<string, string | undefined>;
  dataDir: string;
  localDir: string;
  resourcesDir: string;
  execPath: string;
  testRun: boolean;
  /** Tests inject a fetch; production uses the global one. */
  fetch?: typeof fetch;
  /** Tests inject PATH lookup so detect does not depend on the machine. */
  which?: ReturnType<typeof nodeWhich>;
  /** M4: the tools jobs may use (08-2 §8.2). Tests pass the fake tools; M8 connectors and M9 browser add the real ones. */
  tools?: ToolRegistry;
  /** Tests only: deterministic ids (a fake AI script can then name a tool call id in a proof). */
  newId?: (prefix: IdPrefix) => string;
  // M8: Google (T2's GoogleAccess) → the Gmail, Calendar and Contacts tools (08-2 §8.2). FOO_TEST runs may set
  // FOO_FAKE_GOOGLE={base url} instead (a fake Google on 127.0.0.1, test/fakes/connectors).
  google?: GoogleOptions;
  /** T5: tests only. Main holds the token (as in production) and Google is the test's fake fetch on these bases. */
  googleViaMain?: { http: HttpFetch; bases?: Partial<GoogleBases> };
  // M9
  /** T8: tests only. foo's browser tools over a test launcher (the sandbox sites), beside injected fake tools. */
  browser?: { registry: ToolRegistry; runtime: BrowserRuntime };
}

export class Engine {
  private settings: Settings = structuredClone(settingsDefaults);
  private online = true;
  readonly ai: AiService;
  readonly lane: ChatLane;
  readonly redactor: Redactor;
  readonly web: EngineWeb;
  readonly tools: ToolLayer;
  readonly jobs: JobRunner;
  readonly recovery: JobRecovery;
  private prompts: PromptBuilder;
  // M8 (T3): the WhatsApp side of the wa-bridge port (08-3 §16.4).
  readonly whatsapp: WhatsAppConnector;
  /** M6 slot (CR-0010): T3's MemoryService (the `memory:*` commands, learn, the watcher); T7 fills its tidy. */
  readonly memory: MemoryService;
  private memoryWatcher: MemoryWatcher | null = null;
  /** M6 T7: the nightly tidy (08-3 §12.7), sharing a fact into a group (§12.5.1) and style stats (§12.9). */
  readonly tidy: MemoryTidy;
  readonly share: MemoryShare;
  private readonly style: StyleStatsRunner;
  // M9 T3: foo's browser (none when a test injects its tools).
  private readonly browser: BrowserRuntime | null;
  // M6 T5
  readonly memoryChips: MemoryChips;
  readonly memoryReview: MemoryReview;
  private memoryIntake: IntakeMemory;
  // M8
  readonly google: GoogleConnectors | null;
  readonly trouble: ConnTrouble;

  static create(o: EngineOptions): Engine {
    return new Engine(o);
  }

  private constructor(private o: EngineOptions) {
    const newId = (p: IdPrefix, now: number) => (o.newId ? o.newId(p) : mintId(p, now));
    const log = (evt: string, kind?: string) =>
      o.link.send('log', { t: o.clock.now(), lvl: 'info', mod: 'engine', evt, ...(kind ? { kind } : {}) });
    this.redactor = new Redactor({ clock: o.clock, log: (kind) => log('redact', kind) });
    this.prompts = new PromptBuilder({
      clock: o.clock,
      log: (kind) => log('prompt', kind),
      redactor: this.redactor,
      promptsDir: join(o.resourcesDir, 'prompts'),
    });
    const pricing = loadPricing(JSON.parse(readFileSync(join(o.resourcesDir, 'pricing.json'), 'utf8')));
    // M9 T4: web tools (08-2 §8.2); each cloud call writes its ai_turns row (08-4 §27.3 item 5).
    this.web = createEngineWeb({
      ...o,
      fetch: o.fetch ?? fetch,
      settings: () => this.settings,
      online: () => this.online,
      scrub: (t) => this.redactor.scrub(t),
      pricing,
      recordTurn: (row) => void o.link.request('db.tx', { ops: [{ op: 'insert', table: 'ai_turns', row: { ...row } }] }),
      newId: () => newId('t', o.clock.now()),
      log: (kind) => log('web', kind),
      // M5's vault answers the engine only (08-2 §11.3); main registers the value before it is sent.
      keys: vaultWebKeys(async (req) => {
        const r = await o.link.request<string>('vault.use', req).catch(() => null);
        return r?.ok && typeof r.value === 'string' && r.value ? r.value : null;
      }),
      // X-127: main writes `connections.web.refused.{p}`. The brief line for a used-up key waits for the brief (M7): logged.
      onRefused: (provider) => o.link.send('web.refused', { provider }),
      onQuota: (p) => log('web.quota', p),
    });
    const fake = o.testRun && Boolean(o.env.FOO_FAKE_AI);
    // CR-0020: keys come from main's vault; a FOO_TEST run may stand in a fake home for the J2 ladder (ai/vaultKeys.ts).
    const testHome = o.testRun ? o.env.FOO_TEST_AI_HOME : undefined;
    const adapters = createAdapters({
      clock: o.clock,
      fetch: o.fetch ?? fetch,
      paths: { LOCAL: o.localDir, DATA: o.dataDir },
      env: testHome ? testHomeEnv(o.env, testHome) : o.env,
      platform: process.platform,
      getKey: vaultKeyReader(o.link),
      which: o.which ?? (testHome ? testHomeWhich(testHome, nodeAiFs) : nodeWhich()),
      fs: nodeAiFs,
      pricing,
      providerSettings: (id) => this.settings.ai.providers[id],
      execPath: o.execPath,
      timeZone: this.settings.locale.timeZone,
      isOnline: () => this.online,
      cliLimiter: new CliLimiter(),
    });
    const registry = new AiRegistry(adapters, { clock: o.clock, fakeEnabled: fake });
    void sweepSystemFiles({ fs: nodeAiFs, paths: { LOCAL: o.localDir, DATA: o.dataDir } }).catch(() => undefined);
    this.ai = new AiService({
      registry,
      clock: o.clock,
      pricing,
      settings: () => this.settings,
      online: () => this.online,
      fake,
      publish: (status) => o.link.send('ui.patch', { event: 'ai:status', payload: status }),
      persist: (p) => o.link.send('ai.state', p),
      onUsable: () => {
        void this.drainQueued();
        void this.jobs.startNext();
      },
      detectRow: (row) => o.link.send('ui.patch', { event: 'ai:detectRow', payload: row }),
      retestTimers: !o.testRun,
    });
    // M8
    // T5: connection trouble, and the poller / Contacts sync with the rows. Main holds the Google token (gap pick T5-01): the
    // Google tools take main's access unless a test injects its own, or a FOO_TEST run serves only a fake Gmail
    // (FOO_FAKE_GOOGLE without FOO_TEST_GOOGLE_BASE: T4's fixed fake token). FOO_TEST runs without a fake reach no Google.
    this.trouble = new ConnTrouble({ link: o.link, clock: o.clock, newId: (p) => newId(p, o.clock.now()), log });
    const viaMain = (bases?: Partial<GoogleBases>) =>
      this.trouble.linkOptions({
        ...(bases ? { bases } : {}),
        contactsOn: () => this.settings.connections.google.contactsOn,
        online: () => this.online,
      });
    const fakeBase = o.testRun ? o.env.FOO_FAKE_GOOGLE : undefined;
    const google =
      o.google ??
      (o.googleViaMain ? { ...viaMain(o.googleViaMain.bases), http: o.googleViaMain.http } : null) ??
      (o.testRun
        ? fakeBase
          ? o.env.FOO_TEST_GOOGLE_BASE
            ? viaMain({ gmail: fakeBase, calendar: fakeBase, people: fakeBase })
            : testGoogleAccess(fakeBase)
          : null
        : viaMain());
    this.google = google
      ? googleTools({ ...google, link: o.link, clock: o.clock, timeZone: () => this.settings.locale.timeZone, log })
      : null;
    // M5 T7: the real gate (08-2 §9.4) replaces the M4 stub; R4 results go through Redactor.scrub (08-2 §11.4).
    const gate = createGate({ settings: () => this.settings, now: () => o.clock.now() });
    const browser =
      o.browser ?? (o.tools ? null : engineBrowserTools({ ...o, redactor: this.redactor, settings: () => this.settings, log }));
    this.browser = browser?.runtime ?? null;
    this.tools = new ToolLayer({
      link: o.link,
      clock: o.clock,
      newId: (p) => newId(p, o.clock.now()),
      // M6 T5: the memory step tools (08-2 §8.2) beside the injected ones (M8 connectors, M9 browser, fakes in tests).
      // M8 T7: whatsapp.draft and the X hand-back tools; the WhatsApp check is read through `this.whatsapp` when called.
      tools: {
        ...webToolDefs(this.web),
        ...this.memoryToolRegistry(newId),
        ...this.draftToolRegistry(),
        // M9 T3: foo's browser tools unless a test injects its own (M9 T8: a test may inject both).
        ...(o.tools ?? browser?.registry ?? {}),
        ...(o.tools && o.browser ? o.browser.registry : {}),
        ...(this.google?.tools ?? {}),
      },
      gate,
      log: (evt, kind) => log(evt, kind),
      scrub: (text) => this.redactor.scrub(text),
      // M8 T5
      listed: (tool) => this.trouble.listed(tool),
    });
    this.recovery = new JobRecovery({
      link: o.link,
      clock: o.clock,
      newId: (p) => newId(p, o.clock.now()),
      settings: () => this.settings,
      ai: this.ai,
      log: (evt, kind) => log(evt, kind),
    });
    this.jobs = new JobRunner({
      link: o.link,
      clock: o.clock,
      newId: (p) => newId(p, o.clock.now()),
      settings: () => this.settings,
      ai: this.ai,
      prompts: this.stepProtocol(),
      tools: this.tools,
      dataDir: o.dataDir,
      rateOf: (id) => capRateOf(pricing, id, resolveModel(id, 'default', pricing, this.settings.ai.providers[id])) ?? null,
      usdToInr: pricing.usdToInr,
      log: (evt, kind) => log(evt, kind),
      gate,
      scrub: (text) => this.redactor.scrub(text),
      // M9 T8: the live terms right before a booking, read from the job's page (08-2 §9.4.2).
      ...(this.browser
        ? {
            browserLive: liveTermsReader(this.browser),
            browserUrl: (id: string) => this.browser?.page(id)?.url() ?? null,
            recipes: this.browser.recipes,
          }
        : {}),
      hooks: {
        onAiError: (job, kind) => this.recovery.onAiError(job, kind),
        onCannotStart: (job, kind) => this.recovery.onCannotStart(job, kind),
        // M8 T5: jobs waiting on a lost Google connection resume after recovery's, in the same slots.
        beforeSchedule: async () => (await this.recovery.beforeSchedule()) && (await this.trouble.beforeSchedule()),
        onToolError: (job, tool, kind, stepId) => this.trouble.onToolError(job, tool, kind, stepId),
        // M5 T10: messages that waited at the AI cap go when it is raised or the month turns.
        onCapLifted: () => void this.drainQueued(),
        // M9 T3: a finished job's browser window closes, so the next browser job gets its slot.
        onEnded: (jobId) => void this.browser?.jobEnded(jobId),
      },
      // M6 T5: "Used:" chips under a step's card or result, and the post-turn review after DONE (08-3 §12.4, §12.5).
      memory: {
        used: async (chatId, facts) => {
          const last = (await this.query<EngineMessage[]>('messagesBefore', chatId, null, 1)) ?? [];
          if (last[0]) await this.memoryChips.used(chatId, last[0].id, facts);
        },
        jobDone: (chatId) => this.memoryReview.after(chatId),
      },
    });
    this.whatsapp = new WhatsAppConnector({
      link: o.link,
      clock: o.clock,
      settings: () => this.settings,
      log: (evt, kind) => log(evt, kind),
    });
    this.recovery.attach(this.jobs);
    this.trouble.attach(this.jobs, this.google);
    this.lane = new ChatLane({
      link: o.link,
      clock: o.clock,
      newId: (p) => newId(p, o.clock.now()),
      settings: () => this.settings,
      ai: this.ai,
      protocol: this.protocol(),
      log: (evt, kind) => log(evt, kind),
      jobs: this.jobs,
      // M5 T10: the cap check covers chat-lane turns (08-2 §5.10 item 4, CR-0008 (j) row 5).
      capCheck: (chars, purpose) => this.jobs.allowChatCall(chars, purpose),
      // M6 T5: memory in the lane; the seams are built below and only called once messages flow.
      memory: {
        beforeTurn: (chat, m) => this.memoryIntake.beforeTurn(chat, m),
        decide: (chat, helper, m, act) => this.memoryIntake.decide(chat, helper, m, act),
        used: (chatId, anchorId, facts) => this.memoryChips.used(chatId, anchorId, facts),
        answered: (chatId) => this.memoryReview.after(chatId),
        onCardAnswered: (a) => this.memoryIntake.onCardAnswered(a),
      },
    });
    this.jobs.setIntake((chatId, messageId) => this.lane.enqueue(chatId, messageId, { intakeOnly: true }));
    let parser: ParseWorker | null = null;
    this.memory = new MemoryService({
      link: o.link,
      clock: o.clock,
      dataDir: o.dataDir,
      timeZone: () => this.settings.locale.timeZone,
      // Always a real UUIDv7: the file parser accepts only full `f_{UUIDv7}` ids (08-3 §12.2), never the tests' counters.
      newFactId: () => mintId('f', o.clock.now()),
      // 08-1 §2.5: parsing runs in a worker; from TypeScript sources (tests) the worker loads them through tsx.
      parser: () => (parser ??= createParseWorker(__filename.endsWith('.ts') ? { execArgv: ['--require', 'tsx/cjs'] } : {})),
      classify: null,
      log: (evt, kind) => log(evt, kind),
    });
    const ids = { newId: (p: IdPrefix) => newId(p, o.clock.now()), newNonce };
    const turn = tidyTurnVia({
      link: o.link,
      clock: o.clock,
      newId: ids.newId,
      timeZone: () => this.settings.locale.timeZone,
      fooChatId: async () => {
        const r = await o.link.request<string | null>('db.query', { q: 'chats.foo', args: [] });
        return r.ok ? r.value : null;
      },
      ai: this.ai,
      build: (block) => this.prompts.buildTidy(TidyActSchema, block, this.settings.locale.timeZone),
      allow: (chars) => this.jobs.allowChatCall(chars, 'tidy'),
    });
    const settings = () => this.settings;
    this.tidy = new MemoryTidy({ link: o.link, clock: o.clock, dataDir: o.dataDir, memory: this.memory, settings, turn, log, ...ids });
    this.memory.tidyWith = () => this.tidy.run();
    this.share = new MemoryShare({ link: o.link, clock: o.clock, ...ids });
    this.style = new StyleStatsRunner({ link: o.link, memory: this.memory, settings, log });
    // M6 T5
    const query = <T>(q: string, ...args: unknown[]) => this.query<T>(q, ...args);
    const tx = (ops: DbOp[]) => o.link.request<DbTxReply>('db.tx', { ops });
    this.memoryChips = new MemoryChips({
      now: () => o.clock.now(),
      newId: (p) => newId(p, o.clock.now()),
      tx,
      query,
      memory: this.memory,
      changed: (factIds, chip) => o.link.send('ui.patch', { event: 'memory:changed', payload: { factIds, chip } }),
    });
    this.memoryReview = new MemoryReview({
      clock: o.clock,
      settings: () => this.settings,
      query,
      tx,
      newId: (p) => newId(p, o.clock.now()),
      messageLine: (m, chat) => this.reviewLine(m, chat),
      factLine: (f) =>
        this.prompts.factLine(
          { id: f.id, text: f.text, said: f.provenance === 'said' ? 'user' : 'guess', learnedAt: f.learnedAt },
          this.settings.locale.timeZone,
        ),
      build: (data) => this.prompts.buildMemoryReview(MemoryReviewActSchema, data, this.settings.locale.timeZone),
      turn: (chatId, system, prompt) => this.reviewTurn(chatId, system, prompt),
      memory: this.memory,
      chips: this.memoryChips,
      log: (evt, kind) => log(evt, kind),
    });
    this.memoryIntake = new IntakeMemory({
      clock: o.clock,
      settings: () => this.settings,
      query,
      tx,
      newId: (p) => newId(p, o.clock.now()),
      memory: this.memory,
      classify: null,
      chips: this.memoryChips,
      review: this.memoryReview,
      react: (messageId, emoji, helper) => this.lane.react(messageId, emoji, helper),
      post: (chatId, messageId, text, helper) => this.lane.post(chatId, messageId, text, helper, null),
      undoMs: UNDO_MS,
      log: (evt, kind) => log(evt, kind),
    });
  }

  /**
   * CR-0010 G-M6-21: main hands every `memory_confirm` answer to the engine, so one no seam claimed (a payload with neither
   * `memory` nor `share`) is still moved out of `asking` here rather than left open forever.
   */
  private async settleMemoryConfirm(a: { cardId: string; answer?: CardAnswer; choice?: string; resolvedBy?: string }): Promise<boolean> {
    const card = await this.query<CardRow>('cardById', a.cardId);
    if (!card || card.jobId !== null || card.type !== 'choice' || card.payload.purpose !== 'memory_confirm') return false;
    if (card.state !== 'asking') return true;
    await this.o.link.request<DbTxReply>('db.tx', { ops: [resolveCardOp(card, answerOf(a), a.resolvedBy, this.o.clock.now())] });
    return true;
  }

  private async query<T>(q: string, ...args: unknown[]): Promise<T | null> {
    const r = await this.o.link.request<T>('db.query', { q, args });
    return r.ok ? r.value : null;
  }

  /** M8 T7: `whatsapp.draft` (the §16.4.2 ladder) and `x.draft` / `x.openCompose`. */
  private draftToolRegistry(): ToolRegistry {
    const recipients = linkWaRecipients(this.o.link, {
      check: (jid) => this.whatsapp.check(jid),
      now: () => this.o.clock.now(),
    });
    const whatsapp = whatsappDraftTool({
      link: this.o.link,
      recipients,
      draftsOn: () => this.settings.connections.whatsapp.draft,
    });
    return { 'whatsapp.draft': whatsapp, ...xTools({ link: this.o.link }) };
  }

  /** M6 T5: the two memory step tools; their seams are read when a job calls them. */
  private memoryToolRegistry(newId: (p: IdPrefix, now: number) => string): ToolRegistry {
    return memoryTools({
      clock: this.o.clock,
      settings: () => this.settings,
      query: (q, ...args) => this.query(q, ...args),
      tx: (ops) => this.o.link.request<DbTxReply>('db.tx', { ops }),
      newId: (p) => newId(p, this.o.clock.now()),
      log: (evt, kind) => this.o.link.send('log', { t: this.o.clock.now(), lvl: 'info', mod: 'engine', evt, ...(kind ? { kind } : {}) }),
      memory: { learn: (op) => this.memory.learn(op) },
      chips: { saved: (chatId, anchorId, fact) => this.memoryChips.saved(chatId, anchorId, fact) },
    });
  }

  /** 08-4 §24.21 memory_review line: 08-2 §7.2 part 7 (`[{name}, {when}]: {text_for_ai ?? text}`). */
  private async reviewLine(m: EngineMessage, chat: EngineChat): Promise<string> {
    const helper = chat.helperId ? await this.query<{ name: string }>('helpers.byId', chat.helperId) : null;
    const name =
      m.authorKind === 'user'
        ? (this.settings.user.firstName ?? 'You')
        : m.authorKind === 'helper'
          ? (helper?.name ?? 'Helper')
          : this.settings.identity.agentName;
    const text = m.kind === 'voice' ? (m.transcript ?? '') : m.text;
    return this.prompts.messageLine({ name, at: m.createdAt, text, textForAi: m.textForAi }, this.settings.locale.timeZone);
  }

  /**
   * 08-3 §12.4: one `memory_review` turn on the background lane (cheap, 800 out, 60 s, 08-4 §30.1); skipped with no AI or at
   * the spend cap (08-2 §5.10 item 4). One ai_turns row in foo's 1:1 chat (08-4 §31 `ai_turns.chat_id`). Returns the `<act>`.
   */
  private async reviewTurn(chatId: string, system: string, prompt: string): Promise<unknown> {
    const pick = this.ai.pick();
    if (!pick) return null;
    if (!(await this.jobs.allowChatCall(system.length + prompt.length, 'memory_review'))) return null;
    const turnId = mintId('t', this.o.clock.now());
    const startedAt = this.o.clock.now();
    const r = await this.ai
      .runTurn(
        pick.providerId,
        { ...this.ai.turnParams(pick.providerId, 'memory_review'), turnId, purpose: 'memory_review', system, prompt, chatId },
        { onText: () => {}, onSession: () => {} },
        new AbortController().signal,
      )
      .catch(() => null);
    const fooChat = await this.query<string>('chats.foo');
    const usage = r?.usage ?? { tokensIn: null, tokensOut: null, cacheRead: null, cacheWrite: null, costUsd: null };
    const cost = this.ai.costPaise(pick.providerId, usage, r?.modelReported);
    const ok = !!r && r.stopReason === 'end';
    await this.o.link.request('db.tx', {
      ops: [
        {
          op: 'insert',
          table: 'ai_turns',
          row: {
            id: turnId,
            chat_id: fooChat,
            purpose: 'memory_review',
            provider_id: pick.providerId,
            model_reported: r?.modelReported ?? null,
            session_id: r?.sessionId ?? null,
            tokens_in: usage.tokensIn,
            tokens_out: usage.tokensOut,
            tokens_cache_read: usage.cacheRead,
            tokens_cache_write: usage.cacheWrite,
            cost_paise: cost.paise,
            cost_source: cost.source,
            billing: pick.billing,
            duration_ms: this.o.clock.now() - startedAt,
            outcome: ok ? 'ok' : r?.errorKind === 'AI_TIMEOUT' ? 'timeout' : 'error',
            error_kind: ok ? null : (r?.errorKind ?? 'UNKNOWN'),
            started_at: startedAt,
          },
        },
      ],
    });
    if (!ok) return null;
    const env = parseEnvelope(r.text);
    return env.act ?? null;
  }

  /** 08-3 §12.2: reindex what changed while foo was closed, then watch `{DATA}/memory`. */
  private async startMemory(): Promise<void> {
    if (!this.o.dataDir || this.memoryWatcher) return;
    this.memoryWatcher = watchMemory({
      dataDir: this.o.dataDir,
      clock: this.o.clock,
      onChange: (file) => void this.memory.fileChanged(file),
    });
    await this.memory.reindexAll();
  }

  /** The step protocol for the job runner (08-4 §24.1 step row, §25.3, 08-2 §7.5–§7.6). */
  private stepProtocol(): ConstructorParameters<typeof JobRunner>[0]['prompts'] {
    const redactor = this.redactor;
    return {
      buildStep: (jobBlock, tools, memory, steer) =>
        this.prompts.buildStep({
          pinned: memory.part5,
          turnFacts: memory.part5b,
          agentName: this.settings.identity.agentName,
          firstName: this.settings.user.firstName ?? null,
          vibeLine: '',
          emoji: '',
          timeZone: this.settings.locale.timeZone,
          tools,
          jobBlock,
          steer: steer ?? null,
        }),
      buildRepair: (issues) => this.prompts.buildRepair(issues).prompt,
      parseStep: (text) => {
        const env = parseEnvelope(text);
        if (env.act === undefined) return { act: null, issues: env.actError ?? formatIssues([]) };
        const v = validateAct('step', env.act);
        return v.ok ? { act: v.act as StepAct, issues: null, say: env.say } : { act: null, issues: v.issues };
      },
      buildStuck: (results) => this.prompts.buildStuck(results),
      parseStuck: (text) => {
        const env = parseEnvelope(text);
        const v = env.act === undefined ? null : validateAct('classify', env.act);
        return v?.ok ? (v.act as { whatsWrong: string }).whatsWrong : null;
      },
      filter: (text) => filterSay(text, { redactor }).text,
      isBanned: (text) => findBanned(text).length > 0,
      // M5 T8 (08-4 §24.7, §25.4)
      buildSecondLook: (userWords, actionJson) => this.prompts.buildSecondLook(userWords, actionJson),
      parseSecondLook: (text) => {
        const env = parseEnvelope(text);
        const v = env.act === undefined ? null : validateAct('second_look', env.act);
        return v?.ok ? (v.act as SecondLookAct) : null;
      },
    };
  }

  /** The reply protocol for the chat lane, from the prompt modules. */
  private protocol(): LaneProtocol {
    const redactor = this.redactor;
    const decision = (act: unknown): IntakeDecisionView | null => {
      const v = validateAct('intake', act);
      return v.ok ? ((v.act as { decision: IntakeDecisionView }).decision ?? null) : null;
    };
    // 08-4 §25.2 IntakeAct.usedMemoryIds (the lane keeps only the ids it offered, §24.16 item 6).
    const usedIds = (act: unknown): string[] => {
      const v = validateAct('intake', act);
      return v.ok ? (v.act as { usedMemoryIds: string[] }).usedMemoryIds : [];
    };
    const issuesOf = (act: unknown, error: string | null) => {
      if (error) return error;
      const v = validateAct('intake', act);
      return v.ok ? null : v.issues;
    };
    return {
      buildIntake: (i: IntakeInput) => {
        const nameOf = (m: EngineMessage) =>
          m.authorKind === 'user'
            ? (i.settings.user.firstName ?? 'You')
            : m.authorKind === 'helper'
              ? (i.helper?.name ?? 'Helper')
              : i.settings.identity.agentName;
        const conversation: ConversationMessage[] = i.conversation.map((m) => ({
          name: nameOf(m),
          at: m.createdAt,
          text: m.kind === 'voice' ? (m.transcript ?? '') : m.text,
          textForAi: m.textForAi,
        }));
        const helper = i.helper ? { name: i.helper.name, jobText: i.helper.jobText, goodResult: i.helper.goodResult ?? '' } : undefined;
        return this.prompts.buildIntake({
          chatKind: i.chat.kind === 'helper' ? 'helper' : 'foo',
          agentName: i.settings.identity.agentName,
          vibeLine: '',
          emoji: '',
          firstName: i.settings.user.firstName ?? null,
          timeZone: i.settings.locale.timeZone,
          ...(helper ? { helper } : {}),
          helpers: [],
          pinned: i.memory.part5,
          turnFacts: i.memory.part5b,
          conversation,
          userMessage: i.message.textForAi ?? i.message.text,
          local: i.local,
          ...(i.oldPlan ? { oldPlan: i.oldPlan } : {}),
        });
      },
      buildRepair: (issues) => this.prompts.buildRepair(issues).prompt,
      parse: (text) => {
        const env = parseEnvelope(text);
        const act = env.act === undefined ? null : decision(env.act);
        const issues = act ? null : (issuesOf(env.act, env.actError) ?? formatIssues([]));
        return { say: env.say, act, issues, usedMemoryIds: act ? usedIds(env.act) : [] };
      },
      parseAct: (text) => {
        const env = parseEnvelope(text);
        const act = env.act === undefined ? null : decision(env.act);
        return { act, issues: act ? null : issuesOf(env.act, env.actError), usedMemoryIds: act ? usedIds(env.act) : [] };
      },
      gate: (onRelease, signal) => {
        let resolve!: () => void;
        const closed = new Promise<void>((r) => (resolve = r));
        const g = new ReleaseGate({
          clock: this.o.clock,
          redactor,
          rewrite: (sentence) => this.rewrite(sentence, signal),
          onRelease,
          onSayClosed: () => resolve(),
        });
        return {
          push: (d) => g.feed(d),
          end: async () => {
            g.end();
            await closed;
          },
          released: () => g.releasedText,
        };
      },
      filter: (text) => filterSay(text, { redactor }).text,
    };
  }

  /** 08-4 §24.9: one rewrite turn on the cheap model for a sentence that still holds a banned word. */
  private async rewrite(sentence: string, signal: AbortSignal): Promise<string | null> {
    if (signal.aborted) return null;
    const pick = this.ai.pick();
    if (!pick) return null;
    const built = this.prompts.buildRewrite(sentence);
    // M5 T10 (row 5): a rewrite is a key call too; at the cap the held sentence is dropped, as when the turn fails.
    if (!(await this.jobs.allowChatCall(built.system.length + built.prompt.length, 'rewrite'))) return null;
    const r = await this.ai
      .runTurn(
        pick.providerId,
        { ...this.ai.turnParams(pick.providerId, 'rewrite'), turnId: mintId('t', this.o.clock.now()), purpose: 'rewrite', ...built },
        { onText: () => {}, onSession: () => {} },
        signal,
      )
      .catch(() => null);
    if (!r || r.stopReason !== 'end') return null;
    return parseEnvelope(r.text).say;
  }

  /** 08-1 §2.2 step 7: +20 s after start, re-verify the chosen AI when its last verify is more than 10 min old. */
  private scheduleHealthCheck(): void {
    this.o.clock.setTimeout(() => {
      const primary = this.settings.ai.primary;
      if (!primary) return;
      const at = this.settings.ai.providers[primary]?.lastVerifiedAt ?? 0;
      if (this.o.clock.now() - at > 10 * 60_000) void this.ai.verify(primary).catch(() => undefined);
    }, 20_000);
  }

  /** 04 §3.3: messages that waited to send go now, oldest first. */
  async drainQueued(): Promise<void> {
    const r = await this.o.link.request<EngineMessage[]>('db.query', { q: 'messagesQueued', args: [] });
    if (r.ok) for (const m of r.value) this.lane.enqueue(m.chatId, m.id, { onlyIfQueued: true });
  }

  /** One message from main; a defined return value is the reply to a request. */
  async handle(msg: MainToEngine): Promise<Result<unknown> | undefined> {
    switch (msg.kind) {
      case 'settings.changed': {
        const parsed = settingsSchema.safeParse(msg.payload.settings);
        if (parsed.success) {
          const first = this.firstSettings;
          const usableBefore = this.ai.pick() !== null;
          const capBefore = first ? null : this.settings.money.aiCapPaise;
          this.settings = parsed.data;
          this.firstSettings = false;
          this.ai.settingsChanged();
          // 08-2 §5.10 item 4: a raised AI cap resumes the jobs paused at it.
          // Main sends no paths, so a changed cap is read from the value itself.
          if (capBefore !== null && capBefore !== parsed.data.money.aiCapPaise) void this.jobs.capChanged();
          // First settings, or a chosen AI that just became usable (J2 choose → ai.state → settings): waiting messages go now.
          if (first || (!usableBefore && this.ai.pick())) void this.drainQueued();
          if (first && !this.o.testRun) this.scheduleHealthCheck();
          if (first) void this.startMemory().catch(() => undefined);
          // M8 T5: the Google rows as main has them (a restart while connected starts the poller after the login delay).
          if (first && this.google) void this.jobs.track(this.trouble.boot());
          // 08-2 §5.9 (G-M4-13): main decided safe mode and whether the last exit was clean; recovery runs once per start.
          if (first) void this.jobs.track(this.recovery.recoverAll(msg.payload.launch ?? { safeMode: false, cleanStart: true }));
        }
        return undefined;
      }
      case 'net':
        this.online = msg.payload.online;
        this.ai.netChanged(msg.payload.online);
        await this.recovery.netChanged(msg.payload.online);
        return undefined;
      case 'user.message':
        this.lane.enqueue(msg.payload.chatId, msg.payload.messageId);
        void this.style.onUserMessage(msg.payload.chatId).catch(() => undefined);
        return undefined;
      case 'reply.stop':
        this.lane.stop(msg.payload.chatId);
        return undefined;
      case 'reply.retry':
        this.lane.retry(msg.payload.messageId);
        return undefined;
      case 'ai.cmd': {
        const id = msg.payload.providerId as ProviderId | undefined;
        if (msg.payload.cmd === 'detect') return ok(await this.ai.detect());
        if (msg.payload.cmd === 'verify' && id) return ok(await this.ai.verify(id));
        if (msg.payload.cmd === 'choose' && id) return this.ai.choose(id, (msg.payload.backup as ProviderId | null | undefined) ?? null);
        return { ok: false, error: { kind: 'AI_CLI_INCOMPATIBLE' } };
      }
      case 'webkey.check':
        return ok({ result: await this.web.checkKey(msg.payload.provider) });
      case 'test.reset':
        this.lane.cancelAll();
        this.memoryReview.cancelAll();
        this.jobs.cancelAll();
        return undefined;
      case 'card.answered':
        // M6 T5: a `memory_confirm` card (Remember that…? / which fact to forget) is the memory seam's.
        if (await this.memoryIntake.onCardAnswered(msg.payload)) return undefined;
        if ((await this.tidy.onCardAnswered(msg.payload)) || (await this.share.onCardAnswered(msg.payload))) return undefined;
        if (await this.settleMemoryConfirm(msg.payload)) return undefined;
        if (await this.trouble.onCardAnswered(msg.payload)) return undefined; // M8 T5
        if (!(await this.recovery.onCardAnswered(msg.payload))) await this.jobs.onCardAnswered(msg.payload);
        return undefined;
      // M5 T7: main moved an approval (08-1 §2.4); an expired payment / booking card ends its job (AT-111).
      case 'approval.changed':
        await this.jobs.onApprovalChanged(msg.payload);
        return undefined;
      // M5 T14 (G-M5-39 (b)): the second look of a Draft's Send, asked by main's Draft tick.
      case 'draft.secondLook':
        return ok(await this.jobs.draftSecondLook(msg.payload));
      case 'job.stop': {
        const r = await this.jobs.stopJob(msg.payload.jobId, msg.payload.reason);
        return r ? ok(r) : { ok: false, error: { kind: 'JOB_GONE' } };
      }
      case 'job.stopAll':
        return ok(await this.jobs.stopAll());
      case 'job.retry':
        return this.jobs.retry(msg.payload.jobId, msg.payload.newJobId);
      case 'test.clock':
        return undefined;
      // M5 T2 (08-0 §G.6, X-93): main's registry of record, mirrored here; `ttlMs: 0` = until the app quits. Never logged.
      case 'registry:add':
        this.redactor.registry.add({
          handle: msg.payload.handle,
          value: msg.payload.value,
          normalised: msg.payload.normalised,
          ttlMs: msg.payload.ttlMs || null,
        });
        return undefined;
      case 'registry:remove':
        this.redactor.registry.remove(msg.payload.handles);
        return undefined;
      // G-M4-04: a request; main waits for the ack before it exits.
      case 'jobs.pauseAll': {
        const paused = await this.recovery.pauseAll(msg.payload.reason);
        // M9 T3: foo's browser closes with the app (08-1 §2.3 step 4), never delaying the ack main waits on.
        void this.browser?.browser.shutdown();
        return ok({ paused });
      }
      // M8 (T3): Google's commands are T2's.
      case 'connection.cmd':
        if (msg.payload.target === 'whatsapp' && ['linkStart', 'linkCancel', 'unlink'].includes(msg.payload.cmd))
          this.whatsapp.command(msg.payload.cmd as 'linkStart' | 'linkCancel' | 'unlink');
        return undefined;
      case 'power':
        this.trouble.power(msg.payload.event);
        await this.recovery.power(msg.payload.event);
        return undefined;
      // M8 T5
      case 'connection.state':
        await this.trouble.onState(msg.payload);
        return undefined;
      // M6 (CR-0010 G-M6-01): the Memory page's invokes, answered with the invoke's result.
      case 'memory.cmd': {
        // M6 T5: a chip's own Undo (`chip_…` token) and ✕ (`chipId`) go through the chips; a store Undo also restores the
        // intake-forget chip it belongs to.
        const c = msg.payload;
        if (c.cmd === 'undo' && isChipToken(c.undoToken)) return this.memoryChips.undo(c.undoToken);
        if (c.cmd === 'forget' && c.chipId) return this.memoryChips.forget(c.chipId, c.factId);
        const r = await this.memory.cmd(c);
        if (r.ok && c.cmd === 'undo') await this.memoryChips.restored(c.undoToken);
        return r;
      }
      case 'test.memoryTidy':
        return this.memory.tidy();
      // M8 T7
      case 'wa.send':
        return this.whatsapp.send(msg.payload);
      case 'wa.check':
        return ok({ exists: await this.whatsapp.check(msg.payload.jid) });
      default:
        return undefined;
    }
  }

  /** M8 (T3): `bridge.port` hands over the engine end of a (re)started wa-bridge (08-1 §2.4.2). */
  attachBridge(port: WaPortLike): void {
    void this.whatsapp.attach(port);
  }
  private firstSettings = true;
}
