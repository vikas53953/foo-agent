// Spec: 08-3 §16.1.1 (`resources/google-oauth.json`: `{ projectId, clientId, clientSecret, consentScreen }`; the secret is
// never logged; missing or malformed file → the Google Connect buttons are disabled with "Gmail isn't available in this
// build."), 08-0 §E (resources are zod-validated at load). Also read: the file Google Cloud downloads for a Desktop-app client
// (`{ installed: { client_id, client_secret } }`) and the flat `client_id` / `client_secret` form of
// resources/google-oauth.example.json, so the owner can drop in either (implementation-notes "M8 T2").
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { GoogleClient } from '../../engine/tools/connectors/google';

const id = z.string().min(1).max(512);
const specShape = z.object({ clientId: id, clientSecret: id }).loose();
const flatShape = z.object({ client_id: id, client_secret: id }).loose();
const downloadShape = z.object({ installed: flatShape }).loose();

export function parseGoogleClient(raw: unknown): GoogleClient | null {
  const a = specShape.safeParse(raw);
  if (a.success) return { clientId: a.data.clientId, clientSecret: a.data.clientSecret };
  const b = flatShape.safeParse(raw);
  if (b.success) return { clientId: b.data.client_id, clientSecret: b.data.client_secret };
  const c = downloadShape.safeParse(raw);
  if (c.success) return { clientId: c.data.installed.client_id, clientSecret: c.data.installed.client_secret };
  return null;
}

/** The client file path: `resources/google-oauth.json`; a FOO_TEST run may name a fixture with FOO_TEST_GOOGLE_OAUTH. */
export function googleClientPath(resourcesDir: string, env: Record<string, string | undefined>): string {
  if (env.FOO_TEST === '1' && env.FOO_TEST_GOOGLE_OAUTH) return env.FOO_TEST_GOOGLE_OAUTH;
  return join(resourcesDir, 'google-oauth.json');
}

export function loadGoogleClient(path: string): GoogleClient | null {
  if (!existsSync(path)) return null;
  try {
    return parseGoogleClient(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}
