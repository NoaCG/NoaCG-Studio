// Prepare a generated branch commit. Only --push updates the canonical remote distribution branch.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble, ROOT } from './toolkit-distribution.mjs';

export function prepareDistribution({ source = ROOT, remote, push = false }) {
  const gitSource = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
  if (gitSource('status', '--porcelain', '--untracked-files=normal')) throw new Error('distribution requires clean source');
  if (push && !/^https:\/\/github\.com\/NoaCG\/NoaCG-Studio(?:\.git)?$/.test(remote)) throw new Error('only canonical HTTPS remote may receive distribution');
  const result = assemble(source);
  // Only the repository tree becomes the branch, written into a fresh temporary folder so git
  // metadata never lands in a kept artifact.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'noacg-dist-branch-'));
  try {
    return commitDistribution({ source, remote, push, result, dir, gitSource });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true }); // a refused snapshot leaves nothing to inspect
    throw error;
  }
}

function commitDistribution({ source, remote, push, result, dir, gitSource }) {
  const repo = path.join(dir, 'artifact/repository');
  for (const [file, bytes] of result.packages.repository) {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    writeFileSync(path.join(repo, file), bytes);
  }
  const sourceDate = gitSource('show', '-s', '--format=%cI', 'HEAD');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, GIT_AUTHOR_NAME: 'NoaCG Studio', GIT_AUTHOR_EMAIL: 'noreply@noacg.studio',
      GIT_COMMITTER_NAME: 'NoaCG Studio', GIT_COMMITTER_EMAIL: 'noreply@noacg.studio',
      GIT_AUTHOR_DATE: sourceDate, GIT_COMMITTER_DATE: sourceDate } }).trim();
  git('init', '--initial-branch=agent-toolkit-dist');
  let previous = '';
  if (remote) {
    previous = git('ls-remote', '--heads', remote, 'refs/heads/agent-toolkit-dist').split(/\s+/)[0];
    if (previous) {
      git('fetch', '--no-tags', remote, 'refs/heads/agent-toolkit-dist');
      const old = JSON.parse(git('show', 'FETCH_HEAD:PROVENANCE.json'));
      // Refuse delayed old releases replacing a newer source snapshot.
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', old.sourceCommit, result.report.sourceCommit], { cwd: source, stdio: 'pipe', windowsHide: true });
      } catch {
        throw new Error(`agent-toolkit-dist already holds ${old.sourceCommit}, which ${result.report.sourceCommit} does not contain: a newer or unrelated snapshot is published, so this one is not`);
      }
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
  return { sourceCommit: result.report.sourceCommit, commit, parent: previous || null, githubArchiveBytes, pushed: push, repository: repo };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.some((a) => a !== '--push')) throw new Error('usage: node cli/scripts/publish-toolkit-distribution.mjs [--push]');
    const push = args.includes('--push');
    console.log(JSON.stringify(prepareDistribution({ push, remote: push ? 'https://github.com/NoaCG/NoaCG-Studio.git' : undefined }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
