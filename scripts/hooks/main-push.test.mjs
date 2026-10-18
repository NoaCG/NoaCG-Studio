// guards: scripts/command-match.mjs, scripts/hooks/guard-command.mjs, scripts/hooks/codex-guard-command.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { mainPushRefusal } from './main-push.mjs';

test('real Git upstream destinations are refused without contacting the remote', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'noacg-main-push-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-b', 'main');
  git('config', 'user.name', 'Push fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('commit', '--allow-empty', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  const remote = join(root, 'remote.git');
  git('init', '--bare', remote);
  git('remote', 'add', 'origin', remote);
  git('push', 'origin', 'refs/heads/main:refs/heads/main');
  git('switch', '--track', '-c', 'feature', 'origin/main');
  git('config', 'push.default', 'upstream');
  git('commit', '--allow-empty', '-m', 'feature');
  git('tag', 'v1');
  const head = git('rev-parse', 'HEAD');
  const refused = (command) => assert.match(mainPushRefusal(command, root, root) ?? '', /only the merge queue/, command);
  const allowed = (command) => assert.equal(mainPushRefusal(command, root, root), null, command);

  for (const command of ['git push -u origin feature', 'git push origin', 'git push', 'git push origin HEAD',
    'git push --repo=origin feature', 'git push --repo origin feature', 'git push origin $branch']) refused(command);
  // These writes are ONLY to the disposable local bare repository, never the project remote.
  assert.match(git('push', '--dry-run', '--porcelain', '-u', 'origin', 'feature'), /refs\/heads\/feature:refs\/heads\/main/);
  assert.equal(git('--git-dir', remote, 'rev-parse', 'main'), base);
  git('push', '-u', 'origin', 'feature');
  assert.equal(git('--git-dir', remote, 'rev-parse', 'main'), head);
  git('commit', '--allow-empty', '-m', 'default push');
  git('push', 'origin');
  assert.equal(git('--git-dir', remote, 'rev-parse', 'main'), git('rev-parse', 'HEAD'));

  for (const command of ['git push origin refs/heads/feature:refs/heads/feature', 'git push origin HEAD:feature',
    'git push origin main:feature', 'git push origin --tags', 'git push origin tag v1',
    'git push --dry-run origin main', 'git push -n origin feature', 'git push origin refs/tags/v1',
    'git push origin --delete feature']) allowed(command);
  git('push', '-u', 'origin', 'refs/heads/feature:refs/heads/feature');
  allowed('git push');
  allowed('git push origin feature');
  refused('git -c push.default=matching push');
  refused('git -c remote.origin.push=feature:main push origin feature');
  refused('git -c remote.origin.push=feature:refs/heads/main push origin');
  refused('git -c remote.origin.push=HEAD:main push origin feature');
  allowed('git -c remote.origin.push=feature:another push origin feature');
  refused('git -c remote.origin.push=feature:another -c remote.origin.push=feature:main push origin feature');
  refused('git -c remote.origin.push=refs/tags/v1:main push origin refs/tags/v1');
  allowed('git -c remote.origin.push=refs/tags/v1:main push origin tag v1');
  refused('git push origin missing-source');
  // A failure to resolve a source is conservative, but an unrelated repository is out of scope.
  assert.equal(mainPushRefusal('git push origin main', root), null);
  git('remote', 'rename', 'origin', 'only-remote');
  git('config', '--unset', 'branch.feature.remote');
  git('config', 'remote.only-remote.push', 'feature:main');
  refused('git push');
});

test('both real hook adapters enforce the same implicit push policy', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const branch = spawnSync('git', ['-C', root, 'branch', '--show-current'], { encoding: 'utf8', windowsHide: true }).stdout.trim();
  const implicit = `git -c push.default=upstream -c branch.${branch}.remote=origin -c branch.${branch}.merge=refs/heads/main push -u origin ${branch}`;
  const commands = [
    [implicit, true], ['git push origin HEAD:refs/heads/main', true],
    ['git -c push.default=matching push', true],
    ['git push origin HEAD:refs/heads/codex/safe-feature', false],
    ['git push --dry-run origin main', false], ['git push origin --tags', false],
  ];
  for (const [command, deny] of commands) {
    const reasons = [];
    for (const adapter of ['guard-command.mjs', 'codex-guard-command.mjs']) {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL(adapter, import.meta.url))], {
        input: JSON.stringify({ cwd: root, tool_name: 'Bash', tool_input: { command } }),
        encoding: 'utf8', windowsHide: true,
      });
      if (adapter.startsWith('codex')) {
        assert.equal(result.status, 0, result.stderr);
        const decision = result.stdout ? JSON.parse(result.stdout).hookSpecificOutput : null;
        assert.equal(decision?.permissionDecision === 'deny', deny, command);
        reasons.push(decision?.permissionDecisionReason?.trim() ?? '');
      } else {
        assert.equal(result.status, deny ? 2 : 0, result.stderr || command);
        reasons.push(result.stderr.trim());
      }
    }
    assert.equal(reasons[0], reasons[1], command);
  }
});
