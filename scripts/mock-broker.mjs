// A stand-in for https://auth.teacher.dev for local click-through testing. Single user, in-memory
// state, no real Google. Run with `npm run mock-broker` and point the app at it with
// VITE_AUTH_BROKER_URL=http://localhost:8787 (see README → Local click-through).
//
//   http://localhost:8787/         control panel: see state, break the grant, reset
//
// Behaviour mirrors the real broker's contract: session in an HttpOnly cookie, X-Requested-With
// required on POST/DELETE, exact-origin CORS, and OAuth "flows" that are top-level navigations
// landing back on the app with ?error=<code> on failure.

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.MOCK_BROKER_PORT ?? 8787)
const APP_ORIGIN = process.env.MOCK_APP_ORIGIN ?? 'http://localhost:5173'
const EMAIL = 'teacher@example.org'
const OTHER_EMAIL = 'someone-else@example.org'
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file'
const COOKIE = 'mock_broker_session'
// Sessions and the grant survive restarts so a signed-in browser stays signed in across `npm run
// mock-broker` runs. Gitignored; delete it (or use Reset) to start over.
const STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'mock-broker-state.json')

const state = {
  sessions: new Set(),
  grant: null, // null | { status: 'active' | 'invalid', lastError: string }
  mints: 0,
}

function load() {
  if (!existsSync(STATE_FILE)) return
  try {
    const saved = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    state.sessions = new Set(saved.sessions ?? [])
    state.grant = saved.grant ?? null
    state.mints = saved.mints ?? 0
  } catch {
    // A corrupt file just means a fresh start.
  }
}

function save() {
  writeFileSync(STATE_FILE, JSON.stringify({ sessions: [...state.sessions], grant: state.grant, mints: state.mints }, null, 2))
}
load()

function log(...parts) {
  console.log(new Date().toISOString().slice(11, 19), ...parts)
}

function cookieValue(req) {
  const match = (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  return match?.[1] ?? ''
}

function signedIn(req) {
  return state.sessions.has(cookieValue(req))
}

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders })
  res.end(JSON.stringify(body))
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, ...headers })
  res.end()
}

