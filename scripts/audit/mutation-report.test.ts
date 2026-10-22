// Spec: 11-fidelity §11.2 (mutation scores include uncovered mutants and never overstate an unexecuted report).
import { describe, expect, it } from 'vitest';
import { summarizeReport, type MutationReport } from './mutation-report';

describe('Lane F mutation reporter', () => {
  it('counts NoCoverage as undetected and maps repo-relative area paths', () => {
    const report: MutationReport = {
      files: {
        'src/shared/redactor.ts': { mutants: [{ status: 'Killed' }, { status: 'NoCoverage' }] },
      },
    };
    const summary = summarizeReport(report);
    expect(summary.status).toBe('candidate');
    expect(summary.findings[0]?.category).toBe('mutation-shared');
    expect(summary.findings[0]?.note).toContain('"noCoverage":1');
    expect(summary.findings[0]?.note).toContain('"scorePercent":50');
  });

  it('keeps timeout detection visible while excluding invalid mutants from the score', () => {
    const report: MutationReport = {
      files: {
        'C:/repo/src/engine/jobs/JobRunner.ts': {
          mutants: [{ status: 'Timeout' }, { status: 'Killed' }, { status: 'CompileError' }],
        },
      },
    };
    const summary = summarizeReport(report);
    expect(summary.status).toBe('pass');
    expect(summary.findings[0]?.category).toBe('mutation-jobs');
    expect(summary.findings[0]?.note).toContain('"timeout":1');
    expect(summary.findings[0]?.note).toContain('"invalid":1');
    expect(summary.findings[0]?.note).toContain('"scorePercent":100');
  });

  it('blocks empty or unknown-only reports instead of claiming a perfect score', () => {
    const summary = summarizeReport({ files: { 'src/renderer/store/apply.ts': { mutants: [{ status: 'Unknown' }] } } });
    expect(summary.status).toBe('blocked');
    expect(summary.findings[0]?.status).toBe('blocked');
    expect(summary.findings[0]?.note).toContain('"scorePercent":null');
  });

  it('blocks a mixed known and unknown report from making a partial score claim', () => {
    const summary = summarizeReport({
      files: {
        'src/shared/redactor.ts': { mutants: [{ status: 'Killed' }, { status: 'Unknown' }] },
      },
    });
    expect(summary.status).toBe('blocked');
    expect(summary.findings[0]?.status).toBe('blocked');
    expect(summary.findings[0]?.note).toContain('"unknown":1');
    expect(summary.findings[0]?.note).toContain('"scorePercent":null');
  });
});
