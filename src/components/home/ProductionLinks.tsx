import { useState } from 'react';
import type { Show } from '../../model/shows';
import LibMenu from './LibMenu';
import { IconLink } from '../icons';
import {
  airOnCaspar,
  casparAddress,
  casparConfigured,
  loadCasparSettings,
  stopOnCaspar,
  type CasparResult,
} from '../../control/casparLink';

/**
 * THE LINKS PANEL of the playout dashboard (docs/PLAYOUT_DASHBOARD.md §7) — publishing and the
 * capability URLs, split out of `ProductionPage` on 2026-08-28.
 *
 * Everything here is READ-ONLY with respect to the dashboard's own state: it renders what it is
 * given and calls back. The publish / unpublish / claim handlers stay on `ProductionPage`
 * because unpublish clears `liveCue`, and that map is what Take airs — see
 * docs/backlog/production-page-phases.md for why it may not move with the panel.
 */
/**
 * ONE ROW of the links panel: the capability on a single line, its explanation one small arrow
 * away.
 *
 * Every row here used to carry an always-open paragraph, and five of them turned a popover into
 * a page — the control page, the link a class actually operates from, sat below the fold under
 * an explanation of an SPX file most of them will never download. The text is not the problem
 * (an operator reading it once is exactly who it is for); being unable to put it away is. So the
 * help COLLAPSES per row, and a row can be `quiet` — present, findable, but not competing with
 * the links people copy every show.
 */
/**
 * THE ONE BUTTON (docs/CASPARCG_CONNECT.md §2). One `PLAY <channel>-<layer> [HTML] "<output
 * URL>"` is the entire live link: from there every cue, take, update and recovery flows through
 * the durable command log the /output page already follows, which is why there is no per-take
 * CG traffic here.
 *
 * It appears only once a server is configured under Settings -> Playout. Unconfigured, the row
 * would be a dead control on the busiest surface in the app - and the URL row directly above it
 * is the manual route that has always worked and still does.
 */
function CasparAirRow({ outputUrl }: { outputUrl: string | null }) {
  const [busy, setBusy] = useState<'air' | 'stop' | null>(null);
  // WHICH command produced this result, not just the result. Both buttons succeed the same way -
  // `{ state: 'ok' }` - so a message written from the result alone said "✓ On 1-20" after Take
  // off as well, telling an operator the graphic was up a second after they took it down.
  // Measured against a real CasparCG 2.5.0 on 2026-09-10; the fake-agent spec could not see it,
  // because it asserted on `data-state` and never on the words.
  const [outcome, setOutcome] = useState<{ what: 'air' | 'stop'; result: CasparResult } | null>(null);

  // Read on every render, and again at the moment of the click, rather than latching a copy at
  // mount: Settings is a modal that can be opened and changed without this page unmounting, and
  // a latched copy would quietly send the command to the OLD server while the row displayed the
  // old channel. It is a parse of a few hundred bytes, against a control that airs a graphic.
  const settings = loadCasparSettings();
  if (!casparConfigured(settings)) return null;

  const run = async (what: 'air' | 'stop') => {
    const now = loadCasparSettings();
    setBusy(what);
    setOutcome(null);
    try {
      const result = what === 'air' ? await airOnCaspar(now, outputUrl!) : await stopOnCaspar(now);
      setOutcome({ what, result });
    } finally {
      setBusy(null);
    }
  };

  return (
    <LinkRow
      label="CasparCG"
      testId="caspar-air"
      help={
        <>
          Loads the output URL above onto channel <code>{casparAddress(settings)}</code> of{' '}
          <code>{settings.host}</code>, through the agent running on this machine. Do it once at the
          start of the production and leave it up - the graphics are cued from this page, not by
          re-loading the layer. Change the server under Settings &rarr; Playout.
        </>
      }
      under={
        outcome && (
          <span
            className={outcome.result.state === 'ok' ? 'status-ok' : 'status-bad'}
            data-testid="caspar-air-result"
            data-state={outcome.result.state}
          >
            {outcome.result.state !== 'ok'
              ? outcome.result.detail
              : outcome.what === 'air'
                ? `✓ On ${casparAddress(settings)}`
                : `✓ Off ${casparAddress(settings)}`}
          </span>
        )
      }
    >
      <span className="prod-link-file" data-testid="caspar-air-target">
        {settings.host} · {casparAddress(settings)}
      </span>
      <button onClick={() => void run('air')} disabled={!outputUrl || busy !== null} data-testid="caspar-put-on-air">
        {busy === 'air' ? 'Sending…' : 'Put on air'}
      </button>
      <button
        className="prod-link-quiet-action"
        onClick={() => void run('stop')}
        disabled={busy !== null}
        data-testid="caspar-take-off-air"
      >
        {busy === 'stop' ? 'Stopping…' : 'Take off'}
      </button>
    </LinkRow>
  );
}

