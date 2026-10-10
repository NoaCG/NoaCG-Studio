// guards: scripts/**
//
// EVERY CHILD PROCESS A SCRIPT STARTS SAYS `windowsHide`, so no console window flashes on Windows.
//
// WHY. A process with no console of its own (the unattended worktree sweep starts detached, and a
// session hook runs under an app, not a terminal) cannot lend one to its children, so Windows
// gives each console child a NEW, visible window unless the call asks for `windowsHide: true`.
// The owner saw a burst of flashing windows after every session start, resume, compaction and
// landing. Reproduced 2026-10-09: a detached launcher's children opened three console windows
// without the flag and none with it.
//
// WHAT THE FLAG COSTS. Nothing off Windows. On Windows, a child with the flag and NO inherited
// stdio gets a hidden console of its own even when its parent runs in a terminal: about 35 ms
// more per spawn, and Ctrl+C in that terminal no longer reaches it. For a quick git call that is
// the price of never flashing. For a long-running child that a person starts from a terminal and
// stops with Ctrl+C (a dev server, a paid model run) it would orphan the child, so those say
// `windowsHide: false` - a terminal has a console to share, so they do not flash either.
//
// THE RULE, as this test reads it: every call to spawn, spawnSync, exec, execSync, execFile,
// execFileSync or fork from node:child_process under scripts/ (direct, renamed, through a
// namespace, a dynamic import or `promisify`) must SHOW `windowsHide` - in an object literal
// argument after any spread, or in a `const` object literal of the same file that the call names.
// Options handed in from a variable the file cannot see (a helper's parameter) do not count:
// write `{ ...options, windowsHide: true }` at the call, which is also how a shared helper covers
// its callers. A child-process function or the module passed around as a value is refused,
// because its calls cannot be read.
//
// THE ONE EXEMPTION is `windowsHide: false`, allowed only in a file listed in SHARES_THE_CONSOLE
// below with its reason; a listed file that no longer says `false` fails too, so the list
// cannot go stale. It is for long-running terminal children, as above, and for a GUI program the
// user is meant to see (Windows hides its first window under the flag). Keep it short.
import test from 'node:test';
import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Files allowed to say `windowsHide: false`, and why their child must share the console. */
const SHARES_THE_CONSOLE = {
  'scripts/ograf-walk-common.mjs': 'the app dev server, ograf-server and SPX hold ports, and the OGraf renderer walks have no Ctrl+C handler to stop them',
  'scripts/ai-bench-server.mjs': 'the dev server holds the port; Ctrl+C on the bench must stop it',
  'scripts/ai-lite-compare.mjs': 'the dev server holds the port; Ctrl+C on the comparison must stop it',
  'scripts/agent-round-bench.mjs': 'a paid `claude -p` cell runs for minutes; Ctrl+C on the bench must stop it',
  'scripts/agy-run.mjs': 'a paid agy run takes minutes; Ctrl+C on the wrapper must stop it',
};

const FUNCTIONS = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']);
const MODULES = new Set(['child_process', 'node:child_process']);

const isModuleLoad = (node) => {
  const call = node && ts.isAwaitExpression(node) ? node.expression : node;
  if (!call || !ts.isCallExpression(call) || call.arguments.length !== 1) return false;
  const [arg] = call.arguments;
  const loader = call.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(call.expression) && call.expression.text === 'require');
  return loader && ts.isStringLiteralLike(arg) && MODULES.has(arg.text);
};

const isPromisify = (node) =>
  ts.isCallExpression(node) &&
  node.arguments.length === 1 &&
  ((ts.isIdentifier(node.expression) && node.expression.text === 'promisify') ||
    (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'promisify'));

/**
 * `windowsHide` in an object literal: 'true' (any value but false), 'false', or null when absent
 * or followed by a spread, which could turn it back off.
 */
