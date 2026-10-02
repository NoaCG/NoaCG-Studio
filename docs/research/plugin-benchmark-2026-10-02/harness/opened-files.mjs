// Reads a builder subagent's own transcript (the JSONL Claude Code keeps per subagent) and lists
// what it actually opened, so "did the default arm open neither opt-in file" rests on the
// transcript and not on the agent's own FILES READ line. Counts a Read of a plugin file, a
// shell command that names one (cat, head, grep ...), and `noacg docs <topic>`, which prints a
// reference. Also lists tools it should not have used (Skill, Agent, browser) and any touch of
// the repository.
// Usage: node opened-files.mjs <subagents-dir> <cell>   (finds the transcript whose first
// prompt names the cell's folder)
import fs from 'node:fs';
import path from 'node:path';

const [dir, cell] = process.argv.slice(2);
const needle = `cells\\\\${cell}\\\\`;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
const hits = files.filter((f) => {
  const first = fs.readFileSync(path.join(dir, f), 'utf8').split('\n', 1)[0];
  return first.includes(needle) && first.includes('standing in for a user');
});
if (hits.length !== 1) { console.log(`transcripts for ${cell}: ${hits.length} (${hits.join(', ')})`); process.exit(hits.length ? 0 : 1); }

const opened = new Set();
const flags = [];
let toolCalls = 0;
for (const line of fs.readFileSync(path.join(dir, hits[0]), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  const content = row.message?.content;
  if (row.type !== 'assistant' || !Array.isArray(content)) continue;
  for (const c of content) {
    if (c.type !== 'tool_use') continue;
    toolCalls += 1;
    const text = JSON.stringify(c.input);
    for (const m of text.matchAll(/(SKILL\.md|commands[\\/]+graphic\.md|references[\\/]+(\w[\w-]*\.md)|README\.md)/g)) {
      if (/plugin/i.test(text)) opened.add(m[2] ? 'references/' + m[2] : m[1].replace(/\\+/g, '/'));
    }
    for (const m of text.matchAll(/noacg docs ([a-z][\w-]*)/g)) opened.add('noacg docs ' + m[1]);
    if (['Skill', 'Agent', 'Task'].includes(c.name) || c.name.startsWith('mcp__')) flags.push('used ' + c.name);
    if (/(c:|\/c)[\\/]+claude[\\/]+NoaCG-Studio/i.test(text) &&!/agent-a5568edb9b361f7f9[\\/]+cli[\\/]+dist/.test(text)) flags.push(`${c.name} touched the repository: ${text.slice(0, 160)}`);
  }
}
const optIn = [...opened].filter((f) => /critique|design-notes/.test(f));
console.log(JSON.stringify({ cell, transcript: hits[0], toolCalls, opened: [...opened].sort(), optInOpened: optIn, flags }, null, 2));
