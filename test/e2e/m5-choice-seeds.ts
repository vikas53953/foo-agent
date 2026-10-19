// Seeded Choice and tiles payloads for the M5-T5 e2e, UX-10 and BP specs and the foo-verify journey: the words 05-1 §5.3.1 /
// §5.4.1 and the UX walkthrough chapter 10 draw (UX-10-02, -05, -06), as 08-1 §4.5 ChoicePayload rows (a stepper's later
// questions in `steps`, implementation-notes M5-T5). Fake places and prices only (public repo).
import type { CardSeedRequest } from '../../src/shared/ipc';

const base = { multi: false, aiReversible: false, reversible: false, livePrices: true };

export const FLIGHTS: Record<string, unknown> = {
  ...base,
  purpose: 'job',
  question: 'Which flight time works for Delhi on Fri 18 Dec?',
  options: [
    { id: 'o1', label: '10:15 AM · IndiGo · ₹5,240', detail: 'No early start, you said you hate those', bestFit: true },
    { id: 'o2', label: '7:10 AM · Air India · ₹4,890', detail: 'Cheapest, leaves early' },
    { id: 'o3', label: '1:35 PM · Akasa Air · ₹5,610' },
  ],
};

/** AT-288: three questions, "1 of 3". */
export const TRIP_STEPS: Record<string, unknown> = {
  ...FLIGHTS,
  stepper: { index: 1, total: 3 },
  steps: [
    {
      question: 'Checked bag?',
      options: [
        { id: 'o1', label: '15 kg included', bestFit: true },
        { id: 'o2', label: 'Add 25 kg', detail: '₹2,100' },
      ],
    },
    {
      question: 'Seat?',
      options: [
        { id: 'o1', label: 'Window', bestFit: true },
        { id: 'o2', label: 'Aisle' },
        { id: 'o3', label: 'Any' },
      ],
    },
  ],
};

/** UX-10-05: "1 of 2 · Checked bag?". */
export const BAG_STEPS: Record<string, unknown> = {
  ...base,
  purpose: 'job',
  question: 'Checked bag?',
  options: [
    { id: 'o1', label: '15 kg included', bestFit: true },
    { id: 'o2', label: 'Add 25 kg', detail: '₹2,100' },
  ],
  stepper: { index: 1, total: 2 },
  steps: [
    {
      question: 'Seat?',
      options: [
        { id: 'o1', label: 'Window', bestFit: true },
        { id: 'o2', label: 'Aisle' },
      ],
    },
  ],
};

/** UX-10-06: tick boxes, then Done. */
export const SUBSCRIPTIONS: Record<string, unknown> = {
  ...base,
  livePrices: false,
  purpose: 'job',
  multi: true,
  question: 'Which of these subscriptions do you still use?',
  options: [
    { id: 'o1', label: 'Netflix', bestFit: true },
    { id: 'o2', label: 'Spotify' },
    { id: 'o3', label: 'Hotstar' },
    { id: 'o4', label: 'Cult.fit' },
  ],
};

/** 05-1 §5.4.1's drawn stays (photos missing → the Image placeholder). */
export const STAYS: Record<string, unknown> = {
  ...base,
  purpose: 'job',
  question: 'Pick a stay · 12–14 Dec',
  options: [
    {
      id: 'o1',
      label: 'Taj Holiday Village',
      detail: '₹7,300/night · 2 min walk · free cancellation',
      bestFit: true,
      photoRef: 'media/stay-1.jpg',
    },
    { id: 'o2', label: 'W Goa', detail: '₹7,950/night · 4 min walk', photoRef: 'media/stay-2.jpg' },
    { id: 'o3', label: 'Ronil Beach', detail: '₹4,100/night · 3 min walk · No free cancellation', photoRef: 'media/stay-3.jpg' },
  ],
};

export const seed = (payload: Record<string, unknown>, chatId?: string, type: 'choice' | 'tiles' = 'choice'): CardSeedRequest => ({
  ...(chatId ? { chatId } : {}),
  type,
  state: 'asking',
  payload,
});
