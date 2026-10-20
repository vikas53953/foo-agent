// Spec: 08-3 §22.5 (a bot-check page), 07-1 J9 route ladder, 10-1 AT-039 (all booking sites block → [Open the page]).
// While `blocking` is on, every page is a 403 challenge; off, it is an ordinary booking page.
import { defineSite, page } from '../site';

export default defineSite({
  initialToggles: () => ({ blocking: true }),
  initialData: () => ({}),
  handle(_req, { toggles, count }) {
    if (toggles.blocking) {
      count('blocked');
      return {
        ...page(
          'Just a moment',
          `<h1>Checking your browser before you continue…</h1><p>Access denied: automated access is not allowed on this site.</p>`,
          403,
        ),
        headers: { 'x-sandbox-bot-check': 'challenge' },
      };
    }
    return page('Book a table', `<h1>Book a table</h1><p>Tables tonight from 7:00 PM.</p>`);
  },
});
