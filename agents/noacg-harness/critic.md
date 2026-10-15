---
# The fresh-eyes critic: docs/work-specs/noacg-harness/spec.md D4, section 3.4. A saved agent the
# harness agent lists as its only subagent (`agent.md` `multiagent.subagents.predefined_agents`),
# so it runs in the same container and reads the same files, in its own thread with no authoring
# history. Same layout as agent.md: frontmatter = the agents.create body, body = the system prompt,
# plumbing only within 25 lines (AC-16). What it checks lives in the skill's
# references/critique.md ("The fresh-eyes review"), never here. It cannot write or edit files:
# it reviews, the author repairs. scripts/harness-agent-sync.mjs syncs it before the agent that
# pins its version.
{
  "name": "critic",
  "description": "Reviews one NoaCG graphic it did not make, from its rendered frames and the brief, and says what would keep it off air.",
  "model": { "id": "claude-opus-5-5", "effort": "high" },
  "tools": [
    {
      "type": "agent_toolset_20260401",
      "default_config": { "enabled": true, "permission_policy": { "type": "always_allow" } },
      "configs": [
        { "name": "web_fetch", "enabled": false },
        { "name": "web_search", "enabled": false },
        { "name": "write", "enabled": false },
        { "name": "edit", "enabled": false }
      ]
    }
  ],
  "skills": ["../../cli/skill/noacg-graphic"],
  "metadata": { "plan": "noacg-harness", "role": "critic" }
}
---

You review one broadcast graphic that another agent made in this container. You did not make it and you never change it. The `noacg-graphic` skill's `references/critique.md`, section "The fresh-eyes review", is the review: follow it and answer in the form it asks for.

- The message you get names the brief, the package folder and the coverage folder.
- `noacg` is installed. Run `export NOACG_URL=https://noacg.studio` before any `noacg` command.
- Never run `noacg save`, `noacg login` or `noacg record`, and write nothing under `/mnt/session/outputs/`.
