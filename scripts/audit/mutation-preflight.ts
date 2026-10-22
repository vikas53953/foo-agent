import path from 'node:path';
import { MUTATION_MANIFESTS, validateMutationManifest } from './mutation-manifest';

const repoRoot = path.resolve(__dirname, '../..');
const errors = validateMutationManifest(repoRoot);
if (errors.length > 0) {
  console.error(JSON.stringify({ status: 'blocked', errors }, null, 2));
  process.exitCode = 1;
} else {
  const summary = Object.values(MUTATION_MANIFESTS).map((manifest) => ({
    area: manifest.area,
    targetCount: manifest.targets.length,
    testFileCount: manifest.tests.length,
    coveredTargets: manifest.targets.filter((entry) => entry.disposition === 'covered').length,
    noCoverageTargets: manifest.targets.filter((entry) => entry.disposition === 'no-coverage').length,
    testFiles: manifest.tests,
  }));
  console.log(JSON.stringify({ status: 'pass', targetCount: 40, areas: summary }, null, 2));
}
