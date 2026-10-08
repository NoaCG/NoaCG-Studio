// The SHOW data layer (Phase 5). A show is the rundown-level unit: an ORDERED set of
// graphics that run together on air (bug + lower third + ticker), each keeping its own
// state machine. Its control page aggregates every graphic's controls — the single-graphic
// case is just a show of one. Shows reuse the packet manager's storage conventions
// (localStorage, updatedAt for LWW sync, soft-delete tombstones) so the cloud sync engine
// can adopt the kind without a second pattern.

import type { SpxTemplate, ProductionSounds } from './types';
import { firstIndexById, type SavedGraphic } from './packets';
import type { ProjectBrand } from './brand';
import type { JsonObject, ProductionBindings } from './productionData';
import type { ShowProfile } from './profile';
import { readShowProfile, serializeShowProfile } from './profile';
import { canAuthorAccount, conditionalDurableWrite, durable, type ConditionalWriteResult } from './durableStore';
import { replaceRundown, type RundownSlice } from './rundownHistory';
import { uuid } from './id';
import { accentColor, readOutputSetup, type ProductionOutputSetup, type RundownColors } from './outputSetup';
import { loadTeamShows, teamShowIds, writeTeamShow } from './teamShows';
import {
  appendCue,
  foldSelection,
  insertAfter,
  leaveFolders,
  liveFolderIds,
  nextFolderName,
  placeInOrder,
  placeRefusal,
  PLACE_GONE,
  pruneFolders,
  settleFolders,
  stepInOrder,
  throughRefusal,
  unfold,
  type Movable,
  type Place,
} from './showFolders.ts';
import { cutPlaceRefusal, pasteCopies, type CueClip } from './cueClipboard.ts';
import { cueShortcutIdentity, normalizeCueShortcut } from './cueShortcuts.ts';

/**
 * One prepared, orderable data row of a production — "what airs next", not a graphic.
 * Cues are data rows OVER the graphic pool (`Show.graphics`): many cues may point at the
 * same pool graphic (`sourceId`), which is how one lower third airs Anna at cue 2 and Ben
 * at cue 7 without a second copy of the template (docs/CLOUD_PLAYOUT.md §2).
 */
export interface ShowCue {
  /** Optional production-owned direct trigger, e.g. v or shift+f. */
  hotkey?: string;
  /** Optional visual highlight only; never a route or tally color. */
  accentColor?: string;
  /** Still-picture presentation. Absent means Fit; applied only by the next Take. */
  imageFit?: 'fit' | 'stretch';
  id: string;
  /** The pool entry this cue drives (SavedGraphic.id) - or, when `source` is `playout`, the
   *  PlayoutItem (Show.playoutItems) it drives. */
  sourceId: string;
  /** ADDITIVE OPTIONAL. Absent = a cue over a pool graphic, as every cue was before 2026-09-22.
   *  `playout` = a cue over an item in the playout server's own library (docs/BRIDGE.md §5):
   *  it airs through NoaCG Bridge as one command, not through the output URL. */
  source?: 'playout';
  /** The operator-facing name — "Anna Andersson — Presenter". */
  label: string;
  /** fieldId -> value, the cue's prepared data. A cue OWNS its values (an entry is only a
   *  starting point — editing a cue never writes back to a ControlEntry). */
  values: Record<string, string>;
  /** Operator note shown in the rundown. */
  note?: string;
  /** ADDITIVE OPTIONAL. How THIS cue plays its server clip (docs/CLIP_PLAYBACK_PLAN.md §7): what
   *  the file IS stays on its PlayoutItem, shared by every cue of it; how one cue plays it lives
   *  here. Absent on every cue saved before 2026-09-28, which plays exactly as it always did. */
  playback?: CuePlayback;
  /** ADDITIVE OPTIONAL. The folder this cue is in (`Show.folders`, docs/CLIP_PLAYBACK_PLAN.md §7).
   *  Absent = in none, which is every cue saved before 2026-09-28. One that names no folder of the
   *  record reads as in none (./showFolders.ts). */
  folderId?: string;
  /** ADDITIVE OPTIONAL. How this GRAPHIC cue ends by itself (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0
   *  and §2.2). Absent = manual, which is how every cue saved before it keeps behaving. A server
   *  cue never carries one: a clip's ending is its `playback.end`. */
  auto?: CueAuto;
}

/** What a timed cue does when its time is up: play its layer off, take the next graphic cue in the
 *  rundown, or both in that order (the editor says Out, Next cue, Out and next cue). */
export type CueEnd = 'out' | 'next' | 'out-next';

/** A timed cue's end (docs/RUNDOWN_AUTOMATION_PLAN.md §2.2, as §2.0 narrows it to graphics). */
export interface CueAuto {
  /** Seconds after the cue is ON AIR (§2.0's anchor, never the Take press): 0.5 to 86400, at most
   *  one decimal (control/cueAuto.ts `cleanAfter`). */
  after: number;
  then: CueEnd;
}

/**
 * A FOLDER OF THE RUNDOWN (docs/CLIP_PLAYBACK_PLAN.md §6.6 and §7): cues that belong together, and
 * how one Take plays them. It holds no list of its cues: each cue names its folder, and a folder's
 * cues stand together in `Show.cues`, where the first of them places it. Folders do not nest, and a
 * folder no cue names reads as absent. ADDITIVE OPTIONAL on the record, like cues.
 */
export interface ShowFolder {
  id: string;
  name: string;
  /** One by one: tidiness, every cue taken on its own. Play through: one Take plays its clips in
   *  order on the folder's one slot. All together: one Take starts every cue in it. */
  mode: 'manual' | 'through' | 'together';
  /** Play through only: the sequence starts over after its last clip, until Out. Absent = the last
   *  clip ends by its own setting. */
  end?: 'loop';
  /** Play through only: the one slot its clips play on. A part left out is the clip default: layer
   *  10 (PLAYOUT_CLIP_LAYER) on the studio's clip channel. */
  slot?: { channel?: number; layer?: number };
  /** Its cues are hidden in the rundown. */
  collapsed?: boolean;
}

/** A fade's length as the operator picks it. Short is half a second and Long one second
 *  (control/cuePlayback.ts `FADE_SECONDS`), converted to the channel's frames by the Bridge. */
export type ClipFade = 'short' | 'long';

/**
 * How one cue plays its server clip or audio file (docs/CLIP_PLAYBACK_PLAN.md §6.5 and §7). Every
 * field is optional and a missing one is the default: hold the last frame, cut in and out, 0 dB,
 * the whole file.
 */
export interface CuePlayback {
  /** What happens at the end. Absent = hold, unless the legacy `PlayoutItem.loop` says loop
   *  (control/cuePlayback.ts `effectiveEnd`). This build writes it explicitly once the operator
   *  chooses, and never writes `PlayoutItem.loop`. `next` plays the next clip on the same slot. */
  end?: 'hold' | 'clear' | 'loop' | 'next';
  fadeIn?: ClipFade;
  fadeOut?: ClipFade;
  /** -60 to +6 dB; absent = 0 dB. Applies at the next Take, as the clip's own audio filter. */
  levelDb?: number;
  /** Where the clip starts and ends, seconds into the file; absent = its start and its end. */
  trimIn?: number;
  trimOut?: number;
}

/** A field a server template takes, as the cue editor offers it: the id on the wire (`f0`),
 *  the operator's word for it, and its default. The same three things FIELDS.md documents. */
export interface PlayoutField {
  field: string;
  title: string;
  value: string;
}

/**
 * An item that lives in the PLAYOUT SERVER's own library rather than in NoaCG: an HTML
 * template or a clip on a CasparCG server, listed through NoaCG Bridge and cued from the
 * rundown beside the production's own graphics (docs/BRIDGE.md §5). NoaCG stores the NAME and
 * where it plays; the file never travels. ADDITIVE OPTIONAL on the Show record.
 */
/** The server's own word for a media file, from its list (`CLS`). */
export type PlayoutMediaKind = 'movie' | 'still' | 'audio';

export interface PlayoutItem {
  id: string;
  /** Which kind of playout system. Only `casparcg` exists today; OBS and vMix add their own. */
  adapter: 'casparcg';
  kind: 'template' | 'media';
  /** The server's own name: a template id as it lists templates, a clip name as it lists media. */
  name: string;
  /** The layer it plays on. A template takes the next free layer like a graphic does; a clip
   *  plays on the shared clip layer below every graphic (PLAYOUT_CLIP_LAYER). */
  layer: number;
  /** ADDITIVE OPTIONAL. The CasparCG channel it plays on, picked in the cue editor from the
   *  channels the studio names in Settings -> Playout. Absent = the studio's GRAPHICS channel,
   *  which is where every item saved before 2026-09-23 has always played, so an old record reads
   *  unchanged. A plain number, not a reference to a Settings row: the record syncs to machines
   *  whose studio may name its channels differently, and CasparCG only knows the number. */
  channel?: number;
  /** ADDITIVE OPTIONAL, LEGACY since 2026-09-28. A clip that LOOPS: its Take sends CasparCG's own
   *  `PLAY … LOOP`. Written by builds from 2026-09-25 to 2026-09-27 and still READ, for every cue
   *  of the item that has no ending of its own (`ShowCue.playback.end`, control/cuePlayback.ts
   *  `effectiveEnd`). This build never writes it, and removes it once every cue of the item has an
   *  explicit ending, so an older build can still turn a loop on for cues nobody set here and can
   *  never re-enable one this build turned off. A template never carries it. */
  loop?: boolean;
  /** ADDITIVE OPTIONAL. What a media file is, in the server's own word from its list. An audio
   *  file plays on its own layer (PLAYOUT_AUDIO_LAYER) and a still never ends, so it holds and never
   *  joins a sequence. Absent on items saved before 2026-09-28: resolved from the server's list
   *  before the cue can join a sequence, and otherwise treated as a movie. */
  mediaKind?: PlayoutMediaKind;
  /** A clip's length, when the server reported one. */
  frames?: number;
  fps?: number;
  /** A template's fields, when known: from NoaCG's own library when it made the template, else
   *  what the operator typed. A clip has none. */
  fields?: PlayoutField[];
}

/** One column of a production dataset. `key` is the stable id values are stored under;
 *  `label` is what the operator reads AND what field binding matches against (a column named
 *  like a field's title loads into that field — visible, deterministic, no mapping UI). */
export interface DatasetColumn {
  key: string;
  label: string;
}

/** One row of a production dataset — column key -> value, all strings (the same currency as
 *  cue values and SPX fields, so a row loads into a cue with no conversion layer). */
export interface DatasetRow {
  id: string;
  values: Record<string, string>;
}

/**
 * A production-owned DATA TABLE (docs/INTERACTIVE_PLAYOUT_PLAN.md, D3): a quiz's question
 * bank, a match's teams, a roster — the show's working data, editable in the Data workspace
 * and loaded into cues by DELIBERATE operator action, never a live wire. Lives inside the
 * Show record (ADDITIVE OPTIONAL, rule 6): it syncs with the production, works offline, and
 * needs no server table. `kind` only picks the starter columns and the workspace's wording —
 * the shape is one honest table either way.
 */
