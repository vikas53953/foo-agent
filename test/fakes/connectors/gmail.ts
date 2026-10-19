// Spec: CR-0009 G-M5-12 (a minimal fake Gmail behind the 08-3 §16.5 connector interface: drafts.create | update | send |
// delete), 08-3 §22.2 (fakes have the real API). The store itself lives in src/main/drafts/gmailDrafts.ts so FOO_TEST app
// runs can install it too; M8 extends this file with search, read and pollHistory. Made-up addresses only (example.com).
export { memoryGmailDrafts as fakeGmail, type MemoryGmail as FakeGmail } from '../../../src/main/drafts/gmailDrafts';
