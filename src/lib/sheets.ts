import {
  FAKE_GOOGLE,
  fakeAddNotes,
  fakeAddStudents,
  fakeAddSubject,
  fakeDeleteNote,
  fakeLoadGradebook,
  fakeRenameSpreadsheet,
  fakeUpdateGrade,
  fakeUpdateNote,
} from './fake-google'
import { DEFAULT_SUBJECTS, DIMENSIONS, type Gradebook, type Grades, type Note, type Student, type Subject } from './types'

const API = 'https://sheets.googleapis.com/v4/spreadsheets'
const DAY_HEADERS = ['Name', 'Date', ...DIMENSIONS.map((dimension) => dimension.key), 'Total']
const SUBJECT_HEADERS = ['Subject', 'Emoji']
const NOTE_HEADERS = ['Date', 'Student', 'Subject', 'Note']
const TAB_SUBJECTS = 'Subjects'
const TAB_NOTES = 'Notes'

interface ValueRange {
  range?: string
  values?: unknown[][]
}

interface BatchValuesResponse {
  valueRanges?: ValueRange[]
}

interface SheetProperties {
  sheetId?: number
  title?: string
}

interface SpreadsheetResponse {
  properties?: { title?: string; timeZone?: string }
  sheets?: { properties?: SheetProperties }[]
}

interface BatchUpdateResponse {
  replies?: { addSheet?: { properties?: SheetProperties } }[]
}

interface AppendResponse {
  updates?: { updatedRange?: string }
}

class GoogleApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'GoogleApiError'
  }
}

async function googleFetch<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  if (!response.ok) {
    let message = `Google returned an error (${response.status}).`
    try {
      const body = await response.json()
      message = body?.error?.message || message
    } catch {
      // Keep the status-based message when Google returns no JSON body.
    }
    throw new GoogleApiError(message, response.status)
  }

  return response.json() as Promise<T>
}

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 3)
}

export function defaultGrades(): Grades {
  return Object.fromEntries(DIMENSIONS.map(({ key }) => [key, true])) as Grades
}

function gradesFromRow(row: unknown[]): Grades {
  return Object.fromEntries(
    DIMENSIONS.map(({ key }, index) => [
      key,
      String(row[index + 2] ?? '').trim().toLowerCase() === 'yes',
    ]),
  ) as Grades
}

export function totalFor(grades: Grades): number {
  return DIMENSIONS.reduce((total, { key }) => total + Number(grades[key]), 0)
}

function dateParts(timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date())

  const number = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)

  return { year: number('year'), month: number('month'), day: number('day') }
}

function dateSerial({ year, month, day }: { year: number; month: number; day: number }): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000) + 25_569
}

export function keyToSerial(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map(Number)
  return dateSerial({ year, month, day })
}

function serialToKey(serial: number): string {
  return new Date((Math.floor(serial) - 25_569) * 86_400_000).toISOString().slice(0, 10)
}

/** Notes written by the app hold a date serial, but a teacher typing into the sheet may leave a
 *  plain "2026-09-14" string. Both read back as a day key; anything else is left blank. */
function dayKeyFromCell(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return serialToKey(value)
  const text = String(value ?? '').trim()
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : ''
}

/** Formats a day key for people: "Mon, Sep 14" this year, "Mon, Sep 14, 2025" otherwise. */
export function formatDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  if (!year || !month || !day) return dayKey
  const instant = new Date(Date.UTC(year, month - 1, day, 12))
  const sameYear = year === new Date().getFullYear()
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(instant)
}

function todayIn(timeZone: string) {
  const parts = dateParts(timeZone)
  const instant = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12))
  return {
    key: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    serial: dateSerial(parts),
    label: new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(instant),
  }
}

function headerMatches(actual: unknown[] | undefined, expected: readonly string[]): boolean {
  return expected.every((heading, index) => String(actual?.[index] ?? '').trim() === heading)
}

function validateTemplate(ranges: ValueRange[]): void {
  if (!headerMatches(ranges[0]?.values?.[0], DAY_HEADERS)) {
    throw new Error('This file does not have the expected “Day Records” columns.')
  }
  if (!headerMatches(ranges[1]?.values?.[0], ['Name', 'Initials'])) {
    throw new Error('This file does not have the expected “Class Roster” columns.')
  }
  if (!headerMatches(ranges[2]?.values?.[0], ['Week', 'Start Date', 'End Date'])) {
    throw new Error('This file does not have the expected “Week Ranges” columns.')
  }
  if (!headerMatches(ranges[3]?.values?.[0], SUBJECT_HEADERS)) {
    throw new Error('This file does not have the expected “Subjects” columns.')
  }
  if (!headerMatches(ranges[4]?.values?.[0], NOTE_HEADERS)) {
    throw new Error('This file does not have the expected “Notes” columns.')
  }
}

