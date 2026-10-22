import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type MutationArea = 'shared' | 'engine' | 'main' | 'renderer';
export type MutationDisposition = 'covered' | 'no-coverage';

export type MutationTarget = {
  target: string;
  tests: readonly string[];
  disposition: MutationDisposition;
  note?: string;
};

export type MutationAreaManifest = {
  area: MutationArea;
  tests: readonly string[];
  targets: readonly MutationTarget[];
};

const REDACTOR_TESTS = [
  'test/unit/redactor/patterns.test.ts',
  'test/unit/redactor/context.test.ts',
  'test/unit/redactor/techlog.test.ts',
  'test/unit/m2r-redactor.test.ts',
] as const;

const SCHEMA_TESTS = [
  'test/unit/m3-prompt-envelope.test.ts',
  'test/unit/m3-prompt-builder.test.ts',
  'test/unit/m5-contracts.test.ts',
  'test/unit/m9-contracts.test.ts',
] as const;

const SHARED_TESTS = [
  ...REDACTOR_TESTS,
  ...SCHEMA_TESTS,
  'test/unit/m4-contracts.test.ts',
  'test/unit/p1-time-saved.test.ts',
  'test/unit/slot-cleaning.test.ts',
  'test/fidelity/sm/FID-16-approval.test.ts',
  'test/fidelity/sm/FID-16.test.ts',
  'test/fidelity/sm/FID-17.test.ts',
  'test/unit/settings.test.ts',
] as const;

const ENGINE_TESTS = [
  'test/unit/m3-prompt-envelope.test.ts',
  'test/unit/m3-adapters-parsers.test.ts',
  'test/unit/m3-adapters-fake.test.ts',
  'test/unit/m3-adapters-http.test.ts',
  'test/unit/jobs/queue.test.ts',
  'test/unit/jobs/stopFlow.test.ts',
  'test/integration/jobs/recovery.test.ts',
  'test/integration/jobs/start.test.ts',
  'test/integration/jobs/finish.test.ts',
  'test/integration/jobs/fail.test.ts',
  'test/unit/gate/decide.test.ts',
  'test/unit/gate/draftSecondLook.test.ts',
  'scripts/audit/cloud-outbound.test.ts',
  'test/integration/web/outbound.test.ts',
  'test/integration/web/providers.test.ts',
] as const;

const MAIN_TESTS = [
  'test/integration/db/rebuild.test.ts',
  'test/unit/migrations.test.ts',
  'test/unit/m2a-queries.test.ts',
  'test/unit/queries.test.ts',
  'test/unit/m5-redaction-store.test.ts',
  'test/unit/ipc-guard.test.ts',
  'test/unit/r1-contracts.test.ts',
  'test/integration/approvals/engine-card-answer.test.ts',
  'test/unit/vault/SecretVault.test.ts',
  'test/unit/vault/secretIpc.test.ts',
  'test/integration/vault/AT-008.test.ts',
  'test/unit/settings.test.ts',
  'test/unit/stale-lock.test.ts',
  'test/unit/preload-net.test.ts',
  'test/unit/m9-signin-banner-preload.test.ts',
  'test/unit/m8-wa-bridge.test.ts',
  'test/unit/m8-wa-send-bridge.test.ts',
  'test/integration/m8-whatsapp-link.test.ts',
] as const;

const RENDERER_TESTS = [
  'test/unit/face/moods.test.ts',
  'test/unit/m2a-store.test.ts',
  'test/unit/m4-shell.test.ts',
  'test/unit/m6-page.test.ts',
] as const;

const covered = (target: string, tests: readonly string[], note?: string): MutationTarget => ({
  target,
  tests,
  disposition: 'covered',
  ...(note ? { note } : {}),
});

const noCoverage = (target: string, note: string): MutationTarget => ({
  target,
  tests: [],
  disposition: 'no-coverage',
  note,
});

