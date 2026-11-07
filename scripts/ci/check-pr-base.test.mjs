import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkPullRequest } from './check-pr-base.mjs';

const personalFork = {
  BASE_BRANCH: 'main', HEAD_REPOSITORY: 'contributor/dsh-liangxiang',
  HEAD_IS_FORK: 'true', HEAD_OWNER: 'contributor', HEAD_OWNER_TYPE: 'User',
  PR_AUTHOR: 'contributor', HEAD_BRANCH: 'fix/example', HEAD_DEFAULT_BRANCH: 'main',
};

test('fork main gate accepts synchronized history and rejects stale or diverged heads', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'liangxiang-pr-base-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '--quiet');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    // Only isolated fixture commits; never use the real checkout or its hooks.
    git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'feature');
    const head = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', base);
    const env = { ...personalFork, BASE_SHA: base, PR_HEAD_SHA: head };
    assert.doesNotThrow(() => checkPullRequest(env, cwd));
    assert.doesNotThrow(() => checkPullRequest({ ...env, HEAD_REPOSITORY: 'Contributor/renamed-fork', PR_AUTHOR: 'Contributor' }, cwd));
    assert.throws(() => checkPullRequest({ ...env, BASE_SHA: head, PR_HEAD_SHA: base }, cwd), /Sync/);
    git('checkout', '--detach', base);
    git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'new main');
    git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
    assert.throws(() => checkPullRequest(env, cwd), /Sync/);
    git('-c', 'commit.gpgsign=false', 'merge', '--no-ff', '--no-edit', head);
    assert.doesNotThrow(() => checkPullRequest({ ...env, PR_HEAD_SHA: git('rev-parse', 'HEAD') }, cwd));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('fork main gate rejects wrong destinations, upstream branches and unsafe refs before running git', () => {
  const env = { ...personalFork, BASE_SHA: 'a'.repeat(40), PR_HEAD_SHA: 'b'.repeat(40) };
  assert.throws(() => checkPullRequest({ ...env, BASE_BRANCH: 'dev' }), /target main/);
  for (const repository of ['liang-today/dsh-liangxiang', 'LIANG-TODAY/dsh-liangxiang', '', undefined]) {
    assert.throws(() => checkPullRequest({ ...env, HEAD_REPOSITORY: repository }), /personal fork/);
  }
  for (const value of ['main', '--help', '$(false)', 'a'.repeat(39)]) {
    assert.throws(() => checkPullRequest({ ...env, PR_HEAD_SHA: value }), /complete commit SHA/);
  }
});

test('fork main gate rejects organization, borrowed and non-fork sources', () => {
  for (const changed of [
    { HEAD_IS_FORK: 'false' }, { HEAD_IS_FORK: undefined },
    { HEAD_OWNER_TYPE: 'Organization' }, { HEAD_OWNER: undefined },
    { PR_AUTHOR: 'someone-else' }, { PR_AUTHOR: undefined },
    { HEAD_REPOSITORY: 'someone-else/dsh-liangxiang' },
  ]) assert.throws(() => checkPullRequest({ ...personalFork, ...changed }), /owned by its author/);
});

test('fork main gate requires a dedicated feature branch, including custom default branches', () => {
  for (const changed of [
    { HEAD_BRANCH: 'main' }, { HEAD_BRANCH: undefined }, { HEAD_DEFAULT_BRANCH: undefined },
    { HEAD_BRANCH: 'trunk', HEAD_DEFAULT_BRANCH: 'trunk' },
  ]) assert.throws(() => checkPullRequest({ ...personalFork, ...changed }), /feature branch/);
});
