// M11 pack §4.1 Job Object design (G-M11-01, CR-0015): main keeps one Job Object per tracked pid; `proc.kill` answers
// whether the addon took the tree (`native:false` → the engine runs taskkill); the supervisor kills every tracked job
// when the engine exits (CR-0007 §(e) pick 1). Runs everywhere with a recording fake of the addon.
import { describe, expect, it } from 'vitest';
import { JobObjects, type JobNative } from '../../../src/main/proc/JobObjects';

function fakeNative(available = true): JobNative & { calls: string[] } {
  const calls: string[] = [];
  return {
    available,
    calls,
    assignToJobObject: (pid) => void calls.push(`assign ${pid}`),
    killJobObject: (pid) => void calls.push(`kill ${pid}`),
  };
}

describe('JobObjects (main)', () => {
  it('track assigns the pid to a Job Object; kill terminates it and reports native', () => {
    const n = fakeNative();
    const jobs = new JobObjects(n);
    expect(jobs.track(41, 'ai_cli')).toEqual({ native: true });
    expect(jobs.kill(41)).toEqual({ native: true });
    expect(n.calls).toEqual(['assign 41', 'kill 41']);
    expect(jobs.size).toBe(0);
  });

  it('an unknown pid is not killed natively, so the engine falls back to taskkill', () => {
    const n = fakeNative();
    const jobs = new JobObjects(n);
    expect(jobs.kill(99)).toEqual({ native: false });
    expect(n.calls).toEqual([]);
  });

  it('addon missing → every answer is native:false and nothing is called', () => {
    const n = fakeNative(false);
    const jobs = new JobObjects(n);
    expect(jobs.track(7, 'whisper')).toEqual({ native: false });
    expect(jobs.kill(7)).toEqual({ native: false });
    expect(jobs.killAll()).toBe(0);
    expect(n.calls).toEqual([]);
  });

  it('an addon that throws on assign leaves the pid untracked (taskkill path)', () => {
    const n = fakeNative();
    n.assignToJobObject = () => {
      throw new Error('ACCESS_DENIED');
    };
    const jobs = new JobObjects(n);
    expect(jobs.track(5, 'ai_cli')).toEqual({ native: false });
    expect(jobs.kill(5)).toEqual({ native: false });
  });

  it('killAll (engine exit) kills every tracked job once', () => {
    const n = fakeNative();
    const jobs = new JobObjects(n);
    jobs.track(1, 'ai_cli');
    jobs.track(2, 'whisper');
    expect(jobs.killAll()).toBe(2);
    expect(jobs.killAll()).toBe(0);
    expect(n.calls).toEqual(['assign 1', 'assign 2', 'kill 1', 'kill 2']);
  });

  it('tracking the same pid twice keeps one job', () => {
    const n = fakeNative();
    const jobs = new JobObjects(n);
    jobs.track(3, 'ai_cli');
    jobs.track(3, 'ai_cli');
    expect(jobs.size).toBe(1);
    expect(n.calls).toEqual(['assign 3']);
  });
});
