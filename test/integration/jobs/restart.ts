// Restart harness for the M4 T4 tests: a second Engine on the same database and bridge, as after an engine crash, a quit
// and reopen, or a Windows restart (08-2 §5.9). The fake AI script is rewritten first, since a new engine reads it from the
// top. 08-1 §2.4 (on every engine start main sends the settings; G-M4-13 adds what it decided from launches.json).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Engine } from '../../../src/engine/Engine';
import type { MainLink } from '../../../src/engine/protocol';
import type { Result } from '../../../src/shared/errors';
import { fakeTools, type FakeToolOptions } from '../../fakes/tools';
import { RESOURCES, type FakeLineIn } from '../../unit/m3-engine-helpers';
import type { JobHarness } from './jobHarness';

/** Ids that never collide with the first engine's counters (`k_r000001`). */
function restartIds(): (prefix: string) => string {
  const n = new Map<string, number>();
  return (p) => {
    const next = (n.get(p) ?? 0) + 1;
    n.set(p, next);
    return `${p}_r${String(next).padStart(6, '0')}`;
  };
}

/** The old engine is gone (its loops cancelled, as a killed process stops); a new one starts on the same rows. */
export function restartEngine(
  h: JobHarness,
  script: FakeLineIn[],
  launch: { safeMode: boolean; cleanStart: boolean },
  // M5 T7: the same extra fake tools as before the restart (the gate tests' browser.submit).
  tools?: FakeToolOptions,
  // A killed process (power cut, Task Manager, the e2e driver closing foo): the old engine writes nothing more, not even
  // the cut-off its cancelled turns would post. Without it the old engine's cancelled turns still finish their writes.
  o: { killed?: boolean } = {},
): Engine {
  if (o.killed) {
    const old = (h.engine as unknown as { o: { link: MainLink } }).o.link;
    old.request = () => new Promise<never>(() => {});
    old.send = () => {};
  }
  h.engine.jobs.cancelAll();
  h.engine.lane.cancelAll();
  writeFileSync(path.join(h.dir, 'fake-ai.jsonl'), script.map((l) => JSON.stringify(l)).join('\n') + '\n');
  let seq = 0;
  const link: MainLink = {
    async request<T>(kind: 'db.tx' | 'db.query', payload: unknown): Promise<Result<T>> {
      seq += 1;
      const reply = h.bridge.receive({ id: `r${seq}`, kind, payload });
      if (!reply) throw new Error(`no reply for ${kind}`);
      if (kind === 'db.tx') h.txs.push({ ops: (payload as { ops: never[] }).ops, ok: reply.result.ok });
      return reply.result as Result<T>;
    },
    send(kind, payload) {
      seq += 1;
      h.bridge.receive({ id: `r${seq}`, kind, payload });
    },
  };
  const engine = Engine.create({
    link,
    clock: h.clock,
    env: { FOO_FAKE_AI: path.join(h.dir, 'fake-ai.jsonl'), FOO_TEST: '1' },
    dataDir: path.join(h.dir, 'data'),
    localDir: path.join(h.dir, 'local'),
    resourcesDir: RESOURCES,
    execPath: process.execPath,
    testRun: true,
    fetch: (() => Promise.reject(new Error('network is not allowed in tests'))) as typeof fetch,
    tools: fakeTools(tools).tools,
    newId: restartIds(),
  });
  h.bridge.post = (msg) => {
    void engine.handle(msg).then((result) => {
      if (result !== undefined) h.bridge.receive({ re: msg.id, result });
    });
  };
  (h as { engine: Engine }).engine = engine;
  h.bridge.send('settings.changed', { paths: [], settings: h.settings(), launch });
  return engine;
}
