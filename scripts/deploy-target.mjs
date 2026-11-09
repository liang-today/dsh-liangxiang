#!/usr/bin/env node
/** Fail closed before deployment can copy files or contact a health endpoint. */
import { readFileSync, realpathSync } from 'node:fs'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { fileURLToPath } from 'node:url'

const KEYS = [
  'LIANGXIANG_DEPLOY_SSH', 'LIANGXIANG_DEPLOY_SSH_PORT',
  'LIANGXIANG_DEPLOY_ROLE', 'LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME',
  'LIANGXIANG_DEPLOY_HEALTH_URL', 'LIANGXIANG_DEPLOY_HEALTH_CONNECT_IP',
]

/** Read only deployment values, never source or expand a local .env file. */
export function readDeployEnv(env, filename) {
  const values = {}
  let text = ''
  try { text = readFileSync(filename, 'utf8') } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)=(.*)$/.exec(line)
    if (!match || !KEYS.includes(match[1])) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (values[match[1]] === undefined) values[match[1]] = value
  }
  for (const key of KEYS) if (env[key] !== undefined) values[key] = env[key]
  return values
}

const hostnamePattern = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i
const refuse = message => { throw new Error(`refusing deploy: ${message}`) }

export async function resolveDeployTarget(env, resolveHost = lookup) {
  const role = env.LIANGXIANG_DEPLOY_ROLE
  if (role !== 'standby' && role !== 'production') refuse('LIANGXIANG_DEPLOY_ROLE must explicitly be standby or production')
  const remote = env.LIANGXIANG_DEPLOY_SSH ?? ''
  const match = /^([a-z_][a-z0-9_-]*)@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i.exec(remote)
  if (!match) refuse('LIANGXIANG_DEPLOY_SSH must be an explicit user@host without options or shell expressions')
  const host = match[2].toLowerCase()
  const expectedHostname = env.LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME ?? ''
  if (!hostnamePattern.test(expectedHostname)) refuse('LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME is required')
  const labels = expectedHostname.toLowerCase().split(/[-.]/)
  const generic = expectedHostname === 'liangxiang'
  const standbyLabel = labels.includes('standby')
  const productionLabel = labels.some(label => label === 'prod' || label === 'production')
  if (!generic && (role === 'standby' ? !standbyLabel || productionLabel : !productionLabel || standbyLabel)) {
    refuse('expected hostname must identify the selected standby or production role')
  }
  const port = env.LIANGXIANG_DEPLOY_SSH_PORT ?? ''
  if (port !== '' && (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)) refuse('SSH port must be 1-65535')
  let health
  try { health = new URL(env.LIANGXIANG_DEPLOY_HEALTH_URL) } catch { refuse('LIANGXIANG_DEPLOY_HEALTH_URL is required') }
  if (health.protocol !== 'https:' || health.username || health.password || health.search || health.hash || health.pathname !== '/v1/health' || (health.port && health.port !== '443')) {
    refuse('health URL must be HTTPS /v1/health without credentials, query or custom port')
  }
  if (!hostnamePattern.test(health.hostname)) refuse('health URL has an unsupported hostname')
  const connectIp = env.LIANGXIANG_DEPLOY_HEALTH_CONNECT_IP ?? ''
  const addresses = async name => isIP(name) ? [name] : [...new Set((await resolveHost(name, { all: true })).map(row => row.address))].sort()
  if (connectIp !== '') {
    if (role !== 'production' || !isIP(connectIp)) refuse('pinned health address requires production and a literal IP')
    const sshAddresses = await addresses(host)
    if (sshAddresses.length !== 1 || sshAddresses[0] !== connectIp) refuse('pinned health address must exactly match the SSH target')
  } else if (health.hostname.toLowerCase() !== host) {
    if (role === 'standby') refuse('standby health hostname must exactly match the SSH hostname')
    // Production may use its public TLS name with an explicit SSH address.
    // Every resolved endpoint must match, not merely one address in a pool.
    const [sshAddresses, healthAddresses] = await Promise.all([addresses(host), addresses(health.hostname)])
    if (sshAddresses.length === 0 || JSON.stringify(sshAddresses) !== JSON.stringify(healthAddresses)) refuse('production health and SSH hostnames resolve to different targets')
  }
  return { role, remote, host, port, expectedHostname, healthUrl: health.href,
    healthResolve: connectIp === '' ? '' : `${health.hostname}:443:${isIP(connectIp) === 6 ? `[${connectIp}]` : connectIp}` }
}

export function verifyHostname(expected, actual) {
  if (actual.trim() !== expected) refuse('remote hostname does not match the explicitly expected host')
}

export function verifyReceipt(receipt, sha, build) {
  const parts = receipt.trim().split(/\s+/)
  if (parts.length !== 3 || parts[0] !== build || parts[1] !== sha || !Number.isFinite(Date.parse(parts[2]))) refuse('VERSION does not exactly match the expected build and commit')
}

export function verifyHealth(value, version, build) {
  if (value === null || typeof value !== 'object' || value.status !== 'ok' || value.authority_mode !== 'DEV_STAGING_ONLY' || value.version !== version || value.server_build !== build) refuse('health response does not match the expected version, build and authority mode')
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const stdin = () => readFileSync(0, 'utf8')
  if (command === 'config') {
    const target = await resolveDeployTarget(readDeployEnv(process.env, args[0]))
    const fields = {
      LIANGXIANG_DEPLOY_SSH: target.remote, LIANGXIANG_DEPLOY_SSH_PORT: target.port,
      DEPLOY_ROLE: target.role, DEPLOY_EXPECTED_HOSTNAME: target.expectedHostname,
      DEPLOY_HEALTH_URL: target.healthUrl,
      DEPLOY_HEALTH_RESOLVE: target.healthResolve,
    }
    for (const [key, value] of Object.entries(fields)) console.log(`${key}=${value}`)
  } else if (command === 'hostname') verifyHostname(args[0], stdin())
  else if (command === 'receipt') verifyReceipt(stdin(), args[0], args[1])
  else if (command === 'health') verifyHealth(JSON.parse(stdin()), args[0], args[1])
  else if (command === 'versions') {
    const source = readFileSync(args[0], 'utf8')
    for (const name of ['PLUGIN_VERSION', 'SERVER_BUILD']) {
      const value = new RegExp(`export const ${name} = '([^']+)'`).exec(source)?.[1]
      if (!value || !/^[0-9A-Za-z.+-]+$/.test(value)) refuse(`${name} is missing or invalid`)
      console.log(`${name}=${value}`)
    }
  } else refuse('unknown target verification command')
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
