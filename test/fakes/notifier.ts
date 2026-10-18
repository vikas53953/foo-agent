// Spec: 08-3 §22.6 (fake Notifier), CR-0015 (G-M11-16). Unit and integration tests use the same recorder the FOO_TEST app
// exposes on `test:notifier`.
export { RecordingNotifier, type NotifierCall } from '../../src/main/test/fakeNotifier';
