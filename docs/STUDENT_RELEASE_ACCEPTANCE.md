# Student release — owner acceptance checklist

The final gate of the student release (docs/GOALS_ARCHIVE.md, "Student release" step 10). The agent-automatable half is
DONE and named below so nothing is re-tested by hand that a spec already pins; what remains
needs real hardware, the real backend, and real people — the owner runs it, against this list,
and the release is accepted when every unchecked box is ticked (or consciously waived here,
in writing).

The Done-when sentence being accepted: *a first-time student can choose or create a supported
graphic, customize it without the editor or AI, prepare and manage cues in a Production,
export or publish it, and reliably operate Take / Update / Next / Out in CasparCG or OBS.*

## 0. What the automated suites already hold (do not re-test by hand)

- Wizard → production → cues → verbs (rehearsal), operator clarity, persistence across
  reload/reopen, stable slugs, republish hint: `e2e/productions.spec.ts`,
  `e2e/production-persistence.spec.ts`, `e2e/wizard-finish.spec.ts`, `e2e/wizard-kit.spec.ts`.
- Wrong take → Out / All out (per-layer, the frame clears): `e2e/productions.spec.ts`.
- Storage-full save fails loudly, last good copy intact, recovery after freeing space:
  `e2e/playout-drills.spec.ts`.
- Exported packages: every relative reference resolves inside its own zip (all 6 targets),
  fonts arrive and load over `file://`, the single-file overlay survives its own autoplay
  with inlined images, CasparCG XML payload drive, OGraf load/update/play contract:
  `e2e/exports.spec.ts`.
- Account essentials: password reset request, recovery dialog, password change round-trip,
  session-expiry prompt with local work intact: `e2e/auth.spec.ts` (offline posture) +
  `e2e/configured/account.spec.ts` (live suite — run it once against the real backend
  before acceptance: `npm run test:e2e:live`).

## 1. Cloud playout on real hardware (CasparCG 2.3.x + OBS)

Follow docs/CLOUD_PLAYOUT.md §8 steps 1-8 in order; the open items from earlier rounds are:

- [ ] §8.4 The verbs against the real output: Take / Update (no replay) / Next / per-layer
      Out / All out, with two graphics on air on separate layers.
- [ ] §8.4b Layer reorder → republish → the output repaints in the new order; a third cue on
      an already-live graphic REPLACES its layer rather than stacking.
- [ ] §8.5 Renderer reboot mid-show: kill the output tab/machine, reload — it snaps back to
      the pre-kill on-air state; commands sent while it was dead apply on reconnect, in order.
- [ ] §8.6 The `?control=` page from a phone (signed out) drives the same production; the
      live chip agrees on both surfaces.
- [ ] §8.7a OBS Browser Source with the output URL: 1920×1080 at the channel's FPS,
      transparent over a background source, and it repaints after "Refresh cache of current
      page". This is the OBS half of §8 step 7. It had no line here until 2026-09-10, so the
      route every student can do at their own desk (`docs/DEMO_2026-09-25.md` A3) had no box to
      tick anywhere; the owner has done it and nothing recorded it.
- [ ] §8.7 CasparCG channel restart with the URL loaded (`CG 1-20 ADD 1 "<url>" 1`):
      transparent, correct scale at 1920×1080, recovers after `RESTART`.
- [ ] §8.8 Unpublish → both URLs go dead honestly; republish → the output URL is unchanged.
- [ ] Verbs under load: run the rundown at real operating tempo (stepper hammering included)
      and confirm the 50-commands-per-5-s cap is not hit by one operator + one renderer.

## 2. The export door on real hardware (the no-account path)

**Round 1 findings (owner, 2026-08-04) — all four boxes FAILED, root-caused and fixed
2026-08-05; re-test against a build carrying those fixes:**

- A PUBLISHED production's package baked the hosted-log receiver into every graphic; its boot
  recovery snapped the graphic to its last reported (off) state one RPC round-trip after the
  host's `play()` — seen as "flashes in then disappears" in both CasparCG and SPX. Fixed: the
  production package never carries the receiver (the playout host is the controller); pinned
  by `e2e/shows.spec.ts`.
- Every graphic exported as `index.html`, so SPX rundowns listed every template as "index".
  Fixed: `<slug>/<slug>.html`, and production packages assign each graphic its own playout
  layer (previously all playlayer 7 — two templates in one rundown evicted each other).
