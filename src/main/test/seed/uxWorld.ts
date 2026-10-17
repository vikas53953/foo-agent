// Spec: 08-3 §22.9 `demo` (the walkthrough world: foo, Trips, Money, Home, the Family group and 2 wa_mirror groups;
// ≈ 400 messages), 11-fidelity §11.2.3 (Blueprint `#win` mock names, amounts and times), 03-shell-1 §3.4 (rows the chat
// list shows: needs-you, working, unread, done, folded, group sender, WhatsApp mirror). Times are Fri 16 Oct 2026 IST.
import type { Db } from '../../store/db';
import type { Settings } from '../../../shared/settings';
import { HOUR, ist, MIN, SeedWriter } from './writer';

export interface SeedResult {
  chats: number;
  messages: number;
  refs: Record<string, string>;
}

const FILLER_USER = [
  'can you check this for me',
  'ok thanks',
  'what time does it open on Sunday?',
  'remind me about this tomorrow evening',
  'kal subah yaad dila dena',
  'sounds good 👍',
  'any cheaper option?',
  'let’s do the second one',
  'not this week, maybe next',
  'perfect',
];
const FILLER_REPLY = [
  'Done. I’ll keep an eye on it.',
  'I checked. It opens at 10:00 AM on Sun 18 Oct.',
  'Got it. I won’t do anything until you say so.',
  'Here’s what I found. The first one is the best value.',
  'Noted.',
  'I’ll remind you on Sat 17 Oct, 7:00 PM.',
  'Yes, that one has free cancellation.',
  'All set.',
];

/** Alternating user / reply lines between `from` and `to`, evenly spaced. */
function filler(
  w: SeedWriter,
  chatId: string,
  n: number,
  from: number,
  to: number,
  reply: { author: 'foo' | 'helper'; helperId?: string },
) {
  const step = (to - from) / n;
  for (let i = 0; i < n; i++) {
    const at = Math.round(from + i * step);
    if (i % 2 === 0) w.message(chatId, { author: 'user', text: w.pick(FILLER_USER), at, badge: 'done' });
    else w.message(chatId, { author: reply.author, helperId: reply.helperId, text: w.pick(FILLER_REPLY), at });
  }
}

