/**
 * THE WIZARD'S ENDINGS: one implementation of each door on the Finish step
 * (docs/work-specs/wizard-structure/spec.md section 3, phase S4).
 *
 * A door takes the mode's own APPLIER (`apply`: it snapshots the walk and builds the graphic
 * into the store with the wizard kept open, then returns the applied template or null) and the
 * graphic's name, and does the rest the same way for every mode: the export door, the
 * production door, the editor door, and the two set doors of a kit or a Pro package. Every
 * write, store and route arrives through `io`, so the order of the writes, what a failure says
 * and when the reader moves are tested in Node (scripts/wizard-doors.test.mjs) with writes that
 * answer late, fail, or see a second press.
 *
 * Nothing here holds state of its own: the one press guard is the shell's ref, passed in.
 */
import type { Route } from '../../../app/router';
import type { addReadyGraphicToShow } from '../../../control/productionAdmission';
import type { commitDurableWrites } from '../../../model/durableStore';
import type { captureLookFromTemplate } from '../../../model/packets';
import type { createShowNamedChecked, loadShows, setShowLook, Show } from '../../../model/shows';
import type { ProductionDest, saveTemplateSetToProduction } from '../../../model/templateSet';
import type { SpxTemplate } from '../../../model/types';
import type { StorageAlert } from '../../../store/storageAlert';
import type { publishGate } from '../../../validation/publishGate';

/** The mode's applier: snapshot the walk, build the graphic into the store, return it. */
export type Apply = () => SpxTemplate | null | Promise<SpxTemplate | null>;
/** The graphic's name, read once the applier has built it. */
export type DoorName = () => string;
/** A set door's save: the whole set to a production, or null when it was refused or failed. */
export type SaveSet = (dest: ProductionDest) => Promise<Show | null>;

export interface DoorIo {
  /** The library save by name (spec R2). The shell's until S5, which moves the record it reads. */
  saveBuiltGraphic(name: string): Promise<{ ok: boolean; error: string | null }>;
  /** Record what the door made, for the walk-back warning and a second pass. The shell's until S5. */
  noteMade(name: string, production: string | null, landedOn?: Route | null): void;
  /** True from a production-door press until it lands or fails: the shell's ref. */
  productionPress: { current: boolean };
  /** The built graphic as the store holds it now, after the save has renamed it. */
  built(): { template: SpxTemplate; graphicId: string | null };
  /** Open the export window over the wizard, on the graphic the store holds. */
  openExport(): void;
  /** Open the new editor in place of the wizard's route. */
  openEditor(): void;
  /** Ask the production page for its whole-show export once it opens. */
  requestProductionExport(showId: string): void;
  closeGallery(): void;
  navigate(route: Route): void;
  replace(route: Route): void;
  raiseStorageAlert(alert: StorageAlert): void;
  publishGate: typeof publishGate;
  loadShows: typeof loadShows;
  createShowNamedChecked: typeof createShowNamedChecked;
  commitDurableWrites: typeof commitDurableWrites;
  addGraphicToShow: typeof addReadyGraphicToShow;
  setShowLook: typeof setShowLook;
  captureLookFromTemplate: typeof captureLookFromTemplate;
  saveTemplateSetToProduction: typeof saveTemplateSetToProduction;
  trackEvent(event: 'activation', detail: string): void;
  /** The set doors' busy flag and error line (the shell's `kitBusy` and `kitError`). */
  setSetBusy(busy: boolean): void;
  setSetError(error: string | null): void;
}

