---
v: 2
source: build-feedback
kind: ask
raised: 2026-10-02
state: open
note: "Review of 0.7.1 (claude/bx-mcp-state-renders): the MCP state renders work; these are the follow-ups it found."
asked: "File the follow-ups from the 0.7.1 review of the MCP state renders."
serves: NOW
size: medium
touches: cli/src/mcp.ts, cli/src/commands/, skill/
covered-by: none
needs-owner: none
---
# MCP state renders: follow-ups from the 0.7.1 review

**Filed:** 2026-10-02. **Source:** the review of 0.7.1 (`claude/bx-mcp-state-renders`, PR #637).

## Why

0.7.1 lets an agent ask the MCP server for a graphic's states as frames. It works, but the review
found one real limit for clients and four loose ends. Agents are the people this reaches first
(GOALS outcome 2), so a tool call that outlives its client's patience is the one to fix first.

## What it would take

1. **Keep `validate --screenshots` inside client limits.** Measured: five frames over the video
   plate came to 5.9 MB and 18 s. Codex's tool timeout is 60 s and clients cap output size. Write
   opaque frames as JPEG (a frame over an opaque plate has no alpha to lose), or cap the number of
   frames, or both.
2. **Keep the validation report when the state walk fails.** Today a failed walk returns the
   failure alone; the report the caller already paid for should come back with it.
3. **Share the state-walk and sequence code.** The CLI commands and `cli/src/mcp.ts` each carry
   their own copy. One module, two callers.
4. **Name the MCP argument in errors.** `parseOps` and `resolveBackground` errors name the
   terminal flag (`--ops`, `--background`) when the caller used an MCP argument. The message should
   name whichever the caller used.
5. **Teach the skill the MCP `events` and `at` arguments.** The skill does not name them yet, so
   a caller finds them only from the tool schema.

Items 3 and 4 touch the same lines and are best taken together; item 1 is independent and first.
