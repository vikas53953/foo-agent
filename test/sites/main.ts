// Spec: 08-3 §22.5 (test sites), 08-4 §27.6 (FOO_TEST_ALLOW_HOSTS). Runs the sandbox on its own for manual checks and
// e2e runs, and prints what a test needs to reach it:
//   pnpm tsx test/sites/main.ts [--port 8443]
// → one JSON line { port, allowHosts, resolverRules, spkiSha256, urls }, then serves until Ctrl+C.
import { SITE_NAMES } from './hosts';
import { startSandbox } from './server';

const i = process.argv.indexOf('--port');
const port = i > 0 ? Number(process.argv[i + 1]) : 0;
void startSandbox({ port }).then((sb) => {
  console.log(
    JSON.stringify({
      port: sb.port,
      allowHosts: sb.allowHosts,
      resolverRules: sb.resolverRules,
      spkiSha256: sb.cert.spkiSha256,
      urls: Object.fromEntries(SITE_NAMES.map((n) => [n, sb.url(n)])),
    }),
  );
  const stop = () => void sb.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
});
