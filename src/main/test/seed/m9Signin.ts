// Spec: 08-3 §22.9 (seed sets, test builds only), 05-3 §5.10 (Sign-in card rows: the `sign_in` lane waiting, the
// `captcha` take-over lane live, a signed-in summary, the `bank_3ds` lane whose "Use the code box" opens the §5.8 Code box), §5.18.1 (handoff marker rows: foo → helper and helper → helper, the
// BP-CARD-17 words), CR-0013 G-M9-04 / G-M9-10. The M9 T6 world: a small one, so the ux-world goldens do not move. Fake
// sites only (public repo): the spec's own example site and words.
import type { Settings } from '../../../shared/settings';
import type { Db } from '../../store/db';
import type { SeedResult } from './uxWorld';
import { ist, MIN, SeedWriter } from './writer';

export function seedM9Signin(db: Db, now = ist(2026, 10, 16, 9, 41)): SeedResult {
  const w = new SeedWriter(db, 9);
  w.wipe();
  const refs: Record<string, string> = {};
  const at = (h: number, mi: number) => ist(2026, 10, 16, h, mi);

  db.transaction(() => {
    const foo = w.chat({ kind: 'foo', title: 'foo', at: at(9, 40), createdAt: at(8, 0) });
    refs.foo = foo.chatId;
    const trips = w.chat({
      kind: 'helper',
      title: 'Trips',
      at: at(9, 36),
      createdAt: at(8, 5),
      helper: { name: 'Trips', color: '--h-terracotta', face: 'letter:T', job: 'Looks after your travel.' },
    });
    refs.trips = trips.chatId;
    const money = w.chat({
      kind: 'helper',
      title: 'Money',
      at: at(9, 20),
      createdAt: at(8, 6),
      helper: { name: 'Money', color: '--h-green', face: 'letter:M', job: 'Looks after bills and payments.' },
    });
    refs.money = money.chatId;

    // foo's chat: two handoff markers (05-3 §5.18.1 rows "foo → helper" and "helper → helper").
    w.message(foo.chatId, { author: 'user', text: 'find flights to Delhi for Fri 23 Oct', at: at(9, 10) });
    w.message(foo.chatId, {
      author: 'system',
      kind: 'marker',
      markerKind: 'handoff',
      helperId: trips.helperId!,
      text: 'foo asked Trips to find flights to Delhi on Fri 23 Oct',
      at: at(9, 11),
    });
    w.message(foo.chatId, {
      author: 'system',
      kind: 'marker',
      markerKind: 'handoff',
      helperId: trips.helperId!,
      text: 'Trips told Money about ₹14,600 for Taj Holiday Village',
      at: at(9, 40),
    });

    // Trips: a train booking waiting on a sign-in (lane sign_in, Edge not in front yet).
    const train = w.job({
      chatId: trips.chatId,
      ownerHelperId: trips.helperId!,
      title: 'Train to Delhi',
      state: 'needs_you',
      intent: 'do',
      usesBrowser: true,
      createdAt: at(9, 25),
      lastProgressAt: at(9, 30),
      steps: [
        { text: 'Opened irctc.co.in', state: 'done' },
        { text: 'Sign in to IRCTC', state: 'waiting_user' },
        { text: 'Book the train', state: 'pending' },
      ],
    });
    refs.signinJob = train;
    w.message(trips.chatId, { author: 'user', text: 'book the train to Delhi on Fri 23 Oct', at: at(9, 25), jobId: train });
    const signin = w.card(trips.chatId, {
      type: 'signin',
      state: 'waiting',
      author: 'helper',
      helperId: trips.helperId!,
      jobId: train,
      at: at(9, 30),
      payload: { type: 'signin', mode: 'sign_in_here', jobId: train, site: 'irctc.co.in', reason: 'sign_in' },
    });
    refs.signinCard = signin.cardId;
    w.linkJob(train, { needsYouCardId: signin.cardId });

    // Trips: a web check-in stopped on a person check (lane captcha, take over), Edge in front.
    const checkin = w.job({
      chatId: trips.chatId,
      ownerHelperId: trips.helperId!,
      title: 'Web check-in',
      state: 'needs_you',
      intent: 'do',
      usesBrowser: true,
      createdAt: at(9, 32),
      lastProgressAt: at(9, 35),
      steps: [{ text: 'Check in for the Fri 23 Oct flight', state: 'waiting_user' }],
    });
    refs.captchaJob = checkin;
    const captcha = w.card(trips.chatId, {
      type: 'signin',
      state: 'live',
      author: 'helper',
      helperId: trips.helperId!,
      jobId: checkin,
      at: at(9, 35),
      payload: { type: 'signin', mode: 'take_over', jobId: checkin, site: 'example.test', reason: 'captcha' },
    });
    refs.captchaCard = captcha.cardId;
    w.linkJob(checkin, { needsYouCardId: captcha.cardId });

    // Money: an earlier sign-in that went through (summary row).
    const bill = w.job({
      chatId: money.chatId,
      ownerHelperId: money.helperId!,
      title: 'Electricity bill',
      state: 'done',
      createdAt: at(9, 0),
      finishedAt: at(9, 20),
      steps: [{ text: 'Signed in to the biller', state: 'done' }],
    });
    w.card(money.chatId, {
      type: 'signin',
      state: 'signed_in',
      author: 'helper',
      helperId: money.helperId!,
      jobId: bill,
      at: at(9, 2),
      payload: { type: 'signin', mode: 'sign_in_here', jobId: bill, site: 'biller.example.test', reason: 'sign_in' },
    });
    w.message(money.chatId, { author: 'helper', helperId: money.helperId!, text: 'Paid. Receipt saved.', at: at(9, 20) - MIN });

    // Money: a card payment stopped on the bank's check (lane bank_3ds, take over); the masked number is the spec's own.
    const pay = w.job({
      chatId: money.chatId,
      ownerHelperId: money.helperId!,
      title: 'Phone bill',
      state: 'needs_you',
      intent: 'do',
      usesBrowser: true,
      createdAt: at(9, 20),
      lastProgressAt: at(9, 20),
      steps: [{ text: 'Pay the phone bill', state: 'waiting_user' }],
    });
    refs.bankJob = pay;
    const bank = w.card(money.chatId, {
      type: 'signin',
      state: 'waiting',
      author: 'helper',
      helperId: money.helperId!,
      jobId: pay,
      at: at(9, 20),
      payload: { type: 'signin', mode: 'take_over', jobId: pay, site: 'bank.example.test', reason: 'bank_3ds', phone: '+91 98••• ••210' },
    });
    refs.bankCard = bank.cardId;
    w.linkJob(pay, { needsYouCardId: bank.cardId });
  })();
  const counts = w.finish(now);
  w.check();
  return { ...counts, refs, media: [] };
}

/** Setup done, a test name and a verified AI, so the shell shows the chats (no personal data). */
export function m9SigninSettings(s: Settings, refs: Record<string, string>, now: number): Settings {
  return {
    ...s,
    setup: { complete: true, step: 5 },
    user: { firstName: 'Asha' },
    locale: { ...s.locale, timeZone: 'Asia/Kolkata', region: 'IN' },
    ai: {
      ...s.ai,
      primary: 'claude-cli',
      providers: { 'claude-cli': { kind: 'key', lastVerifiedAt: now - 2 * MIN, lastVerifyOk: true } },
    },
    window: { ...s.window, lastChatId: refs.trips },
  };
}