function hideIn(literal) {
  let shown = null;
  for (const prop of literal.properties) {
    if (ts.isSpreadAssignment(prop)) shown = null;
    else if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'windowsHide') shown = 'true';
    else if (ts.isPropertyAssignment(prop) && prop.name.getText() === 'windowsHide') {
      shown = prop.initializer.kind === ts.SyntaxKind.FalseKeyword ? 'false' : 'true';
    }
  }
  return shown;
}

/**
 * The files, parsed and bound together as one program (one checker is far cheaper than one per
 * file), so a name resolves to the declaration in scope at each use: `run` the spawnSync alias
 * in one function is not `run` the loop variable in the next. Files are never resolved against
 * each other. `files` maps a file name to its text; returns `{ checker, sources }`.
 */
const BIND_OPTIONS = {
  allowJs: true,
  noResolve: true,
  noLib: true,
  types: [],
  target: ts.ScriptTarget.Latest,
  // Every file its own scope, even one with no import or export.
  moduleDetection: ts.ModuleDetectionKind.Force,
};
const host = ts.createCompilerHost(BIND_OPTIONS);
function bind(files) {
  const sources = new Map();
  for (const [name, text] of files) {
    const kind = name.endsWith('x') ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
    sources.set(name, ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, kind));
  }
  const program = ts.createProgram({
    rootNames: [...sources.keys()],
    options: BIND_OPTIONS,
    host: { ...host, getSourceFile: (name) => sources.get(name), fileExists: (name) => sources.has(name) },
  });
  return { checker: program.getTypeChecker(), sources };
}

/** One file on its own, for the fixtures below. */
function scanSource(text, fileName = 'x.mjs') {
  const { checker, sources } = bind(new Map([[fileName, text]]));
  return scanBound(sources.get(fileName), checker);
}

/**
 * The child-process calls in one bound file that do not show `windowsHide`, and the ones that
 * turn it off, as `{ calls, findings }`: how many calls were judged, and `{ line, fn, problem }`
 * for each one that failed, where problem is 'missing', 'false' or 'untraceable'.
 */
