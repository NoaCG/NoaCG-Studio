import { useState } from 'react';
import {
  loadPlayoutSettings,
  playoutConfigured,
  putOutputOnAir,
  slotAddress,
  slotOf,
  takeOutputOff,
  type PlayoutResult,
} from '../../control/playoutLink';

/**
 * PUBLISHING AND THE LINKS of the playout dashboard (docs/PLAYOUT_DASHBOARD.md §7), split out of
 * `ProductionPage` on 2026-08-28 and, since the studio-day follow-up, drawn as sections of the one
 * Playout panel (home/PlayoutStatusControl.tsx) rather than a popover of their own.
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
 * THE ONE BUTTON (docs/BRIDGE.md §2). One take of the output URL - `PLAY <channel>-<layer> [HTML]
 * "<output URL>"` on CasparCG - is the entire live link for NoaCG's own graphics: from there
 * every cue, take, update and recovery flows through the durable command log the /output page
 * already follows, which is why there is no per-take CG traffic here. Server-resident templates
 * and clips are a different kind of cue, and live in the rundown.
 *
 * It appears only once a server is configured under Settings -> Playout. Unconfigured, the row
 * would be a dead control on the busiest surface in the app - and the URL row directly above it
 * is the manual route that has always worked and still does.
 */
function BridgeAirRow({ outputUrl, primary, onSent }: { outputUrl: string | null; primary?: boolean; onSent?: () => void }) {
  const [busy, setBusy] = useState<'air' | 'stop' | null>(null);
  // WHICH command produced this result, not just the result. Both buttons succeed the same way -
  // `{ state: 'ok' }` - so a message written from the result alone said "✓ On 1-20" after Take
  // off as well, telling an operator the graphic was up a second after they took it down.
  // Measured against a real CasparCG 2.5.0 on 2026-09-10; the fake-Bridge spec could not see it,
  // because it asserted on `data-state` and never on the words.
  // The ADDRESS is captured with it, and for the mirror of the reason `run` re-reads the settings
  // below: this sentence is PAST tense. Rendering the address re-derives it from
  // present settings, so airing on 2-30 and then typing layer 40 for the next show turns a
  // standing verdict into "✓ On 2-40" - a claim about a layer nothing was ever sent to.
  const [outcome, setOutcome] = useState<{
    what: 'air' | 'stop';
    address: string;
    result: PlayoutResult;
  } | null>(null);

  // Read on every render, and again at the moment of the click, rather than latching a copy at
  // mount: Settings is a modal that can be opened and changed without this page unmounting, and
  // a latched copy would quietly send the command to the OLD server while the row displayed the
  // old channel. It is a parse of a few hundred bytes, against a control that airs a graphic.
  const settings = loadPlayoutSettings();
  if (!playoutConfigured(settings)) return null;

  const run = async (what: 'air' | 'stop') => {
    const now = loadPlayoutSettings();
    setBusy(what);
    setOutcome(null);
    try {
      const result = what === 'air' ? await putOutputOnAir(now, outputUrl!) : await takeOutputOff(now);
      setOutcome({ what, address: slotAddress(slotOf(now)), result });
    } finally {
      setBusy(null);
      onSent?.();
    }
  };

  return (
    <LinkRow
      label="CasparCG"
      testId="caspar-air"
      help={
        <>
          Loads the output URL above onto channel <code>{slotAddress(slotOf(settings))}</code> of{' '}
          <code>{settings.host}</code>, through NoaCG Bridge on this machine. Do it once at the
          start of the production and leave it up - the graphics are cued from this page, not by
          re-loading the layer. Change the server under Setup, below.
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
              : `✓ ${outcome.what === 'air' ? 'On' : 'Off'} ${outcome.address}`}
          </span>
        )
      }
    >
      <span className="prod-link-file" data-testid="caspar-air-target">
        {settings.host} · {slotAddress(slotOf(settings))}
      </span>
      <button className={primary ? 'primary' : undefined} onClick={() => void run('air')} disabled={!outputUrl || busy !== null} data-testid="caspar-put-on-air">
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

/**
 * ▶ START PRODUCTION: the one press that publishes a production for the first time. It sits beside
 * the playout status while the production is offline (docs/work-specs/studio-day-playout AC-8), the
 * one action an offline production needs, and the panel says the same in words.
 */
export function StartProductionButton({
  busy,
  backendConfigured,
  hasCues,
  needsSignIn,
  onPublish,
}: {
  busy: boolean;
  backendConfigured: boolean;
  /** The rundown holds at least one cue. Until it does, Start production is QUIET: publishing an
   *  empty production works (it mints the links, so the output URL can be set up early), but it
   *  runs nothing, so it is not the page's call to action - the amber belongs to the first thing
   *  there is to take. */
  hasCues: boolean;
  /** A backend is configured and nobody is signed in. The button stays LIVE - pressing it is
   *  what opens the sign-in - and its tooltip says the need before anyone presses. */
  needsSignIn: boolean;
  onPublish: () => void;
}) {
  return (
    <button
      className={hasCues ? 'primary' : undefined}
      onClick={onPublish}
      disabled={busy || !backendConfigured}
      title={
        !backendConfigured
          ? 'Publishing needs the cloud backend, and this build runs offline'
          : (hasCues ? '' : 'No cues yet, so there is nothing to run. ') +
            (needsSignIn
              ? 'Puts this production online: one output URL for CasparCG, OBS or vMix and one control page. Needs a free account.'
              : 'Publish: one persistent output URL for CasparCG/OBS/vMix and one control page for operating')
      }
      data-testid="production-publish"
    >
      ▶ Start production
    </button>
  );
}

