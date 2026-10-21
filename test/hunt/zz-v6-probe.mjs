// TEMPORARY hunt probe: how often does an ephemeral 127.0.0.1 port have a different listener on [::1] (where Chromium
// tries "localhost" first), and how long does a refused [::1] connect take on this runner?
import net from 'node:net';
const tryConnect = (port) =>
  new Promise((ok) => {
    const t0 = Date.now();
    const s = net.connect({ host: '::1', port });
    const done = (r) => { s.destroy(); ok({ r, ms: Date.now() - t0 }); };
    s.setTimeout(5000, () => done('timeout'));
    s.on('connect', () => done('CONNECTED'));
    s.on('error', (e) => done(e.code));
  });
let hits = 0, refusedMs = [];
const N = Number(process.argv[2] ?? 300);
for (let i = 0; i < N; i++) {
  const srv = net.createServer();
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const port = srv.address().port;
  const r = await tryConnect(port);
  if (r.r === 'CONNECTED' || r.r === 'timeout') { hits++; console.log(`port ${port}: [::1] ${r.r} in ${r.ms} ms`); }
  else refusedMs.push(r.ms);
  srv.close();
}
refusedMs.sort((a, b) => a - b);
console.log(`${hits}/${N} ports had something else on [::1]; refused connect ms p50=${refusedMs[refusedMs.length >> 1]} max=${refusedMs.at(-1)}`);
