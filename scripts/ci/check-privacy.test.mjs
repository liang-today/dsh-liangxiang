import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectText, assertMetadata, assertNotToolIdentity, inspectMetadata, requiresSignature, signatureFinding } from './check-privacy.mjs';

test('private phrase digests reject context without publishing literal blocked labels', () => {
  const fixture = ['内', '部', '称', '谓'].join('');
  const policy = new Map([[fixture.length, new Set([createHash('sha256').update(fixture).digest('hex')])]]);
  assert.deepEqual(inspectText('说明：' + fixture, policy), ['private-context']);
  assert.deepEqual(inspectText('公开技术说明', policy), []);
});

test('home paths and conversation identifiers are rejected', () => {
  assert.ok(inspectText(['', 'Users', 'example-user', 'work'].join('/')).includes('personal-path'));
  assert.ok(inspectText(['C:', 'Users', 'example-user', 'work'].join('\\')).includes('personal-path'));
  const id = ['01' + 'a'.repeat(6), 'b'.repeat(4), '7' + 'c'.repeat(3), 'd'.repeat(4), 'e'.repeat(12)].join('-');
  assert.ok(inspectText(id).includes('private-session'));
});

test('provider tokens and private keys are blocked while public digests are allowed', () => {
  assert.ok(inspectText('gh' + 'p_' + 'a'.repeat(36)).includes('credential'));
  assert.ok(inspectText(['-----BEGIN', 'RSA', 'PRIVATE KEY-----'].join(' ')).includes('credential'));
  assert.deepEqual(inspectText(createHash('sha256').update('fixture').digest('hex')), []);
});

test('commit emails require a noreply identity, not a personal or placeholder mailbox', () => {
  assert.doesNotThrow(() => assertMetadata('123+contributor@users.noreply.github.com'));
  assert.doesNotThrow(() => assertMetadata('noreply@github.com'));
  assert.throws(() => assertMetadata('fixture@example.com'), /noreply/);
  assert.ok(inspectText('private-user@' + 'personal-domain.test').includes('personal-email'));
  assert.deepEqual(inspectText('fixture@example.com'), []);
});

test('a maintainer noreply email still requires the configured public name', () => {
  const email = '16209318+NiYa193@users.noreply.github.com';
  assert.doesNotThrow(() => assertMetadata(email, 'NiYa193'));
  assert.doesNotThrow(() => assertMetadata(email, 'liangxiang-CI'));
  assert.throws(() => assertMetadata(email, 'Private Fixture'), /public name/);
  assert.throws(() => assertMetadata(email), /public name/);
  assert.doesNotThrow(() => assertMetadata('123+contributor@users.noreply.github.com', 'Contributor'));
});

test('community public commit mailboxes are advisory; local publication remains strict', () => {
  const email = 'contributor@' + 'personal-domain.test';
  assert.deepEqual(inspectMetadata(email, 'Contributor', true), ['public-commit-email']);
  assert.throws(() => inspectMetadata(email, 'Contributor'), /noreply/);
  assert.deepEqual(inspectMetadata('123+contributor@users.noreply.github.com', 'Contributor', true), []);
  // The exception applies only to commit identity, never source/PR text.
  assert.deepEqual(inspectText(email), ['personal-email']);
});

test('community mode retains maintained public names and configured emails', () => {
  const email = '16209318+NiYa193@users.noreply.github.com';
  assert.deepEqual(inspectMetadata(email, 'NiYa193', true), []);
  assert.throws(() => inspectMetadata(email, 'Private Fixture', true), /public name/);
  assert.throws(() => inspectMetadata('maintainer@' + 'personal-domain.test', 'NiYa193', true), /noreply/);
  assert.throws(() => inspectMetadata('123+other@users.noreply.github.com', 'NiYa193', true), /configured public email/);
});

test('a signature only counts when it belongs to the commit author', () => {
  const address = '123+contributor@users.noreply.github.com';
  assert.equal(signatureFinding('G', address, address), null);
  assert.equal(signatureFinding('U', '123+Contributor@users.noreply.github.com', address), null);
  assert.equal(signatureFinding('N', '', address), 'unsigned-commit');
  assert.equal(signatureFinding('B', address, address), 'unsigned-commit');
  // A key over someone else's author field is a forged signature, not a signed commit.
  assert.equal(signatureFinding('G', 'other@users.noreply.github.com', address), 'signature-identity-mismatch');
});

test('tool and bot defaults can never author a commit', () => {
  assert.throws(() => assertNotToolIdentity('infinsys-agent'), /tool or bot default/);
  assert.doesNotThrow(() => assertNotToolIdentity('Contributor'));
  assert.throws(() => assertMetadata('123+contributor@users.noreply.github.com', 'infinsys-agent'), /tool or bot/);
  assert.equal(requiresSignature('16209318+NiYa193@users.noreply.github.com', 'NiYa193'), true);
  assert.equal(requiresSignature('hanxi-cat@users.noreply.github.com', 'hanxi-cat'), true);
  assert.equal(requiresSignature('123+contributor@users.noreply.github.com', 'Contributor'), false);
});