/** Grade books copied from the original template have no notes tabs. Rather than reject them, add
 *  "Subjects" (seeded with defaults) and "Notes" (headers only) so older copies keep working.
 *  Returns the gid of the "Notes" tab, which row deletion needs. */
async function ensureNoteTabs(spreadsheetId: string, token: string, sheets: SheetProperties[]): Promise<number> {
  const existing = new Map(sheets.map((sheet) => [sheet.title, sheet.sheetId]))
  const missing = [TAB_SUBJECTS, TAB_NOTES].filter((title) => !existing.has(title))
  if (!missing.length) return existing.get(TAB_NOTES) ?? 0

  const base = `${API}/${encodeURIComponent(spreadsheetId)}`
  const added = await googleFetch<BatchUpdateResponse>(`${base}:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({
      requests: missing.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })),
    }),
  })
  added.replies?.forEach((reply) => {
    const properties = reply.addSheet?.properties
    if (properties?.title) existing.set(properties.title, properties.sheetId)
  })

  const data: { range: string; values: unknown[][] }[] = []
  if (missing.includes(TAB_SUBJECTS)) {
    data.push({
      range: `'${TAB_SUBJECTS}'!A1:B`,
      values: [SUBJECT_HEADERS, ...DEFAULT_SUBJECTS.map(({ name, emoji }) => [name, emoji])],
    })
  }
  if (missing.includes(TAB_NOTES)) data.push({ range: `'${TAB_NOTES}'!A1:D1`, values: [NOTE_HEADERS] })
  await googleFetch(`${base}/values:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  })

  const notesSheetId = existing.get(TAB_NOTES)
  if (missing.includes(TAB_NOTES) && typeof notesSheetId === 'number') {
    // Dates are stored as serials like "Day Records"; show them as yyyy-mm-dd and give the note
    // column room to breathe when the teacher opens the sheet directly.
    await googleFetch(`${base}:batchUpdate`, token, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId: notesSheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
              cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
              fields: 'userEnteredFormat.numberFormat',
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId: notesSheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
              properties: { pixelSize: 520 },
              fields: 'pixelSize',
            },
          },
        ],
      }),
    })
  }
  return notesSheetId ?? 0
}

async function batchGet(spreadsheetId: string, token: string): Promise<ValueRange[]> {
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' })
  ;[
    "'Day Records'!A1:H",
    "'Class Roster'!A1:B",
    "'Week Ranges'!A1:C",
    `'${TAB_SUBJECTS}'!A1:B`,
    `'${TAB_NOTES}'!A1:D`,
  ].forEach((range) => params.append('ranges', range))

  const response = await googleFetch<BatchValuesResponse>(
    `${API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`,
    token,
  )
  return response.valueRanges ?? []
}

/** Appends rows to a tab and returns the first row number they landed on (null if Google did not
 *  say). Rows are appended after the last row with content, so an empty tab starts at row 2. */
