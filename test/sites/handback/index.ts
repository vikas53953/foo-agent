// Spec: 08-4 §27.4 (hand-back sites: pattern `^netbanking\.`; foo never types, clicks or reads there), 10-1 AT-142
// (error card [Open {site}] → the default browser). The server counts every request to this host, so a test can show
// foo's browser made none.
import { defineSite, page } from '../site';

export default defineSite({
  initialToggles: () => ({}),
  initialData: () => ({}),
  handle(req, { count }) {
    if (req.method === 'POST') {
      count('posts');
      return page('SandBank', '<h1>Sign-in is switched off in the sandbox.</h1>');
    }
    if (req.path === '/') {
      return page(
        'SandBank NetBanking',
        `<h1>SandBank NetBanking</h1>
<form method="post" action="/login"><label>Customer ID <input name="customerId" autocomplete="username"></label>
<label>Password <input name="password" type="password" autocomplete="current-password"></label>
<button type="submit">Log in</button></form>`,
      );
    }
    return page('Not found', '<h1>Not found</h1>', 404);
  },
});