function html(res, body) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock broker</title>
<style>
  body{font:15px/1.5 system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 20px;color:#222}
  h1{font-size:1.3rem} .card{border:1px solid #ddd;border-radius:12px;padding:20px 22px;margin:16px 0}
  .btn{display:inline-block;margin:6px 8px 6px 0;padding:9px 16px;border-radius:8px;border:1px solid #888;background:#fff;color:#222;text-decoration:none;font-weight:600}
  .btn.primary{background:#1a73e8;border-color:#1a73e8;color:#fff} code{background:#f2f2f2;padding:1px 5px;border-radius:4px}
  .muted{color:#666;font-size:.9rem}
</style>${body}`)
}

function appUrl(returnTo, error) {
  const url = new URL(returnTo || '/', APP_ORIGIN)
  if (error) url.searchParams.set('error', error)
  return url.toString()
}

function validReturnTo(value) {
  return typeof value === 'string' && /^\/(?![\/\\])[^\x00-\x1f]*$/.test(value)
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) } catch { resolve({}) }
    })
  })
}

function connectionBody() {
  if (!state.grant) return { connected: false }
  return {
    connected: true,
    status: state.grant.status,
    googleUserId: '117900000000000000000',
    googleEmail: EMAIL,
    grantedScopes: [DRIVE_FILE],
    lastError: state.grant.lastError,
    lastErrorDescription: state.grant.lastError ? 'Simulated by the mock broker.' : '',
  }
}

// ---- API surface (XHR from the app) ------------------------------------------------------------

async function api(req, res, url) {
  const origin = req.headers.origin
  if (origin !== APP_ORIGIN) {
    log('refused origin', origin ?? '(none)')
    return json(res, 403, { error: 'origin_not_allowed' })
  }
  const cors = {
    'Access-Control-Allow-Origin': APP_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    return res.end()
  }
  const reply = (status, body) => json(res, status, body, cors)
  const mutating = req.method === 'POST' || req.method === 'DELETE'
  if (mutating && !req.headers['x-requested-with']) return reply(403, { error: 'csrf_required' })

  const route = `${req.method} ${url.pathname}`
  log(route, signedIn(req) ? '(session)' : '(no session)')

  if (route === 'POST /auth/google/start') {
    const { returnTo = '/' } = await readBody(req)
    if (!validReturnTo(returnTo)) return reply(400, { error: 'invalid_return_to' })
    return reply(200, { authorizationUrl: `http://localhost:${PORT}/mock/google?flow=signin&returnTo=${encodeURIComponent(returnTo)}` })
  }

  if (route === 'POST /auth/logout') {
    state.sessions.delete(cookieValue(req))
    save()
    res.writeHead(204, { ...cors, 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` })
    return res.end()
  }

  if (!signedIn(req)) return reply(401, { error: 'unauthorized' })

  if (route === 'POST /oauth/google/start') {
    const { returnTo = '/' } = await readBody(req)
    if (!validReturnTo(returnTo)) return reply(400, { error: 'invalid_return_to' })
    return reply(200, { authorizationUrl: `http://localhost:${PORT}/mock/google?flow=connect&returnTo=${encodeURIComponent(returnTo)}` })
  }

  if (route === 'GET /oauth/google/connection') return reply(200, connectionBody())

  if (route === 'DELETE /oauth/google/connection') {
    state.grant = null
    save()
    res.writeHead(204, cors)
    return res.end()
  }

  if (route === 'POST /oauth/google/token') {
    if (!state.grant) return reply(404, { error: 'not_connected' })
    if (state.grant.status === 'invalid') return reply(409, { error: state.grant.lastError })
    if (++state.mints > 60) return reply(429, { error: 'rate_limited' })
    save()
    return reply(200, {
      accessToken: 'mock-access-token-' + randomBytes(6).toString('hex'),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      grantedScopes: [DRIVE_FILE],
      appId: '000000000000',
      apiKey: 'mock-picker-api-key',
    })
  }

  return reply(404, { error: 'not_found' })
}

// ---- Pretend Google consent screen (top-level navigation) ---------------------------------------

function consent(req, res, url) {
  const flow = url.searchParams.get('flow') === 'connect' ? 'connect' : 'signin'
  const returnTo = url.searchParams.get('returnTo') || '/'
  const choice = url.searchParams.get('choice')
  const back = (error) => appUrl(returnTo, error)

  if (!choice) {
    const title = flow === 'signin' ? 'Sign in with Google' : 'This app wants access to your Google Drive'
    const detail = flow === 'signin'
      ? 'The mock broker pretends to be Google here. Pick an outcome.'
      : 'Requested scope: <code>drive.file</code> — files you open with this app only.'
    const mismatch = flow === 'connect'
      ? `<a class="btn" href="?flow=${flow}&returnTo=${encodeURIComponent(returnTo)}&choice=mismatch">Continue as ${OTHER_EMAIL}</a>`
      : ''
    return html(res, `
      <div class="card">
        <h1>${title}</h1>
        <p>${detail}</p>
        <p>
          <a class="btn primary" href="?flow=${flow}&returnTo=${encodeURIComponent(returnTo)}&choice=allow">Continue as ${EMAIL}</a>
          ${mismatch}
          <a class="btn" href="?flow=${flow}&returnTo=${encodeURIComponent(returnTo)}&choice=cancel">Cancel</a>
        </p>
        <p class="muted">Also: <a href="?flow=${flow}&returnTo=${encodeURIComponent(returnTo)}&choice=fail">simulate a Google failure</a></p>
      </div>`)
  }

  log(`consent ${flow}: ${choice}`)
  if (choice === 'cancel') return redirect(res, back('access_denied'))
  if (choice === 'fail') return redirect(res, back(flow === 'signin' ? 'google_signin_failed' : 'google_connect_failed'))

  if (flow === 'signin') {
    const token = randomBytes(16).toString('hex')
    state.sessions.add(token)
    save()
    return redirect(res, back(), { 'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax` })
  }

  if (!signedIn(req)) return redirect(res, back('unauthorized'))
  if (choice === 'mismatch') return redirect(res, back('google_account_mismatch'))
  state.grant = { status: 'active', lastError: '' }
  save()
  return redirect(res, back())
}

// ---- Control panel --------------------------------------------------------------------------------

function control(req, res, url) {
  const action = url.searchParams.get('do')
  if (action === 'invalidate') state.grant = state.grant && { status: 'invalid', lastError: 'invalid_grant' }
  if (action === 'admin') state.grant = state.grant && { status: 'invalid', lastError: 'admin_policy_enforced' }
  if (action === 'restore') state.grant = state.grant && { status: 'active', lastError: '' }
  if (action === 'signout') state.sessions.clear()
  if (action === 'reset') { state.sessions.clear(); state.grant = null; state.mints = 0 }
  if (action) { log('control:', action); save(); return redirect(res, '/') }

  const grant = state.grant ? `${state.grant.status}${state.grant.lastError ? ` (${state.grant.lastError})` : ''}` : 'not connected'
  return html(res, `
    <h1>Mock auth broker</h1>
    <p class="muted">Standing in for <code>auth.teacher.dev</code> on port ${PORT}. App origin: <code>${APP_ORIGIN}</code>.</p>
    <div class="card">
      <p>Sessions: <strong>${state.sessions.size}</strong> · Drive grant: <strong>${grant}</strong> · Tokens minted: <strong>${state.mints}</strong></p>
      <p>
        <a class="btn" href="/?do=invalidate">Break the grant (invalid_grant)</a>
        <a class="btn" href="/?do=admin">Break it (admin_policy_enforced)</a>
        <a class="btn" href="/?do=restore">Restore grant</a>
      </p>
      <p>
        <a class="btn" href="/?do=signout">End all sessions</a>
        <a class="btn" href="/?do=reset">Reset everything</a>
      </p>
    </div>
    <p class="muted">Then open <a href="${APP_ORIGIN}">${APP_ORIGIN}</a>. Tokens are fakes — set <code>VITE_FAKE_GOOGLE=true</code> so Picker and Sheets are faked too.</p>`)
}

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname === '/mock/google') return consent(req, res, url)
  if (url.pathname === '/') return control(req, res, url)
  return api(req, res, url)
}).listen(PORT, () => {
  console.log(`Mock auth broker listening on http://localhost:${PORT}`)
  console.log(`  control panel: http://localhost:${PORT}/`)
  console.log(`  set VITE_AUTH_BROKER_URL=http://localhost:${PORT} in .env.local`)
  console.log(`  state persists in ${STATE_FILE} (${state.sessions.size} session(s), grant: ${state.grant?.status ?? 'none'})`)
})