async function appendRows(
  spreadsheetId: string,
  token: string,
  values: unknown[][],
  range = "'Day Records'!A:G",
): Promise<number | null> {
  const response = await googleFetch<AppendResponse>(
    `${API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    token,
    { method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values }) },
  )
  const match = response.updates?.updatedRange?.match(/!A(\d+)(?::[A-Z]+\d+)?$/)
  return match ? Number(match[1]) : null
}

/** Writes are serialized across tabs in the same browser so two quick saves cannot interleave. */
function withLock<T>(spreadsheetId: string, work: () => Promise<T>): Promise<T> {
  if ('locks' in navigator) return navigator.locks.request(`participation-gradebook:${spreadsheetId}`, work)
  return work()
}

export async function loadGradebook(spreadsheetId: string, token: string): Promise<Gradebook> {
  if (FAKE_GOOGLE) return fakeLoadGradebook(spreadsheetId)
  const metadata = await googleFetch<SpreadsheetResponse>(
    `${API}/${encodeURIComponent(spreadsheetId)}?fields=properties(title,timeZone),sheets.properties(sheetId,title)`,
    token,
  )
  const sheets = (metadata.sheets ?? []).map((sheet) => sheet.properties ?? {})
  // Reject a wrong file before adding tabs to it: the roster tab is the cheapest tell.
  if (!sheets.some((sheet) => sheet.title === 'Class Roster')) {
    throw new Error('This file does not have the expected “Class Roster” tab.')
  }
  const notesSheetId = await ensureNoteTabs(spreadsheetId, token, sheets)
  const ranges = await batchGet(spreadsheetId, token)

  validateTemplate(ranges)
  const timeZone = metadata.properties?.timeZone || 'America/New_York'
  const today = todayIn(timeZone)
  const todayByName = new Map<string, { row: number; grades: Grades }>()

  ;(ranges[0]?.values?.slice(1) ?? []).forEach((row, index) => {
    const name = String(row[0] ?? '').trim()
    if (name && Number(row[1]) === today.serial) {
      todayByName.set(name, { row: index + 2, grades: gradesFromRow(row) })
    }
  })

  const roster = (ranges[1]?.values?.slice(1) ?? [])
    .map((row) => {
      const name = String(row[0] ?? '').trim()
      return { name, initials: String(row[1] ?? '').trim() || deriveInitials(name) }
    })
    .filter(({ name }) => name)

  const missing = roster.filter(({ name }) => !todayByName.has(name))
  if (missing.length) {
    const startRow = await appendRows(
      spreadsheetId,
      token,
      missing.map(({ name }) => [name, today.serial, ...DIMENSIONS.map(() => 'Yes')]),
    )
    if (startRow === null) return loadGradebook(spreadsheetId, token)
    missing.forEach(({ name }, index) => {
      todayByName.set(name, { row: startRow + index, grades: defaultGrades() })
    })
  }

  const students: Student[] = roster.map((entry) => {
    const todayEntry = todayByName.get(entry.name)
    return {
      ...entry,
      row: todayEntry?.row ?? 0,
      grades: todayEntry?.grades ?? defaultGrades(),
    }
  })

  return {
    id: spreadsheetId,
    title: metadata.properties?.title || 'Class Notes',
    timeZone,
    dayKey: today.key,
    dayLabel: today.label,
    students,
    subjects: subjectsFromRows(ranges[3]?.values?.slice(1) ?? []),
    notes: notesFromRows(ranges[4]?.values?.slice(1) ?? []),
    notesSheetId,
  }
}

function subjectsFromRows(rows: unknown[][]): Subject[] {
  const seen = new Set<string>()
  const subjects: Subject[] = []
  for (const row of rows) {
    const name = String(row[0] ?? '').trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    subjects.push({ name, emoji: String(row[1] ?? '').trim() })
  }
  return subjects
}

/** Blank rows are skipped but still count toward row numbers, so edits land on the right line. */
function notesFromRows(rows: unknown[][]): Note[] {
  const notes: Note[] = []
  rows.forEach((row, index) => {
    const text = String(row[3] ?? '').trim()
    const student = String(row[1] ?? '').trim()
    if (!text && !student) return
    notes.push({
      row: index + 2,
      dateKey: dayKeyFromCell(row[0]),
      student,
      subject: String(row[2] ?? '').trim(),
      text,
    })
  })
  return notes
}

async function writeGrade(
  spreadsheetId: string,
  student: Student,
  dayKey: string,
  token: string,
): Promise<number> {
  const values = [
    student.name,
    keyToSerial(dayKey),
    ...DIMENSIONS.map(({ key }) => (student.grades[key] ? 'Yes' : 'No')),
  ]

  if (!student.row) {
    const row = await appendRows(spreadsheetId, token, [values])
    if (!row) throw new Error('The grade was saved, but its row could not be located. Refresh and try again.')
    return row
  }

  const range = encodeURIComponent(`'Day Records'!A${student.row}:G${student.row}`)
  await googleFetch(
    `${API}/${encodeURIComponent(spreadsheetId)}/values/${range}?valueInputOption=RAW`,
    token,
    { method: 'PUT', body: JSON.stringify({ majorDimension: 'ROWS', values: [values] }) },
  )
  return student.row
}

export function updateGrade(
  spreadsheetId: string,
  student: Student,
  dayKey: string,
  token: string,
): Promise<number> {
  if (FAKE_GOOGLE) return fakeUpdateGrade(student)
  return withLock(spreadsheetId, () => writeGrade(spreadsheetId, student, dayKey, token))
}

/** Renames the spreadsheet. The Sheets title is the Drive file name, and drive.file covers metadata
 *  on files the teacher picked, so no Drive API call is needed. Returns the title Google stored. */
export async function renameSpreadsheet(spreadsheetId: string, title: string, token: string): Promise<string> {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('Give the grade book a name.')
  if (FAKE_GOOGLE) return fakeRenameSpreadsheet(spreadsheetId, trimmed)
  await googleFetch(`${API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ updateSpreadsheetProperties: { properties: { title: trimmed }, fields: 'title' } }],
    }),
  })
  return trimmed
}