export interface ShowDataset {
  id: string;
  name: string;
  kind: 'quiz' | 'teams' | 'roster' | 'generic';
  columns: DatasetColumn[];
  rows: DatasetRow[];
}

export interface Show {
  /** Absent is legacy; an empty destination list is a new, unchosen output. */
  outputSetup?: ProductionOutputSetup;
  rundownColors?: RundownColors;
  id: string;
  name: string;
  /** Format stamp. Absent = a pre-stamp record, normalized to 2 on read and written on every
   *  save. A no-op today - it exists so a FUTURE breaking change has a field to bump and
   *  migrate on (`root/version-every-persisted-format-ship-breaking`); 2 matches the packet
   *  lineage this store follows. */
  version?: 2;
  /** The production's LOOK (palette + font + style family) - the unified brand its graphics
   *  share. Set when a kit creates the production or from the first graphic added; the wizard
   *  pre-applies it when creating a graphic FOR this production. Absent = none chosen (the
   *  global project brand stays the default outside a production). ADDITIVE OPTIONAL - an
   *  older build reads and rewrites the record untouched. */
  look?: ProjectBrand;
  /** The BRAND this production is in, by saved-look id (model/brand.ts). The wizard's chooser
   *  preselects it when a graphic is created FOR this production, and "Apply brand to all
   *  graphics" sets it.
   *
   *  It sits BESIDE `look` rather than replacing it, and when both exist the REFERENCE wins: a
   *  reference stays right when the brand is edited, while `look` is a copy taken from whichever
   *  graphic happened to be added first. `look` remains the fallback for every production that
   *  never chose a brand - which is all of them until somebody does. ADDITIVE OPTIONAL
   *  (`root/version-every-persisted-format-ship-breaking`): absent = no brand chosen, an older build reads and rewrites the record
   *  untouched. */
  brandId?: string;
  /** The graphic POOL — which templates the production can air, each once. The order here is
   *  authoring order, NOT the layer stack: a graphic airs on the layer NUMBER its own entry
   *  carries (`graphicLayer`), which is what every z-order consumer reads. */
  graphics: SavedGraphic[];
  /** The cue rundown, in playout order (docs/CLOUD_PLAYOUT.md). ADDITIVE OPTIONAL — an older
   *  build reads and rewrites the record untouched; absent = no cues authored. */
  cues?: ShowCue[];
  /** The rundown's FOLDERS (ShowFolder). ADDITIVE OPTIONAL: an older build keeps the flat order and
   *  rewrites them untouched, and the published page, the export and a pack never carry them. */
  folders?: ShowFolder[];
  /** The production's DATA TABLES (the Data workspace — docs/INTERACTIVE_PLAYOUT_PLAN.md D3).
   *  ADDITIVE OPTIONAL like cues; absent = none authored. */
  datasets?: ShowDataset[];
  /** Items of the playout server's library that this production cues (PlayoutItem). ADDITIVE
   *  OPTIONAL - an older build reads and rewrites the record untouched, and its rundown simply
   *  shows those cues as pointing at nothing it knows. */
  playoutItems?: PlayoutItem[];
  /**
   * The production-data SEED (docs/PRODUCTION_DATA_PLAN.md §2.1) — the tree this production
   * STARTS from, and what "Reset" returns the live tree to. Authored, so it travels: it syncs,
   * duplicates and exports with the record.
   *
   * The LIVE tree is deliberately NOT here (model/productionState.ts says why at length): it
   * moves at feed rate, and this record syncs last-write-wins with conflict copies that drop
   * the production's slugs. ADDITIVE OPTIONAL — absent = no data authored.
   */
  data?: JsonObject;
  /** Field BINDINGS: graphic name -> field id -> production-data path. A bound field takes its
   *  value from the live tree at Take and on every change, never from a stored cue value
   *  (docs/PRODUCTION_DATA_PLAN.md §2.7). ADDITIVE OPTIONAL. */
  bindings?: ProductionBindings;
  /**
   * The production's CONTROL PROFILE (model/profile.ts; docs/CONTROL_PANEL_ANY_GRAPHIC.md §6e) —
   * how THIS production arranges the controls its graphics already declare: order, section,
   * shown name, hidden, pinned, per pool graphic per control id. (Its second primitive, COMBINE,
   * was removed on 2026-10-02; a stored `combine` list is ignored on read.)
   *
   * ADDITIVE OPTIONAL on the same precedent as `bindings` — an older build reads and rewrites the
   * record untouched, and ABSENT means no profile, which is the generated panel exactly as the
   * machines declare it. It carries its OWN `v` inside itself, so adding it never bumps
   * `Show.version`.
   *
   * ALWAYS read it through `readShowProfile`, never straight off the record: that is what turns a
   * profile written by a newer build into READ-ONLY rather than into a crash or, worse, into
   * silent data loss the first time an older build saves the show.
   */
  profile?: ShowProfile;
  /**
   * Run a vote board's percentage FIGURES live while the vote is open, instead of holding them
   * for Show result (the owner's ruling, 2026-08-30 — see setShowPollLiveFigures below). It
   * travels to the graphic as an ordinary field value on the staged cue, never as a second
   * mechanism: `tallyValues` writes it and the board's own runtime obeys it
   * (templates/importedDesign/pollBehaviour.ts).
   *
   * ADDITIVE OPTIONAL, and ABSENT MEANS OFF — which is what every existing production did.
   */
  pollLiveFigures?: boolean;
  /** The hosted control page's capability slug, once published (control/hostedControl.ts).
   *  Kept on the record so the URL survives reloads and the show export can bake the hosted
   *  receiver into its graphics. Rotating/unpublishing clears it. */
  hostedSlug?: string;
  /** The browser-output URL's capability slug, once published (docs/CLOUD_PLAYOUT.md §3).
   *  ADDITIVE OPTIONAL, stripped from conflict copies exactly like hostedSlug. */
  outputSlug?: string;
  /** When the operator first TOOK the output URL for this production (ISO) - copied the link or
   *  downloaded the template file. Publishing mints the slug whether or not anybody wants an
   *  output, so the slug cannot answer "is there an output here"; this can. The production
   *  page's renderer heartbeat is a question about a browser source somebody set up, so it is
   *  asked only once one has been set up (or has ever reported in). ADDITIVE OPTIONAL. */
  outputOpenedAt?: string;
  /** The PUBLIC audience URL's capability slug (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 5,
   *  migration 0035) — what a viewer's phone opens at `/join/<slug>`. Minted by the database at
   *  publish and read back, never chosen here. */
  joinSlug?: string;
  /** The PRESENTER view's own capability slug (`/join?pv=<slug>`) — a read-only window onto
   *  what the operator has lined up, deliberately a different capability from the join link so
   *  handing a presenter their page never hands them the audience's, or the reverse. */
  presenterSlug?: string;
  /** When the hosted pages were last published (ISO). The output payload is PINNED at publish,
   *  so updatedAt > publishedAt means the renderer and operators run an older snapshot — the
   *  production page's "changes not yet published" hint reads exactly this. */
  publishedAt?: string;
  /** When the show last changed (ISO). Bumped on every mutation; drives cloud sync (LWW). */
  updatedAt: string;
  /** Soft-delete tombstone (hidden from the UI, kept so the delete syncs). See Packet.deleted. */
  deleted?: boolean;
  /**
   * The TEAM that holds this production (docs/TEAMS_PLAN.md §4), present only on a record read
   * from the server's `team_productions` - the column there is the authority, and this is a copy
   * of it so every reader can tell a team production from a personal one without asking.
   *
   * NEVER PERSISTED HERE. `saveAll` routes a record carrying it to the in-memory team store
   * (model/teamShows.ts) instead of this browser's own list, and the server save strips it
   * (backend/teamProductions.ts `teamDoc`), so neither plane stores a second copy of the answer.
   * ADDITIVE OPTIONAL: absent means a personal production, which is every record written before.
   */
  teamId?: string;
}

const SHOWS_KEY = 'spx-gfx-shows';

const nowIso = () => new Date().toISOString();

/** See packets.ts BACKFILL_TS — a stable old timestamp for records saved before updatedAt. */
const BACKFILL_TS = '1970-01-01T00:00:00.000Z';

function notifyDataChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('spx-data-changed'));
  }
}

/**
 * Persist a list the save envelope read and mutated.
 *
 * TWO DESTINATIONS. A record carrying `teamId` is a team production and goes back to the in-memory
 * team store, which pushes a changed one to the server (model/teamShows.ts); everything else is
 * this browser's own list. A personal record HIDDEN behind a team production of the same id - the
 * tombstone a move leaves behind - is never handed to a mutator (`readEditable` skips it), so it is
 * carried over from what is stored rather than dropped: that tombstone is how the move reaches
 * this account's other devices.
 */
function saveAll(list: Show[]): string | null {
  if (!canAuthorAccount()) return 'Account editing is paused. Sign in again; pending work is preserved.';
  const personal: Show[] = [];
  for (const show of list) {
    if (show.teamId) writeTeamShow(show);
    else personal.push(show);
  }
  const shadowed = teamShowIds();
  if (shadowed.size > 0) {
    const present = new Set(personal.map((s) => s.id));
    for (const hidden of loadAllShows()) {
      if (shadowed.has(hidden.id) && !present.has(hidden.id)) personal.push(hidden);
    }
  }
  try {
    durable.setItem(SHOWS_KEY, JSON.stringify(personal));
    notifyDataChanged();
    return null;
  } catch {
    return 'Browser storage is full — remove a graphic from the show or delete an old show.';
  }
}

/** All PERSONAL shows INCLUDING tombstones — for the sync engine, which must never see a team
 *  production (TEAMS_PLAN §2: team rows live outside the LWW mirror). Back-fills a stable sync
 *  timestamp and normalizes the format stamp on read (pure read-shape: no updatedAt bump, so a
 *  record never looks freshly edited just because a newer build read it). */
export function loadAllShows(): Show[] {
  try {
    const list = JSON.parse(durable.getItem(SHOWS_KEY) ?? '[]') as Show[];
    return list.map((s) => ({ ...s, version: 2 as const, updatedAt: s.updatedAt || BACKFILL_TS }));
  } catch {
    return [];
  }
}

/**
 * What the UI and every mutator below edit: this browser's own productions, then the team
 * productions this tab holds. ONE HOME PER PRODUCTION (TEAMS_PLAN §4): a production moved into a
 * team keeps its id - the published links are keyed by it - so a personal record with a team
 * record's id is the move's tombstone and stays out of sight here.
 */
function readEditable(): Show[] {
  const team = loadTeamShows();
  if (team.length === 0) return loadAllShows();
  const ids = new Set(team.map((s) => s.id));
  return [...loadAllShows().filter((s) => !ids.has(s.id)), ...team];
}

