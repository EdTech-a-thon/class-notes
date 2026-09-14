import { mintToken, type DriveToken } from './broker'
import type { PickedSpreadsheet } from './types'

const GAPI_SCRIPT = 'https://apis.google.com/js/api.js'
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export const googleConfig = {
  templateId: import.meta.env.VITE_GOOGLE_TEMPLATE_ID?.trim() ?? '',
}

export const missingTemplateConfig = !googleConfig.templateId

declare global {
  interface Window {
    google?: { picker: any }
    gapi?: { load: (name: string, callback: () => void) => void }
  }
}

// Held in memory only. Never persisted, never logged.
let token: DriveToken | null = null
let minting: Promise<DriveToken> | null = null

function isFresh(candidate: DriveToken | null): candidate is DriveToken {
  return !!candidate && Date.now() < Date.parse(candidate.expiresAt) - 60_000
}

async function currentToken(): Promise<DriveToken> {
  if (isFresh(token)) return token
  minting ??= mintToken()
    .then((minted) => {
      if (!minted.grantedScopes.includes(DRIVE_FILE_SCOPE)) {
        throw new Error('Google did not grant access to Drive files. Reconnect Google Drive and allow file access.')
      }
      token = minted
      return minted
    })
    .finally(() => {
      minting = null
    })
  return minting
}

function loadScript(src: string, id: string): Promise<void> {
  const existing = document.getElementById(id) as HTMLScriptElement | null
  if (existing?.dataset.loaded === 'true') return Promise.resolve()

  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.defer = true
    script.onload = () => {
      script.dataset.loaded = 'true'
      resolve()
    }
    script.onerror = () => reject(new Error('Google could not be reached. Check your connection and try again.'))
    if (!existing) document.head.appendChild(script)
  })
}

/** Returns a Drive access token, minting one through the broker when none is fresh. */
export async function authorize(): Promise<string> {
  return (await currentToken()).accessToken
}

export function clearAuthorization(): void {
  token = null
}

export function getActiveToken(): string | null {
  return isFresh(token) ? token.accessToken : null
}

async function initializePicker(): Promise<void> {
  await loadScript(GAPI_SCRIPT, 'google-api-loader')
  if (!window.gapi) throw new Error('Google Picker did not finish loading.')
  await new Promise<void>((resolve) => window.gapi?.load('picker', resolve))
}

export async function pickSpreadsheet(): Promise<PickedSpreadsheet | null> {
  const [current] = await Promise.all([currentToken(), initializePicker()])
  const picker = window.google?.picker
  if (!picker) throw new Error('Google Picker is unavailable.')

  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false)
      .setOwnedByMe(true)
      .setMimeTypes('application/vnd.google-apps.spreadsheet')

    // No setOrigin(): broker-minted tokens work without it, and the app origin does not need to be
    // registered on the OAuth client. Only the API key's website restrictions matter.
    const instance = new picker.PickerBuilder()
      .setAppId(current.appId)
      .setDeveloperKey(current.apiKey)
      .setOAuthToken(current.accessToken)
      .setTitle('Choose your participation grade book')
      .addView(view)
      .setCallback((data: Record<string, any>) => {
        const action = data[picker.Response.ACTION]
        if (action === picker.Action.CANCEL) resolve(null)
        if (action === picker.Action.PICKED) {
          const document = data[picker.Response.DOCUMENTS]?.[0]
          resolve({
            id: document[picker.Document.ID],
            name: document[picker.Document.NAME],
            url: document[picker.Document.URL],
          })
        }
      })
      .build()

    instance.setVisible(true)
  })
}

export function templateCopyUrl(): string {
  return googleConfig.templateId
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(googleConfig.templateId)}/copy`
    : '#'
}
