# T - the output URL flashing when CasparCG loads it

Branch `claude/t-caspar-load-flash`. The flash is OURS, it is measured on a real CasparCG 2.5.0
on this laptop, and it is fixed. CasparCG's own HTML producer paints nothing of its own on load.

## The cause, in one paragraph

A browser source that opens a production's `/output` page replays every command the control log
holds that its own snapshot does not already contain - on a first-ever load, the whole rehearsal
(`control/outputRecovery.ts` says why the baseline is the log's START and not its head). That
replay ran off air, which is right, but "off air" was an `opacity: 0` on the stage, and the
comment on that line said the documents would keep compositing and their timelines keep ticking
behind it. They do not. Chromium throttles the rendering of an iframe whose embedder has made it
invisible, and every graphic is a sandboxed cross-origin frame. So the replay crawled, the fixed
1.2 s settle expired long before it was finished, and the rest of every entrance and the exits
queued behind them played out ON AIR. That is the flash, and it lasts as long as whatever was
still running.

## The evidence

All of it on `casparcg-server-v2.5.0-stable-windows` on this laptop, channel 1 at 1080p50 with a
magenta colour producer on layer 5 and the page on layer 20, recorded through a file consumer and
read frame by frame with `ffmpeg … signalstats YAVG`. The page was the real `/output` shell with
its boot module swapped for one that builds the real stage from a catalog design (a throwaway file
under `public/`, deleted - rebuild it rather than looking for it).

- **The throttling, measured directly.** Behind an `opacity: 0` stage, a replayed entrance's
  playhead advanced 0.02 -> 0.45 seconds over about three seconds, in steps of ~0.03 s at roughly
  1 Hz. The moment the stage came back it ran 0.45 -> 1.26 in three 200 ms samples and finished on
  air. With the document itself transparent and the frame left alone, the same entrance ran 0.2 s
  per 200 ms from the start and was over before air returned.
- **Before:** 12 to 18 frames of lower thirds on air about a second after the source loaded, the
  last of them fading out over the layer underneath.
- **After:** 540 recorded frames with not one pixel of ours when the replay ends with everything
  off; and exactly one frame of transition into the settled picture when it ends with a graphic
  live. The renderer reported `back on air … settled` at 2.6-3.2 s, because the replay had
  actually finished rather than because a timer said so.
- **CasparCG's own half:** a trivial transparent page loaded with the same `PLAY 1-20 [HTML] …`
  gave 291 frames with no flash at all, so the HTML producer does not paint a frame of its own
  when a page loads. Nothing here is CasparCG's to fix. If a flash ever survives this walk on
  another server, look at the rundown item's mixer transition.

## What changed

- **`src/output/stage.ts`** - `setVisible` sends every DOCUMENT the new `offair` command instead
  of hiding the stage, so the frames keep their frame rate. Each graphic's frame is also
  `visibility: hidden` until its own `load`: until then it holds a document with no colour-scheme
  of its own, which Chromium paints as an opaque white canvas inside this dark-scheme page
  (measured in Playwright: full-frame white). The stage also exposes `motion`, `replies` and
  `whenLoaded()`.
- **`src/preview/composeDocument.ts`** - the live-control script answers `offair` by setting the
  document root transparent, and every state reply now carries `motion`: the summed playhead of
  GSAP's global timeline plus the document's own web animations. The state branch was also
  restructured so a throwing `noacgMachineState()` can no longer swallow the whole reply, which
  the walk below reads as "this graphic cannot be called still".
- **`src/output/catchUp.ts`** (new) - `airWhenSettled`: wait for the documents to load (bounded by
  the cap, because one unreachable subresource must never hold the whole channel off air), then
  poll until two asks in a row come back ANSWERED with the same playhead from every graphic.
  Floor 1.2 s from the load, ceiling 6 s. It lives outside `main.ts` so the spec drives the
  shipped walk rather than an imitation of it.
- **`src/output/main.ts`** - calls it, and forces air back with a console warning if it ever
  throws.
- **`e2e/output-first-paint.spec.ts`** (new) - four tests on the real shell: nothing paints from
  navigation until a cue is taken, a graphic off air keeps running while showing nothing, a replay
  that ends with everything off leaves the output clean when air returns, and a frame is invisible
  until its document has loaded.

## Worth knowing next time

- **`PRINT` and a FILE consumer are how you review playout without watching a window.**
  `ADD 1-700 FILE name.mp4` writes into the server's media folder, `REMOVE 1-700` stops it, and
  `ffmpeg -vf "scale=64:36,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-"` turns
  the recording into one number per frame. A colour producer underneath (`PLAY 1-5 #FFFF00FF`
  works on 2.5.0) makes any stray pixel of ours obvious.
- **The desktop browser pane renders no frames**, so GSAP stands still in it: the first probe run
  through it reported every timeline at playhead 0 and nearly sent this row chasing a phantom. The
  repo already carries that trap for exits; it applies to any timing measurement.
- **A backtick in a comment inside `composeDocument`'s template literals ends the emitted runtime**
  (`docs/backlog/a-backtick-in-a-comment-ends-the-emitted-runtime.md`). It cost one lint cycle
  here.

## Check

- `review: delegated` - the code-review skill at effort high, handed the scope
  `scripts/review-request.mjs` printed (base `6f5855d9`, 8 files). It reported that same base and
  file list; `git diff --name-only 6f5855d9..HEAD` is those 8 files and the tree was clean, so the
  scope matched. Seven findings, all confirmed against the code and all fixed: the unbounded
  `whenLoaded()` wait (high - one hanging subresource would have held the whole channel off air
  for the show), a state reply that could be swallowed whole, `motion` blind to CSS animations, a
  missing `.catch` on the walk, and three test weaknesses (a raced visibility read, a non-monotonic
  playhead assertion, an `expect` inside a route handler that would have reported a timeout).
- `simplify: inline` - the skill returned fan-out instructions, so the pass was done here over
  reuse, simplification, efficiency and altitude. One edit: the settle loop's readings became a
  named `Reading` type with an explicit "never answered" value, which removed three non-null
  assertions, plus a local `wait` helper. Considered and rejected: moving the colour-scheme meta
  to the front of the composed head as a second defence - the frame being hidden until `load`
  already covers every unparsed state, and two mechanisms for one rule is worse than one.
- `verify: npm run build` green twice (exit code read directly), `npm run test:e2e:affected`
  queued: 1443 passed and one failure, `e2e/end-credits.spec.ts:194`, which passed on its own
  immediately afterwards and touches nothing this branch changed. Filed as
  `docs/backlog/the-end-credits-emphasis-test-measures-a-detached-element.md` rather than fixed
  here, because it is another file's flake and outside the reviewed scope. The four tests of
  `e2e/output-first-paint.spec.ts` are green, and they fail against the old stage-hiding code -
  checked by putting it back. The CasparCG recordings above were re-taken after the check fixes.
- `taste: not applicable` - no design file, no template machinery, no fit or alignment code. The
  graphics in the recordings are the unmodified house lower third.

## Left undone

- **The real hosted `/output` was never loaded on the real backend for this walk.** Everything
  here used the real shell, the real stage and the real composed documents, but a locally served
  page rather than `https://noacg.studio/output?production=…`, because a linked worktree carries
  no backend configuration. The owner-queue item's route is exactly that missing step, and it
  takes four minutes.
- **A ticker or a clock that never stops moving still reaches the 6 s ceiling on a cold boot**,
  which is the old behaviour: it comes back on air with whatever is still running. Nothing was
  measured with such a production; if it ever looks wrong, the honest fix is for the graphic to
  say which of its animations are decoration rather than a transition.