test('the pre-commit hook rejects a borrowed or tool identity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-privacy-identity-'));
  const script = fileURLToPath(new URL('./check-privacy.mjs', import.meta.url));
  const mine = { GIT_AUTHOR_NAME: 'Fixture Developer', GIT_AUTHOR_EMAIL: 'fixture@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'Fixture Developer', GIT_COMMITTER_EMAIL: 'fixture@users.noreply.github.com' };
  try {
    execFileSync('git', ['init', '-q'], { cwd: directory });
    execFileSync('git', ['config', 'user.name', 'Fixture Developer'], { cwd: directory });
    execFileSync('git', ['config', 'user.email', 'fixture@users.noreply.github.com'], { cwd: directory });
    execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: directory });
    const preCommit = overrides => spawnSync(process.execPath, [script, '--pre-commit'],
      { cwd: directory, env: { ...process.env, ...mine, ...overrides }, encoding: 'utf8' });
    assert.equal(preCommit({}).status, 0);
    assert.equal(preCommit({ GIT_AUTHOR_NAME: 'infinsys-agent' }).status, 1, 'never a tool default');
    assert.equal(preCommit({ GIT_AUTHOR_EMAIL: '16209318+NiYa193@users.noreply.github.com' }).status, 1,
      'never another account');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('an unsigned maintained commit is blocked by the push hook', () => {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-privacy-signature-'));
  const script = fileURLToPath(new URL('./check-privacy.mjs', import.meta.url));
  const env = { ...process.env, GIT_AUTHOR_NAME: 'NiYa193', GIT_AUTHOR_EMAIL: '16209318+NiYa193@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'NiYa193', GIT_COMMITTER_EMAIL: '16209318+NiYa193@users.noreply.github.com' };
  const git = (args, input) => execFileSync('git', args, { cwd: directory, env, input, encoding: 'utf8' }).trim();
  const commit = parent => {
    const blob = git(['hash-object', '-w', '--stdin'], 'Public fixture\n');
    const tree = git(['mktree'], `100644 blob ${blob}\tpublic.txt\n`);
    return git(['commit-tree', tree, ...(parent ? ['-p', parent] : [])], 'Fixture change\n');
  };
  try {
    git(['init', '-q']);
    const base = commit();
    const head = commit(base);
    git(['update-ref', 'HEAD', head]);
    const push = spawnSync(process.execPath, [script, '--pre-push'], {
      cwd: directory, env, input: `refs/heads/work ${head} refs/heads/work ${base}\n`, encoding: 'utf8',
    });
    assert.equal(push.status, 1);
    assert.match(push.stderr, /unsigned-commit/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('the community CLI warns without exposing email and still blocks sensitive content/history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-privacy-test-'));
  const email = 'contributor@' + 'personal-domain.test';
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Contributor', GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: 'Contributor', GIT_COMMITTER_EMAIL: email };
  const git = (args, input) => execFileSync('git', args, { cwd: directory, env, input, encoding: 'utf8' }).trim();
  const script = fileURLToPath(new URL('./check-privacy.mjs', import.meta.url));
  const scan = (head, base, community = true) => spawnSync(process.execPath,
    [script, '--range', `${base}..${head}`, '--ref', head, ...(community ? ['--community-pr'] : [])],
    { cwd: directory, env, encoding: 'utf8' });
  const commit = (name, content, parent) => {
    const blob = git(['hash-object', '-w', '--stdin'], content);
    const tree = git(['mktree'], `100644 blob ${blob}\t${name}\n`);
    return git(['commit-tree', tree, ...(parent ? ['-p', parent] : [])], 'Fixture change\n');
  };
  try {
    git(['init', '-q']);
    const base = commit('public.txt', 'Public fixture\n');
    const head = commit('public.txt', 'Community contribution\n', base);
    git(['update-ref', 'HEAD', head]);
    const push = (ref, overrides = {}) => spawnSync(process.execPath, [script, '--pre-push'], {
      cwd: directory, env: { ...env, GIT_COMMITTER_NAME: 'NiYa193',
        GIT_COMMITTER_EMAIL: '16209318+NiYa193@users.noreply.github.com', ...overrides },
      input: `refs/heads/work ${ref} refs/heads/work ${base}\n`, encoding: 'utf8',
    });
    const advisory = scan(head, base);
    assert.equal(advisory.status, 0);
    assert.match(advisory.stderr, /::warning::/);
    assert.ok(!advisory.stderr.includes(email));
    assert.equal(scan(head, base, false).status, 1);
    assert.equal(push(head).status, 0, 'imported signed identities need no rewriting');
    assert.equal(push(head, { GIT_COMMITTER_EMAIL: email }).status, 1, 'our current identity stays strict');
    assert.equal(push(head, { GIT_COMMITTER_NAME: 'Private Fixture' }).status, 1);
    for (const [name, content, category] of [
      ['public.txt', 'gh' + 'p_' + 'a'.repeat(36), 'credential'],
      ['public.txt', ['-----BEGIN', 'PRIVATE KEY-----'].join(' '), 'credential'],
      ['.env', 'SETTING=fixture\n', 'private-file'],
    ]) {
      const sensitive = commit(name, content, base);
      const result = scan(sensitive, base);
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(category));
      assert.ok(!result.stderr.includes(content));
      assert.equal(push(sensitive).status, 1, 'importing commits cannot bypass content checks');
      const removed = commit('public.txt', 'Removed sensitive fixture\n', sensitive);
      assert.equal(scan(removed, base).status, 1);
      assert.equal(push(removed).status, 1, 'deleted sensitive content remains blocked');
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
