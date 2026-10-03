// gate: build
// guards: cli/skill/**, cli/plugin/**, cli/plugin-mcp/**, cli/scripts/toolkit-distribution.mjs, cli/scripts/build-skill.mjs, cli/package.json, cli/package-lock.json, cli/LICENSE, cli/NOTICE, .claude-plugin/marketplace.json, .github/workflows/release-cli.yml
import { assemble } from '../cli/scripts/toolkit-distribution.mjs';
import { measured } from './measured.mjs';

const { packages, report } = assemble();
measured(Object.values(packages).reduce((n, files) => n + files.size, 0), 'distribution files validated across independent packages');
console.log(`Toolkit ${report.version}: Claude main/MCP, Codex main/local MCP and repository validate.`);
