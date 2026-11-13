// Spec: test spend guards (Vikas 13 Nov 2026, "go with all 5"). One tiny real call (Haiku, 1 output token, well under a
// thousandth of a cent) before a run and between journeys: when the key is refused (credit used up, key disabled, limit
// reached) the run stops at once instead of driving the app for hours against a dead key (12 Nov: gate 11 ran 3 h 20 min
// after the credit ran out). Prints only the HTTP status and the API's error type, never the key.
// Usage: node key-check.js   (reads ANTHROPIC_API_KEY)   exit 0 usable, 1 refused, 2 no key.
const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('key check: ANTHROPIC_API_KEY is not set');
  process.exit(2);
}
(async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        console.log('key check: usable');
        process.exit(0);
      }
      const body = await res.json().catch(() => ({}));
      const type = String(body?.error?.type || 'unknown').replace(/[^a-z_]/g, '');
      // Overloaded or rate-limited is a busy API, not a dead key: wait and try again.
      if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 10_000));
        continue;
      }
      console.error(`key check: refused (HTTP ${res.status}, ${type}). Out of credit, key disabled, or the spend limit was reached.`);
      process.exit(1);
    } catch (e) {
      if (attempt === 3) {
        console.error(`key check: no answer from the API (${String(e?.name || e).slice(0, 60)})`);
        process.exit(1);
      }
    }
  }
})();
