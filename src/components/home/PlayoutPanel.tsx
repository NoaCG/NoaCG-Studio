import { useEffect, useState, type ReactNode } from 'react';
import { TONE_DOT, type OutputLine, type ReadyTone } from '../../control/readiness';
import type { StatusCheck } from '../../control/playoutStatus';
import { bridgePaired, loadPlayoutSettings, type PlayoutSettings } from '../../control/playoutLink';
import { observeVmixOutput, readVmixOutput, type VmixOutputReading, type VmixReplace } from '../../control/vmixSetup';
import { DOWNLOADS_BRIDGE_URL } from '../../downloads/links';

/**
 * THE PLAYOUT PANEL'S SECTIONS (docs/work-specs/playout-workflow-simplification AC-3), opened from
 * the header's one status: the reporting outputs, the browser source, and the Bridge switches with
 * the selected adapter's controls and Playout settings. Labels, states and actions only; a longer reason sits
 * in a row's tooltip, and only real errors are spelled out. Read-only with respect to the page:
 * everything is drawn from props and every press calls back.
 */

/** A state's dot, in its tone's colour: the panel's rows and its status line. */
export function Dot({ tone }: { tone: ReadyTone }) {
  return (
    <span className={`pd-pp-dot pd-pp-dot--${tone}`} aria-hidden="true">
      {TONE_DOT[tone]}
    </span>
  );
}