function LinkRow({
  label,
  help,
  testId,
  quiet,
  openByDefault,
  under,
  children,
}: {
  label: string;
  help: React.ReactNode;
  testId: string;
  /** A secondary capability: smaller and dimmer, so the row is found rather than read past. */
  quiet?: boolean;
  openByDefault?: boolean;
  /** A verdict belonging to this row's own control, always shown (a refusal never collapses). */
  under?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!openByDefault);
  return (
    <div className={`prod-link-item${quiet ? ' quiet' : ''}`}>
      <div className="prod-link-row">
        <span className="mono muted">{label}</span>
        {children}
        <button
          className="prod-link-help-toggle"
          aria-expanded={open}
          aria-label={open ? `Hide what the ${label.toLowerCase()} is for` : `What is the ${label.toLowerCase()} for?`}
          title={open ? 'Hide the explanation' : 'What is this for?'}
          onClick={() => setOpen((o) => !o)}
          data-testid={`${testId}-help-toggle`}
        >
          {open ? '▾' : '▸'}
        </button>
      </div>
      {under}
      {open && (
        <p className="hint prod-link-help" data-testid={`${testId}-help`}>
          {help}
        </p>
      )}
    </div>
  );
}

/** Publishing and the two capability links (docs/PLAYOUT_DASHBOARD.md §7) — the dashboard's
 *  other job, one click from the operator rather than a page they must navigate away to. */
