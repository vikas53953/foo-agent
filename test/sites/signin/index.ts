// Spec: 08-3 §22.5 (a sign-in page with OTP), 07-2 J13 (sign-in, passkey / phone approval branch), 10-1 AT-056
// (password fields the AI never sees), AT-057 (the page changes after sign-in), AT-211 (passkey / phone approval).
// Sandbox credentials only: sandbox-user / sandbox-pass, OTP 123456.
import { defineSite, page, redirect } from '../site';

const form = (error = '') =>
  `<h1>Sign in to RailPass</h1>${error ? `<p role="alert">${error}</p>` : ''}
<form method="post" action="/login">
<label>Username <input name="username" autocomplete="username"></label>
<label>Password <input name="password" type="password" autocomplete="current-password"></label>
<button type="submit">Sign in</button></form>`;

const otpForm = (error = '') =>
  `<h1>Enter the code</h1><p>We sent a 6-digit code to your phone.</p>${error ? `<p role="alert">${error}</p>` : ''}
<form method="post" action="/otp">
<label>Code <input name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label>
<button type="submit">Verify</button></form>`;

export default defineSite({
  initialToggles: () => ({
    /** What comes after the password: 'otp' or 'passkey' (phone approval). */
    method: 'otp',
    passkeyApproved: false,
    username: 'sandbox-user',
    password: 'sandbox-pass',
    otp: '123456',
  }),
  initialData: () => ({}),
  handle(req, { toggles, count }) {
    const step = req.cookies.step;
    switch (`${req.method} ${req.path}`) {
      case 'GET /':
        return redirect('/login');
      case 'GET /login':
        return page('RailPass · sign in', form());
      case 'POST /login': {
        count('logins');
        if (req.form.get('username') !== toggles.username || req.form.get('password') !== toggles.password) {
          return page('RailPass · sign in', form('Wrong username or password.'), 401);
        }
        return toggles.method === 'passkey' ? redirect('/passkey', 'step=passkey') : redirect('/otp', 'step=otp');
      }
      case 'GET /otp':
        return step === 'otp' ? page('RailPass · code', otpForm()) : redirect('/login');
      case 'POST /otp': {
        count('otps');
        if (step !== 'otp') return redirect('/login');
        if (req.form.get('otp') !== toggles.otp) return page('RailPass · code', otpForm("That code didn't work."), 401);
        return redirect('/account', 'step=done');
      }
      case 'GET /passkey':
        if (step !== 'passkey') return redirect('/login');
        if (toggles.passkeyApproved) return redirect('/account', 'step=done');
        return page(
          'RailPass · approve',
          `<h1>Approve the sign-in on your phone</h1><p>Open the RailPass app and tap Approve. This page moves on by itself.</p>`,
          200,
          '<meta http-equiv="refresh" content="1">',
        );
      case 'GET /account':
        return step === 'done'
          ? page('RailPass · account', `<h1>Signed in as ${toggles.username}</h1><p>Your trips: none yet.</p>`)
          : redirect('/login');
      default:
        return page('Not found', '<h1>Not found</h1>', 404);
    }
  },
});
