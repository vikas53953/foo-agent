// Spec: 07 journeys, 10 acceptance (real-PC / real-AI end-to-end check).
// When the driver may call foo's reply finished. Real-AI run 16 (main 0665cf6): an AI page sits on "Building your page…"
// with no new words while the AI writes the page, so "nothing changed for 6 s" settled early; the journey then closed foo
// mid-reply and the next launch showed "That reply got cut off" (04 §19.4). A bubble still streaming, or a page still
// building, is foo at work, never a finished reply.
'use strict';

/** items: the rows below the newest user bubble, as { state: bubble data-state, pageState: its ai-page data-state }. */
function stillWorking(items) {
  return items.some((x) => x.state === 'streaming' || x.state === 'live' || x.pageState === 'building');
}

/** Settled: a new reply came, foo is not still working on it, and nothing changed for quietMs. */
function settled({ n, before, items, quietFor, quietMs }) {
  return n > before && !stillWorking(items) && quietFor >= quietMs;
}

module.exports = { stillWorking, settled };
