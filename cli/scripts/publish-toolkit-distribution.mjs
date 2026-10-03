// Prepare a generated branch commit. Only --push updates the canonical remote distribution branch.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble, ROOT, writeDistribution } from './toolkit-distribution.mjs';

export function prepareDistribution({ source = ROOT, out, remote, push = false }) {
  const gitSource = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();
  if (gitSource('status', '--porcelain', '--untracked-files=normal')) throw new Error('distribution requires clean source');
  if (push && !/^https:\/\/github\.com\/NoaCG\/NoaCG-Studio(?:\.git)?$/.test(remote)) throw new Error('only canonical HTTPS remote may receive distribution');
  const result = assemble(source);
  if (out) writeDistribution(out, result);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'noacg-dist-branch-'));
  // Use a dedicated temporary output so no previous artifact is mutated by git metadata.
  writeDistribution(path.join(dir, 'artifact'), result);
  const repo = path.join(dir, 'artifact/repository');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'NoaCG Studio', GIT_AUTHOR_EMAIL: 'noreply@noacg.studio',
      GIT_COMMITTER_NAME: 'NoaCG Studio', GIT_COMMITTER_EMAIL: 'noreply@noacg.studio',
      GIT_AUTHOR_DATE: gitSource('show', '-s', '--format=%cI', 'HEAD'), GIT_COMMITTER_DATE: gitSource('show', '-s', '--format=%cI', 'HEAD') } }).trim();
  git('init', '--initial-branch=agent-toolkit-dist');
  let previous = '';
  if (remote) {
    previous = git('ls-remote', '--heads', remote, 'refs/heads/agent-toolkit-dist').split(/\s+/)[0];
    if (previous) {
      git('fetch', '--no-tags', remote, 'refs/heads/agent-toolkit-dist');
      const old = JSON.parse(git('show', 'FETCH_HEAD:PROVENANCE.json'));
      // Refuse delayed old releases replacing a newer source snapshot.
      execFileSync('git', ['merge-base', '--is-ancestor', old.sourceCommit, result.report.sourceCommit], { cwd: source });
      if (old.sourceCommit === result.report.sourceCommit) return { sourceCommit: old.sourceCommit, commit: previous, unchanged: true, repository: repo };
    }
  }
  git('add', '--all');
  const tree = git('write-tree');
  const args = ['commit-tree', tree, ...(previous ? ['-p', previous] : []), '-m', `Update local Agent Toolkit ${result.report.version} from ${result.report.sourceCommit}`];
  const commit = git(...args);
  git('update-ref', 'refs/heads/agent-toolkit-dist', commit);
  const archive = path.join(dir, 'github-archive.zip');
  git('archive', '--format=zip', '--prefix=NoaCG-Studio-agent-toolkit-dist/', `--output=${archive}`, commit);
  const githubArchiveBytes = readFileSync(archive).length;
  if (githubArchiveBytes >= 50 * 1024 * 1024) throw new Error('Git repository archive exceeds Claude limit');
  if (push) git('push', `--force-with-lease=refs/heads/agent-toolkit-dist:${previous}`, remote, `${commit}:refs/heads/agent-toolkit-dist`);
  const receipt = { sourceCommit: result.report.sourceCommit, commit, parent: previous || null, githubArchiveBytes, pushed: push, repository: repo };
  writeFileSync(path.join(dir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.some((a) => !['--push'].includes(a))) throw new Error('usage: node cli/scripts/publish-toolkit-distribution.mjs [--push]');
    if (!existsSync(path.join(ROOT, 'cli/package.json'))) throw new Error('source repository missing');
    console.log(JSON.stringify(prepareDistribution({ push: args.includes('--push'), remote: args.includes('--push') ? 'https://github.com/NoaCG/NoaCG-Studio.git' : undefined }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
