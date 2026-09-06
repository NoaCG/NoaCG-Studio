import { forwardRef } from 'react';

/**
 * THE USER'S OWN CODING AGENT IS THE PREFERRED WAY TO MAKE GRAPHICS WITH NOACG, AND THE
 * STEP SAYS SO BEFORE IT EVER ASKS ANYONE FOR A KEY.
 *
 * Owner, 2026-08-26: "steer users to their own Claude Code - better and cheaper - before any
 * key entry"; re-confirmed 2026-09-03: "That is the preferred way of using AI with NoaCG."
 * The receipt is docs/backlog/byo-key-and-create-with-ai-guidance.md. Three reasons, each
 * enough on its own: a Claude Code or Codex subscription already holds a frontier model and an
 * agent loop, and the NoaCG CLI exists so that agent can scaffold, validate, screenshot and
 * save into the user's library (docs/AGENT_CLI.md); the user is already paying for it, so a
 * second credential and a second bill for a worse answer is the wrong recommendation; and a
 * key field on the one door marked AI is the login wall the product refuses everywhere else.
 *
 * WHAT THIS IS NOT: an execution tier. Nothing here runs in the studio - the agent runs on
 * the user's machine - so this is copy and a link, never a radio beside Lite and Pro. It is
 * also not a brush-off: the closing line tells somebody with no agent that nothing changes
 * for them, and the tiers stay exactly where they were.
 *
 * WHAT IT PROMISES IS ONLY WHAT EXISTS. Every command is the Distribution table of
 * docs/AGENT_CLI.md, verbatim; `/noacg:graphic` is the plugin's command; the link is the docs
 * page's own "paste this to your agent" prompt, which does the install for people who would
 * rather not type commands. What the user needs is said plainly - their own subscription and
 * a terminal - rather than sold around.
 *
 * SHAPE: the step's own one-line-then-disclosure grammar (SectionHead, GOALS goal 4), except
 * that the body here is the instruction rather than the WHY, so it opens from a button that
 * says what it does. The host owns `open`: the settings sheet's pointer and the key-entry
 * moment both reveal this same card rather than repeating it, and the host opens it by itself
 * exactly when it opens the settings sheet by itself - the build where the key field is
 * already on screen.
 */

/** The docs page's "paste this to your agent" prompt, which does the whole setup. */
const AGENT_ROUTE_DOCS_HREF = '/docs#agent-install';

/** docs/AGENT_CLI.md, Distribution: the Claude Code plugin, two commands, nothing to install first. */
const CLAUDE_CODE_INSTALL = 'claude plugin marketplace add miwco/NoaCG-Studio\nclaude plugin install noacg@noacg-studio';

interface Props {
  open: boolean;
  onToggle: (open: boolean) => void;
  /**
   * Whether a NoaCG-run tier (Lite or Pro) is on offer here. The closing line for somebody
   * with no agent has to be true in BOTH builds: on a hosted studio nothing needs installing
   * or pasting, but on a self-hosted one the only road left is their own provider account,
   * and "nothing to install" there would send them to a Generate button that stays disabled
   * until a key is stored.
   */
  hostedOffered: boolean;
}

const AgentRouteCard = forwardRef<HTMLDivElement, Props>(function AgentRouteCard(
  { open, onToggle, hostedOffered },
  ref,
) {
  return (
    <div className="ai-agent-route" data-testid="ai-agent-route" ref={ref}>
      <div className="ai-agent-route-line">
        {/* The card's one amber: the same tag the entry card wears for Beta, because it is the
            same job - one word the eye reads before the sentence. */}
        <span className="wz-beta-tag">Preferred</span>
        <span>
          Have Claude Code or Codex? Your own agent is the best way to make graphics with NoaCG,
          and you already pay for it.
        </span>
        <button
          type="button"
          className="link-btn"
          aria-expanded={open}
          onClick={() => onToggle(!open)}
          data-testid="ai-agent-route-toggle"
        >
          {open ? 'Hide' : 'Show me ›'}
        </button>
      </div>
      {open && (
        <div className="ai-agent-route-body hint" data-testid="ai-agent-route-body">
          <p>
            Your agent draws the graphic the way it writes any other code, checks it against
            NoaCG&apos;s own validator and live playout test, fixes what that reports, and saves
            the finished graphic into your NoaCG library. That gives a better graphic than a
            single generation here, and it costs nothing beyond the subscription you already
            have: no key to paste, no second bill. What it needs is that subscription and a
            terminal to run the agent in.
          </p>
          <p>
            <strong>Claude Code:</strong> run these two lines once, then ask for the graphic you
            need, or type <code className="inline">/noacg:graphic</code>.
          </p>
          <pre className="ai-agent-cmd"><code>{CLAUDE_CODE_INSTALL}</code></pre>
          <p>
            <strong>Codex:</strong> <code className="inline">codex plugin marketplace add miwco/NoaCG-Studio</code>,
            then <code className="inline">codex plugin add noacg@noacg-studio</code>.
          </p>
          <p>
            Would rather not type commands?{' '}
            <a href={AGENT_ROUTE_DOCS_HREF} target="_blank" rel="noreferrer">
              Paste one prompt to your agent
            </a>{' '}
            and it does the setup itself, then asks you what to make.
          </p>
          <p>
            {hostedOffered
              ? 'No coding agent? Nothing to install: describe the graphic below and NoaCG makes it right here.'
              : 'No coding agent? This door still works: Bring your own key, under AI settings below, runs it on your own provider account.'}
          </p>
        </div>
      )}
    </div>
  );
});

export default AgentRouteCard;
