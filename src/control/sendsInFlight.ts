// SENDS NOT YET ANSWERED (live-publishing designs/G3.md section 5, "Takes first").
//
// Every press's send counts itself here while it is on the wire (hostedControl.ts `sendSeqVerb`,
// serverVerbs.ts), and an automatic publish waits for none before each of its steps, so a press
// never shares the main thread with the publish's own work.

let inFlight = 0;
let waiters: (() => void)[] = [];

/** A send started; call the answer when it is answered, whatever it came to. */
export function noteSendStarted(): () => void {
  inFlight += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    inFlight = Math.max(0, inFlight - 1);
    if (inFlight === 0) {
      const ready = waiters;
      waiters = [];
      for (const w of ready) w();
    }
  };
}

/** Resolves once no send is in flight. */
export function sendsIdle(): Promise<void> {
  return inFlight === 0 ? Promise.resolve() : new Promise((resolve) => waiters.push(resolve));
}

/** `send`, counted while it runs. */
export function countedSend<A, R>(send: (a: A) => Promise<R>): (a: A) => Promise<R> {
  return async (a) => {
    const answered = noteSendStarted();
    try {
      return await send(a);
    } finally {
      answered();
    }
  };
}