export const MUTATION_MANIFESTS: Readonly<Record<MutationArea, MutationAreaManifest>> = {
  shared: {
    area: 'shared',
    tests: SHARED_TESTS,
    targets: [
      covered('src/shared/phrases.ts', [
        'test/unit/m4-contracts.test.ts',
        'test/unit/p1-time-saved.test.ts',
        'test/unit/slot-cleaning.test.ts',
      ]),
      covered('src/shared/redactor.ts', REDACTOR_TESTS),
      covered('src/shared/schemas.ts', SCHEMA_TESTS),
      covered('src/shared/approvalMachine.ts', ['test/fidelity/sm/FID-16-approval.test.ts']),
      covered('src/shared/jobMachine.ts', ['test/fidelity/sm/FID-16.test.ts', 'test/fidelity/sm/FID-17.test.ts']),
      covered('src/shared/settingsDefaults.ts', ['test/unit/settings.test.ts']),
    ],
  },
  engine: {
    area: 'engine',
    tests: ENGINE_TESTS,
    targets: [
      covered('src/engine/prompt/envelope.ts', ['test/unit/m3-prompt-envelope.test.ts']),
      covered('src/engine/ai/classify.ts', ['test/unit/m3-adapters-parsers.test.ts']),
      covered('src/engine/ai/probe.ts', ['test/unit/m3-adapters-parsers.test.ts']),
      covered('src/engine/ai/AiRegistry.ts', ['test/unit/m3-adapters-fake.test.ts', 'test/unit/m3-adapters-http.test.ts']),
      covered('src/engine/ai/parsers.ts', ['test/unit/m3-adapters-parsers.test.ts']),
      covered('src/engine/ai/verify.ts', ['test/unit/m3-adapters-parsers.test.ts']),
      covered('src/engine/jobs/JobRunner.ts', [
        'test/integration/jobs/recovery.test.ts',
        'test/integration/jobs/start.test.ts',
        'test/integration/jobs/finish.test.ts',
        'test/integration/jobs/fail.test.ts',
      ]),
      covered('src/engine/jobs/recovery.ts', ['test/integration/jobs/recovery.test.ts']),
      covered('src/engine/jobs/queue.ts', ['test/unit/jobs/queue.test.ts']),
      covered('src/engine/jobs/stopFlow.ts', ['test/unit/jobs/stopFlow.test.ts']),
      covered('src/engine/gate/GateLogic.ts', ['test/unit/gate/decide.test.ts', 'test/unit/gate/draftSecondLook.test.ts']),
      covered('src/engine/tools/web/cloudOutbound.ts', ['scripts/audit/cloud-outbound.test.ts', 'test/integration/web/outbound.test.ts']),
      covered('src/engine/tools/web/http.ts', ['test/unit/m3-adapters-http.test.ts', 'test/integration/web/providers.test.ts']),
    ],
  },
  main: {
    area: 'main',
    tests: MAIN_TESTS,
    targets: [
      covered('src/main/store/db.ts', [
        'test/integration/db/rebuild.test.ts',
        'test/unit/migrations.test.ts',
        'test/unit/m2a-queries.test.ts',
        'test/unit/queries.test.ts',
      ]),
      covered('src/main/store/rebuild.ts', ['test/integration/db/rebuild.test.ts']),
      covered('src/main/store/queries.ts', ['test/unit/m2a-queries.test.ts', 'test/unit/queries.test.ts']),
      covered('src/main/store/writeRedacted.ts', ['test/unit/m5-redaction-store.test.ts']),
      covered('src/main/ipc/guard.ts', ['test/unit/ipc-guard.test.ts', 'test/unit/preload-net.test.ts']),
      covered('src/main/ipc/IpcRouter.ts', ['test/unit/r1-contracts.test.ts', 'test/integration/approvals/engine-card-answer.test.ts']),
      covered('src/main/vault/SecretVault.ts', ['test/unit/vault/SecretVault.test.ts', 'test/integration/vault/AT-008.test.ts']),
      covered('src/main/vault/registryMirror.ts', ['test/integration/vault/AT-008.test.ts', 'test/unit/vault/SecretVault.test.ts']),
      covered('src/main/vault/secretIpc.ts', ['test/unit/vault/secretIpc.test.ts', 'test/integration/vault/AT-008.test.ts']),
      covered('src/main/settings/Settings.ts', ['test/unit/settings.test.ts', 'test/unit/stale-lock.test.ts']),
      covered('src/main/net/netMonitor.ts', ['test/unit/preload-net.test.ts']),
      noCoverage(
        'src/preload/preload.ts',
        'The existing banner test reads preloadBanner.ts source; no direct preload runtime fixture is approved yet.',
      ),
      covered('src/wa-bridge/core.ts', [
        'test/unit/m8-wa-bridge.test.ts',
        'test/unit/m8-wa-send-bridge.test.ts',
        'test/integration/m8-whatsapp-link.test.ts',
      ]),
    ],
  },
  renderer: {
    area: 'renderer',
    tests: RENDERER_TESTS,
    targets: [
      covered('src/renderer/store/apply.ts', ['test/unit/face/moods.test.ts']),
      covered('src/renderer/store/chats.ts', ['test/unit/m4-shell.test.ts']),
      covered('src/renderer/store/messages.ts', ['test/unit/m2a-store.test.ts']),
      covered('src/renderer/store/jobs.ts', ['test/unit/m4-shell.test.ts']),
      noCoverage(
        'src/renderer/store/settings.ts',
        'No direct import was found in the approved existing tests; retain target until a spec-backed selector fixture is approved.',
      ),
      noCoverage(
        'src/renderer/composer/send.ts',
        'No direct import was found in the approved existing tests; retain target until a spec-backed send-state fixture is approved.',
      ),
      covered('src/renderer/screens/memoryView.ts', ['test/unit/m6-page.test.ts']),
      noCoverage(
        'src/renderer/shell/actions.ts',
        'No direct import was found in the approved existing tests; retain target until a spec-backed action fixture is approved.',
      ),
    ],
  },
};