function scanBound(source, checker) {
  // A name with no symbol resolves to a fresh object, so it can never match a remembered one.
  const symbolOf = (id) =>
    (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id
      ? checker.getShorthandAssignmentValueSymbol(id.parent)
      : checker.getSymbolAtLocation(id)) ?? {};
  const direct = new Map(); // symbol -> the child_process function it is
  const namespaces = new Set(); // symbols that are the whole module
  const literals = new Map(); // symbol of a `const x = { ... }` -> the literal

  const visitBindings = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && MODULES.has(node.moduleSpecifier.text)) {
      const clause = node.importClause;
      if (clause?.name) namespaces.add(symbolOf(clause.name));
      const named = clause?.namedBindings;
      if (named && ts.isNamespaceImport(named)) namespaces.add(symbolOf(named.name));
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          const imported = (el.propertyName ?? el.name).text;
          if (FUNCTIONS.has(imported)) direct.set(symbolOf(el.name), imported);
        }
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      // `const { spawnSync } = cp`, from a namespace already bound, reads like a load.
      const fromNamespace = ts.isIdentifier(node.initializer) && namespaces.has(symbolOf(node.initializer));
      if (isModuleLoad(node.initializer) || (fromNamespace && ts.isObjectBindingPattern(node.name))) {
        if (ts.isIdentifier(node.name)) namespaces.add(symbolOf(node.name));
        else if (ts.isObjectBindingPattern(node.name)) {
          for (const el of node.name.elements) {
            const imported = (el.propertyName ?? el.name).getText();
            if (FUNCTIONS.has(imported) && ts.isIdentifier(el.name)) direct.set(symbolOf(el.name), imported);
          }
        }
      }
      if (ts.isIdentifier(node.name) && ts.isObjectLiteralExpression(node.initializer)) literals.set(symbolOf(node.name), node.initializer);
    }
    ts.forEachChild(node, visitBindings);
  };
  visitBindings(source);

  /** The child_process function an expression names, or null. */
  function childFunction(expr) {
    if (ts.isIdentifier(expr)) return direct.get(symbolOf(expr)) ?? null;
    if (ts.isPropertyAccessExpression(expr) && FUNCTIONS.has(expr.name.text)) {
      // `cp.spawn`, and `cp.default.spawn` after a dynamic import.
      let owner = expr.expression;
      if (ts.isPropertyAccessExpression(owner) && owner.name.text === 'default') owner = owner.expression;
      if (ts.isIdentifier(owner) && namespaces.has(symbolOf(owner))) return expr.name.text;
    }
    return null;
  }

  // `const run = promisify(execFile)`, `const run = spawn` and a seam's default `{ start = spawn }`
  // are the same function under another name; their calls are read the same way.
  const isDeclaration = (node) => ts.isVariableDeclaration(node) || ts.isBindingElement(node) || ts.isParameter(node);
  const aliasOf = (node) => (isPromisify(node) ? node.arguments[0] : node);
  const visitAliases = (node) => {
    if (isDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const fn = childFunction(aliasOf(node.initializer));
      if (fn) direct.set(symbolOf(node.name), fn);
    }
    ts.forEachChild(node, visitAliases);
  };
  visitAliases(source);

  // `(deps.launch ?? spawn)(...)`, a test seam in front of the real function, is still a call
  // of that function, and its options are read the same way.
  const SEAMS = new Set([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken]);
  const isSeam = (node, child) =>
    ts.isParenthesizedExpression(node) ||
    (ts.isBinaryExpression(node) && SEAMS.has(node.operatorToken.kind)) ||
    (ts.isConditionalExpression(node) && node.condition !== child);
  function calleeFunction(expr) {
    if (ts.isParenthesizedExpression(expr)) return calleeFunction(expr.expression);
    if (ts.isBinaryExpression(expr) && SEAMS.has(expr.operatorToken.kind)) return calleeFunction(expr.left) ?? calleeFunction(expr.right);
    if (ts.isConditionalExpression(expr)) return calleeFunction(expr.whenTrue) ?? calleeFunction(expr.whenFalse);
    return childFunction(expr);
  }
  const isCallee = (node) => {
    let child = node;
    let parent = node.parent;
    while (parent && isSeam(parent, child)) [child, parent] = [parent, parent.parent];
    return Boolean(parent && ts.isCallExpression(parent) && parent.expression === child);
  };

  const findings = [];
  let calls = 0;
  const report = (node, fn, problem) =>
    findings.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, fn, problem });

  const judgeCall = (call, fn) => {
    calls += 1;
    const shown = [];
    for (const arg of call.arguments.slice(1)) {
      if (ts.isObjectLiteralExpression(arg)) shown.push(hideIn(arg));
      else if (ts.isIdentifier(arg) && literals.has(symbolOf(arg))) shown.push(hideIn(literals.get(symbolOf(arg))));
    }
    if (shown.includes('false')) report(call, fn, 'false');
    else if (!shown.includes('true')) report(call, fn, 'missing');
  };

  const visitCalls = (node) => {
    if (ts.isCallExpression(node)) {
      const fn = calleeFunction(node.expression);
      if (fn && !isPromisify(node)) judgeCall(node, fn);
    }
    // A child-process function used as a value (not called, not declared, not aliased to a name
    // this scan follows) has calls this test cannot read.
    const parent = node.parent;
    const isName = parent && (ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === node;
    const asValue = (ts.isIdentifier(node) && !isName) || ts.isPropertyAccessExpression(node);
    if (asValue && childFunction(node)) {
      const declared = ts.isImportSpecifier(parent) || (isDeclaration(parent) && (parent.name === node || parent.propertyName === node));
      const holder = isPromisify(parent) ? parent.parent : parent;
      const aliased = isDeclaration(holder) && ts.isIdentifier(holder.name) && Boolean(holder.initializer) && aliasOf(holder.initializer) === node;
      if (!isCallee(node) && !declared && !aliased) report(node, childFunction(node), 'untraceable');
    }
    // The module itself is read only as `cp.<name>` or destructured; `cp[name]` or handing `cp`
    // on is untraceable the same way.
    if (ts.isIdentifier(node) && !isName && namespaces.has(symbolOf(node))) {
      const declared =
        ts.isImportClause(parent) || ts.isNamespaceImport(parent) || (ts.isVariableDeclaration(parent) && parent.name === node);
      const read =
        (ts.isPropertyAccessExpression(parent) && parent.expression === node) ||
        (ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isObjectBindingPattern(parent.name)) ||
        // `t.mock.method(cp, 'spawnSync', fake)` replaces a function; it starts nothing.
        (ts.isCallExpression(parent) && parent.arguments[0] === node && /\bmock\.method$/.test(parent.expression.getText()));
      if (!declared && !read) report(node, 'child_process', 'untraceable');
    }
    ts.forEachChild(node, visitCalls);
  };
  visitCalls(source);
  return { calls, findings };
}