/** Live shows for the UI (tombstones hidden), team productions included. */
export function loadShows(): Show[] {
  return readEditable().filter((s) => !s.deleted);
}

/** Personal inverse only: compare the real database document, never the optimistic mirror. */
export async function restorePersonalRundown(
  showId: string, expected: RundownSlice, replacement: RundownSlice, stillValid: () => boolean,
): Promise<ConditionalWriteResult> {
  return conditionalDurableWrite(SHOWS_KEY, current => {
    const all = JSON.parse(current ?? '[]') as Show[];
    if (!Array.isArray(all)) return { refused: 'The stored productions could not be read safely.' };
    const at = all.findIndex(s => s.id === showId);
    const show = all[at];
    if (!show || show.version !== 2 || show.teamId || teamShowIds().has(showId)) return { refused: 'The production changed or is no longer editable here.' };
    const result = replaceRundown(show, expected, replacement);
    if (!result.show) return { refused: result.refused! };
    all[at] = result.show;
    return { value: JSON.stringify(all) };
  }, () => stillValid() && !teamShowIds().has(showId));
}

/** The live productions whose pool holds a copy of this LIBRARY graphic (SavedGraphic's
 *  `graphicId` back-link) - "in 2 productions" on a Home row, and the guard that says what a
 *  library delete would orphan. */
export function productionsContaining(graphicId: string): Show[] {
  return loadShows().filter((s) => s.graphics.some((g) => g.graphicId === graphicId));
}

/**
 * WHAT A PRODUCTION NOBODY NAMED IS CALLED.
 *
 * Deliberately plain. A default that reads as a deliberate name teaches the reader nothing; one
 * that reads as "you have not named this yet" is the invitation to name it.
 */
const UNTITLED_PRODUCTION = 'Untitled production';

/**
 * THE NAME A PRODUCTION WILL ACTUALLY BE SAVED UNDER, answered before it exists.
 *
 * Every write goes through `createShowNamedChecked` below, which applies the same floor - but a
 * confirmation dialog has to PRINT the destination a press is about to create, and at that
 * moment there is no record to read it off. So the policy is a pure function both callers share,
 * rather than a constant each of them re-applies: the sentence on screen and the row on disk
 * cannot then disagree, and a floor that later grows (deduplication, say) grows for both at once.
 *
 * The defect it closes: the wizard's Finish step filled an empty production box with the
 * GRAPHIC's name, so a first import produced a graphic called "Imported SVG design" sitting in a
 * production also called "Imported SVG design" (e2e/import-svg.spec.ts, "an unnamed production is
 * not named after the graphic"). A show holding one strap is not called "Interview strap". The
 * floor was already the app's answer everywhere else and that door never let it be reached.
 */
export function resolveShowName(name: string): string {
  return name.trim() || UNTITLED_PRODUCTION;
}

export function createShow(name: string): Show[] {
  createShowNamed(name);
  return loadShows();
}

/**
 * Create a production and return the RECORD itself - the wizard's kit and Finish doors need
 * the new id to navigate to, and `createShow` above only returns the list.
 *
 * `createShowNamedChecked` is the form that reports a FAILED write, and every caller that then
 * navigates to the new production should use it: on a full quota the row never persists, so the
 * very next `addGraphicToShow` reports "That show no longer exists" - true, but a description of
 * a symptom rather than of what went wrong. `createShowNamed` stays for the callers that go on
 * to make a checked write anyway (their own error is the one that matters).
 */
export function createShowNamedChecked(name: string): { show: Show; error: string | null } {
  const show: Show = {
    id: uuid(),
    name: resolveShowName(name),
    version: 2,
    graphics: [],
    outputSetup: { v: 1, destinations: [] },
    updatedAt: nowIso(),
  };
  const all = loadAllShows();
  all.push(show);
  return { show, error: saveAll(all) };
}

/** Personal rehearsal copy. Internal identifiers are production-scoped, so retaining them
 * keeps every folder, source and profile reference intact, as existing conflict copies do. */
export function duplicateShowChecked(sourceId: string): { show: Show | null; error: string | null } {
  const source = loadShows().find(s => s.id === sourceId);
  if (!source) return { show: null, error: 'That production no longer exists.' };
  const copy = structuredClone(source);
  copy.id = uuid();
  copy.name = `${source.name} copy`;
  copy.updatedAt = nowIso();
  delete copy.teamId;
  delete copy.hostedSlug;
  delete copy.outputSlug;
  delete copy.joinSlug;
  delete copy.presenterSlug;
  delete copy.publishedAt;
  delete copy.outputOpenedAt;
  delete copy.deleted;
  const all = loadAllShows();
  all.push(copy);
  return { show: copy, error: saveAll(all) };
}

export function createShowNamed(name: string): Show {
  return createShowNamedChecked(name).show;
}

/** Insert or replace a whole show by id (the storage seam's put('show'), incl. tombstones). */
export function upsertShow(show: Show): void {
  upsertShows([show]);
}

/** Insert or replace many shows in ONE write (the storage seam's putMany; `upsertGraphics` says
 *  why a sync pull must not rewrite the whole list once per record). Returns the save's error. */
export function upsertShows(shows: Show[]): string | null {
  const all = loadAllShows();
  const at = firstIndexById(all);
  for (const show of shows) {
    const i = at.get(show.id);
    if (i !== undefined) all[i] = show;
    else {
      at.set(show.id, all.length);
      all.push(show);
    }
  }
  return saveAll(all);
}

/**
 * Add the current graphic to a show. Same rule as packets: a graphic with the same NAME is
 * replaced in place (adding twice = updating it, keeping its rundown position); a new name
 * appends at the end of the rundown.
 */
export function addGraphicToShow(
  showId: string,
  template: SpxTemplate,
  opts?: { graphicId?: string | null },
): { shows: Show[]; error: string | null } {
  const all = readEditable();
  if (!canAuthorAccount()) return { shows: all.filter(s => !s.deleted), error: 'Account editing is paused. Sign in again; pending work is preserved.' };
  const show = all.find((s) => s.id === showId && !s.deleted);
  if (!show) return { shows: all.filter((s) => !s.deleted), error: 'That show no longer exists.' };
  const existing = show.graphics.findIndex((g) => g.name === template.name);
  const graphic: SavedGraphic = {
    // Replacing by name KEEPS the pool entry's id — cues reference it (ShowCue.sourceId), so
    // updating a graphic must never orphan the cues prepared against it.
    id: existing >= 0 ? show.graphics[existing].id : uuid(),
    name: template.name,
    type: template.type,
    savedAt: nowIso(),
    template,
    ...(existing >= 0 && show.graphics[existing].soundConfig ? { soundConfig: show.graphics[existing].soundConfig } : {}),
    // Which LIBRARY record this copy came from, when the document was a saved graphic - the
    // link the hosted control page follows to publish that graphic's entries.
    ...(opts?.graphicId ? { graphicId: opts.graphicId } : {}),
    // The playout layer (docs/PLAYOUT_DASHBOARD.md §5). A REPLACEMENT keeps whatever the
    // operator chose — re-adding an edited graphic must not silently move it off its layer
    // mid-show. A NEW graphic takes the next free number from 20 up, so no two graphics of a
    // production ever start on one layer: two on the same layer replace each other on air, and
    // there is no reason to begin from a state the operator then has to repair.
    layer: existing >= 0 ? graphicLayer(show.graphics[existing]) : nextFreeLayer(show.graphics),
  };
  if (existing >= 0) show.graphics[existing] = graphic;
  else {
    show.graphics.push(graphic);
    // A new pool graphic starts with one cue seeded from its field defaults, so the cue
    // rundown is never empty-but-working (docs/CLOUD_PLAYOUT.md §2).
    show.cues = [
      ...(show.cues ?? []),
      { id: uuid(), sourceId: graphic.id, label: template.name, values: seedValues(template.fields) },
    ];
  }
  show.updatedAt = nowIso();
  return { shows: all.filter((s) => !s.deleted), error: saveAll(all) };
}

export function removeShowGraphic(showId: string, graphicId: string): Show[] {
  return removeShowGraphicChecked(showId, graphicId).shows;
}

export function removeShowGraphicChecked(showId: string, graphicId: string): { shows: Show[]; error: string | null } {
  return patchShowChecked(showId, show => {
    if (!show.graphics.some(g => g.id === graphicId)) return false;
    show.graphics = show.graphics.filter((g) => g.id !== graphicId);
    // Cues over a removed pool graphic have nothing left to drive — they go with it.
    if (show.cues?.length) show.cues = show.cues.filter((c) => c.sourceId !== graphicId);
    pruneShowFolders(show);
    return true;
  });
}

// ── Cues (docs/CLOUD_PLAYOUT.md §2) ──────────────────────────────────────────

/** A folder is never empty, and no cue names a folder that is gone (./showFolders.ts): what every
 *  write that removes cues runs in the same write. Nothing is reordered. */
function pruneShowFolders(show: Show): void {
  if (!show.folders && !show.cues?.some((c) => c.folderId)) return;
  const pruned = pruneFolders(show.cues ?? [], show.folders);
  if (!pruned.changed) return;
  show.cues = [...pruned.cues];
  if (pruned.folders.length) show.folders = [...pruned.folders];
  else delete show.folders;
}

/** The mutator envelope, once: resolve the LIVE (non-tombstoned) record, run the mutation,
 *  stamp + persist only when it reports a change, return the visible list. Hand-rolling this
 *  per mutator is how four of the first five cue mutators forgot the tombstone guard. */
/**
 * One write against one show, stamped with ONE timestamp.
 *
 * The mutator receives that timestamp because a stamp of its own would be a DIFFERENT
 * millisecond: `setShowOutputSlug` set `publishedAt = nowIso()` here and the write below then
 * set `updatedAt = nowIso()` again, so a clock tick between two adjacent statements left
 * `updatedAt > publishedAt` — and the production page reads exactly that comparison as "the
 * production changed after the last publish". Publishing could therefore tell the operator to
 * publish again, immediately, about a change nobody made. Rare enough to pass in isolation
 * almost always, which is how it survived until a loaded suite hit the boundary.
 */
function patchShow(showId: string, mutate: (show: Show, at: string) => boolean): Show[] {
  return patchShowChecked(showId, mutate).shows;
}

/** Fresh whole-record write; an async upload cannot overwrite another tab's sound changes. */
export function setGraphicSounds(showId: string, graphicId: string, sounds: ProductionSounds, expected: string): { shows: Show[]; error: string | null } {
  return patchShowChecked(showId, show => {
    const graphic = show.graphics.find(g => g.id === graphicId);
    if (!graphic) throw new Error('This visual was removed.');
    if (JSON.stringify(graphic.soundConfig ?? null) !== expected) throw new Error('Sounds changed elsewhere. Choose the trigger again.');
    graphic.soundConfig = sounds;
    return true;
  });
}

