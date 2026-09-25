import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createShowNamedChecked, deleteShow, type Show } from '../../../model/shows';
import { outputPageUrl, unpublishControlShow } from '../../../control/hostedControl';
import { installPack, parsePack } from '../../../packs/graphicsPack';
import { trackEvent } from '../../../backend/events';
import {
  listWaitingPackages,
  removeWaitingPackage,
  waitingPackageText,
  type WaitingPackage,
} from '../../../backend/agentPackages';
import { useAuthState } from '../../auth/useAuthState';
import { copyLink } from '../copyLink';
import ProductionExportDialog from '../ProductionExportDialog';
import GraphicThumb from '../GraphicThumb';
import RowMenu from '../RowMenu';
import { useTeamsUi } from '../../teams/teamsUi';
import { useTeamsAvailable } from '../../teams/useTeamsAvailable';
import { useTeamState } from '../../teams/useTeamState';
import TeamChip from '../../teams/TeamChip';
import { deleteTeamProduction, teamMemberName, type TeamProductionHead } from '../../../backend/teamProductions';
import type { Team, TeamMember } from '../../../backend/teams';
import { editedWhen, teamMeta } from '../../teams/teamLabels';
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
 * SHARED WITH MY TEAMS - one band per team this account is in, each headed by the team itself.
 *
 * The heading is the answer to "where is the team I was invited to": its chip, how many people are
 * in it and whether it is yours, and the door to its members and join code. A team with nothing
 * in it yet still gets its band, saying how something gets there - an empty list with no heading
 * is exactly the "joined, and nothing happened" state this exists to end. Every team production
 * is listed, in the dashboard too: the invitation is the news, and a cap would hide it.
 */
