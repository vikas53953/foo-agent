// Spec: 06-2 §6.9 About ("Version {1.0.3} · tester build" for unsigned builds, X-44); CR-0018 G-M14-24.
/** Compile-time define (vite.config.ts): true unless the release workflow signed the build. Read by About's version line. */
declare const __FOO_TESTER_BUILD__: boolean;
