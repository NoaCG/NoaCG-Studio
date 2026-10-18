// Resolve implicit push destinations from local Git state. Never run push (even a dry run)
// here: that would contact a remote and could run transport helpers or hooks.
import { spawnSync } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainPushes, pushArguments } from '../command-match.mjs';
import { checkoutRoot, commandCheckout } from '../command-target.mjs';
import { gitCommonDir } from '../primary-checkout.mjs';
import { sameRoot } from '../port-registry.mjs';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const isMain = (ref) => /^(?:(?:refs\/)?heads\/)?main$/.test(ref);
const refusal = 'Blocked: this push could write `main`, and only the merge queue writes main ' +
  '(`root/land-finished-work-only-reconciles-current`). Use `/queue-merge` to land work. ' +
  'For a feature push, name its destination explicitly: ' +
  '`git push origin refs/heads/<feature>:refs/heads/<feature>`.';

/** True includes unresolved implicit destinations: require an explicit destination instead. */
export function implicitPushMayWriteMain(root, invocation) {
  const configArgs = (invocation.config ?? []).flatMap((value) => ['-c', value]);
  function git(args, missing = false) {
    const result = spawnSync('git', ['-C', root, ...configArgs, ...args], {
      encoding: 'utf8', windowsHide: true, timeout: 5000,
    });
    if (missing && result.status === 1) return '';
    if (result.status !== 0) throw new Error('Git could not resolve the push destination');
    return result.stdout.trim();
  }
  const config = (key, multiple = false) => git(['config', multiple ? '--get-all' : '--get', key], true);
  try {
    const current = git(['branch', '--show-current']);
    const { remote: namedRemote, refspecs } = pushArguments(invocation.args);
    const remotes = git(['remote']).split('\n').filter(Boolean);
    const remote = namedRemote || config(`branch.${current}.pushRemote`) ||
      config('remote.pushDefault') || config(`branch.${current}.remote`) ||
      (remotes.length === 1 ? remotes[0] : 'origin');
    if (remote.includes('$')) return true;
    if (config(`remote.${remote}.mirror`) === 'true') return true;
    const configured = config(`remote.${remote}.push`, true).split('\n').filter(Boolean);
    const mode = config('push.default') || 'simple';
    function destinationMayWriteMain(spec, fromConfig = false) {
      spec = spec.replace(/^\+/, '');
      if (spec.includes('$')) return true;
      if (spec.includes(':')) {
        const destination = spec.slice(spec.indexOf(':') + 1);
        return !destination || isMain(destination) || destination.includes('*');
      }
      const source = git(['rev-parse', '--symbolic-full-name', '--verify', spec]);
      if (!source) return true;
      if (isMain(source)) return true;
      if (!fromConfig && configured.length) {
        // A source-only push follows remote.push mappings. Unknown/glob mappings fail closed;
        // an explicit destination bypasses this resolver and remains usable.
        let matched = false;
        for (const mapping of configured) {
          const [from, to] = mapping.replace(/^\+/, '').split(':');
          if (from.includes('*') || !from) return true;
          if (from === spec || from === source || `refs/heads/${from}` === source ||
            (from === 'HEAD' && source === `refs/heads/${current}`)) {
            matched = true;
            if (to ? isMain(to) || to.includes('*') : isMain(source)) return true;
          }
        }
        if (matched) return false;
      }
      if (!fromConfig && ['upstream', 'tracking'].includes(mode) && source.startsWith('refs/heads/')) {
        const branch = source.slice('refs/heads/'.length);
        const upstreamRemote = config(`branch.${branch}.remote`);
        const upstream = config(`branch.${branch}.merge`, true);
        // Git rejects a different push remote in upstream mode; no main write then.
        if (upstreamRemote === remote && upstream) return upstream.split('\n').some(isMain);
      }
      return false;
    }
    if (refspecs.length) return refspecs.some((spec) => destinationMayWriteMain(spec));
    if (configured.length) return configured.some((spec) => destinationMayWriteMain(spec, true));
    if (mode === 'nothing') return false;
    if (mode === 'matching') return true;
    if (!['simple', 'current', 'upstream', 'tracking'].includes(mode) || !current) return true;
    return destinationMayWriteMain(current);
  } catch {
    return true;
  }
}

/** Both adapters use this refusal; unrelated fixture repositories remain outside this policy. */
export function mainPushRefusal(command, sessionDir, protectedRoot = repositoryRoot) {
  const pushes = mainPushes(command, true);
  if (!pushes.length) return null;
  const target = commandCheckout(command, sessionDir) ?? sessionDir;
  const thisRepo = gitCommonDir(protectedRoot);
  for (const push of pushes) {
    const root = push.dir ? checkoutRoot(isAbsolute(push.dir) ? push.dir : join(target, push.dir)) : target;
    if (!root || !thisRepo || !sameRoot(gitCommonDir(root), thisRepo)) continue;
    if (push.how === 'named' || implicitPushMayWriteMain(root, push)) return refusal;
  }
  return null;
}
