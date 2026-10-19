# Disposable scheduling probes

These are failed reproduction attempts, not a repaired test. Each patch was made
only in the owned worktree's `e2e/editor-keys.spec.ts`, then run by the named queue
command in README. No product source changed. The exact insertion point is before
the `await seek(page, 1)` immediately preceding the nested SVG selection rectangle
measurement. All three preserve original test statements and assertions.

## j-0002 insertion

```ts
  // Disposable matching-window injection: deliver an already in-flight old pose
  // after the ruler changes, then delay only the requested current pose.
  await page.evaluate(async () => {
    const controller = (await import('/src/components/editorFoundation/Canvas.tsx')).foundationDiagnostics()!;
    const replays = new WeakSet<object>();
    let held: MessageEvent | undefined;
    let signal!: () => void;
    const caught = new Promise<void>(resolve => { signal = resolve; });
    const deliver = (event: MessageEvent) => {
      const replay = new MessageEvent('message', { data: event.data, source: event.source });
      replays.add(replay); window.dispatchEvent(replay);
    };
    const intercept = (event: MessageEvent) => {
      if (replays.has(event)) return;
      const message = event.data;
      if (message?.type !== 'noacg-editor-foundation-v1' || message.kind !== 'pose') return;
      const time = message.parts?.find((part: { selector: string }) => part.selector === '#nested')?.appearance?.time;
      if (time === 0 && !held) { event.stopImmediatePropagation(); held = event; signal(); }
      else if (time === 1) { event.stopImmediatePropagation(); setTimeout(() => { deliver(event); window.removeEventListener('message', intercept, true); }, 1000); }
    };
    window.addEventListener('message', intercept, true);
    document.querySelector('[role="slider"][aria-label="Playhead"]')!.addEventListener('pointerdown', () => {
      setTimeout(() => deliver(held!), 0);
    }, { once: true });
    controller.seek(0, 'selection');
    await caught;
  });
```

## j-0003 replacement

Change the second predicate from `time === 1` to
`typeof time === 'number' && Math.abs(time - 1) < .00001`.
Keep the one-second timer unchanged.

## j-0004 replacements and diagnostics

Change that predicate to `typeof time === 'number' && time > .1` and the
current-pose release timer from `1000` to `4000` milliseconds. Immediately after
the evaluate, before the original `seek`, add:

```ts
  console.log('FAULT_CAUGHT_ZERO');
```

Immediately after that original `await seek(page, 1);`, add:

```ts
  console.log('FAULT_AFTER_SEEK', await page.getByTestId('foundation-canvas').getAttribute('data-pose-time'));
```

The intended sequence is old actual pose held → real ruler pointerdown → release
old actual pose → hold current actual pose → original ready/drag encounters stale
parts. Observed sequence does not prove that: j-0004 logs the zero-time catch but
reports current canvas pose 1 after seek, and completes in 3.2 seconds test time,
8.1 seconds Playwright wall. Therefore the intended four-second current-pose hold
was not effective. These probes did not log every envelope/selector/appearance or
hook lifetime, so they cannot distinguish an unmatched current message from a
hook lifetime or delivery-order issue. Earlier j-0002/j-0003 lack those two logs;
their passing results alone establish neither a held target pose nor the reason
for no reproduction. No assertion failure occurred in these three probes.
