// Spec: 08-3 §22.9 seed sets (X-129: the `perf` generator lives at test/seed/perf.ts; 10-2 §E PERF rows). Written by the
// generator test:seed runs inside main (src/main/test/seed/perf.ts): 200 chats, 50,000 messages, 2,000 finished jobs,
// no test/seed/perf.sql.gz (implementation-notes, M1 builder A).
export { seedPerf } from '../../src/main/test/seed/perf';
