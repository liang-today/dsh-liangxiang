import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function checkPullRequest(env = process.env, cwd = process.cwd()) {
  if (env.BASE_BRANCH !== 'main') throw new Error('Pull requests must target main');
  const repository = env.HEAD_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || repository.toLowerCase() === 'liang-today/dsh-liangxiang') {
    throw new Error('Use a branch in your personal fork');
  }
  if (env.HEAD_IS_FORK !== 'true' || env.HEAD_OWNER_TYPE !== 'User'
    || !env.HEAD_OWNER || !env.PR_AUTHOR
    || env.HEAD_OWNER.toLowerCase() !== env.PR_AUTHOR.toLowerCase()
    || repository.split('/')[0].toLowerCase() !== env.HEAD_OWNER.toLowerCase()) {
    throw new Error('The pull request must come from a fork owned by its author');
  }
  if (!env.HEAD_BRANCH || !env.HEAD_DEFAULT_BRANCH || env.HEAD_BRANCH === env.HEAD_DEFAULT_BRANCH) {
    throw new Error('Create a feature branch in your fork; do not submit its default branch');
  }
  for (const value of [env.BASE_SHA, env.PR_HEAD_SHA]) {
    if (!/^[a-f0-9]{40}$/.test(value ?? '')) throw new Error('Expected a complete commit SHA');
  }
  try {
    for (const base of [env.BASE_SHA, 'refs/remotes/origin/main']) {
      execFileSync('git', ['merge-base', '--is-ancestor', base, env.PR_HEAD_SHA], { cwd, stdio: 'pipe' });
    }
  } catch {
    throw new Error('Sync the latest community main into your branch before merging');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkPullRequest();
    console.log('Personal fork and main ancestry verified.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
