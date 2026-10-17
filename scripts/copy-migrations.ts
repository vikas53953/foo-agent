// Copies src/main/store/migrations/*.sql next to the compiled db.js (tsc does not copy .sql files).
import { cpSync } from 'node:fs';

cpSync('src/main/store/migrations', 'out/main/main/store/migrations', { recursive: true });