function Section({ title, testId, aside, children }: { title?: string; testId: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="pd-pp-section" data-testid={testId}>
      {(title || aside) && (
        <div className="pd-pp-head">
          {title && <h3 className="pd-pp-title">{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** The checks that say what went wrong and live in no row of their own: a Take that reached no
 *  output, server files, cue settings, a failed publish. */
export function PanelProblems({ checks }: { checks: readonly (Pick<StatusCheck, 'tone' | 'label' | 'advice'> & { key: string })[] }) {
  if (checks.length === 0) return null;
  return (
    <ul className="pd-pp-problems" data-testid="playout-panel-problems">
      {checks.map((c) => (
        <li key={c.key} className={`pd-pp-problem pd-pp-problem--${c.tone}`} data-testid={`status-check-${c.key}`} data-tone={c.tone}>
          <Dot tone={c.tone} />
          <span>
            {c.label}
            {c.advice && <span className="pd-pp-advice">{c.advice}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One row per output as it reports, its state in the plan's words; the longer account in the
 *  tooltip. A gone output can be dismissed. "Check now" asks every output again. */
export function RendererRows({
  outputs,
  onDismiss,
  onCheck,
  checking,
  checked,
  paths = {},
}: {
  outputs: readonly OutputLine[];
  onDismiss: (id: string) => void;
  onCheck?: () => void;
  checking: boolean;
  /** "Checked 14:02": when the last check finished. */
  checked?: string;
  /** Each output's command path from the last check ("110 ms", "Commands late"), by output id. */
  paths?: Record<string, { text: string; tone: ReadyTone }>;
}) {
  return (
    <Section
      title="Outputs"
      testId="playout-panel-outputs"
      aside={
        <span className="pd-pp-head-aside">
          {checked && !checking && (
            <span className="pd-pp-state" data-testid="playout-checked">
              {checked}
            </span>
          )}
          {onCheck && (
            <button type="button" className="pd-pp-link" onClick={onCheck} disabled={checking} data-testid="playout-check-now">
              {checking ? 'Checking…' : 'Check now'}
            </button>
          )}
        </span>
      }
    >
      {outputs.length === 0 ? (
        <div className="pd-pp-row pd-pp-row--quiet" data-testid="playout-no-outputs">
          <Dot tone="idle" />
          <span className="pd-pp-name">None yet</span>
        </div>
      ) : (
        outputs.map((line) => (
          <div
            key={line.id}
            className={`pd-pp-row pd-pp-row--${line.tone}`}
            data-testid="ready-output"
            data-tone={line.tone}
            title={line.detail.join('\n')}
          >
            <Dot tone={line.tone} />
            <span className="pd-pp-name">{line.name}</span>
            <span className="pd-pp-state" data-testid="ready-state">
              {line.gone ? (line.tone === 'bad' ? 'Lost' : 'Reconnecting…') : line.state}
            </span>
            {paths[line.id] && !line.gone && (
              <span className={`pd-pp-state pd-pp-path pd-pp-path--${paths[line.id].tone}`} data-testid="ready-path" title="Command path, from the last check">
                {paths[line.id].text}
              </span>
            )}
            {line.gone && (
              <button type="button" className="pd-pp-icon" aria-label={`Dismiss ${line.name}`} title="Dismiss" onClick={() => onDismiss(line.id)} data-testid="ready-forget">
                ✕
              </button>
            )}
          </div>
        ))
      )}
    </Section>
  );
}

/** The live output as a URL and as a template file: the same output in two forms. */
export function BrowserSourceRow({
  url,
  copied,
  onCopy,
  onTemplate,
}: {
  url: string | null;
  copied: boolean;
  onCopy: () => void;
  onTemplate: () => void;
}) {
  return (
    <Section title="Browser source" testId="playout-panel-browser">
      <div className="pd-pp-url-row">
        <code className="pd-pp-url" data-testid="output-url">{url ?? 'Available after publishing'}</code>
        <button type="button" onClick={onCopy} disabled={!url} data-testid="copy-output-url">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={onTemplate}
          disabled={!url}
          title="The same output as an HTML template file, for a playout system that loads files instead of links"
          data-testid="download-output-embed"
        >
          Template file
        </button>
      </div>
    </Section>
  );
}

function BridgeSwitch({ label, testId, on, locked, onToggle }: {
  label: string;
  testId: string;
  on: boolean;
  locked?: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <label className="pd-pp-switch-row">
      <span className="pd-pp-switch-label">{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="pd-pp-switch"
        checked={on}
        disabled={locked}
        onChange={event => onToggle(event.target.checked)}
        data-testid={testId}
      />
    </label>
  );
}

export function BridgeSection({ vmixOn, casparOn, locked, onVmix, onCaspar, onSettings, children }: {
  vmixOn: boolean;
  casparOn: boolean;
  locked?: boolean;
  onVmix: (on: boolean) => void;
  onCaspar: (on: boolean) => void;
  onSettings: () => void;
  children: ReactNode;
}) {
  return (
    <Section testId="playout-panel-bridge">
      <div className="pd-pp-switches">
        <BridgeSwitch label="vMix via Bridge" testId="vmix-switch" on={vmixOn} locked={locked} onToggle={onVmix} />
        <BridgeSwitch label="CasparCG via Bridge" testId="caspar-switch" on={casparOn} locked={locked} onToggle={onCaspar} />
      </div>
      {children}
      {/* Always available because Playout settings also holds the rundown colours (D9). */}
      <div className="pd-pp-actions">
        <button type="button" onClick={onSettings} data-testid="panel-playout-settings">
          Playout settings…
        </button>
      </div>
    </Section>
  );
}

export interface CasparFacts {
  /** The switch. */
  on: boolean;
  /** Nobody may change it now (account editing paused). */
  locked?: boolean;
  /** The Bridge as last heard: state words, tone, and the host it reaches. */
  bridge: { tone: ReadyTone; text: string; detail?: string; host?: string } | null;
  /** Bridge pairing is not set up in this browser. */
  unpaired: boolean;
  /** The NoaCG output's slot, once published and read. */
  slot: { where: string; tone: ReadyTone; text: string; detail?: string; canLoad: boolean; canUnload: boolean } | null;
  /** Another production is on the slot and Load waits for a decision. */
  replaceAsk: { where: string } | null;
  busy: boolean;
}

/** The CasparCG Bridge, output slot and replacement confirmation. */
export function CasparRows({
  facts,
  onLoad,
  onUnload,
  onReplace,
  onCancelReplace,
  onPair,
}: {
  facts: CasparFacts;
  onLoad: () => void;
  onUnload: () => void;
  onReplace: () => void;
  onCancelReplace: () => void;
  onPair: () => void;
}) {
  const { on, bridge, slot, replaceAsk } = facts;
  return (
    <>
      {on && facts.unpaired && (
        <div className="pd-pp-row" data-testid="caspar-bridge">
          <Dot tone="idle" />
          <span className="pd-pp-name">NoaCG Bridge</span>
          <a className="pd-pp-button-link" href={DOWNLOADS_BRIDGE_URL} target="_blank" rel="noopener" data-testid="bridge-download">
            Download
          </a>
          <button type="button" onClick={onPair} data-testid="bridge-pair">
            Pair
          </button>
        </div>
      )}
      {on && !facts.unpaired && bridge && (
        <div className={`pd-pp-row pd-pp-row--${bridge.tone}`} data-testid="caspar-bridge" data-tone={bridge.tone}>
          <Dot tone={bridge.tone} />
          <span className="pd-pp-name">{bridge.text}</span>
          {bridge.host && <span className="pd-pp-state">{bridge.host}</span>}
          {bridge.detail && <span className="pd-pp-advice pd-pp-advice--row">{bridge.detail}</span>}
        </div>
      )}
      {on && slot && (
        <div className={`pd-pp-row pd-pp-row--${slot.tone}`} data-testid="caspar-slot" data-tone={slot.tone}>
          <Dot tone={slot.tone} />
          <span className="pd-pp-name">Output slot {slot.where}</span>
          <span className="pd-pp-state">{slot.text}</span>
          {slot.canLoad && (
            <button type="button" onClick={onLoad} disabled={facts.busy} data-testid="caspar-put-on-air">
              Load
            </button>
          )}
          {slot.canUnload && (
            <button type="button" onClick={onUnload} disabled={facts.busy} data-testid="caspar-take-off-air">
              Unload
            </button>
          )}
          {slot.detail && <span className="pd-pp-advice pd-pp-advice--row">{slot.detail}</span>}
        </div>
      )}
      {on && replaceAsk && (
        <div className="pd-pp-confirm" role="alertdialog" aria-label="Replace the production on the slot" data-testid="caspar-replace">
          <span>Replace the other production on {replaceAsk.where}?</span>
          <button type="button" className="pd-pp-link" onClick={onCancelReplace} data-testid="caspar-replace-cancel">
            Cancel
          </button>
          <button type="button" onClick={onReplace} data-testid="caspar-replace-confirm">
            Replace
          </button>
        </div>
      )}
    </>
  );
}

/** What is due, all of it: the header carries only the first. */
export function DueActions({ children }: { children: ReactNode }) {
  return (
    <Section testId="playout-panel-actions">
      <div className="pd-pp-actions">{children}</div>
    </Section>
  );
}

/** The overlay row reads the Bridge while this panel is open. Its poll updates only this section. */
export function VmixRows({
  on, settings, url, busy, replace, onPair, onLoad, onUnload, onReplace, onCancelReplace,
}: {
  on: boolean;
  settings: PlayoutSettings;
  url: string | null;
  busy: boolean;
  replace?: VmixReplace;
  onPair: () => void;
  onLoad: () => void;
  onUnload: () => void;
  onReplace: () => void;
  onCancelReplace: () => void;
}) {
  const paired = bridgePaired(settings);
  const key = JSON.stringify([settings.agentUrl, settings.agentToken, settings.vmix?.overlay, url]);
  const [observed, setObserved] = useState<{ key: string; reading: VmixOutputReading }>();
  useEffect(() => {
    if (!on || !paired || busy) return;
    return observeVmixOutput(() => readVmixOutput(loadPlayoutSettings(), url), reading => setObserved({ key, reading }));
  }, [on, paired, busy, key, url]);
  const reading = observed?.key === key ? observed.reading : undefined;
  const connection = reading?.connection;
  const update = connection && !connection.keyed && (connection.supported || !connection.result || connection.result.state === 'outdated');
  const status = connection?.info ? `vMix ${connection.info.version}` : 'NoaCG Bridge';
  const loadProblem = reading?.loadProblem;
  const problem = update ? undefined : loadProblem ?? reading?.detail ?? (connection?.result?.state === 'ok' ? undefined : connection?.result?.detail);
  const row = reading?.overlay;
  const tone = loadProblem ? 'bad' : row?.ownsOutput ? 'ok' : row?.input ? 'warn' : 'idle';
  return (
    <>
      {on && (
        <div className="pd-pp-row" data-testid="vmix-bridge">
          <Dot tone={problem ? 'bad' : update ? 'warn' : connection?.info ? 'ok' : 'idle'} />
          <span className="pd-pp-name">{status}</span>
          {!paired || update ? (
            <a className="pd-pp-button-link" href={DOWNLOADS_BRIDGE_URL} target="_blank" rel="noopener" data-testid="vmix-bridge-download">
              {update ? 'Update' : 'Download'}
            </a>
          ) : null}
          {!paired && <button type="button" onClick={onPair}>Pair</button>}
          {problem && <span className="pd-pp-advice pd-pp-advice--row">{problem}</span>}
        </div>
      )}
      {on && row && (
        <div className={`pd-pp-row pd-pp-row--${tone}`} data-testid="vmix-output" data-tone={tone}>
          <Dot tone={tone} />
          <span className="pd-pp-name">Output on Overlay {row.overlay}</span>
          <span className="pd-pp-state">{row.ownsOutput ? (loadProblem ? 'Source unavailable' : 'On air') : row.input?.title ?? 'Off'}</span>
          <button type="button" onClick={row.ownsOutput ? onUnload : onLoad} disabled={busy || (!row.ownsOutput && (!!replace || !!loadProblem))} data-testid={row.ownsOutput ? 'vmix-unload' : 'vmix-load'}>
            {row.ownsOutput ? 'Unload' : 'Load'}
          </button>
        </div>
      )}
      {on && replace && !loadProblem && (
        <div className="pd-pp-confirm" role="alertdialog" aria-label="Replace the input on the overlay" data-testid="vmix-replace">
          <span>Replace “{replace.input.title}” on Overlay {replace.overlay}?</span>
          <button type="button" className="pd-pp-link" onClick={onCancelReplace}>Cancel</button>
          <button type="button" onClick={onReplace} disabled={busy}>Replace</button>
        </div>
      )}
    </>
  );
}