/**
 * THE PANEL'S ACTIONS for a started production (docs/work-specs/studio-day-playout AC-8): publish
 * what changed - which also asks every open output to prepare it (AC-10) - or unpublish, and put the
 * output on CasparCG or take it off. Publishing, putting on air and preparing stay separate presses
 * (owner, 2026-10-01: each fails differently, so no one button does all three yet).
 */
export function PublishActions({
  busy,
  unpublishedChanges,
  outputUrl,
  airNeeded,
  onPublish,
  onUnpublish,
  onAirChanged,
}: {
  busy: boolean;
  unpublishedChanges: boolean;
  outputUrl: string | null;
  /** The NoaCG output's slot does not hold this production: Put on air is the press that is due. */
  airNeeded: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  /** Put on air or Take off was sent: the slot changed, so the status reads it again now. */
  onAirChanged: () => void;
}) {
  return (
    <>
      {unpublishedChanges && (
        <p className="status-warn" data-testid="publish-freshness">
          The outputs run the published version. Publish changes sends them yours, and each output moves
          onto them when nothing is on air there.
        </p>
      )}
      <div className="row">
        {/* The amber primary only while there IS something to publish: otherwise the press the
            panel needs (Put on air, below) must not sit beside a louder one that does nothing. */}
        <button className={unpublishedChanges ? 'primary' : undefined} onClick={onPublish} disabled={busy} data-testid="production-republish">
          ⟳ Publish changes
        </button>
        <button onClick={onUnpublish} disabled={busy} data-testid="production-unpublish">
          Unpublish
        </button>
      </div>
      {/* The output URL, loaded for you onto the NoaCG output's slot (docs/BRIDGE.md §2). */}
      <BridgeAirRow outputUrl={outputUrl} primary={airNeeded} onSent={onAirChanged} />
    </>
  );
}

/**
 * THE LINKS (docs/PLAYOUT_DASHBOARD.md §7), last in the Playout panel: what an OBS or vMix operator
 * copies, the control page, the audience and presenter links. An operator on CasparCG through the
 * Bridge needs none of them to go on air (owner, 2026-10-01), which is why they are not first.
 */
export function ProductionLinkRows({
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
  onCopy,
  embedFileName,
  onDownloadEmbed,
}: {
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
  onCopy: (kind: 'output' | 'control' | 'join' | 'presenter', text: string) => void;
  embedFileName: string;
  onDownloadEmbed: () => void;
}) {
  return (
    <div data-testid="production-links">
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
      {/* THE SAME OUTPUT, AS A FILE. An SPX rundown lists template files out of ASSETS/templates
          and has nowhere to paste a URL, so the row above reaches every playout host except the
          one this project treats as canonical. The file wraps this production's output URL in a
          full-frame iframe (export/outputEmbed.ts): SPX plays the item, NoaCG cues what is inside
          it. QUIET, and directly under the URL it is a second form of. */}
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
        {/* NOT `.mono` as a class: `.prod-link-row > .mono` is the 92px LABEL column. The mono
            FACE comes from the rule below. */}
        <span className="prod-link-file">{embedFileName}</span>
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
      {/* The AUDIENCE link is the one link here meant to be given away, so it is described as
          public and its help opens by DEFAULT: every other row explains a thing that is private,
          and a collapsed "public" is the one omission here that could air. */}
      {joinUrl && (
        <>
          <LinkRow
            label="Audience link"
            testId="join-url"
            openByDefault
            help={
              <>
                This link is public. Share it with the room. Viewers send questions and vote here;
                nothing they send goes on air until you approve it and take it, on the Audience tab.
              </>
            }
          >
            <code className="prod-url">{joinUrl}</code>
            <button onClick={() => onCopy('join', joinUrl)} data-testid="copy-join-url">
              {copied === 'join' ? '✓ Copied' : 'Copy'}
            </button>
          </LinkRow>
          {/* A READABLE NAME, because this is the one URL that gets said out loud. The first
              publish already derived one (control/joinName.ts); this changes it. Every rule lives
              on the column in migration 0035, and the answer to "is it free?" is the claim. */}
          <LinkRow
            label="Readable name"
            testId="join-name"
            quiet
            help={
              <>
                The name above came from this production&rsquo;s name when you first published.
                Changing it makes the old audience link stop working. Do it before you share it,
                not mid-show.
              </>
            }
            under={
              nameNote ? (
                <p className={nameNote.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="join-name-note">
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
      {/* The PRESENTER link: a third capability with a third audience, described by who it is FOR,
          because the one mistake that matters here is reading the wrong URL out on air. */}
      {presenterUrl && (
        <LinkRow
          label="Presenter link"
          testId="presenter-url"
          help={
            <>
              For the presenter&rsquo;s own phone or tablet. It shows what they are on now and what
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
    </div>
  );
}