/** Turns pasted text into a clean list of names: one per line (or comma-separated on a single
 *  line), trimmed, with blanks and repeats dropped. Case-insensitive so "ava" and "Ava" are one. */
export function parseRosterNames(text: string, existing: readonly string[] = []): string[] {
  let lines = text.split(/\r?\n|\t/)
  if (lines.filter((line) => line.trim()).length === 1 && lines[0].includes(',')) lines = lines[0].split(',')
  const seen = new Set(existing.map((name) => name.toLowerCase()))
  const names: string[] = []
  for (const line of lines) {
    const name = line.trim().replace(/\s+/g, ' ')
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    names.push(name)
  }
  return names
}

/** Appends names to the "Class Roster" tab. Initials are left blank so the app derives them. The
 *  caller reloads the grade book afterwards, which creates today's rows for the new students. */
export async function addStudents(spreadsheetId: string, names: string[], token: string): Promise<void> {
  if (!names.length) return
  if (FAKE_GOOGLE) return fakeAddStudents(spreadsheetId, names)
  const range = encodeURIComponent("'Class Roster'!A:B")
  await googleFetch(
    `${API}/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    token,
    { method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values: names.map((name) => [name]) }) },
  )
}

export type NoteDraft = Omit<Note, 'row'>

function noteValues(note: NoteDraft): unknown[] {
  return [keyToSerial(note.dateKey), note.student, note.subject, note.text]
}

/** Appends one row per note to the "Notes" tab and returns them with their row numbers. */
export function addNotes(spreadsheetId: string, drafts: NoteDraft[], token: string): Promise<Note[]> {
  if (!drafts.length) return Promise.resolve([])
  if (FAKE_GOOGLE) return fakeAddNotes(spreadsheetId, drafts)
  return withLock(spreadsheetId, async () => {
    const startRow = await appendRows(spreadsheetId, token, drafts.map(noteValues), `'${TAB_NOTES}'!A:D`)
    if (startRow === null) throw new Error('The note was saved, but its row could not be located. Refresh and try again.')
    return drafts.map((draft, index) => ({ ...draft, row: startRow + index }))
  })
}

export function updateNote(spreadsheetId: string, note: Note, token: string): Promise<void> {
  if (FAKE_GOOGLE) return fakeUpdateNote(spreadsheetId, note)
  return withLock(spreadsheetId, async () => {
    const range = encodeURIComponent(`'${TAB_NOTES}'!A${note.row}:D${note.row}`)
    await googleFetch(`${API}/${encodeURIComponent(spreadsheetId)}/values/${range}?valueInputOption=RAW`, token, {
      method: 'PUT',
      body: JSON.stringify({ majorDimension: 'ROWS', values: [noteValues(note)] }),
    })
  })
}

/** Removes the note's row from the sheet. Rows below it move up one, so the caller shifts the row
 *  numbers of the notes it still holds. */
export function deleteNote(spreadsheetId: string, notesSheetId: number, row: number, token: string): Promise<void> {
  if (FAKE_GOOGLE) return fakeDeleteNote(spreadsheetId, row)
  return withLock(spreadsheetId, async () => {
    await googleFetch(`${API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, token, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          { deleteDimension: { range: { sheetId: notesSheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } },
        ],
      }),
    })
  })
}

/** Appends a subject to the "Subjects" tab so it shows up as a chip from now on. */
export function addSubject(spreadsheetId: string, subject: Subject, token: string): Promise<void> {
  if (FAKE_GOOGLE) return fakeAddSubject(spreadsheetId, subject)
  return withLock(spreadsheetId, async () => {
    await appendRows(spreadsheetId, token, [[subject.name, subject.emoji]], `'${TAB_SUBJECTS}'!A:B`)
  })
}

export function isAuthorizationError(error: unknown): boolean {
  return error instanceof GoogleApiError && error.status === 401
}
