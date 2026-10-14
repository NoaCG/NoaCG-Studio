// The plugin's copy of the skill differs from the source in its frontmatter only: there it is
// named `graphic`, so Claude Code offers it as `/noacg:graphic` (plugin skills are namespaced by
// the plugin), with the argument hint the retired commands/graphic.md carried. The source keeps
// `noacg-graphic`, the name a copy installed outside the plugin needs to stay recognisable.
// Shared by build-skill.mjs, which writes the copy, and toolkit-distribution.mjs, which checks it.

const SOURCE_NAME = '\nname: noacg-graphic\n';
const PLUGIN_NAME = '\nname: graphic\nargument-hint: "[--guidelines | --critique <folder>] [what the graphic is]"\n';

/** The plugin copy's bytes for one source file (a path relative to the skill folder). */
export function pluginSkillFile(file, bytes) {
  if (file !== 'SKILL.md') return bytes;
  const text = bytes.toString('utf8');
  if (!text.startsWith(`---${SOURCE_NAME}`)) throw new Error(`cli/skill/noacg-graphic/SKILL.md must open with ---${SOURCE_NAME.trimEnd()}`);
  return Buffer.from(text.replace(SOURCE_NAME, PLUGIN_NAME));
}
