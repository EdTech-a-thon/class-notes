// Client for the auth broker. The browser never runs an OAuth flow itself: it asks the broker for
// a Google authorization URL, navigates there, and comes back with an HttpOnly session cookie.

const BROKER = (import.meta.env.VITE_AUTH_BROKER_URL?.trim() || 'https://auth.teacher.dev').replace(/\/+$/, '')

export interface DriveConnection {
  connected: boolean
  status?: 'active' | 'invalid'
  googleUserId?: string
  googleEmail?: string
  grantedScopes?: string[]
  lastError?: string
  lastErrorDescription?: string
}

export interface DriveToken {
  accessToken: string
  expiresAt: string // RFC 3339
  grantedScopes: string[]
  appId: string // Picker app ID (Google Cloud project number)
  apiKey: string // Picker browser API key
}

export class BrokerError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
    this.name = 'BrokerError'
  }

  get signedOut(): boolean {
    return this.status === 401
  }

  get needsConnection(): boolean {
    return this.status === 404 || this.status === 409
  }
}

function messageFor(status: number, code: string): string {
  switch (status) {
    case 401: return 'You are signed out. Sign in with Google to continue.'
    case 404: return 'Google Drive is not connected yet.'
    case 409: return 'Your Google Drive connection stopped working. Reconnect Google Drive to continue.'
    case 429: return 'Too many requests. Wait a minute and try again.'
    case 403:
      return code === 'origin_not_allowed'
        ? 'This site is not allowed to use the sign-in service. Check the broker configuration.'
        : 'The sign-in service refused this request.'
    case 502: return 'Google could not be reached. Try again in a moment.'
    default: return `The sign-in service returned an error (${status}).`
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(BROKER + path, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'fetch',
        ...init.headers,
      },
    })
  } catch {
    throw new BrokerError('The sign-in service could not be reached. Check your connection and try again.', 0, 'network')
  }
}

async function failure(response: Response): Promise<BrokerError> {
  const body = await response.json().catch(() => ({}))
  const code = typeof body?.error === 'string' ? body.error : `http_${response.status}`
  return new BrokerError(messageFor(response.status, code), response.status, code)
}

function currentPath(): string {
  return window.location.pathname || '/'
}

async function startFlow(path: string, returnTo: string): Promise<void> {
  const response = await call(path, { method: 'POST', body: JSON.stringify({ returnTo }) })
  if (!response.ok) throw await failure(response)
  const { authorizationUrl } = (await response.json()) as { authorizationUrl?: string }
  if (!authorizationUrl) throw new BrokerError('The sign-in service did not return a Google URL.', 502, 'missing_url')
  window.location.href = authorizationUrl
}

/** Navigates the whole page to Google sign-in. Resolves only if navigation did not happen. */
export function signIn(returnTo = currentPath()): Promise<void> {
  return startFlow('/auth/google/start', returnTo)
}

/** Navigates the whole page to Google Drive consent. Requires an existing session. */
export async function connectDrive(returnTo = currentPath()): Promise<void> {
  try {
    await startFlow('/oauth/google/start', returnTo)
  } catch (caught) {
    if (caught instanceof BrokerError && caught.signedOut) return signIn(returnTo)
    throw caught
  }
}

export async function signOut(): Promise<void> {
  const response = await call('/auth/logout', { method: 'POST' })
  if (!response.ok && response.status !== 401) throw await failure(response)
}

/** Revokes the Drive grant at Google. Leaves the user signed in. */
export async function disconnectDrive(): Promise<void> {
  const response = await call('/oauth/google/connection', { method: 'DELETE' })
  if (!response.ok && response.status !== 404) throw await failure(response)
}

/** Returns `null` when there is no session. */
export async function getConnection(): Promise<DriveConnection | null> {
  const response = await call('/oauth/google/connection')
  if (response.status === 401) return null
  if (!response.ok) throw await failure(response)
  return response.json() as Promise<DriveConnection>
}

export async function mintToken(): Promise<DriveToken> {
  const response = await call('/oauth/google/token', { method: 'POST' })
  if (!response.ok) throw await failure(response)
  return response.json() as Promise<DriveToken>
}

/**
 * Both OAuth callbacks always land back on the app, carrying `?error=<code>` when something went
 * wrong. Reads the code once and strips it from the address bar.
 */
export function consumeArrivalError(): string | null {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('error')
  if (code === null) return null
  url.searchParams.delete('error')
  window.history.replaceState(window.history.state, '', url)
  return code
}

export function describeArrivalError(code: string): string {
  switch (code) {
    case 'access_denied':
      return 'Google sign-in was cancelled.'
    case 'google_account_mismatch':
      return 'That is a different Google account from the one you signed in with. Connect the same account.'
    case 'unauthorized':
      return 'Your session ended before Google finished. Sign in and try again.'
    case 'invalid_state':
      return 'The sign-in link expired. Try again.'
    case 'google_signin_failed':
    case 'google_connect_failed':
    case 'google_revoke_failed':
      return 'Google could not complete the request. Try again in a moment.'
    default:
      return `Google sign-in did not complete (${code}). Try again.`
  }
}
