// Spec: 11-fidelity §11.2 UX-08 (chapter 8 "Just chatting, in your language", Fri 16 Oct: 👍 for "thanks!", 1–3 short
// bubbles, Hinglish, Punjabi, reply-quote, a rich answer with a table and "MakeMyTrip +2"), 04 §1–§19 (every bubble type
// and state the message list draws: badges, ticks, chips, images, files, voice, Not sent, deleted, edited, Read more,
// emoji-only, WhatsApp formatting, code, Worked for, backup mark, why footer, system line, handoff marker), 05-3
// §5.22–§5.24 (table, file, link preview and place cards). Test builds only.
import type { SeedMedia } from './media';
import { ist, type SeedWriter } from './writer';

const d = (day: number, h: number, mi = 0) => ist(2026, 10, day, h, mi);
const SEC = 1000;

/**
 * UX-08: the chapter 8 conversation in foo's chat, Fri 16 Oct 8:05–8:20 AM, as the walkthrough's state objects draw it
 * (`__STEPS[63…69].state.a.th.foo`): the same words, times and badges (11 §11.2.3 data rule). The walkthrough shows ✓✓ read on
 * every user bubble; the app derives "read" from a badge (04 §3.3, bubbleState.tickState), so the user bubbles without a drawn
 * badge are stored as `complete` (✓✓ delivered) with no badge (implementation-notes, M2 builder C).
 */
export function seedChatScene(w: SeedWriter, fooChatId: string, refs: Record<string, string>, o: { untilCake?: boolean } = {}): void {
  const plain = { status: 'complete' as const };
  const cake = w.message(fooChatId, { author: 'foo', text: 'Cake from Theobroma is booked for Sun 18 Oct, 11:00 AM.', at: d(16, 8, 5) });
  refs.cake = cake;
  if (o.untilCake) return;
  const thanks = w.message(fooChatId, { author: 'user', text: 'thanks!', at: d(16, 8, 6), ...plain });
  w.reaction(thanks, 'foo', '👍', d(16, 8, 6) + 2 * SEC);
  refs.thanks = thanks;
  // GAP: GAPS.md 2026-10-17 "a read tick needs a badge"
  refs.holidayAsk = w.message(fooChatId, { author: 'user', text: 'is Mon 2 Nov a holiday?', at: d(16, 8, 10), badge: 'seen' });
  refs.holidayAnswer = w.message(fooChatId, {
    author: 'foo',
    text: 'No, Mon 2 Nov is a normal working day in Mumbai.',
    at: d(16, 8, 10) + 6 * SEC,
  });
  refs.holidayNext = w.message(fooChatId, { author: 'foo', text: 'The next holiday is Diwali, Sun 8 Nov.', at: d(16, 8, 10) + 8 * SEC });
  refs.hinglish = w.message(fooChatId, {
    author: 'user',
    text: 'parso mummy ka birthday hai, cake ka kya hua?',
    at: d(16, 8, 12),
    ...plain,
  });
  refs.hinglishAnswer = w.message(fooChatId, {
    author: 'foo',
    text: 'Cake Theobroma se order ho gaya hai. Sun 18 Oct, 11:00 AM tak ghar aa jayega 🎂',
    at: d(16, 8, 12) + 5 * SEC,
  });
  refs.punjabi = w.message(fooChatId, { author: 'user', text: 'ਮੰਮੀ ਨੂੰ ਕੇਕ ਕਦੋਂ ਮਿਲੇਗਾ?', at: d(16, 8, 13), lang: 'pa', ...plain });
  refs.punjabiAnswer = w.message(fooChatId, {
    author: 'foo',
    text: 'ਕੇਕ ਆਰਡਰ ਹੋ ਗਿਆ। Sun 18 Oct, 11:00 AM ਤੱਕ ਪਹੁੰਚ ਜਾਵੇਗਾ।',
    at: d(16, 8, 13) + 5 * SEC,
  });
  refs.replyQuote = w.message(fooChatId, {
    author: 'user',
    text: 'can it say "Happy birthday Mummy"?',
    at: d(16, 8, 15),
    badge: 'working',
    replyToId: cake,
  });
  refs.flightsAsk = w.message(fooChatId, { author: 'user', text: 'compare Goa flights on Sat 12 Dec', at: d(16, 8, 20), ...plain });
  refs.richAnswer = w.message(fooChatId, {
    author: 'foo',
    at: d(16, 8, 20) + 30 * SEC,
    text: [
      '### Goa flights, Sat 12 Dec',
      '',
      '| Airline | Leaves | Price |',
      '|---|---|---:|',
      '| IndiGo | 10:15 AM | ₹5,240 |',
      '| Air India | 7:10 AM | ₹4,890 |',
      '| Akasa Air | 1:35 PM | ₹5,610 |',
      '',
      'Fares from [MakeMyTrip](cite+https://www.makemytrip.com/flights/) [IndiGo](cite+https://www.goindigo.in/) ' +
        '[Akasa Air](cite+https://www.akasaair.com/)',
    ].join('\n'),
  });
}

