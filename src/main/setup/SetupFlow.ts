// Spec: 06-1 §2.0 (setup mode; global rules 1–9: resume, Skip the rest, completion), §2.1–§2.6 (the steps), 08-1 §3.2
// `setup:getState|answer|skip`, 08-5 §3 `SetupState`, 08-0 §A.1 (`setup.*`, written after every answered card). CR-0016
// pick G-M12-12: main owns the first-run flow; the engine stays setup-unaware. This is T1's skeleton: state, the step
// registry, and the "AI verified" lock (AT-006). Each step's handler lives in `steps/` and is registered by its ticket.
import { fail, ok, type Result } from '../../shared/errors';
import { SETUP_ANSWER_SCHEMAS } from '../../shared/schemas';
import type { Settings } from '../../shared/settings';
import { settingsDefaults } from '../../shared/settingsDefaults';
import type { SetupState, SetupStep } from '../../shared/types';

export interface SettingsPort {
  get(): Settings;
  update(patch: (s: Settings) => Settings): void;
}

export interface SetupContext {
  settings: SettingsPort;
  now: () => number;
  /** Answers given this session (RAM only, 08-5 §3): the app peek result never reaches disk (D-09, G-M12-17). */
  answers: SetupState['answers'];
}

/** A step's handler: gets the validated answer, writes what the step writes, returns the next state. */
export type StepHandler = (answer: unknown, ctx: SetupContext) => Result<SetupState> | Promise<Result<SetupState>>;
export type SkipHandler = (all: boolean, ctx: SetupContext) => Result<SetupState> | Promise<Result<SetupState>>;

/** 06-1 §2.0 / 06-1 §2.2: the AI is verified when the primary passed its last test. */
export function aiVerified(s: Settings): boolean {
  const p = s.ai.primary;
  return p !== null && s.ai.providers[p]?.lastVerifyOk === true;
}

export class SetupFlow {
  private readonly steps = new Map<SetupStep, StepHandler>();
  private skipHandler: SkipHandler | null = null;
  private readonly answers: SetupState['answers'] = {};

  constructor(
    private readonly settings: SettingsPort,
    private readonly now: () => number,
  ) {}

  registerStep(step: SetupStep, handler: StepHandler): void {
    if (this.steps.has(step)) throw new Error(`setup step ${step} already registered`);
    this.steps.set(step, handler);
  }

  registerSkip(handler: SkipHandler): void {
    if (this.skipHandler) throw new Error('setup skip already registered');
    this.skipHandler = handler;
  }

  get ctx(): SetupContext {
    return { settings: this.settings, now: this.now, answers: this.answers };
  }

  getState(): SetupState {
    const { complete, step, interviewCard } = this.settings.get().setup;
    return interviewCard
      ? { complete, step, interviewCard, answers: { ...this.answers } }
      : { complete, step, answers: { ...this.answers } };
  }

  /**
   * 08-1 §3.2 `setup:answer`. Refused with VALIDATION when setup is complete, when the answer is not for the current step
   * (no later step is reachable, AT-006), when a step after 1 is answered with no verified AI, or when the answer's shape
   * is wrong for its step. A step with no handler yet answers with the unchanged state.
   */
  async answer(step: SetupStep, answer: unknown): Promise<Result<SetupState>> {
    const s = this.settings.get();
    if (s.setup.complete || step !== s.setup.step) return fail('VALIDATION');
    if (step >= 2 && !aiVerified(s)) return fail('VALIDATION');
    const parsed = SETUP_ANSWER_SCHEMAS[step].safeParse(answer);
    if (!parsed.success) return fail('VALIDATION');
    const handler = this.steps.get(step);
    if (!handler) return ok(this.getState());
    const before = this.answers[step];
    this.answers[step] = parsed.data;
    const r = await handler(parsed.data, this.ctx);
    if (!r.ok) {
      if (before === undefined) delete this.answers[step];
      else this.answers[step] = before;
    }
    return r;
  }

  /**
   * 08-1 §3.2 `setup:skip`. `all` = "Skip the rest" (06-1 §2.0; hidden in step 1, an AI is required); without `all`, Skip on
   * the current card (rule 2, steps 2–4 only). Step 0/1 and a finished setup are refused with VALIDATION.
   */
  async skip(all: boolean): Promise<Result<SetupState>> {
    const s = this.settings.get();
    if (s.setup.complete || s.setup.step < 2 || s.setup.step > 4 || !aiVerified(s)) return fail('VALIDATION');
    if (!this.skipHandler) return ok(this.getState());
    return this.skipHandler(all, this.ctx);
  }

  /** Writes `setup.step` (after every answered card, 06-1 §2.0 Reads/writes); leaving step 3 drops `interviewCard`. */
  setStep(step: SetupStep): SetupState {
    this.settings.update((cur) => {
      const { interviewCard, ...rest } = cur.setup;
      return { ...cur, setup: step === 3 && interviewCard ? { ...rest, step, interviewCard } : { ...rest, step } };
    });
    return this.getState();
  }

  /** Test runs only (test:setup reset): a fresh first run, nothing answered. */
  resetForTest(): SetupState {
    for (const k of Object.keys(this.answers)) delete this.answers[Number(k) as SetupStep];
    this.settings.update((cur) => ({ ...cur, setup: { ...settingsDefaults.setup } }));
    return this.getState();
  }
}
