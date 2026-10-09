// Generate directory artifacts using Node 24 and Git only. No app build or npm install needed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const parse = (files, name) => JSON.parse(files.get(name)?.toString() ?? 'null');
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const MiB = 1024 * 1024;

export function validateArchiveLimits({ compressedBytes, unpackedBytes, entries }) {
  requireThat(compressedBytes < 50 * MiB && unpackedBytes < 256 * MiB && entries < 10000, 'repository archive limits exceeded');
}

export function pathsIn(dir, base = dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const full = path.join(dir, name);
    const stat = lstatSync(full);
    requireThat(!stat.isSymbolicLink(), `symbolic link forbidden: ${full}`);
    if (stat.isDirectory()) return pathsIn(full, base);
    requireThat(stat.isFile(), `regular files required: ${full}`);
    return [path.relative(base, full).replace(/\\/g, '/')];
  });
}

// ZIP32, UTF-8 names, regular files, fixed DOS epoch and stable order. No platform metadata.
export function zip(files) {
  const locals = [], central = [];
  let offset = 0;
  for (const [name, bytes] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const filename = Buffer.from(name);
    const compressed = deflateRawSync(bytes, { level: 9 });
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12); // 1980-01-01
    local.writeUInt32LE(crc32(bytes), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    local.copy(record, 6, 4, 30);
    record.writeUInt32LE(offset, 42);
    central.push(record, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export function validatePaths(files) {
  const seen = new Map();
  for (const name of files.keys()) {
    requireThat(!name.includes('\\') && !name.startsWith('/') && !name.includes('\0'), `invalid path: ${name}`);
    const parts = name.split('/');
    for (let i = 0; i < parts.length; i++) {
      const segment = parts[i];
      requireThat(segment && segment !== '.' && segment !== '..'
        && !/[<>:"|?*\x00-\x1f]/.test(segment) && !/[. ]$/.test(segment)
        && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(segment), `nonportable path: ${name}`);
      const prefix = parts.slice(0, i + 1).join('/');
      const key = prefix.toLowerCase();
      requireThat(!seen.has(key) || seen.get(key) === prefix, `case collision: ${name}`);
      seen.set(key, prefix);
    }
    requireThat(!/(^|\/)(\.DS_Store|Thumbs.db|desktop.ini|__MACOSX|\.npmrc|\.gitmodules|\.gitattributes)$/i.test(name), `forbidden distribution file: ${name}`);
    requireThat(/\.(md|json|mjs|png)$/.test(name) || /(^|\/)(LICENSE|NOTICE)$/.test(name), `unexpected distribution file: ${name}`);
  }
  return seen.size; // files AND directory entries, including hidden directories
}

function validateManifest(files, host, expectedName, version) {
  const name = `.${host}-plugin/plugin.json`;
  const manifest = parse(files, name);
  requireThat(manifest?.name === expectedName && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.name), `${host}: invalid identifier`);
  requireThat(manifest.version === version, `${host}: version drift`);
  requireThat(typeof manifest.description === 'string' && manifest.description.trim(), `${host}: description required`);
  requireThat(manifest.author?.name === 'NoaCG Studio' && manifest.license === 'Apache-2.0', `${host}: publisher/licence drift`);
  for (const field of ['skills', 'commands', 'mcpServers', 'icon']) {
    if (manifest[field] === undefined) continue;
    const refs = Array.isArray(manifest[field]) ? manifest[field] : [manifest[field]];
    for (const ref of refs) {
      requireThat(typeof ref === 'string' && ref.startsWith('./') && !ref.split('/').includes('..'), `${host}: unsafe ${field}`);
      const relative = ref.slice(2).replace(/\/$/, '');
      requireThat(files.has(relative) || [...files.keys()].some((p) => p.startsWith(`${relative}/`)), `${host}: missing ${ref}`);
    }
  }
  requireThat(!manifest.hooks && !manifest.apps && !manifest.experimental, `${host}: unsupported components`);
  if (host === 'claude') {
    requireThat(manifest.displayName === (expectedName === 'noacg' ? 'NoaCG Broadcast Graphics and Playout' : 'NoaCG MCP server'), 'Claude display name drift');
  } else {
    const ui = manifest.interface;
    for (const [field, limit] of [['displayName', 30], ['shortDescription', 30], ['longDescription', 4000], ['developerName', 80]]) {
      requireThat(typeof ui?.[field] === 'string' && ui[field].trim() && ui[field].length <= limit
        && !/[\x00-\x09\x0b-\x1f\u2028\u2029]/.test(ui[field]) && (field === 'longDescription' || !ui[field].includes('\n')), `Codex: invalid ${field}`);
    }
    requireThat(ui.displayName === (expectedName === 'noacg' ? 'NoaCG Graphics and Playout' : 'NoaCG MCP server'), 'Codex display name drift');
    requireThat(ui.category === 'Developer Tools' && Array.isArray(ui.capabilities) && ui.capabilities.length <= 20
      && ui.capabilities.every((v) => typeof v === 'string' && v.trim() && v.length <= 120), 'Codex category/capabilities required');
    requireThat(Array.isArray(ui.defaultPrompt) && ui.defaultPrompt.length <= 3 && ui.defaultPrompt.every((p) => typeof p === 'string' && p.trim() && p.length <= 128), 'Codex prompt limits');
    requireThat(/^#[0-9A-Fa-f]{6}$/.test(ui.brandColor), 'Codex brand colour invalid');
    for (const field of ['composerIcon', 'logo']) {
      if (expectedName === 'noacg') requireThat(ui[field], `Codex: ${field} required`);
      if (ui[field]) requireThat(ui[field].startsWith('./') && files.has(ui[field].slice(2)), `Codex: missing ${field}`);
    }
    for (const field of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
      if (ui[field] !== undefined) requireThat(/^https:\/\/[^\s/@]+(?:\/[^\s]*)?$/.test(ui[field]) && ui[field].length <= 1024, `Codex: invalid ${field}`);
    }
  }
}

export function validatePackage(files, { host, name, version }) {
  validatePaths(files);
  requireThat(files.size <= 512, 'plugin file count exceeds 512');
  for (const [file, bytes] of files) {
    requireThat(bytes.length < 5 * MiB, `file exceeds 5 MiB: ${file}`);
    requireThat(file.endsWith('.png') || bytes.length <= 256 * 1024, `text exceeds 256 KiB: ${file}`);
    if (file.endsWith('.png')) {
      requireThat(bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && bytes.includes(Buffer.from('IEND')), `invalid PNG: ${file}`);
    } else {
      requireThat(!bytes.includes(0) && !bytes.toString().startsWith('version https://git-lfs.github.com/spec/'), `binary/LFS pointer forbidden: ${file}`);
    }
  }
  for (const file of ['README.md', 'LICENSE', 'NOTICE', 'PROVENANCE.json']) requireThat(files.has(file), `required file missing: ${file}`);
  requireThat(files.get('LICENSE').toString().includes('Apache License') && files.get('LICENSE').toString().includes('Version 2.0'), 'Apache licence text missing');
  const prose = files.get('README.md').toString().replace(/(?:```|~~~)[\s\S]*?(?:```|~~~)/g, '');
  requireThat(prose.trim().split(/\s+/).length >= 40, 'README must contain 40 prose words');
  validateManifest(files, host, name, version);
  if (name === 'noacg') {
    requireThat(!files.has('.mcp.json'), 'main plugin must remain lazy');
    const skill = files.get('skills/noacg-graphic/SKILL.md')?.toString();
    requireThat(skill?.startsWith('---\nname: noacg-graphic\n') && /\ndescription:/.test(skill), 'skill frontmatter missing');
    for (const ref of skill.matchAll(/references\/([\w-]+\.md)/g)) requireThat(files.has(`skills/noacg-graphic/references/${ref[1]}`), `missing skill reference ${ref[1]}`);
    const setup = files.get('skills/noacg-graphic/references/setup.md')?.toString();
    requireThat(setup?.includes(`@noacg/cli@${version}`), 'setup CLI pin drift');
    for (const text of [skill, setup, files.get('README.md').toString()]) {
      for (const m of text.matchAll(/(?:npx -y|npm i -g) @noacg\/cli([^\s`<]*)/g)) requireThat(m[1] === `@${version}`, `unpinned or stale CLI command: ${m[0]}`);
    }
  } else {
    const mcp = parse(files, '.mcp.json');
    requireThat(Object.keys(mcp?.mcpServers ?? {}).join() === 'noacg', 'MCP must declare exactly noacg');
    requireThat(mcp.mcpServers.noacg.command === 'node' && JSON.stringify(mcp.mcpServers.noacg.args) === JSON.stringify(['${CLAUDE_PLUGIN_ROOT}/mcp-server.mjs']), 'MCP entry must be a bundled file');
    const launcher = files.get('mcp-server.mjs')?.toString();
    requireThat(launcher?.includes('`@noacg/cli@${REVIEWED}`') && !launcher.includes("'-y', '@noacg/cli'"), 'MCP fallback pin missing');
  }
}

export function assemble(root = ROOT, commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()) {
  const sourceHashes = {};
  const read = (relative) => {
    const stat = lstatSync(path.join(root, relative));
    requireThat(stat.isFile() && !stat.isSymbolicLink(), `nonregular source: ${relative}`);
    let bytes = readFileSync(path.join(root, relative));
    if (!relative.endsWith('.png')) bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    sourceHashes[relative] = sha256(bytes);
    return bytes;
  };
  read('cli/scripts/toolkit-distribution.mjs');
  const pkg = JSON.parse(read('cli/package.json'));
  const lock = JSON.parse(read('cli/package-lock.json'));
  requireThat(lock.version === pkg.version && lock.packages[''].version === pkg.version, 'CLI lockfile version drift');
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    requireThat(/^\d+\.\d+\.\d+$/.test(version), `CLI dependency must be exact: ${name}`);
    requireThat(lock.packages[`node_modules/${name}`]?.version === version, `CLI dependency lock drift: ${name}`);
  }
  const shared = new Map(['README.md', 'LICENSE', 'NOTICE', 'assets/icon.png'].map((f) => [f, read(`cli/plugin/${f}`)]));
  requireThat(shared.get('LICENSE').equals(read('cli/LICENSE')) && shared.get('NOTICE').equals(read('cli/NOTICE')), 'main licence drift');
  const main = new Map(shared), mcp = new Map();
  for (const host of ['claude', 'codex']) {
    main.set(`.${host}-plugin/plugin.json`, read(`cli/plugin/.${host}-plugin/plugin.json`));
    mcp.set(`.${host}-plugin/plugin.json`, read(`cli/plugin-mcp/.${host}-plugin/plugin.json`));
  }
  main.set('commands/graphic.md', read('cli/plugin/commands/graphic.md'));
  for (const file of pathsIn(path.join(root, 'cli/skill/noacg-graphic'))) {
    requireThat(file.endsWith('.md'), `only portable skill markdown is allowed: ${file}`);
    const bytes = read(`cli/skill/noacg-graphic/${file}`);
    const copy = read(`cli/plugin/skills/noacg-graphic/${file}`);
    requireThat(bytes.equals(copy), `generated skill drift: ${file}`);
    main.set(`skills/noacg-graphic/${file}`, bytes);
  }
  requireThat(pathsIn(path.join(root, 'cli/plugin/skills/noacg-graphic')).length === pathsIn(path.join(root, 'cli/skill/noacg-graphic')).length, 'stray generated skill file');
  for (const file of ['README.md', 'LICENSE', 'NOTICE', 'assets/icon.png', '.mcp.json', 'mcp-server.mjs']) mcp.set(file, read(`cli/plugin-mcp/${file}`));
  requireThat(mcp.get('LICENSE').equals(shared.get('LICENSE')) && mcp.get('NOTICE').equals(shared.get('NOTICE')), 'MCP licence drift');
  const marketplace = JSON.parse(read('.claude-plugin/marketplace.json'));
  requireThat(marketplace.name === 'noacg-studio' && marketplace.plugins.length === 2, 'marketplace split drift');
  for (const entry of marketplace.plugins) {
    requireThat(['noacg', 'noacg-mcp'].includes(entry.name) && entry.version === pkg.version, 'marketplace version/name drift');
    entry.source = `./plugins/${entry.name}`;
  }
  const provenance = json({ format: 1, sourceRepository: 'https://github.com/NoaCG/NoaCG-Studio', sourceCommit: commit,
    cli: { package: pkg.name, version: pkg.version, dependencies: pkg.dependencies }, sourceSha256: sourceHashes });
  main.set('PROVENANCE.json', provenance);
  mcp.set('PROVENANCE.json', provenance);
  const claude = new Map([...main].filter(([p]) => !p.startsWith('.codex-plugin/')));
  const codex = new Map([...main].filter(([p]) => !p.startsWith('.claude-plugin/') && !p.startsWith('commands/')));
  const claudeMcp = new Map([...mcp].filter(([p]) => !p.startsWith('.codex-plugin/')));
  const codexMcp = new Map([...mcp].filter(([p]) => !p.startsWith('.claude-plugin/')));
  // The launcher uses the Claude manifest as its version authority even for local Codex installs.
  codexMcp.set('.claude-plugin/plugin.json', mcp.get('.claude-plugin/plugin.json'));
  const packages = { claude, codex, 'claude-mcp': claudeMcp, 'codex-mcp-local': codexMcp };
  for (const [kind, files] of Object.entries(packages)) validatePackage(files, { host: kind.startsWith('claude') ? 'claude' : 'codex', name: kind.includes('mcp') ? 'noacg-mcp' : 'noacg', version: pkg.version });
  const repository = new Map([
    ['.claude-plugin/marketplace.json', json(marketplace)], ['LICENSE', shared.get('LICENSE')], ['NOTICE', shared.get('NOTICE')], ['PROVENANCE.json', provenance],
    ['README.md', Buffer.from(`# NoaCG Agent Toolkit distribution\n\nGenerated from ${commit} in [NoaCG-Studio](https://github.com/NoaCG/NoaCG-Studio/tree/${commit}).\nCLI dependency: @noacg/cli@${pkg.version}. Apache-2.0; see LICENSE and NOTICE.\n\nInstall from this marketplace with Claude Code or local Codex. The main noacg plugin is lazy;\nnoacg-mcp is the optional local server. Ordinary Claude Chat cannot run the local CLI.\nRead each plugin README and the main skill's setup reference. Node, browser and account consent\nremain separate setup. Local validation is not directory submission, approval or publication.\n\nClaude directory source: NoaCG/NoaCG-Studio, branch agent-toolkit-dist, folder plugins/noacg\n(or separately plugins/noacg-mcp). OpenAI upload: the generated Codex skills-only ZIP.\nThe local MCP ZIP is not a hosted directory submission.\n\nNever edit this branch by hand. The source release workflow generates these files and replaces\nthis branch after npm and MCP Registry publication succeed. Source-commit hashes are recorded in\nPROVENANCE.json. Report changes in the source repository.\n`)],
  ]);
  for (const [name, files] of [['noacg', main], ['noacg-mcp', mcp]]) for (const [p, bytes] of files) repository.set(`plugins/${name}/${p}`, bytes);
  packages.repository = repository;
  const report = { sourceCommit: commit, version: pkg.version, tooling: { node: process.versions.node, zlib: process.versions.zlib }, packages: {} };
  const archives = new Map();
  for (const [name, files] of Object.entries(packages)) {
    const entries = validatePaths(files);
    const bytes = zip(files);
    const unpackedBytes = [...files.values()].reduce((sum, f) => sum + f.length, 0);
    validateArchiveLimits({ compressedBytes: bytes.length, unpackedBytes, entries });
    const filename = `noacg-${name}-${pkg.version}.zip`;
    archives.set(filename, bytes);
    report.packages[name] = { filename, compressedBytes: bytes.length, unpackedBytes, files: files.size, entries, sha256: sha256(bytes) };
  }
  return { packages, archives, report };
}

export function writeDistribution(out, result) {
  const expected = new Map();
  for (const [name, files] of Object.entries(result.packages)) {
    for (const [file, bytes] of files) {
      expected.set(`${name}/${file}`, bytes);
    }
  }
  for (const [name, bytes] of result.archives) expected.set(name, bytes);
  expected.set('measurements.json', json(result.report));
  // Idempotent for this exact snapshot. Refuse altered/stray output, without deleting anything.
  if (existsSync(out) && readdirSync(out).length) {
    const actual = pathsIn(out);
    requireThat(actual.length === expected.size && actual.every((p) => expected.has(p)
      && readFileSync(path.join(out, p)).equals(expected.get(p))), `output differs: choose an empty output directory: ${out}`);
    return;
  }
  for (const [file, bytes] of expected) {
    const target = path.join(out, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireThat(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim() === '', 'commit changes first: distribution provenance requires a clean checkout');
    const result = assemble();
    const out = process.argv[2] ?? path.join(ROOT, 'cli/dist/toolkit', result.report.sourceCommit);
    requireThat(!out.startsWith('-'), 'usage: npm run toolkit:dist -- [empty-output-directory]');
    writeDistribution(path.resolve(out), result);
    console.log(JSON.stringify(result.report, null, 2));
    console.log(`Distribution: ${path.resolve(out)}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
