// Spec: 08-3 §22.5 (restaurant booking site: slot-taken toggle, no-show fee change), 10-1 AT-037 (submitted at most once,
// result has a confirmation), AT-038 (fee changes between card and submit), AT-114a ("Booking code TJ8821"), 05-2 §5.5.2
// (booking rows: Charged now, No-show fee, Free to cancel until), 08-4 §28.1 rule 8 (unknown outcome → the site's history).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { control, reset, sandboxFetch, setToggles } from '../sites/client';
import { startSandbox, type Sandbox } from '../sites/server';

let sb: Sandbox;
beforeAll(async () => {
  sb = await startSandbox();
});
afterAll(() => sb.close());
beforeEach(() => reset(sb, 'restaurant'));

const get = (path: string) => sandboxFetch(sb, 'restaurant', path);
const book = (id: string, form: Record<string, string> = {}) =>
  sandboxFetch(sb, 'restaurant', `/book/${id}`, {
    method: 'POST',
    form: { name: 'Test Guest', phone: '+91 90000 00000', party: '4', time: '8:00 PM', ...form },
  });

describe('restaurant sandbox site', () => {
  it('serves over HTTPS with the sandbox certificate, routed by host name', async () => {
    const r = await get('/');
    expect(r.status).toBe(200);
    expect(r.text).toContain('<form');
    const unknown = await sandboxFetch(sb, 'restaurant', '/', { hostHeader: 'nowhere.test' });
    expect(unknown.status).toBe(421);
  });

  it('search shows exactly 3 options, each with a photo that loads', async () => {
    const r = await get('/search?party=4&date=2026-10-18&time=8:00+PM');
    expect(r.status).toBe(200);
    const options = [...r.text.matchAll(/<li class="option" data-option="([a-z-]+)">/g)].map((m) => m[1]);
    expect(options).toHaveLength(3);
    const photos = [...r.text.matchAll(/<img src="(\/photos\/[a-z-]+\.svg)" alt="[^"]+"/g)].map((m) => m[1]!);
    expect(photos).toHaveLength(3);
    for (const p of photos) {
      const img = await get(p);
      expect(img.status).toBe(200);
      expect(img.headers['content-type']).toBe('image/svg+xml');
    }
    for (const id of options) expect(r.text).toContain(`href="/book/${id}?party=4&amp;time=8%3A00+PM"`);
  });

  it('booking form shows the booking rows with the no-show fee and a Book table button', async () => {
    const r = await get('/book/coastline?party=4&time=8:00+PM');
    expect(r.status).toBe(200);
    expect(r.text).toContain('Charged now');
    expect(r.text).toContain('₹0');
    expect(r.text).toMatch(/No-show fee<\/dt><dd data-field="no-show-fee">₹1,000</);
    expect(r.text).toContain('Free to cancel until');
    expect(r.text).toContain('<button type="submit">Book table</button>');
  });

  it('one submit books once, shows "Booking code TJ8821" and counts 1 submit', async () => {
    const r = await book('coastline');
    expect(r.status).toBe(200);
    expect(r.text).toContain('Booking code TJ8821');
    const c = await control(sb, 'restaurant');
    expect(c.counters.submits).toBe(1);
    const history = await get('/bookings');
    expect(history.text).toContain('TJ8821');
    expect(history.text).toContain('Coastline Kitchen');
  });

  it('a fee change shows on the page the engine re-reads before submit', async () => {
    await setToggles(sb, 'restaurant', { noShowFeePaise: 150_000 });
    const r = await get('/book/coastline?party=4&time=8:00+PM');
    expect(r.text).toMatch(/data-field="no-show-fee">₹1,500</);
  });

  it('slot taken: the submit is counted, nothing is booked and the page says so', async () => {
    await setToggles(sb, 'restaurant', { slotTaken: true });
    const r = await book('coastline');
    expect(r.status).toBe(409);
    expect(r.text).toContain('just taken');
    expect(r.text).not.toContain('TJ8821');
    expect((await control(sb, 'restaurant')).counters.submits).toBe(1);
    expect((await get('/bookings')).text).not.toContain('TJ8821');
  });

  it('confirmation "none": the page shows no code but the history page has the booking (08-4 §28.1 rule 8)', async () => {
    await setToggles(sb, 'restaurant', { confirmation: 'none' });
    const r = await book('saffron');
    expect(r.status).toBe(200);
    expect(r.text).not.toContain('TJ8821');
    expect((await get('/bookings')).text).toContain('TJ8821');
  });

  it('control refuses unknown toggles and wrong types; reset clears counters and history', async () => {
    expect((await setToggles(sb, 'restaurant', { nope: 1 })).status).toBe(400);
    expect((await setToggles(sb, 'restaurant', { slotTaken: 'yes' })).status).toBe(400);
    await book('coastline');
    await reset(sb, 'restaurant');
    expect((await control(sb, 'restaurant')).counters.submits ?? 0).toBe(0);
    expect((await get('/bookings')).text).not.toContain('TJ8821');
  });

  it('unknown option and unknown path are 404', async () => {
    expect((await get('/book/nowhere')).status).toBe(404);
    expect((await get('/nope')).status).toBe(404);
  });
});
