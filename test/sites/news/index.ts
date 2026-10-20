// Spec: 10-1 AT-139 (no web keys: the news page is read by Readability on this PC; the script-heavy page is read in
// foo's window, `needsBrowser`), 08-2 §11 web.fetch. `/article` is plain HTML; `/live` has its words only inside a script.
import { defineSite, page } from '../site';

const LIVE_SCRIPT = `<script>
document.getElementById('app').innerHTML =
  '<h1>Live: city marathon</h1><p>Runners are past the 30 km mark.</p><p>Roads near the sea front open at noon.</p>';
</script>`;

export default defineSite({
  initialToggles: () => ({}),
  initialData: () => ({}),
  handle(req) {
    if (req.method !== 'GET') return page('Not found', '<h1>Not found</h1>', 404);
    switch (req.path) {
      case '/':
        return page(
          'Sandbox News',
          `<h1>Sandbox News</h1><ul><li><a href="/article">Monsoon ends early</a></li><li><a href="/live">Live</a></li></ul>`,
        );
      case '/article':
        return page(
          'Monsoon ends early this year',
          `<header><a href="/">Sandbox News</a></header>
<article><h1>Monsoon ends early this year</h1><p class="byline">By the Sandbox News desk · 16 Oct 2026</p>
<p>The weather office said the monsoon withdrew from the whole country a week earlier than usual.</p>
<p>Reservoirs in the west are at 92 percent, the highest in five years, so water cuts are not expected this winter.</p>
<p>Farmers in the north have started sowing wheat, helped by good soil moisture after late rains.</p></article>
<footer>Sandbox News is a test page.</footer>`,
        );
      case '/live':
        return page('Sandbox News · live', `<div id="app"></div><noscript>Turn on JavaScript.</noscript>${LIVE_SCRIPT}`);
      default:
        return page('Not found', '<h1>Not found</h1>', 404);
    }
  },
});