/** `patchShow`, answering too whether the write was refused on the spot (a full store): what a
 *  folder write that tells the operator anything reports, with `commitDurableWrites` after it. */
function patchShowChecked(showId: string, mutate: (show: Show, at: string) => boolean): { shows: Show[]; error: string | null } {
  const all = readEditable();
  if (!canAuthorAccount()) return { shows: all.filter(s => !s.deleted), error: 'Account editing is paused. Sign in again; pending work is preserved.' };
  const show = all.find((s) => s.id === showId && !s.deleted);
  let error: string | null = null;
  if (show) {
    const at = nowIso();
    if (mutate(show, at)) {
      show.updatedAt = at;
      error = saveAll(all);
    }
  }
  return { shows: all.filter((s) => !s.deleted), error };
}

/** A cue's starting values: the template's own field defaults (what update() falls back to). */
export function seedValues(fields: SpxTemplate['fields']): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) values[f.field] = f.value ?? '';
  return values;
}

/** The playout item a cue drives, when it is that kind of cue. */
export function playoutItemOf(show: Pick<Show, 'playoutItems'>, cue: Pick<ShowCue, 'sourceId' | 'source'>): PlayoutItem | null {
  if (cue.source !== 'playout') return null;
  return show.playoutItems?.find((i) => i.id === cue.sourceId) ?? null;
}

/** A playout template's fields as cue values: every field at its default. */
function seedPlayoutValues(item: PlayoutItem): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of item.fields ?? []) values[f.field] = f.value;
  return values;
}

/** Append a cue for a pool graphic - or for a playout item, which the same id space names.
 *  `seed` prefills label/values (e.g. from a ControlEntry - a starting point only; the cue owns
 *  its values from here on). An append never lands in a folder. `after` puts it right after that
 *  cue instead, in that cue's folder: where Duplicate puts its copy (docs/CLIP_PLAYBACK_PLAN.md §7). */
export function addShowCue(
  showId: string,
  sourceId: string,
  seed?: { label?: string; values?: Record<string, string>; note?: string; playback?: CuePlayback; auto?: CueAuto; accentColor?: string },
  after?: string,
): { shows: Show[]; cueId: string | null } {
  let cueId: string | null = null;
  const shows = patchShow(showId, (show) => {
    const source = show.graphics.find((g) => g.id === sourceId);
    const item = source ? null : (show.playoutItems?.find((i) => i.id === sourceId) ?? null);
    if (!source && !item) return false;
    const cue: ShowCue = {
      id: uuid(),
      sourceId,
      ...(item ? { source: 'playout' as const } : {}),
      label: seed?.label?.trim() || (source ? source.name : item!.name),
      values: { ...(source ? seedValues(source.template.fields) : seedPlayoutValues(item!)), ...(seed?.values ?? {}) },
      ...(seed?.note ? { note: seed.note } : {}),
      ...(accentColor(seed?.accentColor) ? { accentColor: accentColor(seed?.accentColor) } : {}),
      // A duplicated server cue plays its clip the same way: the copy is of the cue, settings too.
      ...(item && seed?.playback && Object.keys(seed.playback).length ? { playback: { ...seed.playback } } : {}),
      // A duplicated timed graphic cue keeps its timing, as a copied one does (model/cueClipboard.ts).
      ...(!item && seed?.auto ? { auto: { ...seed.auto } } : {}),
    };
    // After `after`, in its folder, so the folder's run goes on through the copy; else at the end.
    show.cues = after === undefined ? appendCue(show.cues ?? [], cue) : insertAfter(show.cues ?? [], after, cue);
    cueId = cue.id;
    return true;
  });
  return { shows, cueId };
}

/** Clips share one layer below every graphic, on purpose: one clip at a time, and a strap
 *  never disappears behind a rolling VT (docs/BRIDGE.md §5). */
export const PLAYOUT_CLIP_LAYER = 10;
/** Audio files have their own layer, below the clips: a sting never knocks a VT off, and a music
 *  bed survives both (docs/CLIP_PLAYBACK_PLAN.md §6.6). */
export const PLAYOUT_AUDIO_LAYER = 5;

/** Where a new server item goes when nobody says: a template on the next free layer counted across
 *  graphics and templates, a clip on the clip layer, an audio file on the audio layer - never on
 *  `avoid`, the NoaCG output's layer when the item is on the output's channel. */
function defaultItemLayer(item: Pick<PlayoutItem, 'kind' | 'mediaKind'>, show: Show, items: readonly PlayoutItem[], avoid: number | undefined): number {
  if (item.kind !== 'media') {
    return nextFreeLayer([...show.graphics, ...items.filter((i) => i.kind === 'template'), ...(avoid === undefined ? [] : [{ layer: avoid }])]);
  }
  const layer = item.mediaKind === 'audio' ? PLAYOUT_AUDIO_LAYER : PLAYOUT_CLIP_LAYER;
  return layer === avoid ? layer + 1 : layer;
}

/**
 * Put an item of the playout server's library into the production, with one cue on it - the
 * same shape addGraphicToShow gives a graphic, so the rundown is never empty-but-working. The
 * same NAME and kind is one item (adding twice keeps its cues); a template takes the next free
 * layer counted across graphics AND templates, a clip the shared clip layer. The CHANNEL is the
 * caller's to give, from the studio's defaults (playoutLink.ts `defaultChannelFor`), because
 * the record does not know the studio; none given stores none, which means the output's channel.
 * `output` is the NoaCG output's slot: a default never puts a server item on it, since playing it
 * there would replace the output.
 */
export function addPlayoutItem(
  showId: string,
  item: Omit<PlayoutItem, 'id' | 'layer'> & { layer?: number },
  { output }: { output?: { channel: number; layer: number } } = {},
): { shows: Show[]; cueId: string | null } {
  const result = addPlayoutItems(showId, [item], { output });
  return { shows: result.shows, cueId: result.cueIds[0] ?? null };
}

/** Append a picker batch in one production edit, reusing each file's stable pool entry. */
export function addPlayoutItems(
  showId: string,
  batch: readonly (Omit<PlayoutItem, 'id' | 'layer'> & { layer?: number })[],
  { output }: { output?: { channel: number; layer: number } } = {},
): { shows: Show[]; cueIds: string[]; error: string | null } {
  const cueIds: string[] = [];
  const { shows, error } = patchShowChecked(showId, (show) => {
    if (!batch.length) return false;
    for (const item of batch) {
      const items = show.playoutItems ?? [];
      let entry = items.find((i) => i.adapter === item.adapter && i.kind === item.kind && i.name === item.name);
      if (!entry) {
        // The output's layer is taken only on the output's own channel; no channel means that one.
        const avoid = output && (item.channel ?? output.channel) === output.channel ? output.layer : undefined;
        entry = { ...item, id: uuid(), layer: item.layer ?? defaultItemLayer(item, show, items, avoid) };
        show.playoutItems = [...items, entry];
      } else {
        if (item.fields && !entry.fields?.length) entry.fields = item.fields;
        // An item saved before the server's kind was kept learns it the next time it is picked.
        if (item.mediaKind && !entry.mediaKind) entry.mediaKind = item.mediaKind;
      }
      const cue: ShowCue = {
        id: uuid(),
        sourceId: entry.id,
        source: 'playout',
        label: entry.name.split('/').pop() || entry.name,
        values: seedPlayoutValues(entry),
      };
      show.cues = [...(show.cues ?? []), cue];
      cueIds.push(cue.id);
    }
    return true;
  });
  return { shows: error ? loadShows() : shows, cueIds: error ? [] : cueIds, error };
}

/** The range a CasparCG channel number lives in, here and in Settings -> Playout. A studio with
 *  more than a handful is rare; the bound is what keeps a stored number one every reader honours. */
export const MIN_PLAYOUT_CHANNEL = 1;
export const MAX_PLAYOUT_CHANNEL = 99;

/** Move a playout item to another CasparCG channel (the cue editor's channel pick). A number
 *  outside the range is refused rather than stored, so the record never says one channel while
 *  every verb plays on another. */
export function setPlayoutItemChannel(showId: string, itemId: string, channel: number): Show[] {
  return patchShow(showId, (show) => {
    const item = show.playoutItems?.find((i) => i.id === itemId);
    if (!item || !Number.isInteger(channel) || channel < MIN_PLAYOUT_CHANNEL || channel > MAX_PLAYOUT_CHANNEL) return false;
    item.channel = channel;
    return true;
  });
}

/** Turn looping on or off for a server clip (the cue editor's Loop box). Only a clip loops;
 *  the flag is dropped rather than stored as false, so a clip that never looped stays byte for
 *  byte the record it was. */
export function setPlayoutItemLoop(showId: string, itemId: string, loop: boolean): Show[] {
  return patchShow(showId, (show) => {
    const item = show.playoutItems?.find((i) => i.id === itemId);
    if (!item || item.kind !== 'media') return false;
    if (loop) item.loop = true;
    else delete item.loop;
    return true;
  });
}

/** What a media file is, learnt from the server's list for an item saved before the kind was kept
 *  (or chosen under Advanced when the list does not have it). A fact about the FILE, so every cue
 *  of the item sees it. */
export function setPlayoutItemMediaKind(showId: string, itemId: string, mediaKind: PlayoutMediaKind): Show[] {
  return patchShow(showId, (show) => {
    const item = show.playoutItems?.find((i) => i.id === itemId);
    if (!item || item.kind !== 'media' || item.mediaKind === mediaKind) return false;
    item.mediaKind = mediaKind;
    return true;
  });
}

export function setCueImageFit(showId: string, cueId: string, imageFit: 'fit' | 'stretch'): Show[] {
  return patchShow(showId, show => {
    const cue = show.cues?.find(c => c.id === cueId);
    if (!cue || (cue.imageFit ?? 'fit') === imageFit) return false;
    if (imageFit === 'fit') delete cue.imageFit;
    else cue.imageFit = imageFit;
    return true;
  });
}

/** What the server's list says of media files older items saved without, by item id: their kind
 *  and length, in one write. Only a missing fact is filled, so nothing the operator chose is
 *  overwritten. */
export function fillPlayoutItemFacts(
  showId: string,
  facts: ReadonlyMap<string, { mediaKind?: PlayoutMediaKind; frames?: number; fps?: number }>,
): Show[] {
  return patchShow(showId, (show) => {
    let changed = false;
    for (const item of show.playoutItems ?? []) {
      const f = facts.get(item.id);
      if (!f || item.kind !== 'media') continue;
      if (f.mediaKind && !item.mediaKind) {
        item.mediaKind = f.mediaKind;
        changed = true;
      }
      if (f.frames && f.fps && !(item.frames && item.fps)) {
        item.frames = f.frames;
        item.fps = f.fps;
        changed = true;
      }
    }
    return changed;
  });
}