export default function ProductionLinks({
  show,
  open,
  onToggle,
  backendConfigured,
  busy,
  outputUrl,
  controlUrl,
  joinUrl,
  presenterUrl,
  nameDraft,
  nameNote,
  onNameDraft,
  onClaimName,
  copied,
  unpublishedChanges,
  onCopy,
  embedFileName,
  onDownloadEmbed,
  onPublish,
  onUnpublish,
}: {
  show: Show;
  open: boolean;
  onToggle: () => void;
  backendConfigured: boolean;
  busy: boolean;
  outputUrl: string | null;
  controlUrl: string | null;
  joinUrl: string | null;
  presenterUrl: string | null;
  nameDraft: string;
  nameNote: string | null;
  onNameDraft: (value: string) => void;
  onClaimName: () => void;
  copied: 'output' | 'control' | 'join' | 'presenter' | null;
  unpublishedChanges: boolean;
  onCopy: (kind: 'output' | 'control' | 'join' | 'presenter', text: string) => void;
  embedFileName: string;
  onDownloadEmbed: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  if (!show.hostedSlug) {
    return (
      <button
        className="primary"
        onClick={onPublish}
        disabled={busy || !backendConfigured}
        title={
          backendConfigured
            ? 'Publish: one persistent output URL for CasparCG/OBS/vMix and one control page for operating'
            : 'Publishing needs the cloud backend — this build runs offline'
        }
        data-testid="production-publish"
      >
        ▶ Start production
      </button>
    );
  }
  return (
    <div className="pd-links-host">
      <button onClick={onToggle} aria-expanded={open} data-testid="production-links-toggle">
        <IconLink /> Links{unpublishedChanges ? ' •' : ''}
      </button>
      {/* Same shell as the library's row menus (home/LibMenu). What was off-screen here is the
          panel's own TAIL: six link rows with their ▸ explanations open, then Publish/Unpublish,
          is taller than a short laptop window, and this popover had no `max-height` at all. So
          the repair is the cap `.pd-links` now carries rather than the flip — hanging off a
          header pinned to the top of the page, down stays the better side. It is on the shell
          anyway, because the measurement must not fork per popover. */}
      <LibMenu open={open} onClose={onToggle} surface="pd-links" role="none" testid="production-links">
        <LinkRow
          label="Output URL"
          testId="output-url"
          help={
            <>
              Add this once as a browser source (OBS / vMix) or a CasparCG HTML template. It keeps
              working across re-publishes; graphics and cues update in place.
            </>
          }
        >
          <code className="prod-url">{outputUrl}</code>
          <button onClick={() => outputUrl && onCopy('output', outputUrl)} data-testid="copy-output-url">
            {copied === 'output' ? '✓ Copied' : 'Copy'}
          </button>
        </LinkRow>
        {/* The same URL, loaded for you. Directly under the row it acts on, because it IS that
            row's other verb - not a separate capability. */}
        <CasparAirRow outputUrl={outputUrl} />
        {/* THE SAME OUTPUT, AS A FILE. An SPX rundown lists template files out of
            ASSETS/templates and has nowhere to paste a URL, so the row above reaches every
            playout host except the one this project treats as canonical. The file wraps this
            production's output URL in a full-frame iframe (export/outputEmbed.ts): SPX plays
            the item, NoaCG cues what is inside it.
            QUIET, and directly under the URL it is a second form of: it belongs to the one
            host that cannot take the link, so as a full-size row with its own paragraph it
            read as a fourth capability and pushed the control page below the fold. */}
        <LinkRow
          label="Template file"
          testId="spx-template"
          quiet
          help={
            <>
              For playout that loads template <em>files</em> instead of URLs - SPX, or a CasparCG
              template folder. Drop it into SPX&rsquo;s <code>ASSETS/templates</code> and add it to a
              rundown: Play puts the output up, Stop takes it down, and you cue the graphics from here
              or the control page. It carries the output link, so keep it as private as the link itself.
            </>
          }
        >
          {/* NOT `.mono` as a class: `.prod-link-row > .mono` is the 92px LABEL column, so
              wearing it made the file name a second label and left the row's ▸ short of the
              column every other row's sits in. The mono FACE comes from the rule below. */}
          <span className="prod-link-file">{embedFileName}</span>
          {/* "Download", not "⬇ Download": it sits in a column with two Copy buttons, and the
              glyph made this one row a pixel taller than its neighbours. */}
          <button className="prod-link-quiet-action" onClick={onDownloadEmbed} data-testid="download-output-embed">
            Download
          </button>
        </LinkRow>
        <LinkRow
          label="Control page"
          testId="control-url"
          help={
            <>
              Operate from a phone or tablet, no account needed. Keep the link private: holding it is
              the permission to operate.
            </>
          }
        >
          <code className="prod-url">{controlUrl}</code>
          <button onClick={() => controlUrl && onCopy('control', controlUrl)} data-testid="copy-control-url">
            {copied === 'control' ? '✓ Copied' : 'Copy'}
          </button>
        </LinkRow>
        {/* The AUDIENCE link is the one link here meant to be given away — read out on air,
            put on a slide, printed on a QR code. It is listed last and described as public
            so it can never be mistaken for the control page above it. Its help opens by
            DEFAULT for that reason: every other row explains a thing that is private, and a
            collapsed "public" is the one omission on this panel that could air. */}
        {joinUrl && (
          <>
            <LinkRow
              label="Audience link"
              testId="join-url"
              openByDefault
              help={
                <>
                  Public — share it with the room. Viewers send questions and vote here; nothing they
                  send goes on air until you approve it and take it, on the Audience tab.
                </>
              }
            >
              <code className="prod-url">{joinUrl}</code>
              <button onClick={() => onCopy('join', joinUrl)} data-testid="copy-join-url">
                {copied === 'join' ? '✓ Copied' : 'Copy'}
              </button>
            </LinkRow>
            {/* A READABLE NAME, because this is the one URL that gets said out loud. The
                first publish already derived one from the production's name (control/
                joinName.ts), so this field is for CHANGING it rather than for having a link
                at all. It validates nothing: every rule lives on the column in migration
                0035, and the answer to "is it free?" is the claim itself (hostedControl
                claimJoinName says why there is no availability check). */}
            <LinkRow
              label="Readable name"
              testId="join-name"
              quiet
              help={
                <>
                  The name above came from this production&rsquo;s name when you first published.
                  Changing it makes the old audience link stop working — do it before you share it,
                  not mid-show.
                </>
              }
              under={
                nameNote ? (
                  <p
                    className={nameNote.startsWith('✓') ? 'status-ok' : 'status-bad'}
                    data-testid="join-name-note"
                  >
                    {nameNote}
                  </p>
                ) : null
              }
            >
              <input
                type="text"
                value={nameDraft}
                placeholder="friday-night-live"
                onChange={(e) => onNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onClaimName();
                }}
                data-testid="join-name-input"
              />
              <button onClick={onClaimName} disabled={busy} data-testid="join-name-claim">
                Use this name
              </button>
            </LinkRow>
          </>
        )}
        {/* The PRESENTER link is a third capability with a third audience: not the operator's
            control page and emphatically not the public one. It carries no moderation and no
            tally — only the two questions the Audience tab points at, in the presenter's own
            hand. Listed after the audience link and described by who it is FOR, because the
            one mistake that matters here is reading the wrong URL out on air. */}
        {presenterUrl && (
          <LinkRow
            label="Presenter link"
            testId="presenter-url"
            help={
              <>
                For the presenter&rsquo;s own phone or tablet — it shows what they are on now and what
                comes next, and nothing else. Choose those with 🎤 Now and ⇢ Next on the Audience tab.
              </>
            }
          >
            <code className="prod-url">{presenterUrl}</code>
            <button onClick={() => onCopy('presenter', presenterUrl)} data-testid="copy-presenter-url">
              {copied === 'presenter' ? '✓ Copied' : 'Copy'}
            </button>
          </LinkRow>
        )}
        {unpublishedChanges && (
          <p className="status-warn" data-testid="publish-freshness">
            The production changed after the last publish — the output and control pages run the older
            snapshot until you publish changes.
          </p>
        )}
        <div className="row">
          <button className="primary" onClick={onPublish} disabled={busy} data-testid="production-republish">
            ⟳ Publish changes
          </button>
          <button onClick={onUnpublish} disabled={busy} data-testid="production-unpublish">
            Unpublish
          </button>
        </div>
      </LibMenu>
    </div>
  );
}
