// ALL OUT'S TARGETS, a plain function so it runs in Node (scripts/all-out.test.mjs). The send and
// its confirmation are ProductionPage's `outAll`; what the heads say is on is hostedControl.ts
// `headsOnAir`.

/** What All out clears (playout-workflow-simplification D11): every graphic this page has up and
 *  every one the server's heads say is on, since the page's list misses a graphic whose cue marker
 *  went missing. When neither knows of any in a published production, every graphic it has: a
 *  renderer can keep graphics across a republish that no head remembers, and the panic control
 *  must never do nothing. */
export function allOutTargets(input: { local: readonly string[]; onServer: readonly string[] | null; all: readonly string[]; published: boolean }): string[] {
  const named = [...new Set([...input.local, ...(input.onServer ?? [])])];
  return named.length || !input.published ? named : [...new Set(input.all)];
}
