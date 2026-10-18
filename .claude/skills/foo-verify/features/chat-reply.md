# Send a message and get foo's reply (04 §3, §12; 04-2 §20–§23; 08-4 §25)

## Sub-features
- Composer: type, Enter to send, ✓✓ when accepted; my bubble.
- foo's reply: Thinking row, streamed text, up to 3 paced bubbles in chat mode, reactions for "thanks", Stop, Try again.

## How to get to it (user POV)
- Click a chat (foo, Trips, …), type in "Message foo…" at the bottom, press Enter.

## Driving it with foo-verify
- `v.launch({ fakeAi: [intake('<words in the prompt>', '<foo says>')] })`, `openWorld`, `openChat(page, 'foo')`.
- Type into `TID.composerField`, press Enter; wait for `TID.bubbleMe` then `TID.bubbleFoo` with the answer text inside `TID.threadLog`.
- Check `v.fakeTurns()`: one `intake` turn, matched line 1.
- Proof: `test/verify/send-and-reply.journey.ts` (PASS, 3 shots, light + dark).

## Gotchas
- The engine holds a reply 1.5 s on the injected clock (08-4 §25.5 item 2); a reply that lands inside the hold is paced in real time in the renderer.
- Without `fakeAi` a FOO_TEST run starts no engine, so nothing answers.
- Seen 2026-10-18 on `16acd2d`: with the fake clock at 09:41, my bubble shows 9:41 AM but foo's reply shows 9:00 AM. Not yet checked against 04 §3 (time shown on a reply); raised to the coordinator.