/**
 * Change how ONE cue plays its server clip (docs/CLIP_PLAYBACK_PLAN.md §7). A field set to `null`
 * goes back to its default and is removed, so a cue at every default carries no `playback` at all
 * and reads as the record it was.
 *
 * THE LOOP RULE. This never writes `PlayoutItem.loop`. It removes it once every cue of the item has
 * an ending of its own, since nothing reads it then: an older build that ticks its Loop box again
 * can therefore turn a loop on only for cues that never had an ending chosen here.
 */
export function setCuePlayback(
  showId: string,
  cueId: string,
  patch: { [K in keyof CuePlayback]?: CuePlayback[K] | null },
): Show[] {
  return patchShow(showId, (show) => {
    const cue = show.cues?.find((c) => c.id === cueId);
    if (!cue || cue.source !== 'playout') return false;
    const next: Record<string, unknown> = { ...(cue.playback ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) delete next[key];
      else next[key] = value;
    }
    if (Object.keys(next).length) cue.playback = next as CuePlayback;
    else delete cue.playback;
    const item = show.playoutItems?.find((i) => i.id === cue.sourceId);
    if (item?.loop && (show.cues ?? []).filter((c) => c.sourceId === item.id).every((c) => c.playback?.end !== undefined)) {
      delete item.loop;
    }
    return true;
  });
}

/**
 * Time ONE graphic cue, or make it manual again with `null` (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0).
 * A server cue refuses: build 1 times graphics only. The record's version stays 2, since the field
 * is additive, and an older build carries it through untouched (updateShowCue mutates in place).
 */
export function setCueAuto(showId: string, cueId: string, auto: CueAuto | null): Show[] {
  return patchShow(showId, (show) => {
    const cue = show.cues?.find((c) => c.id === cueId);
    if (!cue || cue.source === 'playout') return false;
    if (auto) cue.auto = { after: auto.after, then: auto.then };
    else delete cue.auto;
    return true;
  });
}

/** Move a playout item to another layer (the cue editor's layer box). */
export function setPlayoutItemLayer(showId: string, itemId: string, layer: number): Show[] {
  return patchShow(showId, (show) => {
    const item = show.playoutItems?.find((i) => i.id === itemId);
    if (!item) return false;
    item.layer = Math.min(MAX_PLAYOUT_LAYER, Math.max(MIN_PLAYOUT_LAYER, Math.round(layer) || PLAYOUT_CLIP_LAYER));
    return true;
  });
}

/** Replace a template item's fields - what the operator typed for a template NoaCG did not
 *  make. Every cue on it gains the new fields at their defaults and loses none of its values. */
export function setPlayoutItemFields(showId: string, itemId: string, fields: PlayoutField[]): Show[] {
  return patchShow(showId, (show) => {
    const item = show.playoutItems?.find((i) => i.id === itemId);
    if (!item) return false;
    item.fields = fields;
    for (const cue of show.cues ?? []) {
      if (cue.sourceId !== itemId) continue;
      for (const f of fields) if (!(f.field in cue.values)) cue.values[f.field] = f.value;
    }
    return true;
  });
}

/** Remove a playout item and every cue prepared against it. */
export function removePlayoutItem(showId: string, itemId: string): Show[] {
  return removePlayoutItemChecked(showId, itemId).shows;
}

export function removePlayoutItemChecked(showId: string, itemId: string): { shows: Show[]; error: string | null } {
  return patchShowChecked(showId, (show) => {
    if (!show.playoutItems?.some((i) => i.id === itemId)) return false;
    show.playoutItems = show.playoutItems.filter((i) => i.id !== itemId);
    show.cues = (show.cues ?? []).filter((c) => c.sourceId !== itemId);
    pruneShowFolders(show);
    return true;
  });
}

/** Patch a cue's label / values / note in place. Values merge per field. */
export function updateShowCue(
  showId: string,
  cueId: string,
  patch: { label?: string; values?: Record<string, string>; note?: string | null },
): Show[] {
  return updateShowCueChecked(showId, cueId, patch).shows;
}

/** A draft is cleared only after this write succeeds; a refused write keeps it recoverable. */
export function updateShowCueChecked(
  showId: string,
  cueId: string,
  patch: { label?: string; values?: Record<string, string>; note?: string | null },
): { shows: Show[]; error: string | null } {
  return patchShowChecked(showId, (show) => {
    const cue = show.cues?.find((c) => c.id === cueId);
    if (!cue) return false;
    if (patch.label !== undefined) cue.label = patch.label;
    if (patch.values) cue.values = { ...cue.values, ...patch.values };
    if (patch.note === null) delete cue.note;
    else if (patch.note !== undefined) cue.note = patch.note;
    return true;
  });
}

/** Set or clear a cue's shortcut (model/cueShortcuts.ts). A key another cue holds is refused,
 *  unless `move` says to take it from that cue in the same write ("Move it here"). */
export function setCueShortcut(showId: string, cueId: string, value: string | null, options: { move?: boolean } = {}): { shows: Show[]; error: string | null } {
  return patchShowChecked(showId, show => {
    const cue = show.cues?.find(c => c.id === cueId);
    if (!cue) throw new Error('This cue was removed.');
    const key = value === null ? null : normalizeCueShortcut(value);
    if (value !== null && !key) throw new Error('That key cannot be a shortcut.');
    const holders = key ? (show.cues ?? []).filter(c => {
      const other = c.id !== cueId ? normalizeCueShortcut(c.hotkey) : null;
      return !!other && cueShortcutIdentity(other) === cueShortcutIdentity(key!);
    }) : [];
    if (holders.length && !options.move) throw new Error(`Used by ${holders[0].label}`);
    for (const holder of holders) delete holder.hotkey;
    if (key) cue.hotkey = key; else delete cue.hotkey;
    return true;
  });
}

/**
 * Replace the WHOLE cue rundown in one write - the pack installer's ordered-rundown path
 * (src/packs/graphicsPack.ts): a pack may carry one cue list ORDERED ACROSS graphics (the
 * show walk), which per-cue appends cannot express without a reorder dance. Every entry must
 * reference a pool graphic; an unknown sourceId refuses the whole write, because a rundown
 * that "mostly installed" would air with rows silently missing. Values seed from the source
 * template's defaults exactly as addShowCue seeds them.
 */
export function setShowCues(
  showId: string,
  cues: Array<{ sourceId: string; label: string; values?: Record<string, string>; note?: string; accentColor?: string }>,
): { shows: Show[]; error: string | null } {
  let error: string | null = null;
  const shows = patchShow(showId, (show) => {
    const bySource = new Map(show.graphics.map((g) => [g.id, g]));
    const missing = cues.find((c) => !bySource.has(c.sourceId));
    if (missing) {
      error = `The cue "${missing.label}" points at a graphic that is not in the pool.`;
      return false;
    }
    show.cues = cues.map((c) => {
      const source = bySource.get(c.sourceId)!;
      return {
        id: uuid(),
        sourceId: c.sourceId,
        label: c.label.trim() || source.name,
        values: { ...seedValues(source.template.fields), ...(c.values ?? {}) },
        ...(c.note ? { note: c.note } : {}),
        ...(accentColor(c.accentColor) ? { accentColor: accentColor(c.accentColor) } : {}),
      };
    });
    // A pack carries no folders, so the new rundown is in none, and a folder left naming no cue goes.
    pruneShowFolders(show);
    return true;
  });
  return { shows, error };
}

/** Move a cue one slot up or down the rundown. One step never splits a folder (./showFolders.ts
 *  `stepInOrder`): inside a folder the cue swaps with its neighbour there, at the folder's edge it
 *  steps out of the folder where it stands, and outside one it steps over a whole folder at once. On
 *  a rundown with no folders it is the plain swap it always was. */
export function moveShowCue(showId: string, cueId: string, dir: -1 | 1): Show[] {
  return patchShow(showId, (show) => {
    const cues = show.cues ? stepInOrder(show.cues, show.folders, cueId, dir) : null;
    if (!cues) return false;
    show.cues = cues;
    pruneShowFolders(show);
    return true;
  });
}

/**
 * THE DRAG'S ONE WRITE (docs/CLIP_PLAYBACK_PLAN.md §7): move a cue, or a whole folder, to a place in
 * the rundown and set or clear the cue's folder in the same write, so a team production saves one
 * change however far the row went. It gathers a folder an older build split, never nests a folder,
 * and removes one the move empties. A cue that cannot play through is refused at a Play-through
 * folder's door, and `refused` says why, naming it.
 */
export function moveInRundown(showId: string, what: Movable, place: Place): { shows: Show[]; refused: string | null; error: string | null } {
  let refused: string | null = null;
  const { shows, error } = patchShowChecked(showId, (show) => {
    refused = placeRefusal(show, what, place);
    if (refused) return false;
    const moved = placeInOrder(show.cues ?? [], show.folders, what, place);
    if (!moved) return false;
    show.cues = moved;
    pruneShowFolders(show);
    return true;
  });
  return { shows, refused, error };
}

/**
 * PASTE (docs/CLIP_PLAYBACK_PLAN.md §20.2), one write: copies land as new cues (./cueClipboard.ts),
 * and a cut MOVES the cues it holds, with their ids, as a dragged selection would. A paste into
 * another production than the one copied from, inside what was cut, or where a drop would be refused
 * is refused and writes nothing. `cueIds`: the cues it pasted, for the page to select.
 */
export function pasteInRundown(showId: string, clip: CueClip, place: Place): { shows: Show[]; refused: string | null; error: string | null; cueIds: string[] } {
  let refused: string | null = null;
  let cueIds: string[] = [];
  const { shows, error } = patchShowChecked(showId, (show) => {
    if (clip.showId !== showId) {
      refused = 'Cues paste into the production they were copied from.';
      return false;
    }
    if (clip.kind === 'cut') {
      const ids = clip.ids.filter((id) => show.cues?.some((c) => c.id === id));
      refused = !ids.length ? 'What was cut is no longer in the rundown.' : (cutPlaceRefusal(show.cues ?? [], ids, place) ?? placeRefusal(show, { cueIds: ids }, place));
      // The drag's sentence, in a paste's words.
      if (refused === PLACE_GONE) refused = 'The row to paste after has gone. Select a row and paste again.';
      if (refused) return false;
      const moved = placeInOrder(show.cues ?? [], show.folders, { cueIds: ids }, place);
      cueIds = ids;
      if (!moved) return false;
      show.cues = moved;
      pruneShowFolders(show);
      return true;
    }
    const pasted = pasteCopies(show, clip, place, uuid);
    if ('refused' in pasted) {
      refused = pasted.refused;
      return false;
    }
    show.cues = pasted.cues;
    show.folders = pasted.folders;
    pruneShowFolders(show);
    cueIds = pasted.added;
    return true;
  });
  return { shows, refused, error, cueIds };
}

/** Take these cues out of their folders, one write: each goes right after what stays of its folder,
 *  in no folder; a folder they empty goes, its cues standing where they were. */
