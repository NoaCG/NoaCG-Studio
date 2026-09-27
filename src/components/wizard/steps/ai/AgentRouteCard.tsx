import { forwardRef, useEffect, useState } from 'react';
import { copyLink } from '../../../home/copyLink';

/**
 * THE USER'S OWN CODING AGENT IS THE RECOMMENDED WAY TO MAKE GRAPHICS WITH NOACG, SO IT IS THE
 * FIRST AND LARGEST THING THE CREATE WITH AI STEP SHOWS.
 *
 * Owner, 2026-08-26: "steer users to their own Claude Code - better and cheaper - before any
 * key entry"; re-confirmed 2026-09-03: "That is the preferred way of using AI with NoaCG."
 * The receipt is docs/backlog/byo-key-and-create-with-ai-guidance.md. Owner, 2026-09-27: the
 * one-line card was too small, and the built-in generator under it read as the recommended AI
 * workflow, which it is not today. So the route is no longer a disclosure: the four steps and
 * the install lines are always on screen, above the generator, and the generator below is
 * labelled as the built-in option. Why the agent wins: a Claude Code or Codex subscription holds
 * a frontier model and an agent loop, and the NoaCG CLI lets that agent scaffold, validate,
 * screenshot and save into the user's library (docs/AGENT_CLI.md), with no key and no second
 * bill.
 *
 * WHAT THIS IS NOT: an execution tier. Nothing here runs in the studio - the agent runs on
 * the user's machine - so this is copy and a link, never a radio beside the generator. Nor is
 * it a brush-off: the closing line tells somebody with no agent that the generator below is
 * theirs, and the generator keeps every control it had.
 *
 * WHAT IT PROMISES IS ONLY WHAT EXISTS. Every command is the Distribution table of
 * docs/AGENT_CLI.md, verbatim; `/noacg:graphic` is the plugin's command; the link is the docs
 * page's own "paste this to your agent" prompt, which does the install for any agent, and for
 * people who would rather not type commands. What the user needs is said plainly - their own
 * subscription and a terminal - rather than sold around.
 */

/** The docs page's "paste this to your agent" prompt, which does the whole setup. */
const AGENT_ROUTE_DOCS_HREF = '/docs#agent-install';

/** docs/AGENT_CLI.md, Distribution: the Claude Code plugin, two commands, nothing to install first. */
const CLAUDE_CODE_INSTALL = 'claude plugin marketplace add NoaCG/NoaCG-Studio\nclaude plugin install noacg@noacg-studio';

/** The same table's Codex plugin: the same two steps under Codex's own verbs. */
const CODEX_INSTALL = 'codex plugin marketplace add NoaCG/NoaCG-Studio\ncodex plugin add noacg@noacg-studio';

/** Copy text, falling back to a selected textarea where the Clipboard API is refused - a page on
 *  plain http, or a browser that denies the permission - so the button is never dead. */
async function copyCommand(text: string): Promise<boolean> {
  if (await copyLink(text)) return true;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
  document.body.appendChild(field);
  field.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  field.remove();
  return ok;
}

/**
 * A labelled command block with a Copy button. Select-then-copy is two motions and the second
 * has no feedback, so on a phone a partial selection looks exactly like a whole one until the
 * paste fails in a terminal (docs/backlog/install-lines-need-a-copy-control.md). The block stays
 * selectable in one click for anyone who prefers that; the button says whether the copy landed.
 */
function CopyableCommand({ label, text, testId }: { label: string; text: string; testId: string }) {
  const [said, setSaid] = useState<'copied' | 'failed' | null>(null);
  useEffect(() => {
    if (!said) return;
    const t = window.setTimeout(() => setSaid(null), 1600);
    return () => window.clearTimeout(t);
  }, [said]);
  return (
    <div className="ai-agent-cmd-wrap">
      <span className="ai-agent-cmd-label">{label}</span>
      <pre className="ai-agent-cmd" data-testid={testId}><code>{text}</code></pre>
      <button
        type="button"
        className="ai-agent-copy"
        data-testid={`${testId}-copy`}
        aria-label={`Copy the ${label} install lines`}
        onClick={() => void copyCommand(text).then((ok) => setSaid(ok ? 'copied' : 'failed'))}
      >
        {said === 'copied' ? 'Copied' : said === 'failed' ? 'Select and copy' : 'Copy'}
      </button>
    </div>
  );
}

interface Props {
  /**
   * Whether the NoaCG-run route is on offer here. The closing line for somebody
   * with no agent has to be true in BOTH builds: on a hosted studio nothing needs installing,
   * but on a self-hosted one the only road left is their own provider account, and "nothing to
   * install" there would send them to a Generate button that stays disabled until a key is
   * stored.
   */
  hostedOffered: boolean;
}

const AgentRouteCard = forwardRef<HTMLElement, Props>(function AgentRouteCard({ hostedOffered }, ref) {
  return (
    <section
      className="ai-agent-route"
      data-testid="ai-agent-route"
      ref={ref}
      aria-labelledby="ai-agent-route-title"
    >
      <div className="ai-agent-route-head">
        {/* The block's one amber: the same tag the entry card wears for Beta, because it is the
            same job - one word the eye reads before the sentence. */}
        <span className="wz-beta-tag">Recommended</span>
        <h3 id="ai-agent-route-title" className="ai-agent-route-title">
          Make graphics with your coding agent
        </h3>
      </div>
      <ol className="ai-agent-steps" data-testid="ai-agent-route-body">
        <li>Use Claude Code, Codex or another compatible coding agent.</li>
        <li>
          Install the NoaCG CLI. Run the two lines for your agent once.
          <div className="ai-agent-cmds">
            <CopyableCommand label="Claude Code" text={CLAUDE_CODE_INSTALL} testId="ai-agent-cmd-claude" />
            <CopyableCommand label="Codex" text={CODEX_INSTALL} testId="ai-agent-cmd-codex" />
          </div>
          <span className="hint">
            Another agent, or rather not type commands?{' '}
            <a href={AGENT_ROUTE_DOCS_HREF} target="_blank" rel="noreferrer">
              Paste one prompt to your agent
            </a>{' '}
            and it does the setup itself.
          </span>
        </li>
        <li>
          Prompt the graphic you want. In Claude Code you can also type{' '}
          <code className="inline">/noacg:graphic</code>.
        </li>
        <li>It appears in NoaCG, ready for a rundown.</li>
      </ol>
      <p className="hint ai-agent-route-foot">
        Your agent checks each graphic with NoaCG&apos;s validator and live playout test before it
        saves it. You need the agent&apos;s own subscription and a terminal, and no key.
      </p>
      <p className="hint ai-agent-route-foot">
        {hostedOffered
          ? 'No coding agent? Use the built-in generator below. Nothing to install.'
          : 'No coding agent? The built-in generator below runs on your own AI provider account: tick “Use your own AI account instead” under AI settings.'}
      </p>
    </section>
  );
});

export default AgentRouteCard;
