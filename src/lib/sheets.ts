import { FAKE_GOOGLE, fakeLoadGradebook, fakeRenameSpreadsheet, fakeUpdateGrade } from './fake-google'
import { DIMENSIONS, type Gradebook, type Grades, type Student } from './types'

const API = 'https://sheets.googleapis.com/v4/spreadsheets'
const DAY_HEADERS = ['Name', 'Date', ...DIMENSIONS.map((dimension) => dimension.key), 'Total']

interface ValueRange {
  range?: string
  values?: unknown[][]
}

interface BatchValuesResponse {
  valueRanges?: ValueRange[]
}

interface SpreadsheetResponse {
  properties?: { title?: string; timeZone?: string }
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
}

async function batchGet(spreadsheetId: string, token: string): Promise<ValueRange[]> {
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' })
  ;["'Day Records'!A1:H", "'Class Roster'!A1:B", "'Week Ranges'!A1:C"].forEach((range) =>
    params.append('ranges', range),
  )

  const response = await googleFetch<BatchValuesResponse>(
    `${API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`,
    token,
  )
  return response.valueRanges ?? []
}

async function appendRows(spreadsheetId: string, token: string, values: unknown[][]): Promise<number | null> {
  const range = encodeURIComponent("'Day Records'!A:G")
  const response = await googleFetch<AppendResponse>(
    `${API}/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    token,
    { method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values }) },
  )
  const match = response.updates?.updatedRange?.match(/!A(\d+):G\d+$/)
  return match ? Number(match[1]) : null
}

export async function loadGradebook(spreadsheetId: string, token: string): Promise<Gradebook> {
  if (FAKE_GOOGLE) return fakeLoadGradebook(spreadsheetId)
  const [metadata, ranges] = await Promise.all([
    googleFetch<SpreadsheetResponse>(
      `${API}/${encodeURIComponent(spreadsheetId)}?fields=properties(title,timeZone)`,
      token,
    ),
    batchGet(spreadsheetId, token),
  ])

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
    title: metadata.properties?.title || 'Participation Grade Book',
    timeZone,
    dayKey: today.key,
    dayLabel: today.label,
    students,
  }
}

async function writeGrade(
  spreadsheetId: string,
  student: Student,
  dayKey: string,
  token: string,
): Promise<number> {
  const [year, month, day] = dayKey.split('-').map(Number)
  const values = [
    student.name,
    dateSerial({ year, month, day }),
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
  if ('locks' in navigator) {
    return navigator.locks.request(`participation-gradebook:${spreadsheetId}`, () =>
      writeGrade(spreadsheetId, student, dayKey, token),
    )
  }
  return writeGrade(spreadsheetId, student, dayKey, token)
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

export function isAuthorizationError(error: unknown): boolean {
  return error instanceof GoogleApiError && error.status === 401
}
