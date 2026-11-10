#!/usr/bin/env node
/** Loopback-only manual fault switch; it never changes the Backend or ledger. */
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function loopback(value) {
  const url = new URL(value)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) throw new Error('A loopback HTTP origin is required')
  return url.origin
}

function hostProbe(origin, filename) {
  let cookie = '', lastAuth = '', cached = { online: null }, checked = 0, running
  return async () => {
    if (running) return running
    if (Date.now() - checked < 300) return cached
    running = (async () => {
      try {
        const matches = [...readFileSync(filename, 'utf8').matchAll(/dsh web: (http:\/\/[^\s]*token=[A-Za-z0-9_-]+)/g)]
        const auth = matches.at(-1)?.[1]
        if (!auth || new URL(auth).origin !== origin) throw new Error('Host not ready')
        if (auth !== lastAuth) { cookie = ''; lastAuth = auth }
        if (!cookie) {
          const response = await fetch(auth, { redirect: 'manual', signal: AbortSignal.timeout(800) })
          if (response.status !== 303) throw new Error('Host authentication unavailable')
          cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
          await response.body?.cancel()
        }
        // This API reads the Host cache. Never poll /market, /refresh, claims or votes.
        const response = await fetch(`${origin}/liangxiang/api/state`, { headers: { cookie }, signal: AbortSignal.timeout(800) })
        if (!response.ok) { cookie = ''; throw new Error('Host state unavailable') }
        const state = await response.json()
        cached = { online: state.authorityMode === 'LOCAL_FAKE_DEV' || typeof state.authorityAvailable !== 'boolean' ? null : state.authorityAvailable }
      } catch { cached = { online: null } }
      checked = Date.now()
      return cached
    })().finally(() => { running = undefined })
    return running
  }
}

