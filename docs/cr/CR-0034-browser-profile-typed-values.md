# CR-0034: foo's browser profile keeps no value the person typed

- **Asked by:** the every-feature e2e run on PR #100 (Golden lane, job 119268023892): `test/articles/ART-08a.browser.test.ts`
  found the canary card number (utf16le) in `BROWSER/browser/profile/Default/Sessions/Session_*` and `Tabs_*`. The same
  commit passed in the shards, so it showed only sometimes. Thread "Card number kept in browser files", under Vikas's rule to
  approve on his behalf (2026-10-18 14:56Z) and his 2026-10-21 07:14Z "do not wait for any go or approval from me".
- **Why (root cause):** Chromium writes each open tab's navigation entries, with their form state (every field's value), to
  `Default/Sessions/Session_*` on a 2.5 s timer, and closed tabs to `Tabs_*`. The files are append logs, so a value stays after
  its window closes. A job window that stayed open 2.5 s with the values in the fields leaked; the fake AI usually ends a job
  sooner, so the test passed by luck. Checking the other places a typed value can land (real Chromium, real keystrokes):
  autocomplete saved a typed text field to `Web Data`; a GET form put its values in `History` and the HTTP cache (`Cache/`);
  `Session Storage` and `Crashpad` dumps can hold page data. Cookies (the person's sign-ins) must stay (08-2 §8.3.1 reason 3).
- **Spec sections:** 01 Art. 8; 10-2 §D ART-08a (0 canary hits in every file foo wrote); 08-2 §8.3.1 (persistent profile).
- **Status:** approved on Vikas's behalf after the independent review in §(c). No spec text changes (the launch call and its
  five arguments in §8.3.1 are unchanged), so no DECISIONS row is added; X-192 was reserved and is not used.
- **Change (code only):** `src/engine/tools/browser/profileHygiene.ts`, called by `PlaywrightBrowser`:
  1. Before every launch step: `Default/Sessions` and `Default/Cache` are wiped and replaced by an empty plain file, so Chromium
     cannot create them and saves no session files and no disk cache. `Default/Session Storage`, `Crashpad`, and the pre-M86
     `Current/Last Session/Tabs` files are wiped. `Default/Preferences` gets, merged over what is there:
     `credentials_enable_service: false`, `profile.password_manager_enabled: false`,
     `autofill.{enabled, profile_enabled, credit_card_enabled}: false`, `history.saving_disabled: true`.
  2. After engine shutdown (when the engine waits for it; otherwise step 1 at the next launch), and when the browser closes by itself (the person closed it, or it crashed): the same wipe.
     A failed wipe is logged (`browser.profile_hygiene_failed`) and the browser still opens.

## (a) Not changed

- Cookies, Local Storage and IndexedDB stay: they are how sites keep the person signed in (J13 "Signed-in sites", J23 wipe).
- No new launch arguments (08-2 §8.3.1 lists exactly five).
- Residual: a site that writes a typed value into its own Local Storage or IndexedDB, or into a cookie, keeps it there; that is
  the site's own storage, read only by that site. Pixel OCR of step pictures stays with the masker test (ART-08a notCovered).

## (b) Tests

- `test/articles/ART-08a.browser.test.ts` now holds each job window open 4 s before it closes, and waits 4 s before shutdown,
  past the save timer: before this change it failed every run here with the exact CI hits (Session_* and Tabs_*); after, it
  passes every run.
- `test/integration/browser/profile.test.ts` (new): real keystrokes for a site password, a grouped card number, an SMS code
  (POST form) and a CVV (GET form), held past the timer; the profile is scanned while the browser runs and after it closes:
  0 hits. Before this change: hits in Session__, Tabs__ and Cache. Also: cookies kept, the browser reopens over the
  scrubbed profile and loads a page; a profile an older foo left (sessions, cache, session storage, crash dump, legacy
  session file) is cleaned and its other preferences kept; repeat runs give the same result.
- `test/canary/scan.ts`: files are listed with lstat, so a running Chromium's Singleton* links and socket are skipped.

## (c) Independent review

Fable reviewer, 2026-10-21 ~15:10Z, read-only, against 08-2 §8.3.1, 01 Art. 8, 10-2 ART-08a and the diff; ran both tests,
lint, format and fid:guard. **Verdict: PASS WITH FIXES**; applied:

- Act: the "while running" scan would fail on Windows, where Edge holds its lock files open: `scan` takes `skipLocked`
  (EBUSY/EPERM files are listed in `locked`, at most a quarter of the files; ART-08a does not set it).
- Act: a late `close` of an earlier browser no longer nulls or scrubs a browser launched since over the same profile; the
  shutdown scrub skips a launch in progress.
- Consider: the test serves a favicon, so a GET form value in a page URL would show in `Favicons`: 0 hits.
- Consider: at app exit the engine does not wait for the browser to close, so the after-close wipe may not run then; the
  next launch's wipe covers it (before Chromium opens the profile).
- Consider: Windows proof (Edge with the blocked `Cache` and `Sessions`) comes from the windows-latest lanes before merge.
- Noted, no issue: the merged preference keys are not tracked by Secure Preferences, so Chromium does not reset them;
  double scrub is harmless; the five launch arguments are unchanged.

Recorded as approved on Vikas's behalf under his standing rule; listed for his later review.
