import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('deployment restores group access after rsync copies a private worktree root', { skip: process.platform === 'win32' }, () => {
  const fixture = mkdtempSync(join(tmpdir(), 'liangxiang-deploy-permissions-'));
  try {
    const stage = join(fixture, 'stage');
    const prefix = join(fixture, 'installed');
    mkdirSync(stage, { mode: 0o700 });
    mkdirSync(prefix, { mode: 0o750 });
    const script = readFileSync(new URL('../deploy.sh', import.meta.url), 'utf8');
    const start = script.indexOf('rsync -a --delete', script.indexOf("<<'REMOTE_SCRIPT'"));
    const end = script.indexOf('NODE_BIN=', start);
    assert.ok(start >= 0 && end > start, 'real remote installation block must be testable');
    // Exercise the actual local copy/permission block. Ownership is the only
    // privileged operation stubbed; both paths are this test's own fixture.
    const result = spawnSync('bash', ['-c', 'set -e\nchown() { :; }\n' + script.slice(start, end)], {
      encoding: 'utf8', env: { ...process.env, STAGE: stage, PREFIX: prefix },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(statSync(prefix).mode & 0o777, 0o750);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