const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>3999 · 断网恢复测试</title>
<style>body{font:17px system-ui;background:#f2f6fc;color:#30466c;max-width:650px;margin:7vh auto;padding:24px}main{padding:28px;background:white;border:1px solid #dbe5f5;border-radius:24px}h1{font-size:24px}p{line-height:1.7}button,a{font:inherit;border-radius:12px;padding:12px 18px;border:1px solid #c5d4ed;cursor:pointer;margin:4px;color:#304e80;background:#edf3ff;text-decoration:none;display:inline-block}button[aria-pressed=true]{background:#dce9ff;border-color:#8ca9db}small{display:block;line-height:1.8;color:#65738c}#actual{font-weight:650;min-height:2em}</style>
<main><h1>3999 · 断网恢复测试</h1><p id="switch" role="status">正在读取开关…</p><p id="actual" aria-live="polite">正在确认DSH实际连接…</p><button id="off" aria-pressed="false" onclick="change(false)">模拟断网</button><button id="on" aria-pressed="false" onclick="change(true)">恢复连接</button><p><a href="/open-dsh" target="liangxiang3999">打开隔离DSH</a></p><small>开关立即响应，快速切换以最后一次操作为准。<br>“已放通”不等于“已经连通”：DSH仍按原有重试节奏恢复。<br>本页只影响3999测试出口，不改变电脑网络、Desktop、测试资金或后台时钟。</small></main>
<script>
const controller=crypto.randomUUID(),nodes={switch:document.getElementById('switch'),actual:document.getElementById('actual'),on:document.getElementById('on'),off:document.getElementById('off')};
let sequence=0,pending=0,revision=-1,busy=false,online=null;
function render(s){if(s.revision<revision)return;revision=s.revision;if('online'in s)online=s.online;nodes.switch.textContent=s.connected?'开关：已放通测试连接':'开关：已切断测试连接';nodes.on.setAttribute('aria-pressed',String(s.connected));nodes.off.setAttribute('aria-pressed',String(!s.connected));nodes.actual.textContent=online===null?'DSH：暂未读到连接状态':online?(s.connected?'DSH：已连通社区':'DSH：正在感知连接中断'):(s.connected?'DSH：正在自动重连 · 已等待'+Math.max(0,Math.floor((Date.now()-s.changedAt)/1000))+'秒':'DSH：连接已中断');}
async function status(){if(busy)return;busy=true;const started=sequence;try{const r=await fetch('/status',{cache:'no-store'});if(!r.ok)throw Error();const s=await r.json();if(started===sequence&&!pending)render(s)}catch{if(!pending)nodes.actual.textContent='测试器暂时不可用，请稍后再试'}finally{busy=false}}
async function change(connected){const id=++sequence;pending=id;nodes.switch.textContent=connected?'开关：正在放通…':'开关：正在切断…';try{const r=await fetch('/connection',{method:'POST',headers:{'content-type':'application/json','x-liangxiang-manual-test':'1'},body:JSON.stringify({connected,controller,sequence:id})});if(!r.ok)throw Error();const s=await r.json();if(id===sequence){pending=0;render(s);void status()}}catch{if(id===sequence){pending=0;nodes.switch.textContent='开关尚未确认，请再试一次'}}}
status();setInterval(status,300);
</script></html>`

export async function startNetworkGate({ target, dsh, dshLog, proxyPort = 4287, controlPort = 47726, connected: initial = true }) {
  target = loopback(target); dsh = loopback(dsh)
  let connected = initial, revision = 0, changedAt = Date.now()
  const active = new Set(), commands = new Map(), probe = hostProbe(dsh, dshLog)
  const state = () => ({ connected, revision, changedAt })
  const proxy = http.createServer((req, res) => {
    let destination
    try { destination = new URL(req.url, target); if (destination.origin !== target) throw new Error('Invalid proxy path') }
    catch { res.writeHead(400); res.end(); return }
    if (!connected) { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"manual_test_network_down"}'); return }
    const upstream = http.request(destination, { method: req.method, headers: req.headers }, reply => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res) })
    const pair = { upstream, res }; active.add(pair)
    res.on('close', () => { active.delete(pair); upstream.destroy() })
    upstream.on('error', () => { if (res.destroyed || res.writableEnded) return; if (!res.headersSent) res.writeHead(502); res.end('{"error":"isolated_backend_unavailable"}') })
    req.pipe(upstream)
  })
  const control = http.createServer(async (req, res) => {
    const send = (code, value, type = 'application/json') => { if (res.destroyed) return; res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof value === 'string' ? value : JSON.stringify(value)) }
    const origin = `http://127.0.0.1:${control.address().port}`
    if (req.headers.host !== new URL(origin).host) { send(403, {}); return }
    if (req.method === 'GET' && req.url === '/') { send(200, html, 'text/html; charset=utf-8'); return }
    if (req.method === 'GET' && req.url === '/open-dsh') {
      try {
        const matches = [...readFileSync(dshLog, 'utf8').matchAll(/dsh web: (http:\/\/[^\s]*token=[A-Za-z0-9_-]+)/g)]
        const url = matches.at(-1)?.[1]
        if (!url || new URL(url).origin !== dsh) throw new Error('Host not ready')
        res.writeHead(302, { location: url, 'cache-control': 'no-store' }); res.end()
      } catch { send(503, 'DSH正在启动', 'text/plain; charset=utf-8') }
      return
    }
    if (req.method === 'GET' && req.url === '/status') { const host = await probe(); send(200, { ...state(), ...host }); return }
    if (req.method !== 'POST' || req.url !== '/connection') { send(404, {}); return }
    if (req.headers['x-liangxiang-manual-test'] !== '1' || (req.headers.origin && req.headers.origin !== origin)) { send(403, {}); return }
    let body = ''
    try {
      for await (const chunk of req) { body += chunk; if (body.length > 512) { send(413, {}); return } }
      const value = JSON.parse(body)
      if (typeof value.connected !== 'boolean') throw new Error('Invalid switch')
      if (value.controller !== undefined) {
        if (typeof value.controller !== 'string' || value.controller.length > 64 || !Number.isSafeInteger(value.sequence) || value.sequence < 1) throw new Error('Invalid command')
        if (value.sequence <= (commands.get(value.controller) ?? 0)) { send(200, state()); return }
        commands.set(value.controller, value.sequence)
        if (commands.size > 16) commands.delete(commands.keys().next().value)
      }
      if (connected !== value.connected) {
        connected = value.connected; revision++; changedAt = Date.now()
        if (!connected) for (const { upstream, res: client } of active) { upstream.destroy(); client.destroy() }
      }
      send(200, state())
    } catch { send(400, {}) }
  })
  try { await Promise.all([new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(proxyPort, '127.0.0.1', resolve) }), new Promise((resolve, reject) => { control.once('error', reject); control.listen(controlPort, '127.0.0.1', resolve) })]) }
  catch (error) { proxy.close(); control.close(); throw error }
  return { proxy, control, async close() { for (const { upstream, res } of active) { upstream.destroy(); res.destroy() } await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => control.close(resolve))]) } }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const gate = await startNetworkGate({ target: process.env.LIANGXIANG_TEST_TARGET ?? 'http://127.0.0.1:4286', dsh: process.env.LIANGXIANG_TEST_DSH ?? 'http://127.0.0.1:3999', dshLog: process.env.LIANGXIANG_TEST_DSH_LOG, connected: process.env.LIANGXIANG_TEST_CONNECTED !== '0' })
  console.log('Isolated network controls ready on loopback; no Backend changes.')
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void gate.close().then(() => process.exit(0)) })
}