export function takeCuesOutOfFolders(showId: string, cueIds: readonly string[]): { shows: Show[]; error: string | null } {
  return patchShowChecked(showId, (show) => {
    const cues = leaveFolders(show.cues ?? [], show.folders, cueIds);
    if (!cues) return false;
    show.cues = cues;
    pruneShowFolders(show);
    return true;
  });
}

/** Remove several cues in one write, by the rules one removal follows (`removeShowCue`): a graphic
 *  or server item left with no cue goes with them, and so does a folder. */
export function removeShowCues(showId: string, cueIds: readonly string[]): Show[] {
  return removeShowCuesChecked(showId, cueIds).shows;
}

export function removeShowCuesChecked(showId: string, cueIds: readonly string[]): { shows: Show[]; error: string | null } {
  const gone = new Set(cueIds);
  return patchShowChecked(showId, (show) => {
    const removed = (show.cues ?? []).filter((c) => gone.has(c.id));
    if (!removed.length) return false;
    show.cues = (show.cues ?? []).filter((c) => !gone.has(c.id));
    const used = new Set(show.cues.map((c) => c.sourceId));
    const orphaned = new Set(removed.map((c) => c.sourceId).filter((id) => !used.has(id)));
    show.graphics = show.graphics.filter((g) => !orphaned.has(g.id));
    if (show.playoutItems) show.playoutItems = show.playoutItems.filter((i) => !orphaned.has(i.id));
    pruneShowFolders(show);
    return true;
  });
}

/** Put a cue last in a folder, taking it out of any other: a drop on a collapsed folder's header,
 *  and the cue menu's "Move into". */
export function moveCueIntoFolder(showId: string, cueId: string, folderId: string): { shows: Show[]; refused: string | null; error: string | null } {
  return moveInRundown(showId, { cueId }, { into: folderId });
}

/**
 * Remove a cue - and, when it was its graphic's LAST cue, the pool graphic with it.
 *
 * The RUNDOWN is the whole truth about what a production holds (docs/PLAYOUT_DASHBOARD.md §5).
 * A pool graphic with no cues appears nowhere in it, yet it still ships in the published payload
 * and still loads as an iframe on its own layer in the output page - an orphan nobody could see
 * or reach once the layer list is gone. Pruning it here is what lets the rundown be the only list.
 */
export function removeShowCue(showId: string, cueId: string): Show[] {
  return patchShow(showId, (show) => {
    const cue = show.cues?.find((c) => c.id === cueId);
    if (!cue) return false;
    show.cues = (show.cues ?? []).filter((c) => c.id !== cueId);
    if (!show.cues.some((c) => c.sourceId === cue.sourceId)) {
      show.graphics = show.graphics.filter((g) => g.id !== cue.sourceId);
      // A playout item is pruned by the same rule: nothing survives out of sight of the rundown.
      if (show.playoutItems) show.playoutItems = show.playoutItems.filter((i) => i.id !== cue.sourceId);
    }
    // And a folder by the same rule again: its last cue gone, it goes too.
    pruneShowFolders(show);
    return true;
  });
}

// ── Folders (docs/CLIP_PLAYBACK_PLAN.md §6.5, §6.6 and §7) ───────────────────────────────────────
//
// A folder is made from cues and goes when its last cue leaves, so it is never empty and always has
// a place: its first cue's. Every write here keeps each folder's cues together (./showFolders.ts).

/** Why these cues cannot be in a Play-through folder, naming the first that cannot, or null. */
function throughProblem(show: Show, cueIds: readonly string[]): string | null {
  for (const id of cueIds) {
    const cue = show.cues?.find((c) => c.id === id);
    const why = cue ? throughRefusal(cue, show.playoutItems ?? []) : null;
    if (why) return why;
  }
  return null;
}

/**
 * NEW FOLDER FROM SELECTION: the chosen cues, in rundown order, become one folder, placed where the
 * first of them stood (right after another folder when that is inside one). It plays One by one until
 * the operator says otherwise, and takes a cue out of any folder it was in.
 */
export function addFolderFromSelection(showId: string, cueIds: readonly string[], name?: string): { shows: Show[]; folderId: string | null; error: string | null } {
  let folderId: string | null = null;
  const { shows, error } = patchShowChecked(showId, (show) => {
    const id = uuid();
    // Settled first, like every move: a folder an older build split is whole before it is cut from.
    const settled = settleFolders(show.cues ?? [], show.folders);
    const cues = foldSelection(settled.cues, new Set(cueIds), id);
    if (!cues) return false;
    const live = liveFolderIds(cues, settled.folders);
    const present = settled.folders.filter((f) => live.has(f.id));
    const folder: ShowFolder = { id, name: name?.trim() || nextFolderName(present), mode: 'manual' };
    show.cues = cues;
    show.folders = [...settled.folders, folder];
    pruneShowFolders(show);
    folderId = id;
    return true;
  });
  return { shows, folderId, error };
}

/** One folder of the record, when it has it. */
function folderOf(show: Show, folderId: string): ShowFolder | undefined {
  return show.folders?.find((f) => f.id === folderId);
}

export function renameFolder(showId: string, folderId: string, name: string): Show[] {
  return renameFolderChecked(showId, folderId, name).shows;
}

export function renameFolderChecked(showId: string, folderId: string, name: string): { shows: Show[]; error: string | null } {
  return patchShowChecked(showId, (show) => {
    const folder = folderOf(show, folderId);
    const next = name.trim();
    if (!folder || !next || folder.name === next) return false;
    folder.name = next;
    return true;
  });
}

/**
 * How a folder plays. Play through is refused while the folder holds anything but clips and audio
 * files, and the reason names the cue. A folder's end and slot stay when it plays another way, so
 * going back to Play through finds them as they were.
 */
export function setFolderMode(showId: string, folderId: string, mode: ShowFolder['mode']): { shows: Show[]; error: string | null } {
  let error: string | null = null;
  const shows = patchShow(showId, (show) => {
    const folder = folderOf(show, folderId);
    if (!folder || folder.mode === mode) return false;
    if (mode === 'through') {
      error = throughProblem(show, (show.cues ?? []).filter((c) => c.folderId === folderId).map((c) => c.id));
      if (error) return false;
    }
    folder.mode = mode;
    return true;
  });
  return { shows, error };
}

/**
 * A Play-through folder's end and slot (plan §6.5). `null` goes back to the default and removes the
 * field: the last clip's own ending, and the clip default slot (layer 10 on the clip channel). A
 * channel or layer outside its range is refused rather than stored.
 */
export function setFolderPlayback(
  showId: string,
  folderId: string,
  patch: { end?: 'loop' | null; channel?: number | null; layer?: number | null },
): Show[] {
  return patchShow(showId, (show) => {
    const folder = folderOf(show, folderId);
    if (!folder) return false;
    const inRange = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
    if (typeof patch.channel === 'number' && !inRange(patch.channel, MIN_PLAYOUT_CHANNEL, MAX_PLAYOUT_CHANNEL)) return false;
    if (typeof patch.layer === 'number' && !inRange(patch.layer, MIN_PLAYOUT_LAYER, MAX_PLAYOUT_LAYER)) return false;
    // What it was, so choosing what is already chosen writes nothing (and saves nothing to a team).
    const before = JSON.stringify([folder.end, folder.slot]);
    if (patch.end === 'loop') folder.end = 'loop';
    else if (patch.end === null) delete folder.end;
    const slot: { channel?: number; layer?: number } = { ...(folder.slot ?? {}) };
    for (const key of ['channel', 'layer'] as const) {
      const value = patch[key];
      if (value === null) delete slot[key];
      else if (value !== undefined) slot[key] = value;
    }
    if (Object.keys(slot).length) folder.slot = slot;
    else delete folder.slot;
    return JSON.stringify([folder.end, folder.slot]) !== before;
  });
}

/** Hide or show a folder's cues in the rundown. Kept on the record, so it follows the production. */
export function setFolderCollapsed(showId: string, folderId: string, collapsed: boolean): Show[] {
  return patchShow(showId, (show) => {
    const folder = folderOf(show, folderId);
    if (!folder || !!folder.collapsed === collapsed) return false;
    if (collapsed) folder.collapsed = true;
    else delete folder.collapsed;
    return true;
  });
}

/** Remove a folder and KEEP its cues, where they stand, in no folder: one write. */
export function removeFolder(showId: string, folderId: string): { shows: Show[]; error: string | null } {
  return patchShowChecked(showId, (show) => {
    if (!folderOf(show, folderId)) return false;
    show.cues = unfold(show.cues ?? [], folderId);
    show.folders = (show.folders ?? []).filter((f) => f.id !== folderId);
    pruneShowFolders(show);
    return true;
  });
}

// ── Datasets (the Data workspace — docs/INTERACTIVE_PLAYOUT_PLAN.md D3) ──────

/** Each kind's starter columns. Labels matter: field binding matches a column's LABEL against
 *  a field's TITLE (case-insensitive), so the quiz preset spells its columns exactly as the
 *  quiz templates title their fields — a fresh quiz bank loads into every board with zero
 *  setup. Teams/roster presets are authoring conveniences; their load story arrives with the
 *  sports pilot (Phase 4). */
const DATASET_PRESETS: Record<ShowDataset['kind'], { name: string; labels: string[] }> = {
  quiz: { name: 'Quiz questions', labels: ['Question', 'Answer A', 'Answer B', 'Answer C', 'Answer D', 'Correct answer'] },
  // ONE ROW IS ONE TEAM, and a two-team board has an A side and a B side — so these labels are
  // the SIDELESS half of a scoreboard's field titles ("Team A" minus the side is "Team"), which
  // is what lets the operator pick a side and load a row into it. Every column here binds a
  // real field; 'Code' was dropped because a starter column that matches nothing teaches the
  // wrong thing about how the binding works.
  teams: { name: 'Teams', labels: ['Team', 'Score', 'Team colour', 'Team logo'] },
  roster: { name: 'Line-up', labels: ['Name', 'Number', 'Position'] },
  generic: { name: 'Data table', labels: ['Column 1', 'Column 2', 'Column 3'] },
};

/**
 * A kind's starter columns, for anything that needs the SHAPE without creating a table - the
 * Data tab's downloadable CSV template being the one caller. It reads this table rather than
 * carrying its own list, so a template file can never describe a shape the workspace itself
 * would not have made, and adding a column above changes both at once.
 */
export function datasetPreset(kind: ShowDataset['kind']): { name: string; labels: string[] } {
  return DATASET_PRESETS[kind];
}

function datasetOf(show: Show, datasetId: string): ShowDataset | undefined {
  return show.datasets?.find((d) => d.id === datasetId);
}

/** Create a dataset with its kind's starter columns and one empty row to type into. */
export function addShowDataset(
  showId: string,
  kind: ShowDataset['kind'],
  name?: string,
): { shows: Show[]; datasetId: string | null } {
  let datasetId: string | null = null;
  const shows = patchShow(showId, (show) => {
    const preset = DATASET_PRESETS[kind];
    const columns = preset.labels.map((label, i) => ({ key: `c${i}`, label }));
    const dataset: ShowDataset = { id: uuid(), name: name?.trim() || preset.name, kind, columns, rows: [{ id: uuid(), values: {} }] };
    show.datasets = [...(show.datasets ?? []), dataset];
    datasetId = dataset.id;
    return true;
  });
  return { shows, datasetId };
}

