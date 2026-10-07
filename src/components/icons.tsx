import type { ReactNode, SVGProps } from 'react';

/**
 * The hand-rolled inline SVG icon set (docs/GOALS_ARCHIVE.md "Student release" step 8): Home and the
 * production surfaces stop using pictographic emoji, which render as coloured cartoons, differ
 * per platform, and read as anything but broadcast software. These are monochrome stroke
 * icons drawing `currentColor`, so they follow the surrounding text's colour like a glyph —
 * no icon font, no dependency, offline like everything else.
 *
 * Monochrome VERB glyphs (▶ ■ » ⟳ ✎ ⧉ ✕ ↑ ↓ ● ○ ＋) are not emoji and deliberately stay:
 * they are the operator vocabulary shared with the editor's transport and the exported
 * control panels.
 *
 * `Svg` is exported as the ONE wrapper every drawn icon set uses (the wizard's entry icons
 * draw on it at their own size and stroke), so the grid, the round joins and the a11y
 * attributes are stated once.
 */
export function Svg({ size = 16, children, ...rest }: { size?: number; children: ReactNode } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ verticalAlign: '-2px', flex: 'none' }}
      {...rest}
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number } & SVGProps<SVGSVGElement>;

/** A production / playout output. */
export function IconTv(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M9 21h6M12 18v3" />
    </Svg>
  );
}

/** A flat library folder (Home's light grouping — not the retired packages). */
export function IconFolder(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </Svg>
  );
}

/** The graphics library. */
export function IconGrid(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </Svg>
  );
}

/** The library's dense table view — the ▦/☰ toggle's other half. */
export function IconList(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  );
}

/** Video projects. */
export function IconFilm(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4" />
    </Svg>
  );
}

/** Brand looks. */
export function IconPalette(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h6.5A2.5 2.5 0 0 0 21 9.5 8.7 8.7 0 0 0 12 3Z" />
      <path d="M7.5 10.5h.01M11 7h.01M16 7h.01" strokeWidth={2.6} />
    </Svg>
  );
}

/** Settings. */
export function IconSliders(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h10M18 17h2" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="16" cy="17" r="2" />
    </Svg>
  );
}

/** Export / download. */
export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />
    </Svg>
  );
}

/** Rename / edit. */
export function IconPencil(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m15 5 4 4L8 20l-5 1 1-5L15 5Z" />
    </Svg>
  );
}

/** Duplicate. */
export function IconCopy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </Svg>
  );
}

/** Delete. */
export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </Svg>
  );
}

/** Community / published online. */
export function IconGlobe(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </Svg>
  );
}

/** Copy a URL. */
export function IconLink(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 14a4 4 0 0 0 6 .4l3-3a4 4 0 1 0-5.7-5.6L11.9 7" />
      <path d="M14 10a4 4 0 0 0-6-.4l-3 3a4 4 0 1 0 5.7 5.6l1.4-1.2" />
    </Svg>
  );
}

/** Create. */
export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/** The overflow menu. */
export function IconDots(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1" strokeWidth={2.4} />
      <circle cx="12" cy="12" r="1" strokeWidth={2.4} />
      <circle cx="19" cy="12" r="1" strokeWidth={2.4} />
    </Svg>
  );
}

/** "View all →" and other forward links. */
export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  );
}

/** Operate / control panel. */
export function IconPlay(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4.8v14.4L19 12 7 4.8Z" />
    </Svg>
  );
}

/** The editor (Advanced mode's door). */
export function IconCode(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
    </Svg>
  );
}

/** Import / upload. */
export function IconUpload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 15V5m0 0 4 4m-4-4-4 4M5 19h14" />
    </Svg>
  );
}

/** The per-graphic operator panel (faders). */
export function IconControl(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4v6m0 4v6M12 4v10m0 4v2M18 4v2m0 4v10" />
      <path d="M4 10h4M10 14h4M16 6h4" />
    </Svg>
  );
}

/** A team - two people. Teams are the only surface that uses it (docs/TEAMS_PLAN.md §6). */
/** An explanation behind a press (home/InfoTip). */
export function IconInfo(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </Svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 6.2M17.5 14.6a5.5 5.5 0 0 1 3 4.9" />
    </Svg>
  );
}

/** Pick a colour from anywhere on screen (the Style surfaces' eyedropper). */
export function IconEyedropper(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17.5 3.5a2.1 2.1 0 0 1 3 3l-2.6 2.6 1 1-1.9 1.9-1-1L8.4 18.6l-3.6.9.9-3.6 7.6-7.6-1-1L14.2 5.4l1 1z" />
    </Svg>
  );
}
