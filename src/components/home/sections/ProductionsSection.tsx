import { useRef, useState } from 'react';
import { createShow, deleteShow, type Show } from '../../../model/shows';
import { outputPageUrl, unpublishControlShow } from '../../../control/hostedControl';
import { installPack, parsePack } from '../../../packs/graphicsPack';
import { trackEvent } from '../../../backend/events';
import { copyLink } from '../copyLink';
import ProductionExportDialog from '../ProductionExportDialog';
import GraphicThumb from '../GraphicThumb';
import RowMenu from '../RowMenu';
import { useTeamsUi } from '../../teams/teamsUi';
import { useTeamsAvailable } from '../../teams/useTeamsAvailable';
import { IconDownload, IconLink, IconTrash, IconTv, IconUpload, IconUsers } from '../../icons';

/**
 * THE PRODUCTION'S SIZE, AND THE DOOR INTO IT (docs/backlog/browse-a-productions-graphics.md).
 * The owner could not see which graphics belonged to which production without opening playout
 * and playing them out one at a time, so the size line opens the library narrowed to this one.
 *
 * The door counts the pool copies that still have a LIBRARY RECORD, because that is all the
 * library can list: a copy records the id of the graphic it was made from, and one whose
 * graphic has since been deleted is real on air and invisible there. When that number differs
 * from the production's size, the size stays plain and the browsable subset gets its own words
 * - a door must never promise a count the destination will not show. With nothing to open, or
 * no handler, both stay plain: a button that looks live and does nothing is worse than text.
 */
function ProductionStats({ show, onBrowse }: { show: Show; onBrowse?: (showId: string) => void }) {
  // De-duplicated, because two pool entries can descend from one library graphic.
  const linked = new Set(show.graphics.map((g) => g.graphicId).filter(Boolean)).size;
  const size = `${show.graphics.length} graphic${show.graphics.length === 1 ? '' : 's'}`;
  const door = (label: string) => (
    <button
      className="link-inline"
      onClick={() => onBrowse?.(show.id)}
      title="Browse this production's graphics in the library"
      data-testid="browse-production-graphics"
    >
      {label}
    </button>
  );
  const openable = !!onBrowse && linked > 0;
  return (
    <p className="prod-card-stats">
      {openable && linked === show.graphics.length ? door(size) : size}
      {openable && linked < show.graphics.length && <>{' · '}{door(`${linked} in your library`)}</>}
      {show.cues?.length ? ` · ${show.cues.length} cue${show.cues.length === 1 ? '' : 's'}` : ''}
    </p>
  );
}

/**
 * The Productions section — Home's LEAD (docs/GOALS_ARCHIVE.md "Student release" step 8): a production
 * is the unit that airs, so the dashboard door and the output URL are the two things one click
 * away. Everything about one production (graphics, cues, publish, operating) lives on its own
 * page at #/production/<id>.
 */