const problemsOf = (text) => scanSource(text).findings.map((f) => `${f.fn}:${f.problem}`);

// --- The scan itself: it must catch what it claims to ---------------------------------------

test('a call with no options is refused, a call that shows windowsHide passes', () => {
  assert.deepEqual(problemsOf("import { spawnSync } from 'node:child_process';\nspawnSync('git', ['status']);"), ['spawnSync:missing']);
  assert.deepEqual(problemsOf("import { spawnSync } from 'node:child_process';\nspawnSync('git', ['status'], { windowsHide: true });"), []);
});

test('options without windowsHide are refused, whatever else they say', () => {
  assert.deepEqual(problemsOf("import { execSync } from 'child_process';\nexecSync('git status', { stdio: 'pipe' });"), ['execSync:missing']);
  assert.deepEqual(problemsOf("import { execSync } from 'child_process';\nexecSync('git status', { ...opts });"), ['execSync:missing']);
  assert.deepEqual(problemsOf("import { execSync } from 'child_process';\nexecSync('git status', { ...opts, windowsHide: true });"), []);
  // A spread after the flag can turn it back off.
  assert.deepEqual(problemsOf("import { execSync } from 'child_process';\nexecSync('git status', { windowsHide: true, ...opts });"), ['execSync:missing']);
});

test('every child_process function is covered, under every way of reaching it', () => {
  for (const fn of FUNCTIONS) {
    assert.deepEqual(problemsOf(`import { ${fn} } from 'node:child_process';\n${fn}('x');`), [`${fn}:missing`], fn);
  }
  assert.deepEqual(problemsOf("import { spawn as run } from 'node:child_process';\nrun('x', []);"), ['spawn:missing']);
  assert.deepEqual(problemsOf("import cp from 'node:child_process';\ncp.execFileSync('x');"), ['execFileSync:missing']);
  assert.deepEqual(problemsOf("import * as cp from 'node:child_process';\ncp.fork('x');"), ['fork:missing']);
  assert.deepEqual(problemsOf("const { execFileSync } = await import('node:child_process');\nexecFileSync('x');"), ['execFileSync:missing']);
  assert.deepEqual(problemsOf("const cp = require('child_process');\ncp.exec('x', () => {});"), ['exec:missing']);
  assert.deepEqual(problemsOf("import cp from 'node:child_process';\nconst { spawnSync } = cp;\nspawnSync('x');"), ['spawnSync:missing']);
  assert.deepEqual(problemsOf("const cp = await import('node:child_process');\ncp.default.spawn('x');"), ['spawn:missing']);
  assert.deepEqual(
    problemsOf("import { execFile } from 'node:child_process';\nimport { promisify } from 'node:util';\nconst run = promisify(execFile);\nawait run('x', []);"),
    ['execFile:missing'],
  );
});

