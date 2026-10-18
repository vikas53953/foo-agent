// M12 T1 contracts (CR-0016): 08-1 §3.2 `setup:getState|answer|skip` (VALIDATION), 08-5 §3 `SetupState`, §4.1
// `SetupCardPayload` (five values, X-119 / X-139), 08-0 §A.1 (`setup.interviewCard`, `setup.firstBriefAt`, identity, brief),
// 06-1 §2.0 rules 8 and 9 (setup.step written after every card; interviewCard only while step 3), §2.3 Card 2a name rules,
// AT-006's lock (no later step reachable while no AI passed its test), the first-run ids and copy keys.
import { describe, expect, it } from 'vitest';
import { repair } from '../../../src/main/settings/Settings';
import { aiVerified, SetupFlow, type SettingsPort } from '../../../src/main/setup/SetupFlow';
import { INVOKE_CHANNELS } from '../../../src/shared/ipc';
import { AgentNameSchema, SETUP_ANSWER_SCHEMAS, SetupCardPayloadSchema } from '../../../src/shared/schemas';
import { settingsSchema, type Settings } from '../../../src/shared/settings';
import { settingsDefaults } from '../../../src/shared/settingsDefaults';
import { INTERVIEW_ME } from '../../../src/shared/setupAnswers';
import { GLYPH_POOL, glyphFaceRef, HELPER_COLOURS } from '../../../src/shared/face';
import { TID } from '../../../src/shared/testids';
import copy from '../../../src/shared/copy/en-IN.json';

const NOW = 1_760_000_000_000;

function port(patch: (s: Settings) => Settings = (s) => s): SettingsPort & { writes: number } {
  let cur = settingsSchema.parse(patch(structuredClone(settingsDefaults)));
  const p = {
    writes: 0,
    get: () => cur,
    update: (fn: (s: Settings) => Settings) => {
      cur = settingsSchema.parse(fn(cur));
      p.writes++;
    },
  };
  return p;
}
const atStep =
  (step: Settings['setup']['step'], verified: boolean) =>
  (s: Settings): Settings => ({
    ...s,
    setup: { complete: false, step },
    ai: verified
      ? { ...s.ai, primary: 'claude-cli', providers: { 'claude-cli': { kind: 'plan', lastVerifiedAt: NOW, lastVerifyOk: true } } }
      : s.ai,
  });

