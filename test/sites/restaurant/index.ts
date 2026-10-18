// Spec: 08-3 §22.5 (restaurant booking: slot-taken toggle, no-show fee change), 07-1 J9, 05-2 §5.5.2 (booking rows:
// Charged now, No-show fee, Free to cancel until), 10-1 AT-037 (submit counter), AT-038 (fee toggle), AT-114a ("Booking
// code TJ8821"), 08-4 §28.1 rule 8 (an unclear result is checked on the site's history page). Fictional places only.
import { formatInr } from '../../../src/shared/format';
import { defineSite, esc, notFound, page, type SiteResponse } from '../site';

interface Option {
  id: string;
  name: string;
  area: string;
  rating: string;
  colour: string;
}

export const OPTIONS: readonly Option[] = [
  { id: 'coastline', name: 'Coastline Kitchen', area: 'Marine Drive', rating: '4.5', colour: '#2f6f8f' },
  { id: 'saffron', name: 'Saffron Table', area: 'Bandra West', rating: '4.3', colour: '#c27c0e' },
  { id: 'bay-leaf', name: 'Bay Leaf Pizzeria', area: 'Colaba', rating: '4.4', colour: '#5b8a3a' },
];

interface Booking {
  code: string;
  optionId: string;
  name: string;
  party: string;
  time: string;
}

const photo = (o: Option) => `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">
<rect width="160" height="120" fill="${o.colour}"/><circle cx="80" cy="60" r="34" fill="#fff" opacity=".85"/>
<circle cx="80" cy="60" r="22" fill="${o.colour}" opacity=".6"/></svg>`;

export default defineSite({
  initialToggles: () => ({
    slotTaken: false,
    noShowFeePaise: 100_000,
    freeCancelUntil: 'Sun 18 Oct, 6:00 PM',
    bookingCode: 'TJ8821',
    /** 'code': the confirmation page shows the booking code; 'none': it doesn't (the history page still does). */
    confirmation: 'code',
  }),
  initialData: () => ({ bookings: [] as Booking[] }),
  handle(req, { toggles, data, count }): SiteResponse {
    const parts = req.path.split('/').filter(Boolean);
    if (req.path === '/' && req.method === 'GET') {
      return page(
        'TableJoy',
        `<h1>Find a table</h1>
<form method="get" action="/search">
<label>People <input name="party" value="2" inputmode="numeric"></label>
<label>Date <input name="date" type="date" value="2026-10-18"></label>
<label>Time <input name="time" value="8:00 PM"></label>
<button type="submit">Search</button></form>`,
      );
    }
    if (req.path === '/search' && req.method === 'GET') {
      const party = req.query.get('party') ?? '2';
      const time = req.query.get('time') ?? '8:00 PM';
      const q = new URLSearchParams({ party, time }).toString();
      const items = OPTIONS.map(
        (o) => `<li class="option" data-option="${o.id}"><img src="/photos/${o.id}.svg" alt="${esc(o.name)}" width="160" height="120">
<div><h2>${esc(o.name)}</h2><p>${esc(o.area)} · ★ ${o.rating} · ${esc(time)} free</p>
<a href="/book/${o.id}?${esc(q)}">See table</a></div></li>`,
      ).join('\n');
      return page('TableJoy · results', `<h1>Tables for ${esc(party)}</h1><ul>${items}</ul>`);
    }
    if (parts[0] === 'photos' && parts.length === 2 && req.method === 'GET') {
      const o = OPTIONS.find((x) => `${x.id}.svg` === parts[1]);
      return o ? { status: 200, body: photo(o), type: 'image/svg+xml' } : notFound();
    }
    if (parts[0] === 'book' && parts.length === 2) {
      const o = OPTIONS.find((x) => x.id === parts[1]);
      if (!o) return notFound();
      if (req.method === 'GET') {
        const party = req.query.get('party') ?? '2';
        const time = req.query.get('time') ?? '8:00 PM';
        return page(
          `Book ${o.name}`,
          `<h1>${esc(o.name)}</h1><p>${esc(o.area)} · Sun 18 Oct, ${esc(time)} · ${esc(party)} people</p>
<dl><dt>Charged now</dt><dd data-field="charged-now">${formatInr(0)}</dd>
<dt>No-show fee</dt><dd data-field="no-show-fee">${formatInr(toggles.noShowFeePaise)}</dd>
<dt>Free to cancel until</dt><dd data-field="free-cancel">${esc(toggles.freeCancelUntil)}</dd></dl>
<form method="post" action="/book/${o.id}">
<input type="hidden" name="party" value="${esc(party)}"><input type="hidden" name="time" value="${esc(time)}">
<label>Name <input name="name" autocomplete="name"></label>
<label>Phone <input name="phone" type="tel" autocomplete="tel"></label>
<button type="submit">Book table</button></form>`,
        );
      }
      if (req.method === 'POST') {
        count('submits');
        if (toggles.slotTaken) {
          return page('Slot taken', `<h1>Sorry, that slot was just taken.</h1><p><a href="/">Search again</a></p>`, 409);
        }
        data.bookings.push({
          code: toggles.bookingCode,
          optionId: o.id,
          name: req.form.get('name') ?? '',
          party: req.form.get('party') ?? '',
          time: req.form.get('time') ?? '',
        });
        const body =
          toggles.confirmation === 'code'
            ? `<h1>Booking confirmed</h1><p data-field="booking-code">Booking code ${esc(toggles.bookingCode)}</p>`
            : `<h1>Thanks, we're processing your request.</h1>`;
        return page('Booking', `${body}<p><a href="/bookings">Your bookings</a></p>`);
      }
    }
    if (req.path === '/bookings' && req.method === 'GET') {
      const rows = data.bookings
        .map((b) => {
          const o = OPTIONS.find((x) => x.id === b.optionId)!;
          return `<tr><td>${esc(b.code)}</td><td>${esc(o.name)}</td><td>${esc(b.time)}</td><td>${esc(b.party)}</td><td>Confirmed</td></tr>`;
        })
        .join('');
      return page(
        'Your bookings',
        `<h1>Your bookings</h1>${rows ? `<table><tr><th>Code</th><th>Place</th><th>Time</th><th>People</th><th>Status</th></tr>${rows}</table>` : '<p>No bookings yet.</p>'}`,
      );
    }
    return notFound();
  },
});