- `controlpanel.html` opened from disk did nothing and still claimed a connection. The earlier
  parenthetical here ("BroadcastChannel needs both files opened from the same place — the
  README says so") was DOUBLY false: the README did not say so, and "same place" is not
  enough — Chrome gives every `file://` page a private opaque origin, so two local files can
  NEVER pair, and a graphic inside OBS/vMix/CasparCG runs a separate browser engine a normal
  browser tab cannot reach at all. Fixed: the panel detects silence (no state reply to its
  hello) and says so; READMEs state the same-origin http requirement; every package ships
  GETTING-ON-AIR.md. The full offline local-control answer (a bundled localhost service +
  launcher + the shared production controller) is the follow-up program in flight.

**Round 2 findings (owner, 2026-08-05) — the CasparCG package PASSED on the real server;
two things around it did not, both fixed the same day:**

- The production zip had no `Start controller.cmd`, **and GETTING-ON-AIR.md told the reader to
  double-click one.** Only the HTML-overlay flavour bundles the relay + launchers (SPX and
  CasparCG carry none on purpose — the playout host is the controller there), but one guide
  text served every flavour. A guide naming a missing file reads as a broken export. Fixed:
  `onAirGuideMd({ localController })` describes only what the caller actually bundled, the
  no-launcher flavours instead say what DOES steer them (the SPX rundown, a CasparCG client)
  and point at the overlay target for a double-click operator page, and the launcher filename
  now appears only in packages that carry it. The export dialog says per target who controls
  the graphics. Pinned by `e2e/exports.spec.ts` + `e2e/shows.spec.ts`.
- **Nothing in a package said which field id was which.** A CasparCG client sends `f0`, and
  only the app knew `f0` was the title and `f1` the name. Fixed: every package — all six
  single-graphic targets and both production builders — ships **FIELDS.md**
  (`src/export/fieldReference.ts`): the ID/field/type/default table, dropdown values, image-slot
  and step notes, and paste-ready JSON + CasparCG `componentData` payloads built from the
  graphic's own ids. A production's root FIELDS.md indexes every graphic by its playout layer.

- [ ] CasparCG export: load the package from disk on the real server (the README's
      channel-layer-BEFORE-ADD incantation), fonts render, fields update, plays clean —
      including from a PUBLISHED production's package. *(Round 2: PASSED for a production
      package on the owner's server.)*
- [ ] FIELDS.md against a real client: open a production package's `FIELDS.md` beside the
      CasparCG client, type into the ids it lists, and confirm each one lands in the field the
      table names.
- [ ] **The hosted control page's own UI** (docs/PLAYOUT_DASHBOARD.md). It was rebuilt from a
      per-graphic form into the dashboard - two monitors, verb bar, cue rundown - and the
      offline suite cannot reach it (the route needs a configured backend, so this page has
      always lived on this checklist). Publish a production, open the control link on a phone
      AND a laptop at once, and confirm: both monitors render, PROGRAM recovers what is
      already on air when the page opens cold, a take on one device moves the other's PROGRAM
      monitor and tally, and a field typed on one appears staged on the other.
- [ ] SPX export: import into a real SPX rundown; templates listed by their own names;
      play/continue/stop from SPX; two templates from one production on air together
      (distinct layers).
- [ ] The HTML overlay in OBS as a LOCAL browser source (`file://` path): transparent, fonts
      correct, autoplays. Driving it live requires the same-origin http setup (or the hosted
      page) — confirm the bundled panel's no-listener banner appears over `file://` instead
      of a false "connected".
- [ ] **The launcher path** (the shipped answer to round 1's dead panel): double-click
      "Start controller.cmd" in an overlay/production package — the relay starts, the
      controller opens; point an OBS browser source at
      `http://localhost:<port>/<graphic>/<graphic>.html?stream=program` and confirm it does
      NOT autoplay, → Preview shows the cue on the PVW monitor only, ⟳ Take airs it in OBS,
      Out/All out clear it, and a relay restart mid-show keeps working (relay-log.jsonl).
- [ ] Whole-production export served over a local http address: `show_controlpanel.html`
      drives every graphic of the package independently from that origin.
- [ ] The production export target picker: download the same production as SPX, CasparCG and
      HTML overlay; spot-check one CasparCG file plays on the server.

## 3. Production-length soak (one real show's length, hours)

- [ ] The output URL stays connected for the full length: heartbeat stays fresh, no visual
      degradation, memory stable in the browser source.
- [ ] The action log stays usable (200-row cap, 7-day prune) and the operator page stays
      responsive late in the show.
- [ ] A renderer reboot mid-soak recovers (the §8.5 drill, but hours in).

## 4. Recovery drills observed live (classroom failures, each SEEN handled)

- [ ] Operator browser refresh mid-show: the production page comes back knowing what is on
      air (an ON AIR row per live layer) and the rundown selection survives.
- [ ] Edit a cue, republish mid-show: the output updates in place, nothing else replays.
- [ ] Expired session mid-show: the prompt names it, nothing local is lost, re-sign-in
      resumes (the automated twin is configured/account.spec.ts — observe it once for real).
- [ ] Wrong take on air → Out that layer / All out under pressure (the automated twin is
      productions.spec.ts — do it once on the real output).

## 5. People

- [ ] The owner walks the Done-when sentence end to end on real CasparCG AND OBS, through
      BOTH doors (publish and export), timed — under 5 minutes.
- [ ] A first-time user (never seen NoaCG) walks the same path, timed; every point of
      friction goes on a list, and blockers are fixed before acceptance.

## 6. Housekeeping before the verdict

- [ ] `supabase` advisors clean (or findings triaged in writing).
- [ ] The nightly suite green on the focus areas the morning after the soak.
- [ ] Waivers, if any, written into this file with a reason and an owner.
