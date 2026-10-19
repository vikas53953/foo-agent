// Spec: 08-1 §1.2 (the engine box: chat lane, your-AI adapters, prompt assembly, Redactor), §2.4 (MainToEngine kinds the
// engine answers), 08-2 §6 (adapters; detect, verify, choose), §7 (prompt assembly, FOO/1, output filters), §11.4 (the
// Redactor on every AI input), 08-4 §24.9 / §25.5 (the rewrite turn for a held sentence: cheap model, `rewrite.md`),
// §30.8 (on engine start every `sys-*.md` in the scratch folders is deleted), 08-3 §22.3 (FOO_FAKE_AI).
// The +20 s health check of 08-1 §2.2 step 7 runs only outside FOO_TEST runs (tests verify explicitly). Deferred to their
// milestones: M4 T2 wires the JobRunner + ToolLayer (08-2 §5, §8; the job lane's tools come from `tools`, fake in tests
// until M8/M9);  memory parts 5/5b (M6; empty here), the vault for key providers (M5: no key yet, so a
// key provider reports `AI_KEY_INVALID` on verify).
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { Clock } from '../shared/clock';
import { ok, type Result } from '../shared/errors';
import { newId as mintId, type IdPrefix } from '../shared/ids';
import { settingsSchema, type Settings } from '../shared/settings';
import { settingsDefaults } from '../shared/settingsDefaults';
import type { ProviderId } from '../shared/types';
import type { EngineMessage } from '../main/db/queries';
import { AiRegistry, CliLimiter, createAdapters, loadPricing, nodeAiFs, nodeWhich, sweepSystemFiles } from './ai';
import { AiService } from './AiService';
import { ChatLane, type IntakeDecisionView, type IntakeInput, type LaneProtocol } from './chat/ChatLane';
import type { MainLink, MainToEngine } from './protocol';
import { parseEnvelope, validateAct, formatIssues } from './prompt/envelope';
import { filterSay } from './prompt/filters';
import { PromptBuilder, type ConversationMessage } from './prompt/PromptBuilder';
import { ReleaseGate } from './prompt/releaseGate';
import { Redactor } from './redact/Redactor';
import { findBanned } from './prompt/filters';
import { capRateOf, resolveModel } from './ai/models';
import { stubGate } from './gate/GateLogic';
import { JobRunner } from './jobs/JobRunner';
import { JobRecovery } from './jobs/recovery';
import { ToolLayer, type ToolRegistry } from './tools/ToolLayer';
import type { StepAct } from '../shared/schemas';

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
}

export class Engine {
  private settings: Settings = structuredClone(settingsDefaults);
  private online = true;
  readonly ai: AiService;
  readonly lane: ChatLane;
  readonly redactor: Redactor;
  readonly tools: ToolLayer;
  readonly jobs: JobRunner;
  readonly recovery: JobRecovery;
  private prompts: PromptBuilder;

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
    const fake = o.testRun && Boolean(o.env.FOO_FAKE_AI);
    const adapters = createAdapters({
      clock: o.clock,
      fetch: o.fetch ?? fetch,
      paths: { LOCAL: o.localDir, DATA: o.dataDir },
      env: o.env,
      platform: process.platform,
      getKey: async () => null,
      which: o.which ?? nodeWhich(),
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
    this.tools = new ToolLayer({
      link: o.link,
      clock: o.clock,
      newId: (p) => newId(p, o.clock.now()),
      tools: o.tools ?? {},
      gate: stubGate,
      log: (evt, kind) => log(evt, kind),
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
      hooks: {
        onAiError: (job, kind) => this.recovery.onAiError(job, kind),
        onCannotStart: (job, kind) => this.recovery.onCannotStart(job, kind),
        beforeSchedule: () => this.recovery.beforeSchedule(),
      },
    });
    this.recovery.attach(this.jobs);
    this.lane = new ChatLane({
      link: o.link,
      clock: o.clock,
      newId: (p) => newId(p, o.clock.now()),
      settings: () => this.settings,
      ai: this.ai,
      protocol: this.protocol(),
      log: (evt, kind) => log(evt, kind),
      jobs: this.jobs,
    });
    this.jobs.setIntake((chatId, messageId) => this.lane.enqueue(chatId, messageId, { intakeOnly: true }));
  }

  /** The step protocol for the job runner (08-4 §24.1 step row, §25.3, 08-2 §7.5–§7.6). */
  private stepProtocol(): ConstructorParameters<typeof JobRunner>[0]['prompts'] {
    const redactor = this.redactor;
    return {
      buildStep: (jobBlock, tools, steer) =>
        this.prompts.buildStep({
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
    };
  }

  /** The reply protocol for the chat lane, from the prompt modules. */
  private protocol(): LaneProtocol {
    const redactor = this.redactor;
    const decision = (act: unknown): IntakeDecisionView | null => {
      const v = validateAct('intake', act);
      return v.ok ? ((v.act as { decision: IntakeDecisionView }).decision ?? null) : null;
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
          pinned: [],
          turnFacts: [],
          conversation,
          userMessage: i.message.textForAi ?? i.message.text,
          local: i.local,
        });
      },
      buildRepair: (issues) => this.prompts.buildRepair(issues).prompt,
      parse: (text) => {
        const env = parseEnvelope(text);
        const act = env.act === undefined ? null : decision(env.act);
        return { say: env.say, act, issues: act ? null : (issuesOf(env.act, env.actError) ?? formatIssues([])) };
      },
      parseAct: (text) => {
        const env = parseEnvelope(text);
        const act = env.act === undefined ? null : decision(env.act);
        return { act, issues: act ? null : issuesOf(env.act, env.actError) };
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
      case 'test.reset':
        this.lane.cancelAll();
        this.jobs.cancelAll();
        return undefined;
      case 'card.answered':
        if (!(await this.recovery.onCardAnswered(msg.payload))) await this.jobs.onCardAnswered(msg.payload);
        return undefined;
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
      // G-M4-04: a request; main waits for the ack before it exits.
      case 'jobs.pauseAll':
        return ok({ paused: await this.recovery.pauseAll(msg.payload.reason) });
      case 'power':
        await this.recovery.power(msg.payload.event);
        return undefined;
      default:
        return undefined;
    }
  }
  private firstSettings = true;
}
