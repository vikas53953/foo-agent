# foo feature map (for foo-verify)

One file per user-facing feature: what it is, how Vikas reaches it, how a journey drives it, and the end state that proves it. Spec references point at `spec/constitution/`. Add a file (and a row here) when a ticket adds a feature; fix the file when a journey finds it wrong.

| Feature | File | Since | Journey |
| --- | --- | --- | --- |
| App starts, test hooks, seed, themes | [doctor.md](doctor.md) | M0 | `test/verify/doctor.journey.ts` |
| Chat list, filters, search | [chat-list.md](chat-list.md) | M1 | none yet |
| Send a message and get foo's reply | [chat-reply.md](chat-reply.md) | M2–M3 | `test/verify/send-and-reply.journey.ts` |
| Details panel (Doing now, Using, What I know, Spent) | [details-panel.md](details-panel.md) | M1 | none yet |

Milestones M4 onward (jobs, cards, approvals, memory, routines…) add their files here.
