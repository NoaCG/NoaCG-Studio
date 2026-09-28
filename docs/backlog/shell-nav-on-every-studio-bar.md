# Put the shared shell nav on every studio bar, not only Home and the wizard

**Filed:** 2026-09-28. **Source:** row A of the 2026-09-28 wave (wizard entry nav), owner feedback
the same day: "Wizard/Home share one top bar where logo, Home and + New graphic sit in the same
positions and the CURRENT page is shown as current and is not a clickable button."

## Why

Home's topbar and the wizard header now wear one group, `.shell-nav` (styles/app-shell.css): the
logo, Home and + New graphic with their own spacing and box, so the doors sit at the same pixels
on both surfaces and the page you stand on is an `aria-current="page"` item rather than a button
(pinned by e2e/wizard-shell.spec.ts). The other studio bars still hand-lay the same three
controls on the bar's own gap and the topbar's button ladder, so moving from Home to a production,
a control page, the video shell or the editor shifts Home and + New graphic by a few pixels and
restyles them. The owner's complaint was exactly that lurch between surfaces.

Row A left them alone on purpose: the owner was editing Playout in another worktree, and the
production dashboard and the control page are Playout surfaces.

## What it would take

- `src/components/home/ProductionPage.tsx` (the `.pd-header` bar, about line 3357, and the
  not-found bar about line 1473), `src/components/home/GraphicControlPage.tsx` (about lines 332
  and 622 - note the control page puts a `divider-dot` AFTER the door), `src/components/video/VideoAppShell.tsx`
  (about line 160) and `src/components/AppShell.tsx` (about line 334): wrap logo, dot, the Home
  button and `NewGraphicButton` in `<nav className="shell-nav" aria-label="Studio">`, give the
  two doors `className="shell-door"`, and keep each surface's existing testids.
- On those surfaces neither door is the current page, so both stay buttons; nothing needs
  `aria-current`.
- Extend the pixel comparison in e2e/wizard-shell.spec.ts (or project.spec.ts's
  `orderOnEverySurface` loop) to measure the Home and + New graphic boxes on every surface.
- Check the production dashboard's own header rules (`.pd-header`, playout-dashboard.css hides
  the lockup type under a width) still hold with the group.

## Evidence

- e2e/wizard-shell.spec.ts "the wizard header and the Home topbar are the same bar, to the pixel"
  measures logo, Home and + New graphic at 1100, 1366 and 1600px.
- e2e/project.spec.ts "the wizard door is on every /app surface, beside Home" pins the ORDER on
  every surface but not the geometry.