/** `now` is the clock the pills are derived at (the E2E clock starts at Fri 16 Oct 2026, 9:00 AM IST). */
export function seedUxWorld(db: Db, now = ist(2026, 10, 16, 9, 0)): SeedResult {
  const w = new SeedWriter(db, 1);
  w.wipe();
  const refs: Record<string, string> = {};
  const d = (day: number, h: number, mi = 0) => ist(2026, 10, day, h, mi);

  db.transaction(() => {
    // foo's chat (always pinned, row 1 of block 2).
    const foo = w.chat({ kind: 'foo', title: 'foo', at: d(16, 9, 41), createdAt: d(1, 19, 41) });
    refs.foo = foo.chatId;
    filler(w, foo.chatId, 150, d(1, 19, 45), d(15, 21, 0), { author: 'foo' });

    // "Mom's cake": done 7:12 AM, paid ₹1,450.
    const cake = w.job({
      chatId: foo.chatId,
      title: 'Mom’s cake',
      state: 'done',
      createdAt: d(15, 21, 10),
      finishedAt: d(16, 7, 12),
      steps: [
        { text: 'Found bakeries that deliver on Sunday', state: 'done' },
        { text: 'Picked Theobroma', state: 'done' },
        { text: 'Paid and booked delivery', state: 'done' },
      ],
    });
    refs.cakeJob = cake;
    w.paid(foo.chatId, cake, {
      payee: 'Theobroma',
      description: 'Chocolate truffle cake, 1 kg',
      paise: 145_000,
      at: d(16, 7, 10),
      site: 'theobroma.in',
    });
    const cakeDone = w.message(foo.chatId, {
      author: 'foo',
      text: 'Mom’s cake is ordered from Theobroma for Sun 18 Oct.',
      at: d(16, 7, 12),
      jobId: cake,
    });
    w.linkJob(cake, { resultMessageId: cakeDone });

    // Morning brief, 8:00 AM.
    w.card(foo.chatId, {
      type: 'brief',
      state: 'open',
      at: d(16, 8, 0),
      payload: {
        title: 'Good morning, Vikas',
        items: [
          'Mom’s birthday is Sun 18 Oct. Cake ordered from Theobroma.',
          'Airtel bill ₹1,179 due Fri 23 Oct. Sent to Money.',
          'Goa stays for Sat 12 Dec dropped 18%.',
        ],
      },
    });

    // Goa stay: NEEDS YOU on a ₹14,600 payment that expires 9:51 AM.
    const goa = w.job({
      chatId: foo.chatId,
      title: 'Goa stay',
      state: 'needs_you',
      createdAt: d(16, 9, 36),
      lastProgressAt: d(16, 9, 41),
      steps: [
        { text: 'Checked Booking.com, MakeMyTrip and hotel sites', state: 'done' },
        { text: 'Kept 3 under ₹8,000 a night, beach within 5 min', state: 'done' },
        { text: 'Waiting for you to approve the payment', state: 'waiting_user' },
        { text: 'Book and add to your calendar', state: 'pending' },
      ],
    });
    refs.goaJob = goa;
    const ask = w.message(foo.chatId, {
      author: 'user',
      text: 'ok book the Goa hotel then, under ₹8,000 a night, near the beach',
      at: d(16, 9, 36),
      badge: 'waiting',
      jobId: goa,
    });
    w.card(foo.chatId, {
      type: 'checklist',
      state: 'live',
      jobId: goa,
      at: d(16, 9, 38),
      payload: { title: 'Booking your Goa stay', done: 2, total: 4 },
    });
    const pay = w.card(foo.chatId, {
      type: 'payment',
      state: 'PENDING',
      jobId: goa,
      at: d(16, 9, 41),
      expiresAt: d(16, 9, 51),
      payload: {
        title: 'Pay Taj Holiday Village',
        payee: 'Taj Holiday Village',
        amountPaise: 1_460_000,
        description: 'Sat 12 Dec – Mon 14 Dec, 2 nights',
      },
    });
    w.approval(pay.cardId, goa, foo.chatId, 'PENDING', { payee: 'Taj Holiday Village', paise: 1_460_000, at: d(16, 9, 41) }, d(16, 9, 51));
    w.linkJob(goa, { userMessageId: ask, needsYouCardId: pay.cardId });

    // Two older purchases this month (₹953 + ₹13,376; with the cake, ₹15,779).
    const groceries = w.job({ chatId: foo.chatId, title: 'Groceries', state: 'done', createdAt: d(10, 10, 0), finishedAt: d(10, 10, 20) });
    w.paid(foo.chatId, groceries, {
      payee: 'BigBasket',
      description: 'Weekly groceries',
      paise: 95_300,
      at: d(10, 10, 18),
      site: 'bigbasket.com',
    });
    const train = w.job({ chatId: foo.chatId, title: 'Train to Pune', state: 'done', createdAt: d(6, 18, 0), finishedAt: d(6, 18, 30) });
    w.paid(foo.chatId, train, {
      payee: 'MakeMyTrip',
      description: 'Mumbai to Pune, 4 people',
      paise: 1_337_600,
      at: d(6, 18, 25),
      site: 'makemytrip.com',
    });

    // Trips: working on "Flights for 12 Dec", step 2 of 4.
    const trips = w.chat({
      kind: 'helper',
      title: 'Trips',
      at: d(16, 9, 38),
      createdAt: d(15, 20, 10),
      helper: { name: 'Trips', color: '--h-terracotta', face: 'letter:T', job: 'Looks after your travel.' },
    });
    refs.trips = trips.chatId;
    w.message(trips.chatId, {
      author: 'helper',
      helperId: trips.helperId!,
      text: 'Hi, I’m Trips. I’ll look after your travel. I already see your Goa trip on Sat 12–Mon 14 Dec. Anything to sort for it?',
      at: d(15, 20, 12),
    });
    filler(w, trips.chatId, 30, d(15, 20, 14), d(15, 22, 0), { author: 'helper', helperId: trips.helperId! });
    const flights = w.job({
      chatId: trips.chatId,
      ownerHelperId: trips.helperId!,
      title: 'Flights for 12 Dec',
      state: 'working',
      createdAt: d(16, 9, 30),
      lastProgressAt: d(16, 9, 38),
      steps: [
        { text: 'Checked your calendar for Sat 12 Dec', state: 'done' },
        { text: 'Comparing fares', state: 'running' },
        { text: 'Pick the best 3', state: 'pending' },
        { text: 'Show you the options', state: 'pending' },
      ],
    });
    refs.tripsJob = flights;
    const flightsAsk = w.message(trips.chatId, {
      author: 'user',
      text: 'find flights to Goa for Sat 12 Dec, morning ones',
      at: d(16, 9, 30),
      badge: 'working',
      jobId: flights,
    });
    w.linkJob(flights, { userMessageId: flightsAsk });
    w.message(trips.chatId, {
      author: 'helper',
      helperId: trips.helperId!,
      text: 'On it. Comparing fares now.',
      at: d(16, 9, 38),
      jobId: flights,
    });

    // Money: 2 unread, bill line at 8:02 AM; its last job finished Tue (more than 24 h ago).
    const money = w.chat({
      kind: 'helper',
      title: 'Money',
      at: d(16, 8, 2),
      createdAt: d(12, 19, 0),
      unread: 2,
      helper: { name: 'Money', color: '--h-green', face: 'letter:M', job: 'Looks after bills and payments.' },
    });
    refs.money = money.chatId;
    w.message(money.chatId, {
      author: 'helper',
      helperId: money.helperId!,
      text: 'Hi, I’m Money. I’ll look after bills and payments. I never pay without your tap.',
      at: d(12, 19, 2),
    });
    filler(w, money.chatId, 40, d(12, 19, 5), d(15, 21, 0), { author: 'helper', helperId: money.helperId! });
    const bill = w.job({
      chatId: money.chatId,
      ownerHelperId: money.helperId!,
      title: 'Airtel bill ₹1,179',
      state: 'done',
      intent: 'read_only',
      createdAt: d(13, 17, 50),
      finishedAt: d(13, 18, 0),
    });
    refs.moneyJob = bill;
    w.message(money.chatId, { author: 'helper', helperId: money.helperId!, text: 'Good morning. One bill this week.', at: d(16, 8, 1) });
    w.message(money.chatId, {
      author: 'helper',
      helperId: money.helperId!,
      text: 'Airtel bill ₹1,179 is due Fri 23 Oct',
      at: d(16, 8, 2),
      jobId: bill,
    });

    // Home: gas cylinder booked Thu, Done pill (finished within 24 h).
    const home = w.chat({
      kind: 'helper',
      title: 'Home',
      at: d(15, 18, 31),
      createdAt: d(12, 19, 30),
      helper: { name: 'Home', color: '--h-violet', face: 'letter:H', job: 'Looks after the house.' },
    });
    refs.home = home.chatId;
    filler(w, home.chatId, 40, d(12, 19, 35), d(15, 17, 0), { author: 'helper', helperId: home.helperId! });
    const gas = w.job({
      chatId: home.chatId,
      ownerHelperId: home.helperId!,
      title: 'Gas cylinder',
      state: 'done',
      createdAt: d(15, 18, 0),
      finishedAt: d(15, 18, 30),
    });
    refs.homeJob = gas;
    const gasDone = w.message(home.chatId, {
      author: 'helper',
      helperId: home.helperId!,
      text: 'Gas cylinder booked for Mon 19 Oct',
      at: d(15, 18, 31),
      jobId: gas,
    });
    w.linkJob(gas, { resultMessageId: gasDone });

    // Family group: foo, Trips and Home with you; foo's line is the newest.
    const family = w.chat({
      kind: 'group',
      title: 'Family group',
      at: d(15, 19, 30),
      createdAt: d(13, 20, 0),
      colorToken: '--h-raspberry',
    });
    refs.family = family.chatId;
    w.member(family.chatId, 'foo', 'owner', d(13, 20, 0));
    w.member(family.chatId, trips.helperId!, 'member', d(13, 20, 0));
    w.member(family.chatId, home.helperId!, 'member', d(13, 20, 0));
    filler(w, family.chatId, 40, d(13, 20, 5), d(15, 19, 0), { author: 'foo' });
    w.message(family.chatId, { author: 'foo', text: 'Mom’s cake is ordered 🎂', at: d(15, 19, 30) });

    // News & X: last job finished Mon, nothing pending: folds to one line (X-153).
    const news = w.chat({
      kind: 'helper',
      title: 'News & X',
      at: d(12, 8, 1),
      createdAt: d(3, 9, 0),
      helper: { name: 'News & X', color: '--h-steel', face: 'letter:N', job: 'Reads the news and X for you.' },
    });
    refs.news = news.chatId;
    filler(w, news.chatId, 30, d(3, 9, 5), d(11, 21, 0), { author: 'helper', helperId: news.helperId! });
    const digest = w.job({
      chatId: news.chatId,
      ownerHelperId: news.helperId!,
      title: 'Morning posts',
      state: 'done',
      intent: 'read_only',
      createdAt: d(12, 7, 50),
      finishedAt: d(12, 8, 0),
    });
    w.message(news.chatId, {
      author: 'helper',
      helperId: news.helperId!,
      text: '3 posts you’d want to see',
      at: d(12, 8, 1),
      jobId: digest,
    });

    // Two WhatsApp mirrors (read-only, muted on link).
    const society = w.chat({
      kind: 'wa_mirror',
      title: 'Building society',
      waJid: '120363000000000001@g.us',
      at: d(16, 8, 20),
      createdAt: d(5, 10, 0),
      unread: 4,
    });
    const school = w.chat({
      kind: 'wa_mirror',
      title: 'School friends',
      waJid: '120363000000000002@g.us',
      at: d(14, 21, 12),
      createdAt: d(5, 10, 0),
    });
    refs.society = society.chatId;
    refs.school = school.chatId;
    const senders = ['Ramesh', 'Priya', 'Anil', 'Sunita'];
    for (let i = 0; i < 30; i++) {
      w.waMessage(
        '120363000000000001@g.us',
        { fromMe: false, sender: w.pick(senders), text: 'noted, thanks', at: d(5, 10, 0) + i * 7 * HOUR },
        i,
      );
      w.waMessage('120363000000000002@g.us', { fromMe: i % 5 === 0, sender: 'Rohit', text: 'haha', at: d(5, 10, 0) + i * 6 * HOUR }, i);
    }
    w.waMessage(
      '120363000000000001@g.us',
      { fromMe: false, sender: 'Ramesh', text: 'Water supply is off from 10 AM to 1 PM on Sat 17 Oct', at: d(16, 8, 20) },
      99,
    );
    w.waMessage('120363000000000002@g.us', { fromMe: true, sender: '', text: 'see you all on Sunday', at: d(14, 21, 12) }, 99);

    // AI spend this month: ₹212 over 40 turns.
    for (let i = 0; i < 40; i++) w.aiTurn(i % 3 === 0 ? trips.chatId : foo.chatId, d(1, 20, 0) + i * 8 * HOUR, 530);
  })();
  const counts = w.finish(now);
  w.check();
  return { ...counts, refs };
}

/** The settings the walkthrough world runs with (setup done, Vikas, Claude on a key, the mirrors muted). */
export function uxWorldSettings(s: Settings, refs: Record<string, string>, now: number): Settings {
  return {
    ...s,
    setup: { complete: true, step: 5 },
    user: { firstName: 'Vikas' },
    locale: { ...s.locale, timeZone: 'Asia/Kolkata', region: 'IN' },
    ai: {
      ...s.ai,
      primary: 'claude-cli',
      providers: { 'claude-cli': { kind: 'key', lastVerifiedAt: now - 2 * MIN, lastVerifyOk: true } },
    },
    window: { ...s.window, lastChatId: refs.foo },
    notifications: { ...s.notifications, mutedChats: { [refs.society!]: 'forever', [refs.school!]: 'forever' } },
  };
}
