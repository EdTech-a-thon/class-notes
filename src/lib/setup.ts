// What this device remembers about onboarding. Nothing here is sensitive: a spreadsheet ID and
// name, and whether the teacher has been through the "make a copy" step.

const SHEET_ID_KEY = 'participation-tracker.sheet-id'
const SHEET_NAME_KEY = 'participation-tracker.sheet-name'
const TEMPLATE_COPIED_KEY = 'participation-tracker.template-copied'

export interface RememberedSpreadsheet {
  id: string
  name: string
}

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Without storage every visit starts from step 1, which is at least honest.
  }
}

export function getRememberedSpreadsheet(): RememberedSpreadsheet | null {
  const id = read(SHEET_ID_KEY)
  return id ? { id, name: read(SHEET_NAME_KEY) } : null
}

export function rememberSpreadsheet(sheet: RememberedSpreadsheet): void {
  write(SHEET_ID_KEY, sheet.id)
  write(SHEET_NAME_KEY, sheet.name)
}

export function forgetSpreadsheet(): void {
  write(SHEET_ID_KEY, null)
  write(SHEET_NAME_KEY, null)
}

export function hasCopiedTemplate(): boolean {
  return read(TEMPLATE_COPIED_KEY) === 'true'
}

export function markTemplateCopied(): void {
  write(TEMPLATE_COPIED_KEY, 'true')
}