function TeamBands({
  teams,
  members,
  loaded,
  loadError,
  productions,
  userId,
  renderCard,
  onOpenTeam,
}: {
  teams: Team[];
  members: TeamMember[];
  loaded: boolean;
  loadError: string | null;
  productions: Show[];
  userId: string | undefined;
  renderCard: (show: Show) => ReactNode;
  onOpenTeam: (teamId: string) => void;
}) {
  return (
    <section className="team-bands" data-testid="team-productions">
      <h3 className="prod-band-head">
        Shared with my teams <span className="prod-band-count">{productions.length}</span>
      </h3>
      {!loaded && <p className="hint">Loading your teams…</p>}
      {/* A failed refresh keeps what is on screen, and says so, rather than emptying the band. */}
      {loadError && (
        <p className="status-bad" data-testid="team-productions-error">
          Your teams could not be refreshed ({loadError}). What is shown may be out of date.
        </p>
      )}
      {teams.map((team) => {
        const held = productions.filter((p) => p.teamId === team.id);
        return (
          <div className="team-band" key={team.id} data-testid={`team-band-${team.id}`}>
            <div className="team-band-head">
              <TeamChip name={team.name} />
              <span className="team-band-meta">{teamMeta(team, members, userId)}</span>
              <div className="spacer" />
              <button
                className="team-band-open"
                onClick={() => onOpenTeam(team.id)}
                title="See who is in the team, and the join code to invite someone"
                data-testid="team-band-open"
              >
                <IconUsers />
                Members &amp; join code
              </button>
            </div>
            {held.length > 0 ? (
              <div className="prod-grid">{held.map(renderCard)}</div>
            ) : (
              <p className="hint" data-testid="team-band-empty">
                Nothing shared in this team yet. Anyone in it can open one of their own productions,
                choose <strong>Share</strong> and move it here - it then appears for everybody.
              </p>
            )}
          </div>
        );
      })}
    </section>
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
  const openTeam = useTeamsUi((s) => s.openTeam);
  const teamState = useTeamState();
  // A team production's delete is a server round trip (and the team owner's alone), so it can
  // fail after the confirm - the reason lands on the card that asked.
  const [teamDeleteError, setTeamDeleteError] = useState<{ id: string; message: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [exportShow, setExportShow] = useState<Show | null>(null);
  // The pack door's state: which file is installing, and the outcome line.
  const [packBusy, setPackBusy] = useState<string | null>(null);
  const [packNote, setPackNote] = useState<string | null>(null);
  const packInput = useRef<HTMLInputElement>(null);
  // WAITING PACKAGES (docs/AGENT_SAVE.md §7): what a coding agent sent with `noacg pack --save`,
  // listed here with Install until the user installs or dismisses it. Signed-in and backed only -
  // an offline build asks nothing and grows no row. `waitingConfirm` is the one package whose
  // Dismiss is asking "sure?", the same two-step the production Delete uses.
  const { backendConfigured, signedIn, user } = useAuthState();
  const [waiting, setWaiting] = useState<WaitingPackage[]>([]);
  const [waitingNote, setWaitingNote] = useState<string | null>(null);
  const [waitingConfirm, setWaitingConfirm] = useState<string | null>(null);
  // MINE AND THE TEAM'S, NEVER INTERLEAVED (TEAMS_PLAN §6, mockup `teams-home.html`). A production
  // somebody shared with you through a team must be findable at a glance, and one mixed into your
  // own list by date is not - so team productions get their own band per team, after yours.
  const personal = productions.filter((p) => !p.teamId);
  const teamProductions = productions.filter((p) => p.teamId);
  // The bands exist once there is a team to show - never for a user in no team, who sees this
  // section exactly as it always was (§6: the word "team" appears only after the door is opened).
  const showTeams = teamsAvailable && (teamState.teams.length > 0 || teamProductions.length > 0);
  const shown = limit ? personal.slice(0, limit) : personal;
  // Open the record this call MADE, never "the last one in the list": team productions are listed
  // after your own, so the last one is somebody's team production the moment you are in a team.
  // A write that did not land opens nothing (the app-level storage alert says why).
  const create = () => {
    const { show, error } = createShowNamedChecked(newName);
    onChanged();
    if (error) return;
    setNewName('');
    onOpen(show);
  };

  // Load the waiting list when a session appears, and again whenever the tab comes back into
  // view: the usual moment is "the agent says it sent the package, I switch to the studio".
  useEffect(() => {
    if (!backendConfigured || !signedIn) {
      setWaiting([]);
      return;
    }
    let stale = false;
    const load = () => {
      void listWaitingPackages().then((list) => {
        if (!stale) setWaiting(list);
      });
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stale = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [backendConfigured, signedIn]);

  /**
   * Parse, validate and install one pack's text; land on the new production's page. A failure
   * is shown through `report`. `beforeOpen` runs once the production exists and before the page
   * changes - the waiting row's clean-up.
   */
  const importPackText = async (
    label: string,
    text: string,
    report: (message: string | null) => void = setPackNote,
    beforeOpen?: () => Promise<void>,
  ) => {
    setPackBusy(label);
    report(null);
    try {
      const { pack, error } = parsePack(text);
      if (!pack) throw new Error(error ?? 'That file is not a NoaCG graphics pack.');
      const show = await installPack(pack);
      trackEvent('activation', 'pack');
      await beforeOpen?.();
      onChanged();
      onOpen(show);
    } catch (error) {
      report(error instanceof Error ? error.message : String(error));
    } finally {
      setPackBusy(null);
    }
  };

  /** Install a waiting package: the same parse → validate → install as a file, then the row goes. */
  const installWaiting = async (p: WaitingPackage) => {
    // Busy from the first click, not from when the text arrives - a second click during the
    // fetch would otherwise install the package twice.
    setPackBusy(p.id);
    let text: string;
    try {
      text = await waitingPackageText(p.id);
    } catch (error) {
      setWaitingNote(error instanceof Error ? error.message : String(error));
      setPackBusy(null);
      return;
    }
    await importPackText(p.id, text, setWaitingNote, async () => {
      // The production exists now. A failed delete only leaves the row to be dismissed by hand -
      // never worth failing an install that already happened.
      await removeWaitingPackage(p.id);
      setWaiting((list) => list.filter((w) => w.id !== p.id));
    });
  };

  const dismissWaiting = async (p: WaitingPackage) => {
    setWaitingConfirm(null);
    const { error } = await removeWaitingPackage(p.id);
    if (error) setWaitingNote(error);
    else setWaiting((list) => list.filter((w) => w.id !== p.id));
  };

  const importPackFile = async (file: File | undefined) => {
    if (!file) return;
    await importPackText(file.name, await file.text());
  };

  /**
   * One production's card. A TEAM production (`teamId`) is the same card with three differences:
   * it wears the team's chip and "edited by", its overflow menu opens the team rather than the
   * share door, and only the team's owner is offered Delete (migration 0054, ruling 3) - a member
   * who pressed it would be refused by the database, which is a worse way to find out.
   */
  const productionCard = (r: Show) => {
    const team = r.teamId ? teamState.teams.find((t) => t.id === r.teamId) ?? null : null;
    const head: TeamProductionHead | undefined = teamState.heads[r.id];
    const canDelete = !r.teamId || (team !== null && team.ownerId === user?.id);
    return (
    <div
      className={`prod-card${r.hostedSlug ? ' live' : ''}${team ? ' team' : ''}`}
      key={r.id}
      data-testid={`production-row-${r.id}`}
      data-team={team?.id}
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
        {!canDelete ? null : confirmDelete === r.id ? (
          <button
            className="destructive"
            onClick={() => {
              if (team) {
                // A team production is deleted on the server - both planes, the team
                // owner's call (backend/teamProductions.ts) - never by a local tombstone.
                setConfirmDelete(null);
                setTeamDeleteError(null);
                void deleteTeamProduction(r).then(({ error }) => {
                  if (error) setTeamDeleteError({ id: r.id, message: error });
                  onChanged();
                });
                return;
              }
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
              team
                ? 'Delete this production for everyone in the team. Its links stop working if it is published.'
                : r.hostedSlug
                ? 'Delete this production. It is published, so its output and control links stop working. Its graphics stay saved wherever else they live.'
                : 'Delete this production (its graphics stay saved wherever else they live)'
            }
            data-testid="production-delete-confirm"
          >
            {team ? 'Delete for the team?' : r.hostedSlug ? 'Delete and unpublish?' : 'Delete?'}
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
              team
                ? {
                    label: 'Team members & join code…',
                    icon: <IconUsers />,
                    onClick: () => openTeam(team.id),
                    testid: 'open-team',
                  }
                : {
                    label: 'Share with a team…',
                    icon: <IconUsers />,
                    onClick: () => openShare(r.id, r.name),
                    testid: 'share-with-team',
                  },
            ]}
          />
        )}
      </div>

      {/* WHOSE IT IS AND WHO TOUCHED IT LAST (TEAMS_PLAN §6): the team's chip and "edited
          by" from the server row, so a shared production never passes for one of yours. */}
      {team && (
        <p className="prod-card-team" data-testid="team-production-meta">
          <TeamChip name={team.name} />
          {head && (
            <span>
              edited by {teamMemberName(team.id, head.updatedBy)}, {editedWhen(head.updatedAt)}
            </span>
          )}
        </p>
      )}
      {teamDeleteError?.id === r.id && <p className="status-bad">{teamDeleteError.message}</p>}

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
    );
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
      {/* Packages a coding agent sent - one row each, Install turns it into a production and
          opens its rundown. Shown on the Home dashboard too: arriving is news. */}
      {waiting.length > 0 && (
        <div className="pack-waiting" data-testid="waiting-packages">
          <strong>Waiting to install</strong>
          {waiting.map((p) => (
            <div className="pack-waiting-row" key={p.id} data-testid={`waiting-package-${p.id}`}>
              <div className="lib-info">
                <strong>{p.name}</strong>
                <span className="muted">
                  {p.graphicCount} graphic{p.graphicCount === 1 ? '' : 's'} · sent from your coding
                  agent · {new Date(p.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                {p.description && <span className="muted">{p.description}</span>}
              </div>
              <button
                className="primary"
                disabled={packBusy !== null}
                onClick={() => void installWaiting(p)}
                data-testid="install-waiting-package"
              >
                {packBusy === p.id ? 'Installing…' : 'Install'}
              </button>
              {waitingConfirm === p.id ? (
                <button
                  className="destructive"
                  onClick={() => void dismissWaiting(p)}
                  title="Remove this package without installing it"
                  data-testid="dismiss-waiting-package-confirm"
                >
                  Dismiss?
                </button>
              ) : (
                <button
                  disabled={packBusy !== null}
                  onClick={() => setWaitingConfirm(p.id)}
                  title="Dismiss this package"
                  aria-label={`Dismiss ${p.name}`}
                  data-testid="dismiss-waiting-package"
                >
                  <IconTrash />
                </button>
              )}
            </div>
          ))}
          {waitingNote && <p className="status-bad">{waitingNote}</p>}
        </div>
      )}
      {/* The band heading appears only beside a team band: a user in no team keeps the one list
          they always had, with no word added to it. */}
      {showTeams && (
        <h3 className="prod-band-head" data-testid="my-productions-head">
          My productions <span className="prod-band-count">{personal.length}</span>
        </h3>
      )}
      {personal.length === 0 && (
        <p className="hint" data-testid="no-productions">
          {showTeams
            ? 'None of your own yet. Name one below; what your teams share is listed under each team.'
            : 'No productions yet — name one below, then add graphics and cues.'}
        </p>
      )}
      {/* CARDS, not rows (re-design/handoff.md §5a). A production is the unit that airs — it
          has a state, a size, and a set of graphics — and a one-line row could show none of
          that. The card leads with its name and whether it is published, then what is in it,
          then a strip of the graphics themselves, then the ways to open and take it away. */}
      <div className="prod-grid">
        {shown.map(productionCard)}
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
      {showTeams && (
        <TeamBands
          teams={teamState.teams}
          members={teamState.members}
          loaded={teamState.loaded}
          loadError={teamState.loadError}
          productions={teamProductions}
          userId={user?.id}
          renderCard={productionCard}
          onOpenTeam={openTeam}
        />
      )}
      {exportShow && <ProductionExportDialog show={exportShow} onClose={() => setExportShow(null)} />}
    </>
  );
}
