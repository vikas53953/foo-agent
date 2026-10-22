// Spec: 10-2 §E.1–§E.2 and 09-windows §9.8/§9.9. Regression coverage binds process evidence to the
// ElectronApplication owned by the live producer; an observer must never sample an unrelated executable.
import { describe, expect, it } from 'vitest';
import { producerProcessMetrics } from './lane-e-process-metrics';

describe('Lane E producer-owned process metrics', () => {
  it('samples the exact ElectronApplication process PID', () => {
    const commands: string[] = [];
    const owner = { process: () => ({ pid: 4242 }) };
    const metrics = producerProcessMetrics(owner, (_file, args) => {
      commands.push(args.join(' '));
      return JSON.stringify({ Id: 4242, HandleCount: 17, WorkingSet64: 4096, Responding: true });
    });

    expect(metrics).toEqual({
      pid: 4242,
      handleCount: 17,
      workingSetBytes: 4096,
      responding: true,
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain('-Id 4242');
    expect(commands[0]).not.toContain('-Id 1234');
  });

  it('blocks when the producer owner has no process PID', () => {
    expect(() => producerProcessMetrics({ process: () => ({ pid: undefined }) }, () => '')).toThrow(/producer ElectronApplication PID/u);
  });
});
