// Spec: CR-0054 (DECISIONS X-211): main reads `resources/features.json` once and hands the switched-on features to the
// window in Bootstrap.features; the engine reads the same file itself (Engine.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { resolveFeatures, type FeatureId } from '../shared/features';

let cached: FeatureId[] | null = null;

export function shippedFeatures(): FeatureId[] {
  cached ??= resolveFeatures(process.env, process.env.FOO_TEST === '1', () => {
    try {
      return readFileSync(join(app.getAppPath(), 'resources', 'features.json'), 'utf8');
    } catch {
      return null;
    }
  });
  return cached;
}
