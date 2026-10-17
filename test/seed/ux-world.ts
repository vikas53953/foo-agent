// Spec: 08-3 §22.9 seed sets (X-129: the `demo` generator lives at test/seed/ux-world.ts). The rows are written by the
// generator that test:seed runs inside main (src/main/test/seed/uxWorld.ts), straight into the open foo.db through the
// real schema, so there is no separate test/seed/ux-world.sql.gz (implementation-notes, M1 builder A).
export { seedUxWorld, uxWorldSettings, type SeedResult } from '../../src/main/test/seed/uxWorld';
