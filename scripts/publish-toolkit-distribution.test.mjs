// gate: build
// guards: cli/scripts/publish-toolkit-distribution.mjs, cli/scripts/toolkit-distribution.mjs, .github/workflows/release-cli.yml
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ROOT } from '../cli/scripts/toolkit-distribution.mjs';
import { prepareDistribution } from '../cli/scripts/publish-toolkit-distribution.mjs';

test('distribution branch has only generated history, preserves parents and refuses stale sources', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'noacg-publish-test-'));
  t.after(() => rmSync(dir, {recursive:true,force:true}));
  const source=path.join(dir,'source');
  mkdirSync(source);
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}).trim();
  for (const file of ['cli/package.json','cli/package-lock.json','cli/LICENSE','cli/NOTICE','cli/scripts/toolkit-distribution.mjs','.claude-plugin','cli/plugin','cli/plugin-mcp','cli/skill']) {
    mkdirSync(path.dirname(path.join(source,file)),{recursive:true});
    cpSync(path.join(ROOT,file),path.join(source,file),{recursive:true});
  }
  git(source,'init');
  git(source,'config','user.name','Toolkit test');
  git(source,'config','user.email','test@example.invalid');
  const commit=()=>{git(source,'add','--all');git(source,'commit','-m','Test source snapshot');return git(source,'rev-parse','HEAD');};
  const firstSource=commit();
  const prepare=(remote)=>{
    const r=prepareDistribution({source,remote});
    const temp=path.dirname(path.dirname(r.repository));
    assert.ok(path.basename(temp).startsWith('noacg-dist-branch-'));
    t.after(()=>rmSync(temp,{recursive:true,force:true}));
    return r;
  };
  const first=prepare();
  assert.equal(first.sourceCommit,firstSource);
  assert.equal(first.parent,null);
  assert.equal(first.pushed,false);
  assert.equal(git(first.repository,'rev-list','--count',first.commit),'1');
  assert.equal(JSON.parse(git(first.repository,'show',`${first.commit}:PROVENANCE.json`)).sourceCommit,firstSource);
  assert.throws(()=>prepareDistribution({source,remote:'https://example.invalid/repo.git',push:true}),/canonical HTTPS/);
  const remote=path.join(dir,'remote.git');
  mkdirSync(remote);
  git(remote,'init','--bare');
  git(first.repository,'push',remote,`${first.commit}:refs/heads/agent-toolkit-dist`);
  writeFileSync(path.join(source,'note.md'),'New source commit, no new distribution source.\n');
  const secondSource=commit();
  const second=prepare(remote);
  assert.equal(second.sourceCommit,secondSource);
  assert.equal(second.parent,first.commit);
  assert.equal(git(second.repository,'rev-list','--count',second.commit),'2');
  git(second.repository,'push',remote,`${second.commit}:refs/heads/agent-toolkit-dist`);
  assert.equal(prepare(remote).unchanged,true);
  git(source,'checkout','--detach',firstSource);
  assert.throws(()=>prepare(remote),/does not contain/);
  writeFileSync(path.join(source,'dirty.md'),'uncommitted');
  assert.throws(()=>prepareDistribution({source}),/clean source/);
});