export function mutationFilesFor(area: MutationArea): readonly string[] {
  return MUTATION_MANIFESTS[area].tests;
}

export function mutationTargetsFor(area: MutationArea): readonly string[] {
  return MUTATION_MANIFESTS[area].targets.map((entry) => entry.target);
}

export function validateMutationManifest(repoRoot: string): string[] {
  const errors: string[] = [];
  const basePath = path.join(repoRoot, 'stryker.lane-f.config.json');
  const base = JSON.parse(readFileSync(basePath, 'utf8')) as { mutate?: unknown };
  const baseTargets =
    Array.isArray(base.mutate) && base.mutate.every((entry): entry is string => typeof entry === 'string') ? base.mutate : [];
  const manifestTargets = Object.values(MUTATION_MANIFESTS).flatMap((manifest) => manifest.targets.map((entry) => entry.target));

  const expected = [...new Set(baseTargets)].sort();
  const actual = [...new Set(manifestTargets)].sort();
  if (expected.length !== 40) errors.push(`base mutation target count is ${expected.length}, expected 40`);
  if (expected.join('\n') !== actual.join('\n')) errors.push('area manifests do not preserve the complete base mutation target set');
  if (manifestTargets.length !== new Set(manifestTargets).size) errors.push('a mutation target appears in more than one area manifest');

  const forbidden = [/(^|[\\/])test[\\/]e2e[\\/]/u, /browser\.test\.ts$/u, /windows-keyring\.test\.ts$/u];
  for (const manifest of Object.values(MUTATION_MANIFESTS)) {
    if (new Set(manifest.tests).size !== manifest.tests.length) errors.push(`${manifest.area} manifest contains duplicate test files`);
    for (const testFile of manifest.tests) {
      if (!existsSync(path.join(repoRoot, testFile))) errors.push(`${manifest.area} manifest test file is missing: ${testFile}`);
      if (forbidden.some((pattern) => pattern.test(testFile)))
        errors.push(`${manifest.area} manifest includes a forbidden runner/test: ${testFile}`);
    }
    for (const target of manifest.targets) {
      if (target.disposition === 'covered' && target.tests.length === 0)
        errors.push(`${target.target} is marked covered without a test mapping`);
      if (target.disposition === 'no-coverage' && target.tests.length > 0)
        errors.push(`${target.target} is marked no-coverage with test mappings`);
      for (const testFile of target.tests) {
        if (!manifest.tests.includes(testFile))
          errors.push(`${target.target} maps to a test omitted from ${manifest.area} manifest: ${testFile}`);
      }
    }
  }
  return errors;
}
