---
kind: walk
date: 2026-09-19
because: taste
serves: now
---
# Home and the wizard wear the same top bar, so the logo stops jumping

## Before

Pressing **+ New graphic** on Home opened the wizard full-screen over it. The wizard is not a new
page in the usual sense: `.wz-modal` covers the viewport exactly and Home stays mounted
underneath, so the brand lockup is not redrawn somewhere else, it is **replaced in its own
corner**. Measured at 1366x768:

| | Home `.topbar` | Wizard `.wz-header` |
|---|---|---|
| bar height | 53px | 69px |
| padding | 10px 16px | 18px 28px |
| gap | 6px | 20px |
| logo, top-left | x 20, y 14 | x 32, y 22 |

So on that one press the logo moved 12px right and 8px down and the bar grew 16px. Every one of
those deltas was header padding and nothing else - both bars carry the same 32px content row (the
✕ here, a button there) and the same `BrandLogo size={24}` inside the same `.brand-home`.

## After

The wizard's header takes the topbar's `10px 16px`. The logo lands at x 20, y 14 and the bar at
53px on **both** surfaces - not approximately, identically - so the lockup does not move at all.

The gap is 14px rather than the topbar's 6px. That 6px is the EDITOR shell's crowding compromise
below 1400px; this bar has about 500px of slack and copying a compromise buys nothing. 14px is the
number `.topbar` itself uses whenever it is allowed to, which is above 1520px - including a
projector at 1920, where the two then match exactly.

The Feedback button was the one control on both bars that was 3px bigger in the wizard
(`.fb-open`'s 12px lost to `.wz-wizard button`'s 15px). It is back to 12px in the wizard header.

The rule is scoped twice, and both scopes are load-bearing:

- **`.wz-wizard`** keeps the ten-odd dialogs that borrow `.wz-header` - Settings, Save, Export,
  Community - on their roomier `18px 28px`. They are dialogs and should read as dialogs. The
  full-screen wizard is a PAGE, which is the whole argument for its header being a topbar.
- **`min-width: 769px`** keeps `mobile.css`'s `.wz-header { padding: 12px 14px }` winning on a
  phone, which a bare `.wz-wizard .wz-header` would outrank on specificity whatever the file order.

Nothing states a background: `.wz-modal` is already `--bg-2`, the same colour the topbar paints,
and a second place holding one colour is how two surfaces drift apart later.

## Route (under a minute)

1. `npm run dev:worktree`, open `/app`, and go **Home** (the button in the wizard header).
2. Look at the NoaCG lockup in the top-left corner, then press **+ New graphic**.
   - **Before:** the logo hopped down and to the right as the bar got taller.
   - **Now:** it does not move. Press **Home** and **+ New graphic** a few times in a row - the
     content below changes and the corner is still.
3. Open **Settings** from Home: its dialog header is unchanged, still the roomier padding.
4. Narrow the window under 768px: the wizard header keeps its own phone padding.

## What I saw when I did this myself

Driven in the running app at 1366x768, reading the live boxes rather than the stylesheet. In the
wizard: bar 53px, logo (20,14). Pressing Home: bar 53px, logo (20,14). Delta zero on all three.
The entry step gained the 16px the header gave up - the gap under the video strip went from 118px
to 134px - so the step has more air, not less.

## What I decided, and what is left for your eye

- **14px gap, not the topbar's 6.** The two bars carry different controls after the logo, so no
  gap makes them coincide; this one is chosen on the wizard's own merits.
- **The separator dot is left alone.** Home draws it 4px from the logo, the wizard 10px, in two
  near-identical greys. Once the logo and the bar height stop moving, a 6px shift of a 4px glyph
  is under the threshold, and the wizard's spacing is its own "lockup · what you are making"
  reading. Say the word if your eye catches it on the projector.

## What changed

`src/styles/wizard-and-dialogs.css` adds one `@media (min-width: 769px)` block scoping the topbar's
padding and a 14px gap to `.wz-wizard .wz-header`, plus the Feedback button's own size back. The
reasoning is commented there. `e2e/wizard-shell.spec.ts` pins it: the two bars must report the same
height and the same logo position, and a Settings dialog header must still be `18px 28px` - so a
later change that drops the scope fails rather than silently reshaping every dialog.
