// Spec: 08-1 §3.2 (card:answer carries the card's nonce, 32 hex, checked before the state), §2.4 (a job's card goes to the
// runner as card.answered), 08-2 §5.9 step 3 (the recovery card). M5 T7 / CR-0009: engine-made cards once carried
// `newId('k')` nonces, which card:answer's schema refused (IPC_REJECTED), so a job's Choice card could not be tapped.
// This drives the real router schema and main's answerCard with cards the engine made.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerCard } from '../../../src/main/cards/answerCard';
import { SCHEMAS } from '../../../src/main/ipc/IpcRouter';
import { BILLS_PLAN, jobHarness, jobIntake, step, stepDone, tool, type JobHarness, untilStill } from '../jobs/jobHarness';
import { restartEngine } from '../jobs/restart';
import { BOOK_PLAN, gateTools } from './gateFlow';

vi.mock('electron', () => ({
  app: {},
  BrowserWindow: class {},
  ipcMain: {},
  net: {},
  shell: {},
  systemPreferences: {},
  nativeTheme: {},
  screen: {},
  protocol: {},
}));

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const tap = (card: Record<string, unknown>, optionId: string) => ({
  cardId: String(card.id),
  nonce: String(card.nonce),
  answer: { optionId },
  resolvedBy: 'tap' as const,
});

describe('engine-made cards pass card:answer (08-1 §3.2)', () => {
  it('a job’s Choice card (needsYou): the router accepts the tap, main relays it, the job goes on to its result', async () => {
    h = jobHarness({
      script: [
        jobIntake(BOOK_PLAN, { title: 'Look' }),
        step({
          kind: 'request_approval',
          draft: { verb: 'book', fields: { verb: 'book', irreversible: false }, evidence: [] },
          submitRef: 'e1',
        }),
        step({ kind: 'done', result: 'Found two tables.', unverified: true }),
      ],
      tools: { extra: gateTools([]) },
    });
    h.userSays('Find tables for Saturday');
    await h.settle();
    const card = h.cards('choice')[0]!;
    const req = tap(card, 'o2');
    expect(SCHEMAS['card:answer'].safeParse(req).success).toBe(true);
    const x = h;
    const r = answerCard(
      {
        db: x.db,
        now: () => x.clock.now(),
        engine: x.bridge,
        emitCard: () => undefined,
        emitMessage: () => undefined,
        emitChat: () => undefined,
      },
      req,
    );
    expect(r.ok).toBe(true);
    await h.settle();
    expect(h.cards('choice')[0]!.state).toBe('answered');
    expect(h.job().state).toBe('done_unverified');
  });

  it('the crash-recovery card made on restart carries a nonce the router accepts', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN), stepDone(0), tool('gmail.search', { query: 'bill' }, { delayMs: 20_000 })] });
    h.userSays('Find bills due this week');
    // Real-time waits with the clock still, not settle(): settle moves the fake clock past the 20 s turn and the job would finish.
    const run = h;
    await untilStill(() => !!run.job(), 'the job is made');
    h.clock.advance(2_000);
    await untilStill(
      () => run.job().state === 'working' && run.turnsJsonl().filter((t) => t.purpose === 'step').length === 2,
      'step 2 turn in flight',
    );
    expect(h.job().state).toBe('working');
    restartEngine(h, [], { safeMode: false, cleanStart: false });
    await h.settle();
    const [card] = h.cards('error');
    expect(card).toBeDefined();
    expect(SCHEMAS['card:answer'].safeParse(tap(card!, 'resume_job')).success).toBe(true);
  });
});