export function renameShowDataset(showId: string, datasetId: string, name: string): Show[] {
  return patchShow(showId, (show) => {
    const ds = datasetOf(show, datasetId);
    if (!ds) return false;
    ds.name = name;
    return true;
  });
}

export function removeShowDataset(showId: string, datasetId: string): Show[] {
  return patchShow(showId, (show) => {
    if (!show.datasets?.some((d) => d.id === datasetId)) return false;
    show.datasets = show.datasets.filter((d) => d.id !== datasetId);
    return true;
  });
}

export function addDatasetRow(showId: string, datasetId: string): { shows: Show[]; rowId: string | null } {
  let rowId: string | null = null;
  const shows = patchShow(showId, (show) => {
    const ds = datasetOf(show, datasetId);
    if (!ds) return false;
    const row: DatasetRow = { id: uuid(), values: {} };
    ds.rows = [...ds.rows, row];
    rowId = row.id;
    return true;
  });
  return { shows, rowId };
}

/** Patch one row's cells (column key -> value; merge, like cue values). */
export function updateDatasetRow(
  showId: string,
  datasetId: string,
  rowId: string,
  values: Record<string, string>,
): Show[] {
  return patchShow(showId, (show) => {
    const row = datasetOf(show, datasetId)?.rows.find((r) => r.id === rowId);
    if (!row) return false;
    row.values = { ...row.values, ...values };
    return true;
  });
}

export function removeDatasetRow(showId: string, datasetId: string, rowId: string): Show[] {
  return patchShow(showId, (show) => {
    const ds = datasetOf(show, datasetId);
    if (!ds?.rows.some((r) => r.id === rowId)) return false;
    ds.rows = ds.rows.filter((r) => r.id !== rowId);
    return true;
  });
}

export function addDatasetColumn(showId: string, datasetId: string, label: string): Show[] {
  return patchShow(showId, (show) => {
    const ds = datasetOf(show, datasetId);
    if (!ds) return false;
    // Keys are minted monotonically, never reused: values live under keys, so a removed
    // column's data must not resurface under a later one's.
    const next = ds.columns.reduce((max, c) => Math.max(max, Number(c.key.slice(1)) + 1 || 0), 0);
    ds.columns = [...ds.columns, { key: `c${next}`, label: label.trim() || `Column ${ds.columns.length + 1}` }];
    return true;
  });
}

export function renameDatasetColumn(showId: string, datasetId: string, columnKey: string, label: string): Show[] {
  return patchShow(showId, (show) => {
    const col = datasetOf(show, datasetId)?.columns.find((c) => c.key === columnKey);
    if (!col) return false;
    col.label = label;
    return true;
  });
}

export function removeDatasetColumn(showId: string, datasetId: string, columnKey: string): Show[] {
  return patchShow(showId, (show) => {
    const ds = datasetOf(show, datasetId);
    if (!ds?.columns.some((c) => c.key === columnKey)) return false;
    ds.columns = ds.columns.filter((c) => c.key !== columnKey);
    return true;
  });
}

/**
 * IMPORT a parsed table as a NEW dataset (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 7).
 *
 * The file's header row becomes the COLUMN LABELS verbatim, which is the whole design: the
 * binding is by name (`datasetValuesForFields`), so a spreadsheet whose columns are already
 * called "Question" / "Answer A" binds to the quiz boards with no mapping step, and one whose
 * columns are called something else says so instead of pretending. What lands is ORDINARY
 * dataset rows — editable, synced with the production, with no link back to the file. There is
 * deliberately no "re-import from source": a live file dependency would put the show's data
 * somewhere the show does not travel.
 *
 * `kind` stays 'generic' unless the caller says otherwise, because kind only picks starter
 * columns and an import brings its own.
 */
export function importShowDataset(
  showId: string,
  table: { header: string[]; rows: string[][] },
  opts?: { name?: string; kind?: ShowDataset['kind'] },
): { shows: Show[]; datasetId: string | null; error: string | null } {
  const labels = table.header.map((h) => h.trim()).filter((h) => h !== '');
  if (labels.length === 0) {
    return { shows: loadShows(), datasetId: null, error: 'That file has no column names in its first row.' };
  }
  let datasetId: string | null = null;
  const shows = patchShow(showId, (show) => {
    // Columns follow the header's ORDER and count; a header cell that was blank is dropped
    // above, so its cells are dropped here too rather than landing under a nameless column
    // nothing can ever bind or edit.
    const keep = table.header.map((h, i) => [h.trim(), i] as const).filter(([h]) => h !== '');
    const columns: DatasetColumn[] = keep.map(([label], i) => ({ key: `c${i}`, label }));
    const rows: DatasetRow[] = table.rows.map((cells) => ({
      id: uuid(),
      values: Object.fromEntries(keep.map(([, from], i) => [`c${i}`, cells[from] ?? ''])),
    }));
    const dataset: ShowDataset = {
      id: uuid(),
      name: opts?.name?.trim() || 'Imported table',
      kind: opts?.kind ?? 'generic',
      // An import with no data rows still lands: the columns are the useful half and the
      // operator can type into them. One empty row so there is something to type into.
      rows: rows.length > 0 ? rows : [{ id: uuid(), values: {} }],
      columns,
    };
    show.datasets = [...(show.datasets ?? []), dataset];
    datasetId = dataset.id;
    return true;
  });
  return { shows, datasetId, error: null };
}

/**
 * The BINDING: which of a template's fields a dataset row can fill, by matching column LABELS
 * to field TITLES (trimmed, case-insensitive). Returns fieldId -> value for the matches only —
 * unmatched columns are skipped, unmatched fields keep their cue values. Deterministic and
 * fully visible (rename a column or a field title and the match changes with it); loading is
 * always a deliberate operator action into a CUE, never a live wire to air.
 */
export function datasetValuesForFields(
  dataset: ShowDataset,
  row: DatasetRow,
  fields: { key: string; label: string }[],
): Record<string, string> {
  const byLabel = new Map(dataset.columns.map((c) => [c.label.trim().toLowerCase(), c.key] as const));
  const out: Record<string, string> = {};
  for (const f of fields) {
    const columnKey = byLabel.get(f.label.trim().toLowerCase());
    if (columnKey === undefined) continue;
    const v = row.values[columnKey];
    if (v !== undefined) out[f.key] = v;
  }
  return out;
}

/**
 * Save the production-data SEED — what Reset returns the live tree to.
 *
 * This is the ONE write that puts data values on the show record, and it is a deliberate
 * operator action ("Save as seed"), never something a value change triggers. That is the whole
 * anti-churn rule of docs/PRODUCTION_DATA_PLAN.md §2.1, enforced by there being no other door.
 */
export function setShowSeedData(showId: string, data: JsonObject | undefined): Show[] {
  return patchShow(showId, (show) => {
    if (data && Object.keys(data).length > 0) show.data = data;
    else delete show.data;
    return true;
  });
}

/** One field's binding write - a path to set, or `null` to unbind it. Shared by the single-field
 *  setter below and the bulk one "Bind all by title" uses so both write through the same rule. */
function applyFieldBinding(bindings: ProductionBindings, graphic: string, fieldId: string, path: string | null): ProductionBindings {
  const forGraphic = { ...(bindings[graphic] ?? {}) };
  if (path && path.trim() !== '') forGraphic[fieldId] = path.trim();
  else delete forGraphic[fieldId];
  const next = { ...bindings };
  if (Object.keys(forGraphic).length > 0) next[graphic] = forGraphic;
  else delete next[graphic];
  return next;
}

/** Bind a field to a production-data path, or unbind it with `null` — the operator's one and
 *  only override gesture (docs/PRODUCTION_DATA_PLAN.md §2.7). */
export function setFieldBinding(
  showId: string,
  graphic: string,
  fieldId: string,
  path: string | null,
): Show[] {
  return patchShow(showId, (show) => {
    const bindings = applyFieldBinding(show.bindings ?? {}, graphic, fieldId, path);
    if (Object.keys(bindings).length > 0) show.bindings = bindings;
    else delete show.bindings;
    return true;
  });
}

/** Bind several fields, possibly across several graphics, in ONE read-mutate-write cycle — what
 *  "Bind all by title" presses (docs/CONTROL_PANEL_ANY_GRAPHIC.md §5 row 10). A press that
 *  touches N fields must cost one write to the show record, not N: each `setFieldBinding` call
 *  is its own full load/parse/save of the whole shows store, which is fine for one field typed
 *  by hand but not for a bulk accept. */
export function setFieldBindings(
  showId: string,
  entries: { graphic: string; fieldId: string; path: string }[],
): Show[] {
  return patchShow(showId, (show) => {
    if (entries.length === 0) return false;
    let bindings = show.bindings ?? {};
    for (const { graphic, fieldId, path } of entries) bindings = applyFieldBinding(bindings, graphic, fieldId, path);
    if (Object.keys(bindings).length > 0) show.bindings = bindings;
    else delete show.bindings;
    return true;
  });
}

/**
 * Should this production's vote boards show the percentage figures WHILE the vote is running?
 *
 * Off is the shipped answer and the owner's (2026-08-30): most shows put a vote board up to
 * reveal a result, so the figures wait for Show result. This is the opt-in for the shows that
 * want the numbers moving on air, and it is one fact for the whole production rather than a
 * per-round choice, because it is a decision about how a show looks rather than about a vote.
 *
 * ABSENT means off, so no migration: an older record reads as off, which is what it did.
 */
export function setShowPollLiveFigures(showId: string, on: boolean): Show[] {
  return patchShow(showId, (show) => {
    if (on) show.pollLiveFigures = true;
    else delete show.pollLiveFigures;
    return true;
  });
}

/**
 * Write the production's control profile, in its CANONICAL form (model/profile.ts).
 *
 * It canonicalizes on the way in rather than trusting the caller, so two authoring gestures that
 * mean the same thing leave the same bytes on the record — which is what keeps a sync layer from
 * seeing a change where an operator made none.
 *
 * IT REFUSES TO OVERWRITE A PROFILE THIS BUILD CANNOT READ, and that refusal is the whole reason
 * the setter lives here rather than in whichever surface authors profiles. "An unknown version
 * degrades to read-only" is only a guarantee if there is ONE write path that enforces it; left to
 * a UI it would be a comment, and the first build to open a newer production would quietly erase
 * a profile it did not understand. Returns the shows unchanged in that case.
 */