/**
 * Every other bubble state, in Trips on Thu 15 Oct 10:05–10:40 PM (after the filler, before the morning's job), plus the
 * Family group's helper lines and a handoff marker. Returns the media files the bubbles point at.
 */
export function seedBubbleGallery(
  w: SeedWriter,
  o: { tripsChatId: string; tripsHelperId: string; familyChatId: string; homeHelperId: string; refs: Record<string, string> },
): SeedMedia[] {
  const media: SeedMedia[] = [];
  const { tripsChatId: chat, tripsHelperId: helper, refs } = o;
  const at = (mi: number, s = 0) => d(15, 22, mi) + s * SEC;
  const attach = (name: string, mime: string, bytes: number, when: number, kind: 'image' | 'pdf' | 'doc' | 'other') => {
    const id = w.id('fl', when);
    const path = `data/inbox/${id}-${name}`;
    if (kind === 'image') media.push({ path, kind: 'image', label: name.replace(/\.\w+$/, ''), hue: (media.length * 67) % 360 });
    return { id, name, mime, bytes, path, kind };
  };
  const voice = (ms: number) => (id: string) => {
    const path = `data/voice/${id}.wav`;
    media.push({ path, kind: 'voice', ms });
    return path;
  };

  // Images: one, then a grid of three (04 §10.1), and a file chip (§10.2).
  refs.galleryImage = w.message(chat, {
    author: 'user',
    text: 'this is the beach shack from last time',
    at: at(5),
    // No badge: the photo and the grid below are one run (04 §1.3, the earlier bubble carries no badge), so the grid is
    // the user's "last of a run" that SV-02 measures.
    attachments: [attach('beach-shack.svg', 'image/svg+xml', 2_048, at(5), 'image')],
  });
  w.message(chat, {
    author: 'user',
    text: '',
    at: at(5, 40),
    badge: 'done',
    attachments: [
      attach('room-1.svg', 'image/svg+xml', 2_048, at(5, 40), 'image'),
      attach('room-2.svg', 'image/svg+xml', 2_048, at(5, 41), 'image'),
      attach('room-3.svg', 'image/svg+xml', 2_048, at(5, 42), 'image'),
    ],
  });
  refs.galleryFile = w.message(chat, {
    author: 'user',
    text: 'and the old booking',
    at: at(7),
    badge: 'seen',
    attachments: [attach('Goa booking Dec 2025 confirmation.pdf', 'application/pdf', 182_400, at(7), 'pdf')],
  });

  // Voice notes (§10.3 user, §10.4 helper) with transcripts.
  refs.galleryVoiceUser = w.message(chat, {
    author: 'user',
    kind: 'voice',
    at: at(9),
    badge: 'done',
    voiceMs: 7_000,
    voicePath: voice(7_000),
    transcript: 'Morning flights only, and please keep a window seat for me if you can.',
  });
  refs.galleryVoiceHelper = w.message(chat, {
    author: 'helper',
    helperId: helper,
    kind: 'voice',
    at: at(9, 20),
    voiceMs: 12_000,
    voicePath: voice(12_000),
    transcript:
      'Got it. I will only look at flights that leave before 10 in the morning, and I will ask for a window seat on every booking, so you can sleep on the way.',
  });

  // Not sent (§3.3), deleted (§6.3), edited (§6.2).
  refs.galleryFailed = w.message(chat, { author: 'user', text: 'also check trains', at: at(12), status: 'failed' });
  refs.galleryDeleted = w.message(chat, { author: 'user', text: 'wrong chat, sorry', at: at(14), deletedAt: at(14, 30) });
  refs.galleryEdited = w.message(chat, {
    author: 'user',
    text: 'we are 4 people, 2 adults and 2 kids',
    at: at(16),
    editedAt: at(17),
    badge: 'done',
  });

  // Read more (§10.5): a long pasted note, and emoji-only (§10.9).
  const packing = Array.from({ length: 26 }, (_, i) => `${i + 1}. ${PACKING[i % PACKING.length]}`).join('\n');
  refs.galleryLong = w.message(chat, { author: 'user', text: `packing list from last year:\n${packing}`, at: at(18), badge: 'seen' });
  refs.galleryEmoji1 = w.message(chat, { author: 'user', text: '🏖️', at: at(20), badge: 'done' });
  refs.galleryEmoji3 = w.message(chat, { author: 'user', text: '✈️🌴😎', at: at(20, 30), badge: 'done' });
  // WhatsApp formatting the user typed (§10.10) and a link (§16.1).
  w.message(chat, {
    author: 'user',
    text: 'note: *window seat* please, _not_ the last row. ~Akasa~ any airline is fine. details at www.goa-tourism.gov.in',
    at: at(22),
    badge: 'done',
  });

  // A helper answer with a code block (§13), the Worked line (§15: a job with steps and no checklist), money formatting.
  const job = w.job({
    chatId: chat,
    ownerHelperId: helper,
    title: 'Window seats',
    state: 'done',
    intent: 'read_only',
    createdAt: at(24),
    startedAt: at(24),
    finishedAt: at(24, 42),
    steps: [{ text: 'Checked seat maps for the 3 flights', state: 'done' }],
  });
  refs.galleryWorked = w.message(chat, {
    author: 'helper',
    helperId: helper,
    at: at(24, 43),
    jobId: job,
    text: [
      'Window seats are free on all 3 flights. Seat selection costs Rs 350 on IndiGo.',
      '',
      'Your PNRs, ready to paste:',
      '',
      '```text',
      'IndiGo     6E-5101   PNR K7Q2ZD',
      'Air India  AI-663    PNR M3X8RT',
      '```',
    ].join('\n'),
  });

  // Backup-AI mark (§12.5), an unprompted message with the why footer (§19.6), a system line (§19.4).
  refs.galleryBackup = w.message(chat, {
    author: 'helper',
    helperId: helper,
    text: 'Goa is sunny all week, 31°C by day.',
    at: at(28),
    providerNote: 'answered with ChatGPT while Claude rests',
  });
  refs.galleryWhy = w.message(chat, {
    author: 'helper',
    helperId: helper,
    text: 'Fares to Goa for Sat 12 Dec dropped by ₹600 since this morning.',
    at: at(31),
    prompted: false,
    why: { source: 'suggestion', vars: { what: 'Goa fare drops' } },
  });
  w.message(chat, { author: 'system', kind: 'marker', markerKind: 'system_line', text: 'Trips can now use your calendar.', at: at(33) });

  // Cards (05-3 §5.22–§5.24).
  w.card(chat, {
    type: 'table',
    state: 'shown',
    author: 'helper',
    helperId: helper,
    at: at(35),
    payload: {
      title: 'Goa stays, Sat 12 – Mon 14 Dec',
      columns: [
        { key: 'name', label: 'Hotel', align: 'left', unit: 'text' },
        { key: 'beach', label: 'To the beach', align: 'left', unit: 'text' },
        { key: 'price', label: 'A night', align: 'right', unit: 'inr' },
      ],
      rows: [
        { name: 'Taj Holiday Village', beach: '2 min walk', price: 730_000 },
        { name: 'Novotel Candolim', beach: '5 min walk', price: 640_000 },
        { name: 'Fairfield Benaulim', beach: '10 min drive', price: 520_000 },
      ],
      sourceLine: 'From Booking.com and MakeMyTrip, checked 10:34 PM',
      bestRowIndex: 1,
    },
  });
  w.card(chat, {
    type: 'file',
    state: 'shown',
    author: 'helper',
    helperId: helper,
    at: at(36),
    payload: {
      fileId: w.id('fl', at(36)),
      name: 'Goa trip plan, 12–14 Dec.pdf',
      mime: 'application/pdf',
      bytes: 96_300,
      path: 'data/out/Goa trip plan, 12–14 Dec.pdf',
      madeBy: 'foo',
      kind: 'made',
    },
  });
  w.card(chat, {
    type: 'link_preview',
    state: 'shown',
    author: 'helper',
    helperId: helper,
    at: at(37),
    payload: {
      url: 'https://www.goa-tourism.gov.in/events',
      domain: 'goa-tourism.gov.in',
      title: 'Events in Goa this December',
      description: 'Festivals, markets and beach events across North and South Goa.',
      fetchedAt: at(37),
    },
  });
  w.card(chat, {
    type: 'place',
    state: 'shown',
    author: 'helper',
    helperId: helper,
    at: at(38),
    payload: {
      name: 'Britto’s',
      address: 'Baga Beach, Calangute, Goa 403516',
      hoursLine: 'Open till 11:30 PM',
      rating: '4.3 ★',
      mapsUrl: 'https://maps.google.com/?q=Britto%27s+Baga+Goa',
    },
  });

  // Family group: helper lines for the sender labels (§12.4) and a handoff marker (§19.3).
  w.message(o.familyChatId, {
    author: 'helper',
    helperId: o.tripsHelperId,
    text: 'I can book the cab to the airport too.',
    at: d(15, 19, 10),
  });
  w.message(o.familyChatId, { author: 'helper', helperId: o.tripsHelperId, text: 'Just say the time.', at: d(15, 19, 10) + 20 * SEC });
  w.message(o.familyChatId, {
    author: 'helper',
    helperId: o.homeHelperId,
    text: 'The gas cylinder comes on Mon 19 Oct.',
    at: d(15, 19, 14),
  });
  w.message(o.familyChatId, {
    author: 'system',
    kind: 'marker',
    markerKind: 'handoff',
    helperId: o.tripsHelperId,
    text: 'foo asked Trips to plan the airport cab.',
    at: d(15, 19, 20),
  });
  w.message(o.familyChatId, { author: 'foo', text: 'Trips is on the cab.', at: d(15, 19, 20) + 30 * SEC });
  return media;
}

const PACKING = [
  'Sunscreen',
  'Hats for the kids',
  'Swimwear',
  'Chargers and the power bank',
  'Medicines',
  'Snacks for the flight',
  'Two books',
  'Flip-flops',
];
