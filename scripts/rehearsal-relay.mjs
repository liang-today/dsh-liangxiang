#!/usr/bin/env node
// Loopback HTTP/SSE over SSH stdio; no sshd forwarding or firewall changes.
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
const [remote, sshPort = '18800', localPort = '4285'] = process.argv.slice(2)
if (!/^[\w.-]+@[\w.-]+$/.test(remote ?? '') || !/^\d+$/.test(sshPort) || !/^\d+$/.test(localPort)
  || Number(sshPort) < 1 || Number(sshPort) > 65535 || Number(localPort) < 1024 || Number(localPort) > 65535) {
  throw new Error('Usage: node scripts/rehearsal-relay.mjs user@standby ssh-port local-port')
}
const program = 'const s=require("node:net").connect(4195,"127.0.0.1");process.stdin.pipe(s);s.pipe(process.stdout);s.on("error",()=>{process.exitCode=1});s.on("close",()=>process.stdin.destroy());process.stdin.on("end",()=>s.end())'
const children = new Set()
const server = createServer(socket => {
  const child = spawn('ssh', ['-T', '-p', sshPort, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', remote, `node -e '${program}'`], { stdio: ['pipe', 'pipe', 'pipe'] })
  children.add(child)
  socket.pipe(child.stdin); child.stdout.pipe(socket)
  child.stderr.resume() // Never print a remote banner, environment or credentials.
  child.stdin.on('error', () => socket.destroy())
  child.on('error', () => socket.destroy())
  child.on('close', () => { children.delete(child); socket.destroy() })
  socket.on('error', () => child.kill())
  socket.on('close', () => child.kill())
})
server.maxConnections = 24
server.listen(Number(localPort), '127.0.0.1', () => console.log('[liangxiang] isolated rehearsal relay ready on loopback'))
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { for (const child of children) child.kill(); server.close() })