describe('M12 T1: SetupFlow skeleton', () => {
  it('a fresh data dir is step 0, not complete, nothing answered', () => {
    expect(new SetupFlow(port(), () => NOW).getState()).toEqual({ complete: false, step: 0, answers: {} });
  });

  it('the AI lock: a step after 1 is refused with VALIDATION while no AI passed its test', async () => {
    const flow = new SetupFlow(port(atStep(2, false)), () => NOW);
    const r = await flow.answer(2, { name: 'Sunny' });
    expect(r).toEqual({ ok: false, error: { kind: 'VALIDATION' } });
    const s = new SetupFlow(port(atStep(2, false)), () => NOW);
    expect(await s.skip(true)).toEqual({ ok: false, error: { kind: 'VALIDATION' } });
  });

  it('only the current step can be answered (no later step is reachable)', async () => {
    const flow = new SetupFlow(port(), () => NOW);
    expect((await flow.answer(2, { keep: true })).ok).toBe(false);
    expect((await flow.answer(1, { use: 'claude-cli' })).ok).toBe(false);
    expect((await flow.answer(0, { start: true })).ok).toBe(true);
  });

  it('a wrong answer shape for its step is VALIDATION; a step with no handler answers with the unchanged state', async () => {
    const flow = new SetupFlow(port(atStep(2, true)), () => NOW);
    expect(await flow.answer(2, { start: true })).toEqual({ ok: false, error: { kind: 'VALIDATION' } });
    expect(await flow.answer(2, { keep: true })).toEqual({ ok: true, value: { complete: false, step: 2, answers: {} } });
  });

  it('registered handlers get the parsed answer; the answer is kept in RAM only', async () => {
    const settings = port(atStep(2, true));
    const flow = new SetupFlow(settings, () => NOW);
    const seen: unknown[] = [];
    flow.registerStep(2, (answer, ctx) => {
      seen.push(answer);
      ctx.settings.update((s) => ({ ...s, identity: { ...s.identity, agentName: 'Sunny' } }));
      return { ok: true, value: flow.setStep(3) };
    });
    const r = await flow.answer(2, { name: '  Sunny  ' });
    expect(seen).toEqual([{ name: 'Sunny' }]);
    expect(r.ok && r.value).toEqual({ complete: false, step: 3, answers: { 2: { name: 'Sunny' } } });
    expect(settings.get().identity.agentName).toBe('Sunny');
    expect(JSON.stringify(settings.get())).not.toContain('answers');
    expect(() => flow.registerStep(2, () => ({ ok: true, value: flow.getState() }))).toThrow();
  });

  it('Skip: never in step 0 or 1 or after completion; Skip the rest goes to the registered handler', async () => {
    expect((await new SetupFlow(port(atStep(1, true)), () => NOW).skip(true)).ok).toBe(false);
    const flow = new SetupFlow(port(atStep(3, true)), () => NOW);
    const calls: boolean[] = [];
    flow.registerSkip((all) => {
      calls.push(all);
      return { ok: true, value: flow.getState() };
    });
    expect((await flow.skip(true)).ok).toBe(true);
    expect((await flow.skip(false)).ok).toBe(true);
    expect(calls).toEqual([true, false]);
    const done = new SetupFlow(
      port((s) => ({ ...atStep(4, true)(s), setup: { complete: true, step: 5 } })),
      () => NOW,
    );
    expect((await done.skip(true)).ok).toBe(false);
    expect((await done.answer(5, {})).ok).toBe(false);
  });

  it('rule 8: interviewCard is kept only while step 3; leaving step 3 removes it', () => {
    const settings = port((s) => ({ ...atStep(3, true)(s), setup: { complete: false, step: 3, interviewCard: 'C' } }));
    const flow = new SetupFlow(settings, () => NOW);
    expect(flow.getState()).toEqual({ complete: false, step: 3, interviewCard: 'C', answers: {} });
    expect(flow.setStep(3).interviewCard).toBe('C');
    expect(flow.setStep(4)).toEqual({ complete: false, step: 4, answers: {} });
    expect(settings.get().setup).toEqual({ complete: false, step: 4 });
  });

  it('aiVerified needs the primary to have passed its last test', () => {
    expect(aiVerified(settingsDefaults)).toBe(false);
    expect(aiVerified(atStep(1, true)(settingsDefaults))).toBe(true);
    const failed = {
      ...settingsDefaults,
      ai: {
        ...settingsDefaults.ai,
        primary: 'claude-cli' as const,
        providers: { 'claude-cli': { kind: 'plan' as const, lastVerifyOk: false } },
      },
    };
    expect(aiVerified(failed)).toBe(false);
  });

  it('resetForTest returns to a fresh first run', async () => {
    const settings = port(atStep(3, true));
    const flow = new SetupFlow(settings, () => NOW);
    expect(flow.resetForTest()).toEqual({ complete: false, step: 0, answers: {} });
  });
});