export default function ProductionsSection({
  productions,
  onOpen,
  onBrowseGraphics,
  onChanged,
  limit,
  heading = true,
}: {
  productions: Show[];
  onOpen: (p: Show) => void;
  onBrowseGraphics?: (showId: string) => void;
  onChanged: () => void;
  /** Dashboard mode shows the top few; the full section shows everything. */
  limit?: number;
  heading?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // The team door (docs/TEAMS_PLAN.md §6). `useTeamsAvailable` is false offline AND signed out,
  // so this section grows no overflow menu at all in those builds - which is the rule that "a
  // user who never opens the door never sees the word team" is made of.
  const teamsAvailable = useTeamsAvailable();
  const openShare = useTeamsUi((s) => s.openShare);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [exportShow, setExportShow] = useState<Show | null>(null);
  // The pack door's state: which file is installing, and the outcome line.
  const [packBusy, setPackBusy] = useState<string | null>(null);
  const [packNote, setPackNote] = useState<string | null>(null);
  const packInput = useRef<HTMLInputElement>(null);
  const shown = limit ? productions.slice(0, limit) : productions;
  const create = () => {
    const next = createShow(newName);
    setNewName('');
    onChanged();
    const made = next[next.length - 1];
    if (made) onOpen(made);
  };

  /** Parse, validate and install one pack's text; land on the new production's dashboard. */
  const importPackText = async (label: string, text: string) => {
    setPackBusy(label);
    setPackNote(null);
    try {
      const { pack, error } = parsePack(text);
      if (!pack) throw new Error(error ?? 'That file is not a NoaCG graphics pack.');
      const show = await installPack(pack);
      trackEvent('activation', 'pack');
      onChanged();
      onOpen(show);
    } catch (error) {
      setPackNote(error instanceof Error ? error.message : String(error));
    } finally {
      setPackBusy(null);
    }
  };

  const importPackFile = async (file: File | undefined) => {
    if (!file) return;
    await importPackText(file.name, await file.text());
  };

  return (
    <>
      {heading && (
        <>
          <h2><IconTv size={18} /> Productions</h2>
          <p className="hint">
            A production is the live unit: its graphics, a prepared CUE rundown, one persistent
            browser-<strong>output URL</strong> for CasparCG/OBS/vMix, and one <strong>control
            page</strong> for operating — see each production’s page for all of it.
          </p>
        </>
      )}
      {productions.length === 0 && (
        <p className="hint" data-testid="no-productions">No productions yet — name one below, then add graphics and cues.</p>
      )}
      {/* CARDS, not rows (re-design/handoff.md §5a). A production is the unit that airs — it
          has a state, a size, and a set of graphics — and a one-line row could show none of
          that. The card leads with its name and whether it is published, then what is in it,
          then a strip of the graphics themselves, then the ways to open and take it away. */}
      <div className="prod-grid">
        {shown.map((r) => (
          <div
            className={`prod-card${r.hostedSlug ? ' live' : ''}`}
            key={r.id}
            data-testid={`production-row-${r.id}`}
          >
            <div className="prod-card-head">
              {/* The NAME is the card's own door — reaching for "Open dashboard" for every
                  open was an acceptance-round papercut. */}
              <button
                className="lib-name-link"
                onClick={() => onOpen(r)}
                title={`Open "${r.name}"`}
                data-testid="open-production-name"
              >
                <strong>{r.name}</strong>
              </button>
              <span className={`prod-badge${r.hostedSlug ? ' live' : ''}`}>
                {r.hostedSlug ? '● Live' : 'Idle'}
              </span>
              <div className="spacer" />
              {confirmDelete === r.id ? (
                <button
                  className="destructive"
                  onClick={() => {
                    // A DELETED PRODUCTION STOPS BEING PUBLISHED (docs/CLOUD_PLAYOUT.md,
                    // "Publication lifecycle"). Deleting used to tombstone the local record only,
                    // and its output URL and control page stayed live on the server forever -
                    // five of nineteen publications were that, measured 2026-09-23. The request
                    // is fire-and-forget: offline, signed out or on another account's row it
                    // does nothing, and the nightly sweep (migration 0061) unpublishes whatever
                    // a deleted production left behind.
                    if (r.hostedSlug) void unpublishControlShow(r.id).catch(() => undefined);
                    deleteShow(r.id);
                    setConfirmDelete(null);
                    onChanged();
                  }}
                  title={
                    r.hostedSlug
                      ? 'Delete this production. It is published, so its output and control links stop working. Its graphics stay saved wherever else they live.'
                      : 'Delete this production (its graphics stay saved wherever else they live)'
                  }
                  data-testid="production-delete-confirm"
                >
                  {r.hostedSlug ? 'Delete and unpublish?' : 'Delete?'}
                </button>
              ) : (
                <button onClick={() => setConfirmDelete(r.id)} title="Delete this production" aria-label={`Delete ${r.name}`}>
                  <IconTrash />
                </button>
              )}
              {/* The overflow menu exists only when it has something in it. Delete stays a
                  visible button: it is this card's oldest action and moving it would relocate a
                  control people already know for the sake of tidiness. */}
              {teamsAvailable && (
                <RowMenu
                  label={`More actions for ${r.name}`}
                  items={[
                    {
                      label: 'Share with a team…',
                      icon: <IconUsers />,
                      onClick: () => openShare(r.id, r.name),
                      testid: 'share-with-team',
                    },
                  ]}
                />
              )}
            </div>

            <ProductionStats show={r} onBrowse={onBrowseGraphics} />

            {/* What is actually in it. Four is the strip's width, and the remainder is
                counted rather than dropped silently. */}
            {r.graphics.length > 0 && (
              <div className="prod-card-strip">
                {r.graphics.slice(0, 4).map((g) => (
                  <GraphicThumb key={g.id} template={g.template} label={g.name} />
                ))}
                {r.graphics.length > 4 && (
                  <span className="prod-card-more">+{r.graphics.length - 4}</span>
                )}
              </div>
            )}

            <div className="prod-card-actions">
              <button className="primary" onClick={() => onOpen(r)} data-testid="open-production">
                Open dashboard
              </button>
              {r.outputSlug && (
                <button
                  onClick={() => {
                    void copyLink(outputPageUrl(r.outputSlug!)).then((ok) => {
                      if (!ok) return;
                      setCopiedLink(r.id);
                      setTimeout(() => setCopiedLink((c) => (c === r.id ? null : c)), 2000);
                    });
                  }}
                  title="Copy the browser-output URL (the one your playout client loads)"
                  data-testid="copy-production-output"
                >
                  {copiedLink === r.id ? '✓ Copied' : <><IconLink /> Output URL</>}
                </button>
              )}
              <button
                onClick={() => setExportShow(r)}
                disabled={r.graphics.length === 0}
                title="Export every graphic of this production — OGraf, CasparCG, SPX, OBS/vMix overlay, H2R, LiveOS"
                aria-label={`Export ${r.name}`}
                data-testid="export-production-row"
              >
                <IconDownload />
              </button>
            </div>
          </div>
        ))}
        {/* The way to make one, as the grid's last card — the reference's dashed slot. A
            create row above the list read as a stray form; here it is one of the choices. */}
        <div className="prod-card prod-card-new">
          <strong>New production</strong>
          <p className="prod-card-stats">Name it, add graphics, publish for a live URL.</p>
          <div className="spacer" />
          <input
            value={newName}
            placeholder="Production name…"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) create(); }}
            data-testid="new-production-name"
          />
          <button
            className="primary"
            disabled={!newName.trim()}
            onClick={create}
            data-testid="new-production"
          >
            ＋ Create
          </button>
        </div>
        {/* The pack door — where a finished multi-graphic package made OUTSIDE the studio
            arrives: `noacg pack` (the CLI's production file) or a production exported as a
            graphics pack. It installs as a ready production (src/packs/graphicsPack.ts).
            NoaCG's own templates never list here - everything the studio provides comes
            through the template wizard. Dashboard mode hides it; the full section is where a
            production is set up. */}
        {!limit && (
          <div className="prod-card prod-card-new" data-testid="import-pack-card">
            <strong>Import a package</strong>
            <p className="prod-card-stats">
              A <code className="inline">.noacgpack.json</code> made with the NoaCG CLI
              (<code className="inline">noacg pack</code>) or exported from a production —
              installs as a production with its cue rundown and layers ready to operate.
            </p>
            <div className="spacer" />
            <input
              ref={packInput}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => { void importPackFile(e.target.files?.[0]); e.target.value = ''; }}
              data-testid="import-pack-file"
            />
            <button
              disabled={packBusy !== null}
              onClick={() => packInput.current?.click()}
              title="Import a .noacgpack.json package file"
            >
              <IconUpload /> Import a package file…
            </button>
            {packNote && <p className="status-bad">{packNote}</p>}
          </div>
        )}
      </div>
      {exportShow && <ProductionExportDialog show={exportShow} onClose={() => setExportShow(null)} />}
    </>
  );
}