test('a same-file const object counts; options the file cannot see do not', () => {
  const head = "import { spawnSync } from 'node:child_process';\n";
  assert.deepEqual(problemsOf(`${head}const OPTS = { windowsHide: true };\nspawnSync('x', [], OPTS);`), []);
  assert.deepEqual(problemsOf(`${head}const OPTS = { stdio: 'pipe' };\nspawnSync('x', [], OPTS);`), ['spawnSync:missing']);
  assert.deepEqual(problemsOf(`${head}export function run(cmd, args, options) { return spawnSync(cmd, args, options); }`), ['spawnSync:missing']);
});

test('windowsHide: false is reported, a function passed as a value is untraceable, a test seam is a call', () => {
  assert.deepEqual(problemsOf("import { spawn } from 'node:child_process';\nspawn('x', [], { windowsHide: false });"), ['spawn:false']);
  assert.deepEqual(problemsOf("import { spawn } from 'node:child_process';\nwrap(spawn);"), ['spawn:untraceable']);
  assert.deepEqual(problemsOf("import cp from 'node:child_process';\ncp['spawn']('x');"), ['child_process:untraceable']);
  assert.deepEqual(problemsOf("import * as cp from 'node:child_process';\nwrap(cp);"), ['child_process:untraceable']);
  assert.deepEqual(problemsOf("import cp from 'node:child_process';\nt.mock.method(cp, 'spawnSync', () => ({}));"), []);
  assert.deepEqual(problemsOf("import { spawn } from 'node:child_process';\n(deps.launch ?? spawn)('x', []);"), ['spawn:missing']);
  assert.deepEqual(problemsOf("import { spawn } from 'node:child_process';\n(deps.launch ?? spawn)('x', [], { windowsHide: true });"), []);
  assert.deepEqual(problemsOf("import { spawn } from 'node:child_process';\nfunction go({ start = spawn } = {}) { start('x', []); }"), ['spawn:missing']);
  assert.deepEqual(problemsOf("import { spawn } from 'node:child_process';\nconst run = spawn;\nrun('x', [], { windowsHide: true });"), []);
});

test('names that only look like child_process are left alone', () => {
  assert.deepEqual(problemsOf("const m = /a/.exec('a');\nimport { spawn } from './other.mjs';\nspawn('x');"), []);
});

// --- The repository --------------------------------------------------------------------------

const files = globSync('scripts/**/*.{mjs,js,cjs,jsx}', { cwd: ROOT }).map((f) => f.split(path.sep).join('/'));

test('every child process started under scripts/ shows windowsHide', () => {
  const texts = new Map();
  for (const file of files) {
    const text = readFileSync(path.join(ROOT, file), 'utf8');
    if (text.includes('child_process')) texts.set(file, text);
  }
  const { checker, sources } = bind(texts);
  const offenders = [];
  const sharing = new Set();
  let calls = 0;
  for (const [file, source] of sources) {
    const scan = scanBound(source, checker);
    calls += scan.calls;
    for (const f of scan.findings) {
      if (f.problem === 'false' && SHARES_THE_CONSOLE[file]) {
        sharing.add(file);
        continue;
      }
      const why = { missing: 'does not show windowsHide', false: 'sets windowsHide: false and is not in SHARES_THE_CONSOLE', untraceable: 'is passed as a value, so its calls cannot be read' }[f.problem];
      offenders.push(`${file}:${f.line} ${f.fn} ${why}`);
    }
  }
  // The scan must have looked at something: a glob or an import shape that stopped matching
  // would otherwise pass this test forever.
  assert.ok(calls > 200, `only ${calls} child-process calls found under scripts/ - the scan stopped finding them`);
  assert.deepEqual(offenders, [], `${offenders.length} child-process call(s) would flash a console window on Windows:\n  ${offenders.join('\n  ')}\n`);
  const stale = Object.keys(SHARES_THE_CONSOLE).filter((file) => !sharing.has(file));
  assert.deepEqual(stale, [], 'SHARES_THE_CONSOLE lists files that no longer set windowsHide: false');
});
