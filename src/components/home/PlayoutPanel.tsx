import type { ReactNode } from 'react';
import { TONE_DOT, type OutputLine, type ReadyTone } from '../../control/readiness';
import type { StatusCheck } from '../../control/playoutStatus';
import { DOWNLOADS_BRIDGE_URL } from '../../downloads/links';

/**
 * THE PLAYOUT PANEL'S SECTIONS (docs/work-specs/playout-workflow-simplification AC-3), opened from
 * the header's one status: the outputs as they report, the browser source, the CasparCG switch with
 * its Bridge and slot, and Playout settings. Labels, states and actions only; a longer reason sits
 * in a row's tooltip, and only real errors are spelled out. Read-only with respect to the page:
 * everything is drawn from props and every press calls back.
 */

function Dot({ tone }: { tone: ReadyTone }) {
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
  slot: { where: string; tone: ReadyTone; text: string; canLoad: boolean; canUnload: boolean } | null;
  /** Another production is on the slot and Load waits for a decision. */
  replaceAsk: { where: string } | null;
  busy: boolean;
}

/** CasparCG via Bridge: the switch, then (on) the Bridge, the slot with Load and Unload, and the one
 *  confirmation this redesign keeps, before replacing another production. */
export function CasparSection({
  facts,
  onToggle,
  onLoad,
  onUnload,
  onReplace,
  onCancelReplace,
  onPair,
  onSettings,
}: {
  facts: CasparFacts;
  onToggle: (on: boolean) => void;
  onLoad: () => void;
  onUnload: () => void;
  onReplace: () => void;
  onCancelReplace: () => void;
  onPair: () => void;
  onSettings: () => void;
}) {
  const { on, bridge, slot, replaceAsk } = facts;
  return (
    <Section testId="playout-panel-caspar">
      <label className="pd-pp-switch-row">
        <span className="pd-pp-switch-label">CasparCG via Bridge</span>
        <input
          type="checkbox"
          role="switch"
          className="pd-pp-switch"
          checked={on}
          disabled={facts.locked}
          onChange={(e) => onToggle(e.target.checked)}
          data-testid="caspar-switch"
        />
      </label>
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
      {on && !facts.unpaired && (
        <div className="pd-pp-actions">
          <button type="button" onClick={onSettings} data-testid="panel-playout-settings">
            Playout settings…
          </button>
        </div>
      )}
    </Section>
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
