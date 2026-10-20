// Spec: 08-3 §22.5 (a CAPTCHA page), 07-2 J13 (challenge → Take over), 10-1 AT-058 (no foo click until Hand back).
// foo never solves CAPTCHAs: a test "solves" it through the control endpoint, standing in for the person.
import { defineSite, page } from '../site';

const grid = () =>
  Array.from(
    { length: 9 },
    (_, i) => `<label class="tile"><input type="checkbox" name="tile" value="${i + 1}"> square ${i + 1}</label>`,
  ).join('');

export default defineSite({
  initialToggles: () => ({ solved: false, answer: '1,4,8' }),
  initialData: () => ({}),
  handle(req, { toggles, count }) {
    const through = page('Welcome', `<h1>Thanks, you're through.</h1><p><a href="/next">Continue</a></p>`);
    if (req.method === 'GET' && req.path === '/') {
      if (toggles.solved) return through;
      return page(
        'Check you are human',
        `<h1>Check you're human</h1><p>Pick every square with a traffic light.</p>
<form method="post" action="/verify"><div data-puzzle="grid">${grid()}</div><button type="submit">Verify</button></form>`,
      );
    }
    if (req.method === 'POST' && req.path === '/verify') {
      count('attempts');
      if (req.form.getAll('tile').join(',') !== toggles.answer) {
        return page('Try again', `<h1>That wasn't right.</h1><p><a href="/">Try again</a></p>`, 403);
      }
      return through;
    }
    if (req.method === 'GET' && req.path === '/next') return page('Next', '<h1>You made it.</h1>');
    return page('Not found', '<h1>Not found</h1>', 404);
  },
});
