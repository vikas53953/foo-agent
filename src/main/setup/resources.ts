// Spec: 08-0 §E.5 (resources are zod-validated at load; a bad file is a startup error and the feature shows its error
// state), `maker-pages.json` (read only by `app:openExternal` target `maker_page`, X-42), 06-1 §2.3 names list (G-M12-15).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MakerPagesSchema, NamesSchema, type MakerPages } from '../../shared/schemas';

export function loadMakerPages(resourcesDir: string): MakerPages {
  return MakerPagesSchema.parse(JSON.parse(readFileSync(join(resourcesDir, 'maker-pages.json'), 'utf8')));
}

export function loadNames(resourcesDir: string): string[] {
  return NamesSchema.parse(JSON.parse(readFileSync(join(resourcesDir, 'names.json'), 'utf8'))).names;
}

/** The maker page for a helper app, or null for any other provider (`URL_NOT_ALLOWED` at the channel). */
export function makerPageUrl(pages: MakerPages, providerId: string): string | null {
  return (pages as Record<string, { url: string } | undefined>)[providerId]?.url ?? null;
}