export function makeDoors(io: DoorIo) {
  /**
   * An Export door whose SAVE failed. The report comes from the app-level dialog, the one place
   * a storage failure is announced (App.tsx). The outcome line says where the work actually is,
   * which is the part a "storage is full" string alone never answers: the wizard stays open on
   * Finish under the export window, with the graphic built.
   */
  const reportFailedCreateSave = (name: string, error: string | null) =>
    io.raiseStorageAlert({
      action: `Saving “${name}”`,
      error: error ?? 'The graphic could not be saved.',
      outcome:
        'It is still open in the wizard, unsaved. You can export it without saving, or free some room and press Export it again.',
    });

  /**
   * The export door: create it, SAVE it, and go straight to the export window, which opens
   * OVER the wizard. The save is not optional here. This branch exists for someone who is done,
   * and a graphic that was configured, exported and then dropped would be unrecoverable: every
   * wizard choice would have to be made again to get the same package back.
   *
   * If the save fails (a full quota is the realistic cause) the storage dialog says so, and
   * the wizard is still open on Finish with the graphic built, so the export can go ahead
   * unsaved or the door can be pressed again once there is room.
   */
  const exportDoor = async (apply: Apply, name: DoorName): Promise<void> => {
    if (!(await apply())) return;
    const graphic = name();
    const saved = await io.saveBuiltGraphic(graphic);
    if (!saved.ok) reportFailedCreateSave(graphic, saved.error);
    else io.noteMade(graphic, null);
    // AFTER the save: it renames the working template to the record's name, which is what the
    // export slugs the zip and the SPX/CasparCG template folder from.
    io.openExport();
  };

  /**
   * After the build: SAVE it (library record first - never lose the work), pool a copy into the
   * chosen production with its auto-seeded first cue, capture the look onto a production that
   * has none yet, and land on the production page - the road to air.
   *
   * NOTHING IS REVEALED ON THE WAY (owner walk, 2026-09-01: adding an imported graphic to a
   * production flashed the canvas before the rundown appeared). Every create keeps the wizard
   * open, so it stays over the surface until this routes to the production. That also makes a
   * FAILED save land somewhere useful: the wizard is still open on Finish, with the graphic
   * built, so the door can simply be pressed again.
   */
  const landInProduction = async (dest: ProductionDest, name: string): Promise<void> => {
    const saved = await io.saveBuiltGraphic(name);
    if (!saved.ok) {
      // NEVER a silent return - swallowing this left the user with no production, no saved
      // graphic and nothing said (the acceptance-pass blocker of 2026-08-06).
      io.raiseStorageAlert({
        action: `Adding “${name}” to a production`,
        error: saved.error ?? 'The graphic could not be saved.',
        outcome:
          'Your graphic is still open in the wizard, unsaved. Free some room, then press “Add to the production” again.',
      });
      return;
    }
    const s = io.built();
    let created: string | null = null;
    const gate = io.publishGate(s.template, true);
    if (!gate.ok) {
      io.raiseStorageAlert({ action: `Adding “${name}” to a production`, error: gate.errors.map(e => e.message).join(' '), outcome: 'The graphic is preserved in your library. Correct it before adding it to the rundown.' });
      return;
    }
    let show: Show | undefined;
    if (dest.kind === 'existing') {
      show = io.loadShows().find((x) => x.id === dest.id);
    } else {
      const made = io.createShowNamedChecked(dest.name);
      show = made.show;
      // The durable store confirms a write after the call returns, so every "did that land?"
      // question here is one await (model/durableStore.ts's claim protocol) - claiming the
      // failure is also what keeps THIS message, which names the production, rather than the
      // generic announcement the app makes for an unclaimed one.
      created = made.error ?? (await io.commitDurableWrites());
    }
    // A picked production deleted mid-wizard (another tab/device): fall back to a NEW one rather
    // than dropping the work on the floor. UNNAMED, so the model's own floor answers - naming it
    // after the graphic, which this used to do, is the defect the empty production box carried
    // on the same door (e2e/import-svg.spec.ts, "an unnamed production is not named after the
    // graphic"), and one door must not answer one question two ways.
    if (!show) {
      const made = io.createShowNamedChecked('');
      show = made.show;
      created = made.error ?? (await io.commitDurableWrites());
    }
    const target = show;
    if (created) {
      io.raiseStorageAlert({
        action: `Creating the production “${target.name}”`,
        error: created,
        // Where the reader actually IS: the wizard, still on Finish (the door no longer routes
        // through the editor), so the retry is the door they just pressed - not a trip to Home.
        outcome: `“${name}” is saved in your library. Free some room, then press “Add to the production” again.`,
      });
      return;
    }
    const pooled = io.addGraphicToShow(target.id, s.template, { graphicId: s.graphicId ?? undefined });
    const pooledError = pooled.error ?? (await io.commitDurableWrites());
    if (pooledError) {
      io.raiseStorageAlert({
        action: `Adding “${name}” to “${target.name}”`,
        error: pooledError,
        outcome: `“${name}” is saved in your library. Free some room, then press “Add to the production” again.`,
      });
      return;
    }
    if (!target.look) io.setShowLook(target.id, io.captureLookFromTemplate(s.template));
    // The rundown this graphic went into, by name — what the walk-back warning states, and
    // what makes a second pass down the walk replace that copy instead of adding another.
    io.noteMade(name, target.name, { view: 'production', id: target.id });
    io.closeGallery();
    io.replace({ view: 'production', id: target.id });
  };

  /**
   * THE PRIMARY DOOR (docs/GOALS_ARCHIVE.md "Student release" step 6). One press, one
   * production: a second press while the first is still building and saving adds nothing (it
   * made a second production under the same name, each pooling the graphic). Released when the
   * door lands or fails, so a retry still works.
   */
  const addToProduction = (apply: Apply, dest: ProductionDest, name: DoorName): Promise<void> => {
    if (io.productionPress.current) return Promise.resolve();
    io.productionPress.current = true;
    return (async () => {
      if (await apply()) await landInProduction(dest, name());
    })().finally(() => {
      io.productionPress.current = false;
    });
  };

  /** The editor door saves nothing: it opens the built document in the new editor, and keeps
   *  the walk-back warning in force before a stale wizard draft could replace edits there. */
  const editArtwork = async (apply: Apply): Promise<void> => {
    const template = await apply();
    if (!template) return;
    io.noteMade(template.name, null, { view: 'editor-foundation' });
    io.openEditor();
    io.closeGallery();
  };

  /**
   * The SET-shaped save, shared by the catalog kit and a NoaCG Pro package (§15.9). The write
   * itself lives in model/templateSet.ts (`saveTemplateSetToProduction`), shared with the pack
   * importer - two copies would be two chances for one of them to forget the durable-write
   * claim. This owns only the busy and error lines and the activation event; the busy line is
   * what disables both set doors while a save is on its way.
   */
  const saveSet = async (
    templates: SpxTemplate[],
    fallbackName: string,
    dest: ProductionDest,
    activation: 'kit' | 'pro',
  ): Promise<Show | null> => {
    if (!templates.length) return null;
    io.setSetBusy(true);
    io.setSetError(null);
    try {
      // Refuse the whole set before writing its library or rundown, matching single admission.
      for (const template of templates) {
        const gate = io.publishGate(template, true);
        if (!gate.ok) throw new Error(`"${template.name}" failed validation: ${gate.errors[0]?.message ?? 'unknown error'}. Fix the graphic before adding this set to a production.`);
      }
      const target = await io.saveTemplateSetToProduction(templates, fallbackName, dest);
      io.trackEvent('activation', activation);
      return target;
    } catch (error) {
      io.setSetError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      io.setSetBusy(false);
    }
  };

  /** Set door 1: save the set, land on the production page. */
  const openSet = async (save: SaveSet, dest: ProductionDest): Promise<void> => {
    const show = await save(dest);
    if (!show) return;
    io.closeGallery();
    io.navigate({ view: 'production', id: show.id });
  };

  /**
   * Set door 2: save the set, then export it as ONE package - without the editor ever opening
   * (src/components/AGENTS.md: export is not a reward for opening the editor). The target
   * picker and the validation gate live on ProductionExportDialog, so the wizard asks for that
   * surface through the store's one-shot `pendingProductionExport` (the `pendingProductionId`
   * idiom) rather than growing a second whole-show export screen that could disagree with it.
   */
  const exportSet = async (save: SaveSet, dest: ProductionDest): Promise<void> => {
    const show = await save(dest);
    if (!show) return;
    io.requestProductionExport(show.id);
    io.closeGallery();
    io.navigate({ view: 'production', id: show.id });
  };

  return { export: exportDoor, addToProduction, editArtwork, saveSet, openSet, exportSet };
}