export function setShowProfile(showId: string, profile: ShowProfile): { shows: Show[]; refused: boolean } {
  let refused = false;
  const shows = patchShow(showId, (show) => {
    if (readShowProfile(show.profile).status === 'read-only') {
      refused = true;
      return false;
    }
    show.profile = serializeShowProfile(profile);
    return true;
  });
  // The refusal is REPORTED rather than swallowed, on the `createShowNamedChecked` precedent: a
  // surface that showed "Saved" over a write that never happened is the worse half of this bug.
  return { shows, refused };
}

/**
 * Delete the production's control profile — ONE action, which is the contract the road reserved
 * (docs/CONTROL_PANEL_ROAD.md §3): removing the profile must always leave the COMPLETE generated
 * panel, which stays the recovery surface and the default on every surface that renders one.
 *
 * The key goes entirely rather than becoming an empty profile, so "no profile" is one state: a
 * production that never had one and a production whose profile was deleted are byte-identical.
 *
 * IT REFUSES A PROFILE THIS BUILD CANNOT READ, exactly as `setShowProfile` does, and for a reason
 * that is easy to miss: on an older build a newer profile is INVISIBLE - every surface reads it as
 * null and renders the generated panel - so "delete the profile" would be an operator removing
 * something they were never shown, and the newer build's bytes would be gone for good. Read-only
 * has to hold at both doors or it holds at neither. Removing such a profile is done on a build
 * that can read it.
 */
export function deleteShowProfile(showId: string): { shows: Show[]; refused: boolean } {
  let refused = false;
  const shows = patchShow(showId, (show) => {
    if (!show.profile) return false;
    if (readShowProfile(show.profile).status === 'read-only') {
      refused = true;
      return false;
    }
    delete show.profile;
    return true;
  });
  return { shows, refused };
}

/** Set (or clear, with undefined) the production's unified look. */
export function setShowLook(showId: string, look: ProjectBrand | undefined): Show[] {
  return patchShow(showId, (show) => {
    if (look) show.look = look;
    else delete show.look;
    return true;
  });
}

/** Point the production at a saved BRAND (or clear it, with undefined). The reference the
 *  wizard's chooser preselects; `setShowLook` above still records the captured copy. */
export function setShowBrand(showId: string, brandId: string | undefined): Show[] {
  return patchShow(showId, (show) => {
    if (brandId) show.brandId = brandId;
    else delete show.brandId;
    return true;
  });
}

/** Record (or clear, with undefined) a show's browser-output slug after (un)publishing.
 *  Publishing also stamps publishedAt; clearing removes it (nothing is live any more). */
export function setShowOutputSlug(showId: string, slug: string | undefined): Show[] {
  return patchShow(showId, (show, at) => {
    if (slug) {
      show.outputSlug = slug;
      // The SAME instant the write is stamped with, so a freshly published record reads clean.
      show.publishedAt = at;
    } else {
      delete show.outputSlug;
      delete show.publishedAt;
      // The URL somebody set their browser source to is gone with the slug, so the record that
      // one was ever set up goes with it - a re-publish mints a NEW slug, and the old source
      // will never report in again.
      delete show.outputOpenedAt;
    }
    return true;
  });
}

/** Note that the operator has TAKEN the output URL - copied the link, or downloaded the
 *  template file that wraps it. Stamped once and left alone: the fact being recorded is that an
 *  output was set up at all, not when it was last touched. */
export function noteShowOutputOpened(showId: string): Show[] {
  return patchShow(showId, (show, at) => {
    if (show.outputOpenedAt) return false;      // already known - nothing to write
    show.outputOpenedAt = at;
    return true;
  });
}

/**
 * Record (or clear, with undefined) the AUDIENCE capabilities after (un)publishing.
 *
 * Both slugs travel together because they are minted together, by the database, at publish: the
 * app never chooses one, it reads back what was assigned. Kept separate from
 * `setShowOutputSlug` so the audience plane can be absent from a production that has one -
 * an older server has no 0035 columns to read back, and that must degrade to "no join link",
 * never to a broken publish.
 */
export function setShowAudienceSlugs(
  showId: string,
  slugs: { joinSlug?: string | null; presenterSlug?: string | null } | undefined,
): Show[] {
  return patchShow(showId, (show) => {
    if (slugs?.joinSlug) show.joinSlug = slugs.joinSlug;
    else delete show.joinSlug;
    if (slugs?.presenterSlug) show.presenterSlug = slugs.presenterSlug;
    else delete show.presenterSlug;
    return true;
  });
}

/** Move a graphic one slot up or down the rundown. */
// ── Playout layers (docs/PLAYOUT_DASHBOARD.md §5) ──────────────────────────────────────────
//
// A pool graphic airs on a layer NUMBER the operator types, not on one derived from its
// position in the pool. CasparCG offers 1-100 and a teaching install's rundowns live around
// 20, so counting starts there: the first graphic is 20, the next 21, and so on. Distinct by
// construction (owner decision, 2026-08-05) — two graphics on one layer replace each other on
// air, and nothing is gained by starting from a state the operator has to repair. The number
// stays fully editable; nobody has to think about it.

/** Where the count starts, and what a record saved before the field reads as. */
export const DEFAULT_PLAYOUT_LAYER = 20;
/** The range CasparCG accepts, and therefore the range the control offers. */
export const MIN_PLAYOUT_LAYER = 1;
export const MAX_PLAYOUT_LAYER = 100;

/** A pool graphic's layer — the stored number, or the default for a record saved before the
 *  field existed (additive-optional read, `root/version-every-persisted-format-ship-breaking`). */
export function graphicLayer(graphic: Pick<SavedGraphic, 'layer'>): number {
  const n = Number(graphic.layer);
  return Number.isFinite(n) && n >= MIN_PLAYOUT_LAYER && n <= MAX_PLAYOUT_LAYER
    ? Math.round(n)
    : DEFAULT_PLAYOUT_LAYER;
}

/** The lowest layer no graphic of the pool is using, from the default upward — what the
 *  duplicate-layer warning offers as its one-click fix. */
export function nextFreeLayer(graphics: Pick<SavedGraphic, 'layer'>[]): number {
  const used = new Set(graphics.map(graphicLayer));
  for (let n = DEFAULT_PLAYOUT_LAYER; n <= MAX_PLAYOUT_LAYER; n++) if (!used.has(n)) return n;
  for (let n = MIN_PLAYOUT_LAYER; n < DEFAULT_PLAYOUT_LAYER; n++) if (!used.has(n)) return n;
  return DEFAULT_PLAYOUT_LAYER;
}

/**
 * Which pool graphics SHARE a layer, keyed by that layer. Two graphics on one layer evict each
 * other the moment both are taken - in CasparCG, in SPX, and in the browser output alike - so
 * the surface says so rather than letting it be found live (docs/PLAYOUT_DASHBOARD.md §5).
 * Defaulting everything to one number is the deliberate choice; this is what keeps it honest.
 */
export function duplicateLayers(graphics: SavedGraphic[]): Map<number, SavedGraphic[]> {
  const byLayer = new Map<number, SavedGraphic[]>();
  for (const g of graphics) {
    const layer = graphicLayer(g);
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), g]);
  }
  return new Map([...byLayer].filter(([, gs]) => gs.length > 1));
}

/** Set one pool graphic's playout layer. Out-of-range values clamp rather than refuse — the
 *  control is a number input and a half-typed "1" must not be rejected mid-keystroke. */
export function setShowGraphicLayer(showId: string, graphicId: string, layer: number): Show[] {
  const all = readEditable();
  const show = all.find((s) => s.id === showId && !s.deleted);
  const graphic = show?.graphics.find((g) => g.id === graphicId);
  if (show && graphic) {
    const clamped = Math.min(MAX_PLAYOUT_LAYER, Math.max(MIN_PLAYOUT_LAYER, Math.round(layer) || DEFAULT_PLAYOUT_LAYER));
    graphic.layer = clamped;
    show.updatedAt = nowIso();
    saveAll(all);
  }
  return all.filter((s) => !s.deleted);
}

export function moveShowGraphic(showId: string, graphicId: string, dir: -1 | 1): Show[] {
  const all = readEditable();
  const show = all.find((s) => s.id === showId);
  if (show) {
    const i = show.graphics.findIndex((g) => g.id === graphicId);
    const j = i + dir;
    if (i >= 0 && j >= 0 && j < show.graphics.length) {
      const g = show.graphics[i];
      show.graphics[i] = show.graphics[j];
      show.graphics[j] = g;
      show.updatedAt = nowIso();
      saveAll(all);
    }
  }
  return all.filter((s) => !s.deleted);
}

/** Record (or clear, with undefined) a show's hosted control slug after (un)publishing. */
export function setShowHostedSlug(showId: string, slug: string | undefined): Show[] {
  const all = readEditable();
  const show = all.find((s) => s.id === showId);
  if (show) {
    if (slug) show.hostedSlug = slug;
    else delete show.hostedSlug;
    show.updatedAt = nowIso();
    saveAll(all);
  }
  return all.filter((s) => !s.deleted);
}

/** Delete = tombstone (strip payload, keep the id + fresh timestamp) so the delete syncs.
 *  PERSONAL records only: a team production is the team owner's to delete, on the server
 *  (backend/teamProductions.ts), and a tombstone here would never reach the team. It is also
 *  the second half of a MOVE, which is why it reads the personal list even while a team record
 *  of the same id is in view. */
export function deleteShow(showId: string): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId);
  if (show) {
    show.deleted = true;
    show.graphics = [];
    show.updatedAt = nowIso();
  }
  saveAll(all);
  return all.filter((s) => !s.deleted);
}

/** Drop local tombstones older than the cutoff (the sync controller's coordinated purge). */
export function purgeOldShowTombstones(beforeIso: string): void {
  const all = loadAllShows();
  const kept = all.filter((s) => !s.deleted || s.updatedAt >= beforeIso);
  if (kept.length !== all.length) saveAll(kept);
}

/** Display metadata only. Callers reporting success await commitDurableWrites. */
export function setShowOutputSetup(showId: string, setup: ProductionOutputSetup): { shows: Show[]; error: string | null } {
  const valid = readOutputSetup(setup);
  if (!valid) return { shows: loadShows(), error: 'Invalid output setup.' };
  return patchShowChecked(showId, show => {
    show.outputSetup = valid;
    return true;
  });
}
export function setCueAccentColor(showId: string, cueId: string, color: string | null): Show[] {
  return patchShow(showId, show => {
    const cue = show.cues?.find(c => c.id === cueId);
    if (!cue) return false;
    const value = accentColor(color);
    if ((cue.accentColor ?? undefined) === value) return false;
    if (value) cue.accentColor = value;
    else delete cue.accentColor;
    return true;
  });
}
export function setRundownColor(showId: string, key: string, color: string | null): Show[] {
  return patchShow(showId, show => {
    const colors = { ...show.rundownColors };
    const value = accentColor(color);
    if (colors[key] === value) return false;
    if (value) colors[key] = value;
    else delete colors[key];
    if (Object.keys(colors).length) show.rundownColors = colors;
    else delete show.rundownColors;
    return true;
  });
}
