import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

test('proxy-only install preserves the application and restores the old proxy on reload failure', { skip: process.platform === 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'liangxiang-proxy-only-'))
  try {
    const bin = join(root, 'bin'), etc = join(root, 'etc'), app = join(root, 'app'), backups = join(root, 'backups')
    for (const dir of [bin, etc, app, backups, join(app, 'deploy')]) mkdirSync(dir, { recursive: true })
    const marker = join(etc, 'role'), config = join(etc, 'Caddyfile'), stage = join(root, 'candidate')
    const trace = join(root, 'trace'), version = '2.0.0-u1 original application receipt\n'
    writeFileSync(marker, 'production\n', { mode: 0o600 }); writeFileSync(join(app, 'VERSION'), version)
    writeFileSync(stage, 'new reviewed proxy\n')
    const executable = (name, source) => writeFileSync(join(bin, name), `#!${process.execPath}\n${source}`, { mode: 0o755 })
    executable('hostname', "console.log('service-prod-test')")
    executable('stat', "console.log('0:600')")
    executable('sha256sum', "const fs=require('node:fs');console.log(require('node:crypto').createHash('sha256').update(fs.readFileSync(process.argv.at(-1))).digest('hex')+'  '+process.argv.at(-1))")
    executable('systemctl', `const fs=require('node:fs'),a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(trace)},a.join(' ')+'\\n');if(a[0]==='show'){console.log(a.includes('MainPID')?'12345':'/usr/bin/caddy --config ${config} --force')}else if(a.join(' ')==='reload caddy'){if(process.env.FAIL_RELOAD==='1')process.exit(1)}else if(a.join(' ')==='is-active --quiet caddy'||a.join(' ')==='is-active --quiet liangxiang-backend'){}else{process.exit(95)}`)
    executable('caddy', "if(process.argv[2]!=='validate')process.exit(94)")
    executable('restorecon', '')
    executable('install', "const fs=require('node:fs'),a=process.argv.slice(2);if(a[0]==='-d'){fs.mkdirSync(a.at(-1),{recursive:true})}else{fs.copyFileSync(a.at(-2),a.at(-1))}")
    executable('cp', "const fs=require('node:fs'),a=process.argv.slice(2);fs.copyFileSync(a.at(-2),a.at(-1))")
    executable('curl', "console.log(process.argv.includes('OPTIONS')?'Access-Control-Allow-Origin: *':'{}')")
    const source = readFileSync(new URL('../deploy-proxy.sh', import.meta.url), 'utf8')
    const block = source.split("<<'INSTALL_PROXY'\n")[1].split('\nINSTALL_PROXY')[0]
      .replaceAll('/etc/liangxiang-deploy-role', marker).replaceAll('/etc/caddy/Caddyfile', config)
      .replaceAll('/opt/liangxiang', app).replaceAll('/var/backups/liangxiang', backups)
    const digest = text => createHash('sha256').update(text).digest('hex')
    for (const fails of [false, true]) {
      writeFileSync(config, 'previous proxy\n'); writeFileSync(trace, '')
      const run = spawnSync('bash', ['-c', block, 'proxy-test', stage, 'a'.repeat(40), digest('new reviewed proxy\n'), digest('previous proxy\n'), 'service-prod-test'], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAIL_RELOAD: fails ? '1' : '0' }, encoding: 'utf8',
      })
      assert.equal(run.status === 0, !fails, run.stderr)
      assert.equal(readFileSync(config, 'utf8'), fails ? 'previous proxy\n' : 'new reviewed proxy\n')
      assert.equal(readFileSync(join(app, 'VERSION'), 'utf8'), version)
      assert.doesNotMatch(readFileSync(trace, 'utf8'), /restart|stop|start |daemon-reload/)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
