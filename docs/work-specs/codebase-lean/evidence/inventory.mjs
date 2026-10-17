// Read-only source audit. Run from the repository root; writes only this evidence directory.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = process.cwd();
const out = path.dirname(new URL(import.meta.url).pathname);
const pin = '3010e41134f1e3a6ebf3933582eb9b7e52055241';
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', pin], { encoding: 'utf8' }).trim().split('\n');
const fileSet = new Set(files);
const texts = new Map();
function read(p) { if (!texts.has(p)) texts.set(p, fs.readFileSync(path.join(root, p), 'utf8')); return texts.get(p); }
const lines = p => { const s = read(p); return s ? s.split('\n').length - Number(s.endsWith('\n')) : 0; };
const code = files.filter(p => /\.(?:[cm]?[jt]sx?)$/.test(p));
const source = code.filter(p => p.startsWith('src/'));
const json = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
const cell = s => {
  const value = String(s ?? '').replaceAll('\t', ' ').replaceAll('\r', '').replaceAll('\n', ' / ').trimEnd();
  return value === '' || value.includes('"') ? '"' + value.replaceAll('"', '""') + '"' : value;
};
const table = (name, cols, rows) => fs.writeFileSync(path.join(out, name), [cols.join('\t'), ...rows.map(r => cols.map(c => cell(typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])).join('\t'))].join('\n') + '\n');
const asts = new Map();
function ast(p) { if (!asts.has(p)) asts.set(p, ts.createSourceFile(p, read(p), ts.ScriptTarget.Latest, true, p.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)); return asts.get(p); }
function walk(n, fn) { fn(n); ts.forEachChild(n, c => walk(c, fn)); }
function resolve(from, raw) {
  const s = raw.replace(/[?#].*$/, '');
  const base = s.startsWith('/src/') ? s.slice(1) : s.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(from), s)) : s.startsWith('src/') ? s : null;
  if (!base) return null;
  const candidates = [base, ...['.ts','.tsx','.js','.mjs','.css','/index.ts','/index.tsx'].map(x => base + x)];
  if (/\.js$/.test(base)) candidates.push(base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'));
  return candidates.find(p => fileSet.has(p)) ?? null;
}
const edges = [], dynamic = [], skipSites = [];
for (const p of code) {
  const sf = ast(p), seen = new Set();
  walk(sf, n => {
    if (/(?:\.spec\.|\.test\.|e2e\/_create)/.test(p)) {
      if (ts.isCallExpression(n) && /^(?:test(?:\.describe)?|it|t)\.(?:skip|fixme)$/.test(n.expression.getText(sf))) skipSites.push({path:p,line:sf.getLineAndCharacterOfPosition(n.getStart()).line+1,kind:'skip-call',expression:n.getText(sf).slice(0,700)});
      if (ts.isPropertyAssignment(n) && n.name.getText(sf)==='skip') skipSites.push({path:p,line:sf.getLineAndCharacterOfPosition(n.getStart()).line+1,kind:'skip-option',expression:n.getText(sf).slice(0,700)});
    }
    let value, kind;
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      value = n.moduleSpecifier.text; kind = n.importClause?.isTypeOnly || n.isTypeOnly ? 'type' : 'static';
    } else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || n.expression.getText(sf) === 'require')) {
      if (n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) { value = n.arguments[0].text; kind = 'dynamic'; }
      else dynamic.push({path:p,line:sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,expression:n.getText(sf).slice(0,250)});
    } else if (ts.isNewExpression(n) && n.expression.getText(sf) === 'URL' && n.arguments?.[0] && ts.isStringLiteralLike(n.arguments[0])) {
      value = n.arguments[0].text; kind = 'url';
    } else if (ts.isStringLiteralLike(n) && /^(?:\/)?src\//.test(n.text)) { value = n.text; kind = 'string-path'; }
    if (!value) return;
    const to = resolve(p, value);
    if (to && !seen.has(to + kind)) { seen.add(to + kind); edges.push({from:p,to,kind,line:sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}); }
  });
}
asts.clear();
table('skip-sites.tsv',['path','line','kind','expression'],skipSites);
// HTML entries and CSS imports are outside TypeScript's module resolver.
const roots = [];
for (const p of files.filter(p => !p.includes('/') && p.endsWith('.html'))) {
  for (const m of read(p).matchAll(/(?:src|href)=["']\/?(src\/[^"']+)["']/g)) if (fileSet.has(m[1])) roots.push({path:m[1],reason:p});
}
for (const p of files.filter(p => p.startsWith('src/') && p.endsWith('.css'))) {
  for (const m of read(p).matchAll(/(?:@import\s+|url\(\s*)["']([^"']+)["']/g)) { const to = resolve(p,m[1]); if(to) edges.push({from:p,to,kind:'css',line:read(p).slice(0,m.index).split('\n').length}); }
}
const external = code.filter(p => /^(api|render-worker|player-host|cli|companion-module)\//.test(p) && !/(?:\/test\/|\.test\.|\.spec\.)/.test(p));
for (const e of edges) if (external.includes(e.from) && e.to.startsWith('src/')) roots.push({path:e.to,reason:e.from});
for (const e of edges) if (/^scripts\/(?:build-|prerender|gen-)/.test(e.from) && e.to.startsWith('src/')) roots.push({path:e.to,reason:e.from});
// Hand-checked Vite SSR registry: catalogIndexPlugin calls server.ssrLoadModule by string.
roots.push({path:'src/templates/catalogIndexBuild.ts',reason:'scripts/catalogIndexPlugin.mjs:39 (Vite SSR string loader)'});
const adjacency = new Map();
for (const e of edges) { const list = adjacency.get(e.from) ?? []; list.push(e); adjacency.set(e.from,list); }
function closure(starts) { const visited = new Set(), previous = new Map(), queue = [...starts]; for (const s of queue) previous.set(s,null); for(let i=0;i<queue.length;i++) { const p=queue[i]; if(visited.has(p)) continue; visited.add(p); for(const e of adjacency.get(p) ?? []) if(!previous.has(e.to)) { previous.set(e.to,p); queue.push(e.to); } } return {visited,previous}; }
const live = closure(roots.map(r=>r.path)), old = closure(['src/components/AppShell.tsx']);
const proofPath = p => { const result=[p]; while(live.previous.get(p)) { p=live.previous.get(p); result.unshift(p); } return result; };
const sourceRows = source.map(p => ({path:p,lines:lines(p),classification:live.visited.has(p) ? (old.visited.has(p) ? 'shared-keep' : 'reachable-keep') : old.visited.has(p) ? 'old-editor-exclusive' : 'unreachable-review',proof:live.visited.has(p) ? proofPath(p).join(' -> ') : '',importers:edges.filter(e=>e.to===p).map(e=>e.from)}));
table('source-files.tsv',['path','lines','classification','proof','importers'],sourceRows);
table('import-edges.tsv',['from','line','to','kind'],edges);
json('entrypoints.json', {pin,roots,dynamicExpressions:dynamic});
const storeFile='src/store/templateStore.ts', storeAst=ast(storeFile);
const storeInterface=storeAst.statements.find(n=>ts.isInterfaceDeclaration(n)&&n.name.text==='TemplateState');
const storeRows=storeInterface.members.filter(n=>n.name&&ts.isIdentifier(n.name)).map(n=>{
  const field=n.name.text;
  const consumers=sourceRows.filter(r=>r.path!==storeFile&&r.classification.includes('keep')&&read(r.path).includes('templateStore')&&new RegExp('\\b'+field+'\\b').test(read(r.path))).map(r=>r.path);
  return {field,line:storeAst.getLineAndCharacterOfPosition(n.getStart()).line+1,disposition:consumers.length?'keep-live-consumer':'remove-review-no-live-store-consumer',consumers};
});
table('store-fields.tsv',['field','line','disposition','consumers'],storeRows);
const flagRows=[];
for(const p of source)for(const m of read(p).matchAll(/(?:import\.meta\.env\.(\w+)|\benv\(['"]([A-Z][A-Z_0-9]+)['"]\))/g))flagRows.push({path:p,line:read(p).slice(0,m.index).split('\n').length+1,name:m[1]??m[2],disposition:live.visited.has(p)?'keep-live-path':'review-research-only'});
table('flags.tsv',['path','line','name','disposition'],flagRows);

const durations = JSON.parse(read('scripts/e2e-durations.json'));
const retired = new Set(['skipOldEditor','enableAdvancedMode','switchToAdvancedMode','finishIntoEditor','createProject']);
const caseRows=[], testRows=[];
for(const p of code.filter(p=> /(?:\.spec\.[jt]sx?$|\.test\.[cm]?[jt]s$|\/test\/[^_/][^/]*\.[cm]?js$)/.test(p))) {
  const sf=ast(p), body=read(p), funcs=new Map(), localRetired=new Set();
  if(p.startsWith('e2e/')) for(const n of sf.statements) if(ts.isImportDeclaration(n) && n.moduleSpecifier.text?.endsWith('/_create')) for(const el of n.importClause?.namedBindings?.elements ?? []) if(retired.has(el.propertyName?.text ?? el.name.text)) localRetired.add(el.name.text);
  walk(sf,n=>{if(ts.isFunctionDeclaration(n)&&n.name&&n.body) funcs.set(n.name.text,n.body); if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer&&(ts.isArrowFunction(n.initializer)||ts.isFunctionExpression(n.initializer))) funcs.set(n.name.text,n.initializer.body);});
  function skips(n, seen=new Set()) { let reason=''; if(!n) return reason; walk(n,c=>{if(reason||!ts.isCallExpression(c)) return; const expr=c.expression.getText(sf); if(localRetired.has(expr)) reason=expr; else if(funcs.has(expr)&&!seen.has(expr)) { const next=new Set(seen);next.add(expr);const s=skips(funcs.get(expr),next);if(s) reason=expr+' -> '+s; } else if(expr==='test.skip' && c.arguments[0]?.kind===ts.SyntaxKind.TrueKeyword && c.arguments.some(a=>/OLD_EDITOR_SKIP|old code editor|old editor/.test(a.getText(sf)))) reason='test.skip(true, old editor)'; }); return reason; }
  function visitScope(n, labels=[], inherited='') {
    const statements=ts.isSourceFile(n)||ts.isBlock(n)?n.statements:[];
    let hook=inherited;
    for(const s of statements) if(ts.isExpressionStatement(s)&&ts.isCallExpression(s.expression)&&/^(?:test\.)?before(?:Each|All)$/.test(s.expression.expression.getText(sf))) { const cb=s.expression.arguments.find(a=>ts.isArrowFunction(a)||ts.isFunctionExpression(a)); hook ||= skips(cb?.body); }
    function visit(c) {
      if(ts.isCallExpression(c)) {
        const expr=c.expression.getText(sf), arg=c.arguments[0], cb=c.arguments.find(a=>ts.isArrowFunction(a)||ts.isFunctionExpression(a));
        const title=arg ? (ts.isStringLiteralLike(arg)?arg.text:'<dynamic: '+arg.getText(sf)+'>') : null;
        if(/^(?:test\.)?describe(?:\.(?:skip|only|serial|parallel))?$/.test(expr)&&cb) { visitScope(cb.body,[...labels,title??'<dynamic suite>'],hook || (expr.endsWith('.skip')?'describe.skip':'')); return; }
        if(/^(?:test|it)(?:\.(?:skip|only|todo|fixme))?$/.test(expr)&&title!==null&&cb) {
          const reason=hook||skips(cb.body)||(expr.endsWith('.skip')?'test.skip declaration':'');
          caseRows.push({path:p,line:sf.getLineAndCharacterOfPosition(c.getStart()).line+1,endLine:sf.getLineAndCharacterOfPosition(c.getEnd()).line+1,behaviour:[...labels,title].join(' > '),legacySkip:reason}); return;
        }
      }
      ts.forEachChild(c,visit);
    }
    for(const s of statements) visit(s);
  }
  visitScope(sf);
  const cases=caseRows.filter(r=>r.path===p), skipped=cases.filter(r=>r.legacySkip), tier=p.startsWith('e2e/')?(p.split('/').length===2?'offline':p.split('/')[1]):'node';
  const imports=edges.filter(e=>e.from===p).map(e=>e.to);
  const covers=[...body.matchAll(/^\s*(?:\/\/|\*)?\s*(?:covers|guards):\s*(.*)$/gm)].map(m=>m[1]);
  const ui=/\.(?:click|fill|press|dragTo|hover|check|uncheck|selectOption)\s*\(/.test(body);
  testRows.push({path:p,tier,lines:lines(p),declarations:cases.length,legacySkipped:skipped.length,classification:skipped.length&&skipped.length===cases.length?'delete-retired-file':skipped.length?'delete-retired-cases-keep-rest':!ui&&tier==='offline'?'move-review-browser-api-needed':'keep',minutes:durations.minutes[p.replace(/^e2e\//,'')]??null,uiCalls:ui,covers,imports,behaviours:cases.map(r=>r.behaviour)});
}
for(const r of testRows)r.behaviourSummary=r.behaviours.slice(0,3).join(' / ')+(r.behaviours.length>3?' / remaining cases in test-cases.tsv':'');
table('test-files.tsv',['path','tier','lines','declarations','legacySkipped','classification','minutes','uiCalls','covers','imports','behaviourSummary'],testRows);
table('test-cases.tsv',['path','line','endLine','behaviour','legacySkip'],caseRows);
json('retired-test-cases.json',caseRows.filter(r=>r.legacySkip));

// References are signals, not execution proof. Include workflows, hooks, contracts, docs and generated selectors.
const refFiles=files.filter(p=>/\.(?:md|json|webmanifest|ya?ml|[cm]?[jt]sx?|sh|css|html)$/.test(p));
const basenameCounts = new Map();
for (const p of files) { const b=path.posix.basename(p); basenameCounts.set(b,(basenameCounts.get(b)??0)+1); }
const markdownLinks = new Map();
for (const p of refFiles.filter(p=>p.endsWith('.md'))) for (const m of read(p).matchAll(/\]\(([^\s)#]+)(?:#[^)]*)?\)/g)) {
  const to=path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1]));
  const r=markdownLinks.get(to)??new Set();r.add(p);markdownLinks.set(to,r);
}
const refs = p => {const name=path.posix.basename(p);const r=new Set(markdownLinks.get(p)??[]);for(const e of edges)if(e.to===p)r.add(e.from);for(const q of refFiles)if(q!==p&&(read(q).includes(p)||(basenameCounts.get(name)===1&&read(q).includes(name))))r.add(q);r.delete(p);return [...r].sort();};
const oldReferences=[];
for(const p of refFiles)if(!p.startsWith('contracts/records/'))for(const [i,line] of read(p).split('\n').entries())if(/AppShell(?!Video)|CanvasInteraction|LegacyTimeline|StepTimeline|MachineGraph|OLD_EDITOR_SKIP|issues\/800|#800|keep its source until|old code editor|old editor's/.test(line))oldReferences.push({path:p,line:i+1,excerpt:line.slice(0,350)});
table('old-editor-references.tsv',['path','line','excerpt'],oldReferences);
const scriptRows=code.filter(p=>p.startsWith('scripts/')).map(p=>{const references=refs(p), machine=references.filter(q=>/^(?:\.github\/workflows\/|\.agent-workflows\/|\.claude\/|contracts\/rules\/|scripts\/hooks\/)|(?:^|\/)package\.json$|(?:AGENTS\.md|CLAUDE\.md)$|^(?:vite|playwright|eslint)\..*\.[cm]?[jt]s$/.test(q)), importers=edges.filter(e=>e.to===p).map(e=>e.from);return {path:p,lines:lines(p),test:/\.test\./.test(p),machineReferences:machine,importers,otherReferences:references.filter(q=>!machine.includes(q)),classification:/\.test\.mjs$/.test(p)?'keep-autodiscovered-gate':machine.length||importers.some(q=>!/(\.test\.|\.spec\.)/.test(q))?'keep-referenced':'review-no-machine-caller'};});
table('tooling.tsv',['path','lines','test','classification','machineReferences','importers','otherReferences'],scriptRows);
const instructionFiles=refFiles.filter(p=>/(?:AGENTS\.md|CLAUDE\.md)$/.test(p)||/^(?:\.agent-workflows\/|contracts\/rules\/)/.test(p));
const docRows=files.filter(p=>p.startsWith('docs/')&&p.endsWith('.md')).map(p=>{const references=refs(p), instructionRefs=instructionFiles.filter(q=>read(q).includes(p));return {path:p,lines:lines(p),classification:instructionRefs.length?'keep-instructions':/\/research\/|\/evidence\/|ARCHIVE|\/backlog\//.test(p)?'history-review':'keep-current-until-reviewed',instructionRefs,references};});
table('docs.tsv',['path','lines','classification','instructionRefs','references'],docRows);
const assetRows=files.filter(p=>/^(?:src\/assets\/|public\/)/.test(p)).map(p=>({path:p,bytes:fs.statSync(p).size,references:refs(p)}));
table('assets.tsv',['path','bytes','references'],assetRows);
const groups={src:source.filter(p=>/\.tsx?$/.test(p)),srcAllCode:source,srcCss:files.filter(p=>p.startsWith('src/')&&p.endsWith('.css')),e2e:code.filter(p=>p.startsWith('e2e/')&&/\.tsx?$/.test(p)),e2eAllCode:code.filter(p=>p.startsWith('e2e/')),scripts:code.filter(p=>p.startsWith('scripts/')&&!/\.test\./.test(p)),scriptTests:code.filter(p=>p.startsWith('scripts/')&&/\.test\./.test(p)),docs:docRows.map(r=>r.path)};
const totals=Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{files:v.length,lines:v.reduce((n,p)=>n+lines(p),0)}]));
const classifications={};for(const r of sourceRows){const c=classifications[r.classification]??={files:0,lines:0};c.files++;c.lines+=r.lines;}
const fullRetired=testRows.filter(r=>r.classification==='delete-retired-file'), mixed=testRows.filter(r=>r.classification==='delete-retired-cases-keep-rest');
json('measurements.json',{pin,date:'2026-10-17',lineDefinition:'Physical LF-normalized lines, including blanks and comments; tracked tree at pin; TS/TSX/JS/MJS/CJS code, docs markdown; no node_modules, generated untracked files or this report.',totals,sourceClassifications:classifications,durationSource:durations.source,offline:{files:testRows.filter(r=>r.tier==='offline').length,minutes:testRows.filter(r=>r.tier==='offline').reduce((n,r)=>n+(r.minutes??0),0),staticDeclarations:testRows.filter(r=>r.tier==='offline').reduce((n,r)=>n+r.declarations,0)},retired:{fullFiles:fullRetired.length,fullFileLines:fullRetired.reduce((n,r)=>n+r.lines,0),fullFileMinutes:fullRetired.reduce((n,r)=>n+(r.minutes??0),0),mixedFiles:mixed.length,staticDeclarations:caseRows.filter(r=>r.legacySkip).length},testFiles:testRows.length,testDeclarations:caseRows.length,nonliteralImports:dynamic.length});
console.log(JSON.stringify({totals,source:classifications,retiredFiles:fullRetired.map(r=>r.path),mixedFiles:mixed.map(r=>r.path),testFiles:testRows.length,testDeclarations:caseRows.length},null,2));
