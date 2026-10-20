// Spec: 06-3 §11.2 Take over (foo pauses all clicks and AI calls; Edge to the front with the take-over banner) and Hand back
// (X-135: foo re-reads the page and carries on, "Carrying on from here."), 08-2 §8.3.6 (the mask is removed on take-over and
// put back on hand back), 09 §9.27.3 (closing Edge during take-over = Stop with the stop report), 10-1 AT-058 (no foo click
// until Hand back), AT-078 (the job's Edge window closed → cancelled with the same report). M9 T7, on the T2 CAPTCHA site.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { bannerOps, cardStates, laneHarness, liveStates, type LaneHarness } from './lanes';

let h: LaneHarness;

beforeAll(async () => {
  h = await laneHarness();
});
afterAll(async () => {
  await h.close();
});
afterEach(() => {
  h.lanes.jobEnded(h.job.id);
  h.takeOver.jobEnded(h.job.id);
  for (const a of [h.sent, h.ops, h.answers, h.stops, h.needsYou, h.halted, h.launched]) a.length = 0;
  h.toggles.captcha.solved = false;
});

const masked = async () => (await h.page()).evaluate(() => getComputedStyle(document.querySelector('input[type=password]')!).filter);

describe('06-3 §11.2 take over a running job', { timeout: 60_000 }, () => {
  it('Take over stops the loop and every foo click until Hand back; Hand back re-reads the page and carries on', async () => {
    expect((await h.run('browser.open', { url: h.signin() })).kind).toBe('ok');
    expect(await masked()).toBe('blur(10px)');
    expect(await h.takeOver.on(h.job.id)).toBe(true);
    expect(h.halted).toEqual(['job_1']);
    expect(bannerOps(h.sent)[0]).toBe('open:take_over');
    expect(liveStates(h.sent)).toEqual(['taken_over']);
    // The user sees their own typing (§8.3.6) and foo captures nothing (§8.3.3).
    expect(await masked()).toBe('none');
    expect(await h.run('browser.click', { ref: 'e1' })).toMatchObject({ kind: 'error', result: { reason: 'sign_in_in_front' } });
    expect(await h.run('browser.snapshot')).toMatchObject({ kind: 'error', result: { reason: 'sign_in_in_front' } });

    expect(await h.takeOver.handBack(h.job.id)).toBe(true);
    expect(await masked()).toBe('blur(10px)');
    expect(h.launched).toEqual(['job_1']);
    expect(liveStates(h.sent)).toEqual(['taken_over', 'running']);
    expect(bannerOps(h.sent).at(-1)).toBe('close');
    expect(h.ops).toContainEqual(
      expect.objectContaining({ op: 'insert', row: expect.objectContaining({ text: t('cards.signin.hand_back_line') }) }),
    );
    expect((await h.run('browser.snapshot')).kind).toBe('ok');
  });

  it('closing Edge while in control stops the job with the stop report (09 §9.27.3)', async () => {
    expect((await h.run('browser.open', { url: h.signin() })).kind).toBe('ok');
    await h.takeOver.on(h.job.id);
    await h.pump(500);
    await (await h.page()).close();
    await h.pump(500);
    expect(h.stops).toEqual([{ jobId: 'job_1', reason: 'window_closed', report: true }]);
    expect(h.takeOver.has(h.job.id)).toBe(false);
  });
});

describe('05-3 §5.10.2 CAPTCHA lane: Take over on the Sign-in card', { timeout: 60_000 }, () => {
  it('the challenge page posts the CAPTCHA card; nothing is clicked until Hand back, which ends it handed_back', async () => {
    const opened = await h.run('browser.open', { url: h.captcha() });
    expect(opened).toEqual({ kind: 'error', errorKind: 'SITE_CAPTCHA' });
    expect(await h.lanes.challenge(h.job)).toBe(true);
    expect(h.needsYou[0]).toMatchObject({ type: 'signin', payload: { reason: 'captcha', mode: 'take_over', site: 'localhost' } });
    await new Promise((r) => setTimeout(r, 50));
    const cardId = (h.lanes.pause(h.job.id) ?? { cardId: '' }).cardId;
    expect(await h.run('browser.click', { ref: 'e1' })).toMatchObject({ kind: 'error', result: { reason: 'sign_in_in_front' } });
    expect(await h.takeOver.on(h.job.id)).toBe(true);
    expect(h.halted).toEqual([]);
    expect(cardStates(h.ops, cardId)).toEqual(['live']);
    // The person solves it (the sandbox's control stands in for them); foo still clicks nothing.
    h.toggles.captcha.solved = true;
    await (await h.page()).reload();
    await h.pump(2_000);
    expect(h.answers).toEqual([]);
    expect(h.counts.attempts ?? 0).toBe(0);
    expect(await h.takeOver.handBack(h.job.id)).toBe(true);
    expect(h.answers).toEqual([{ cardId, answer: { end: 'handed_back' }, resolvedBy: 'tap' }]);
    expect(h.lanes.paused(h.job.id)).toBe(false);
  });

  it('closing Edge during the CAPTCHA take-over is Stop', async () => {
    await h.run('browser.open', { url: h.captcha() });
    await h.lanes.challenge(h.job);
    await new Promise((r) => setTimeout(r, 50));
    await h.takeOver.on(h.job.id);
    await h.pump(500);
    await (await h.page()).close();
    await h.pump(500);
    expect(h.stops).toEqual([{ jobId: 'job_1', reason: 'window_closed', report: true }]);
  });
});