describe('M12 T1: shapes', () => {
  it('settings: interviewCard A–H and firstBriefAt are optional; an old file without the M12 keys repairs to the defaults', () => {
    const ok = { ...settingsDefaults, setup: { complete: false, step: 3, interviewCard: 'E', firstBriefAt: NOW } };
    expect(settingsSchema.safeParse(ok).success).toBe(true);
    expect(settingsSchema.safeParse({ ...ok, setup: { complete: false, step: 3, interviewCard: 'I' } }).success).toBe(false);
    const old = { schemaVersion: 2, setup: { complete: false, step: 2 }, identity: { agentName: 'Sunny' } };
    const { settings } = repair(old);
    expect(settings.setup).toEqual({ complete: false, step: 2 });
    expect(settings.identity).toEqual({ agentName: 'Sunny', avatarRef: 'living:default', vibe: 'calm_funny', vibeLine: '', emoji: '' });
    expect(settings.brief).toEqual({ enabled: true, at: '08:00' });
    expect(settingsSchema.safeParse({ ...settingsDefaults, brief: { enabled: true, at: '8:00' } }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...settingsDefaults, identity: { ...settingsDefaults.identity, avatarRef: 'pic:x' } }).success).toBe(
      false,
    );
  });

  it('SetupCardPayload has exactly the five X-119 values (whatsapp_link withdrawn, X-139)', () => {
    for (const v of ['welcome', 'ai_finder', 'name', 'face', 'apps'])
      expect(SetupCardPayloadSchema.safeParse({ setupCard: v }).success).toBe(true);
    expect(SetupCardPayloadSchema.safeParse({ setupCard: 'whatsapp_link' }).success).toBe(false);
  });

  it('06-1 §2.3 Card 2a: trimmed, 1–20 graphemes, at least one letter or digit, any script', () => {
    expect(AgentNameSchema.parse('  Sunny ')).toBe('Sunny');
    expect(AgentNameSchema.safeParse('विकास').success).toBe(true);
    expect(AgentNameSchema.safeParse('ਸੁਖਮਨੀ').success).toBe(true);
    expect(AgentNameSchema.safeParse('a'.repeat(20)).success).toBe(true);
    expect(AgentNameSchema.safeParse('a'.repeat(21)).success).toBe(false);
    expect(AgentNameSchema.safeParse('!!!').success).toBe(false);
    expect(AgentNameSchema.safeParse('   ').success).toBe(false);
    expect(AgentNameSchema.safeParse('R2').success).toBe(true);
  });

  it('setup:answer answers by step (pack §4 table)', () => {
    const ok = (step: keyof typeof SETUP_ANSWER_SCHEMAS, a: unknown) => SETUP_ANSWER_SCHEMAS[step].safeParse(a).success;
    expect(ok(0, { start: true })).toBe(true);
    expect(ok(1, { use: 'codex-cli' })).toBe(true);
    expect(ok(1, { use: 'copilot' })).toBe(false);
    expect(ok(2, { faceRef: 'living:default' })).toBe(true);
    expect(ok(2, { faceRef: glyphFaceRef('✿') })).toBe(true);
    expect(ok(2, { faceRef: 'file:c_0190' })).toBe(true);
    expect(ok(3, { apps: ['whatsapp', 'x'] })).toBe(true);
    expect(ok(3, { apps: [] })).toBe(false);
    expect(ok(3, { apps: ['whatsapp', 'whatsapp'] })).toBe(false);
    expect(ok(3, { apps: ['outlook'] })).toBe(false);
    expect(ok(3, { none: true })).toBe(true);
    expect(ok(4, { chipIndex: 5 })).toBe(true);
    expect(ok(4, { chipIndex: 6 })).toBe(false);
    expect(ok(5, {})).toBe(false);
  });

  it('"interview me" / "set me up" is the anchored phrase only (G-M12-14)', () => {
    for (const t of ['interview me', 'Set me up!', 'interview me.']) expect(INTERVIEW_ME.test(t)).toBe(true);
    for (const t of ['can you interview me', 'set me up a meeting']) expect(INTERVIEW_ME.test(t)).toBe(false);
  });

  it('the glyph pool has 12 named glyphs, the palette 10 colours, every name has a copy key (G-M12-16)', () => {
    const keys = copy as Record<string, string>;
    expect(GLYPH_POOL).toHaveLength(12);
    expect(new Set(GLYPH_POOL.map((g) => g.glyph)).size).toBe(12);
    for (const g of GLYPH_POOL) expect(keys[`setup.face.glyph.${g.name}`]).toBeTruthy();
    for (const c of HELPER_COLOURS) expect(keys[`setup.face.colour.${c}`]).toBeTruthy();
    expect(glyphFaceRef('★')).toBe('glyph:★︎');
  });

  it('the M12 channels, test ids and spec-named copy keys exist', () => {
    for (const c of ['setup:getState', 'setup:answer', 'setup:skip', 'ai:signIn', 'files:pickImage'] as const)
      expect(INVOKE_CHANNELS).toContain(c);
    const ids = Object.values(TID) as string[];
    for (const id of [
      'screen-splash',
      'setup-step-pill',
      'setup-skip-rest',
      'card-setup',
      'dialog-privacy',
      'setup-ai-row',
      'setup-face-tile',
      'card-face-explainer-cell',
      'setup-app-chip',
      'setup-whatsapp-link',
      'setup-first-job-chip',
    ])
      expect(ids).toContain(id);
    const keys = copy as Record<string, string>;
    expect(keys['setup.composer.locked']).toBe('Connect your AI first, then we can talk.');
    expect(keys['setup.resume.line']).toBe('Picking up where we left off.');
    expect(keys['setup.closing.brief_time']).toBe('I’ll send your first morning brief tomorrow, {date}, at {time}.');
    expect(keys['setup.whatsapp_link.failed']).toBe('WhatsApp didn’t link. You can try later in Settings → Connections.');
    for (const k of [
      'setup.privacy.title',
      'setup.privacy.lead',
      'setup.privacy.not_on_suffix',
      'setup.privacy.no_training',
      'setup.ai_finder.maker_consent',
      'setup.ai_finder.waiting_helper',
      'setup.ai_finder.not_installed',
      'setup.ai_finder.needs_helper',
      'setup.ai_finder.signin_in_app',
      'cards.choice.question.local_model',
      'cards.face_explainer.lead',
      'setup.interview.d_lead',
      'setup.apps.x_drafts_only',
      'setup.first_job.fix_prompt',
    ])
      expect(keys[k]).toBeTruthy();
  });
});
