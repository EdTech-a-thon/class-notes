// What this device remembers about onboarding. Nothing here is sensitive: spreadsheet IDs and
// names, and whether the teacher has been through the "make a copy" step.

// Versioned away from the former participation workbook: the observation template has a different
// schema, so an old remembered sheet must not be opened as if it were compatible.
const SHEET_ID_KEY = 'observations-v2.sheet-id'
const SHEET_NAME_KEY = 'observations-v2.sheet-name'
const RECENT_SHEETS_KEY = 'observations-v2.recent-sheets'
const TEMPLATE_COPIED_KEY = 'observations-v2.template-copied'
const RECENT_LIMIT = 8

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

/** Makes `sheet` the current notebook and moves it to the front of the recent list. */
export function rememberSpreadsheet(sheet: RememberedSpreadsheet): void {
  write(SHEET_ID_KEY, sheet.id)
  write(SHEET_NAME_KEY, sheet.name)
  const others = getRecentSpreadsheets().filter((entry) => entry.id !== sheet.id)
  write(RECENT_SHEETS_KEY, JSON.stringify([sheet, ...others].slice(0, RECENT_LIMIT)))
}

/** Every notebook opened on this device, most recent first. Lets a teacher with several classes
 *  switch without going back through the Drive picker. */
export function getRecentSpreadsheets(): RememberedSpreadsheet[] {
  try {
    const parsed: unknown = JSON.parse(read(RECENT_SHEETS_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is RememberedSpreadsheet => !!entry && typeof entry.id === 'string' && !!entry.id)
      .map((entry) => ({ id: entry.id, name: typeof entry.name === 'string' ? entry.name : '' }))
  } catch {
    return []
  }
}

export function hasCopiedTemplate(): boolean {
  return read(TEMPLATE_COPIED_KEY) === 'true'
}

export function markTemplateCopied(): void {
  write(TEMPLATE_COPIED_KEY, 'true')
}

/** Signing out wipes what this device remembers, so the next teacher starts at step 1. */
export function forgetEverything(): void {
  for (const key of [SHEET_ID_KEY, SHEET_NAME_KEY, RECENT_SHEETS_KEY, TEMPLATE_COPIED_KEY]) write(key, null)
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith('observations-v2.draft:')) localStorage.removeItem(key)
    }
  } catch {
    // Storage is already unavailable, so there is nothing else to clear.
  }
}
