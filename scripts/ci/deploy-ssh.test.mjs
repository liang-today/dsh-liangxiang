import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const options = { skip: process.platform === 'win32' };
function resolvePort(port) {
  return spawnSync('bash', ['-c', 'ROOT="$PWD"; source scripts/load-deploy-ssh.sh; printf "%s\\n" "${DEPLOY_SSH[@]}"; printf "%s\\n" "$DEPLOY_RSYNC_SSH"'], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, LIANGXIANG_DEPLOY_SSH: 'operator@backend.invalid', LIANGXIANG_DEPLOY_SSH_PORT: port },
  });
}
test('deployment keeps the default SSH command without a port override', options, () => {
  const result = resolvePort('');
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trim().split('\n'), ['ssh', 'ssh']);
});
test('deployment applies the same validated port to SSH and rsync', options, () => {
  const result = resolvePort('2222');
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trim().split('\n'), ['ssh', '-p', '2222', 'ssh -p 2222']);
});
test('deployment rejects invalid or executable port values before connecting', options, () => {
  for (const value of ['0', '65536', '-1', '22; false', '$(false)']) {
    const result = resolvePort(value);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  }
});
