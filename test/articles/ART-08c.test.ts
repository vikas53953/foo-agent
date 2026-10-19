// Spec: 10-acceptance-2 ART-08c (Article 8): every AI request names secrets only ("OpenAI key", "your IRCTC login"), never
// their values; the Gmail half (codes read from email) is M8. 08-2 §11.4 R1/R2 (stored text is scrubbed on write), R3
// (`PromptBuilder.finalGate`, the registry of values used this run), §11.3 (a vault value is registered before first use),
// §11.5 ("Send anyway": the AI gets "[the user typed a secret; it was hidden]"). Made-up secrets only.
// The trace row for ART-08c lands with M5 T1 (CR-0009); until then this file's titles name the article without the id.
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { PromptBuilder, type IntakeInput } from '../../src/engine/prompt/PromptBuilder';
import { mainRegistry } from '../../src/main/secrets/registerValue';
import { HIDDEN_FOR_AI, sendMessage } from '../../src/main/store/composerQueries';
import { migrate } from '../../src/main/store/db';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';
import { Redactor } from '../../src/shared/redactor';

const OPENAI_KEY = 'sk-proj-FAKE0canary0ART08c00000000000000';
const IRCTC_PASSWORD = 'Tulsi-Garden-77-fake';

function input(over: Partial<IntakeInput>): IntakeInput {
  return {
    agentName: 'foo',
    vibeLine: 'Calm and quick',
    emoji: '🙂',
    firstName: 'Asha',
    timeZone: 'Asia/Kolkata',
    helpers: [],
    pinned: [],
    turnFacts: [],
    conversation: [],
    userMessage: 'Book the Rajdhani for Friday',
    ...over,
  };
}

describe('Article 8c: AI requests name secrets, never their values', () => {
  it('a value the engine used this run is blanked from every part of the request; its name stays', () => {
    const clock = new FakeClock(TEST_EPOCH_MS);
    const late: string[] = [];
    const redactor = new Redactor({ clock, log: (kind) => late.push(kind) });
    // §11.3: the filler registers the vault value before it uses it.
    redactor.registry.add({ handle: 'v_irctc', value: IRCTC_PASSWORD });
    const pb = new PromptBuilder({ clock, log: () => {}, redactor });
    const built = pb.buildIntake(
      input({
        conversation: [
          { name: 'foo', at: TEST_EPOCH_MS - 60_000, text: 'I signed in with your IRCTC login.' },
          { name: 'foo', at: TEST_EPOCH_MS - 30_000, text: `The site echoed ${IRCTC_PASSWORD} back.` },
        ],
        userMessage: `Use your OpenAI key to check, the password is ${IRCTC_PASSWORD}`,
      }),
    );
    const body = JSON.stringify(built);
    expect(body).not.toContain(IRCTC_PASSWORD);
    expect(body).toContain('your IRCTC login');
    expect(body).toContain('OpenAI key');
    expect(late).toContain('REDACTION_LATE_HIT');
  });

  it('a key sent with "Send anyway" reaches the AI only as the hidden note', () => {
    const db = new Database(':memory:');
    migrate(db, 'src/main/store/migrations');
    db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_1', 'foo', 'foo', 0, 0)").run();
    mainRegistry().clear();
    const r = sendMessage(
      db,
      { chatId: 'c_1', clientId: 'x', text: `here is my OpenAI key ${OPENAI_KEY}`, secretOverride: true },
      { now: TEST_EPOCH_MS, newId: () => 'm_1', waiting: false, attachment: () => undefined },
    );
    expect(r.ok).toBe(true);
    const forAi = db.prepare("SELECT text_for_ai FROM messages WHERE id = 'm_1'").pluck().get() as string;
    expect(forAi).toBe(`here is my OpenAI key ${HIDDEN_FOR_AI}`);
    const clock = new FakeClock(TEST_EPOCH_MS);
    const pb = new PromptBuilder({ clock, log: () => {}, redactor: new Redactor({ clock }) });
    const body = JSON.stringify(pb.buildIntake(input({ userMessage: forAi })));
    expect(body).not.toContain(OPENAI_KEY);
    expect(body).toContain('OpenAI key');
  });

  it('a pattern secret the user never registered is still hidden at the final gate', () => {
    const clock = new FakeClock(TEST_EPOCH_MS);
    const pb = new PromptBuilder({ clock, log: () => {}, redactor: new Redactor({ clock }) });
    const body = JSON.stringify(pb.buildIntake(input({ userMessage: `my key is ${OPENAI_KEY}` })));
    expect(body).not.toContain(OPENAI_KEY);
  });
});
