// GET /api/status - public health of what a user's studio depends on, for the outside status
// page's monitors (docs/STATUS_PAGE.md). No sign-in, never cached by the CDN (`no-store`), and
// nothing private in the answer. The checks themselves live in _lib/statusProbe.ts.

import { createStatusHandler, type SocketLike } from './_lib/statusProbe.js';

const handle = createStatusHandler({
  // Wrapped so fetch is never called with `deps` as its receiver.
  fetch: (input, init) => fetch(input, init),
  openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
  now: Date.now,
  // The checks run in parallel, so an answer never takes much longer than one cap.
  timeoutMs: 5_000,
  // Several monitors calling in the same minute share one measurement per warm instance.
  memoMs: 10_000,
});

export default { fetch: handle };
