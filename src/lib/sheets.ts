import {
  FAKE_GOOGLE,
  fakeAddNotes,
  fakeAddStudents,
  fakeAddSubject,
  fakeDeleteNote,
  fakeDeleteSubject,
  fakeLoadGradebook,
  fakeRenameSpreadsheet,
  fakeUpdateNote,
  fakeUpdateSubject,
} from './fake-google'
import type { Gradebook, Note, Student, Subject } from './types'

const API = 'https://sheets.googleapis.com/v4/spreadsheets'
const ROSTER_HEADERS = ['Name', 'Initials']
const SUBJECT_HEADERS = ['Subject', 'Emoji']
const NOTE_HEADERS = ['Date & time', 'Student', 'Subject', 'Note']
const TAB_ROSTER = 'Class Roster'
const TAB_SUBJECTS = 'Subjects'
const TAB_NOTES = 'Notes'

interface ValueRange { values?: unknown[][] }
interface BatchValuesResponse { valueRanges?: ValueRange[] }
interface SheetProperties { sheetId?: number; title?: string }
interface SpreadsheetResponse {
  properties?: { title?: string; timeZone?: string }
  sheets?: { properties?: SheetProperties }[]
}
interface AppendResponse { updates?: { updatedRange?: string } }

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
      // Keep the status-based message when Google returns no JSON.
    }
    throw new GoogleApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function deriveInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 3)
}

function partsIn(timeZone: string, instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? ''
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute') }
}

export function timestampNow(timeZone: string): string {
  const p = partsIn(timeZone)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

function todayIn(timeZone: string) {
  const p = partsIn(timeZone)
  const key = `${p.year}-${p.month}-${p.day}`
  const date = new Date(`${key}T12:00:00Z`)
  return {
    key,
    label: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(date),
  }
}

function serialToTimestamp(serial: number): string {
  const minutes = Math.round(serial * 24 * 60)
  const date = new Date((minutes - 25_569 * 24 * 60) * 60_000)
  return date.toISOString().slice(0, 16)
}

function timestampFromCell(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return serialToTimestamp(value)
  const text = String(value ?? '').trim()
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/)
  if (!match) return ''
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}T${(match[4] ?? '12').padStart(2, '0')}:${match[5] ?? '00'}`
}

export function formatTimestamp(timestamp: string): string {
  const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return timestamp
  const [, year, month, day, hour, minute] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)))
  const sameYear = Number(year) === new Date().getFullYear()
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }), hour: 'numeric', minute: '2-digit',
  }).format(date)
}

function headerMatches(actual: unknown[] | undefined, expected: readonly string[]) {
  return expected.every((heading, index) => String(actual?.[index] ?? '').trim() === heading)
}

function validateTemplate(ranges: ValueRange[]): void {
  if (!headerMatches(ranges[0]?.values?.[0], ROSTER_HEADERS)) {
    throw new Error('This file does not have the expected “Class Roster” columns.')
  }
  if (!headerMatches(ranges[1]?.values?.[0], SUBJECT_HEADERS)) {
    throw new Error('This file does not have the expected “Subjects” columns.')
  }
  if (!headerMatches(ranges[2]?.values?.[0], NOTE_HEADERS)) {
    throw new Error('This file does not have the expected “Notes” columns. Please use the new observation template.')
  }
}

async function batchGet(spreadsheetId: string, token: string): Promise<ValueRange[]> {
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' })
  ;[`'${TAB_ROSTER}'!A1:B`, `'${TAB_SUBJECTS}'!A1:B`, `'${TAB_NOTES}'!A1:D`]
    .forEach((range) => params.append('ranges', range))
  const response = await googleFetch<BatchValuesResponse>(
    `${API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`,
    token,
  )
  return response.valueRanges ?? []
}

function withLock<T>(spreadsheetId: string, work: () => Promise<T>): Promise<T> {
  if ('locks' in navigator) return navigator.locks.request(`observation-notebook:${spreadsheetId}`, work)
  return work()
}

async function appendRows(
  spreadsheetId: string,
  token: string,
  values: unknown[][],
  range: string,
): Promise<number | null> {
  const response = await googleFetch<AppendResponse>(
    `${API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    token,
    { method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values }) },
  )
  const match = response.updates?.updatedRange?.match(/!A(\d+)(?::[A-Z]+\d+)?$/)
  return match ? Number(match[1]) : null
}

export async function loadGradebook(spreadsheetId: string, token: string): Promise<Gradebook> {
  if (FAKE_GOOGLE) return fakeLoadGradebook(spreadsheetId)
  const metadata = await googleFetch<SpreadsheetResponse>(
    `${API}/${encodeURIComponent(spreadsheetId)}?fields=properties(title,timeZone),sheets.properties(sheetId,title)`,
    token,
  )
  const sheets = (metadata.sheets ?? []).map((sheet) => sheet.properties ?? {})
  const ids = new Map(sheets.map((sheet) => [sheet.title, sheet.sheetId]))
  if (![TAB_ROSTER, TAB_SUBJECTS, TAB_NOTES].every((title) => ids.has(title))) {
    throw new Error('This file is not an observation notebook. Please choose a copy of the new template.')
  }
  const ranges = await batchGet(spreadsheetId, token)
  validateTemplate(ranges)
  const timeZone = metadata.properties?.timeZone || 'America/New_York'
  const today = todayIn(timeZone)
  const students = (ranges[0]?.values?.slice(1) ?? []).map((row, index) => {
    const name = String(row[0] ?? '').trim()
    return { name, initials: String(row[1] ?? '').trim() || deriveInitials(name), row: index + 2 }
  }).filter((student) => student.name)
  const subjects = subjectsFromRows(ranges[1]?.values?.slice(1) ?? [])
  const notes = notesFromRows(ranges[2]?.values?.slice(1) ?? [])
  return {
    id: spreadsheetId,
    title: metadata.properties?.title || 'Observation Notebook',
    timeZone,
    dayKey: today.key,
    dayLabel: today.label,
    students,
    subjects,
    notes,
    notesSheetId: ids.get(TAB_NOTES) ?? 0,
    subjectsSheetId: ids.get(TAB_SUBJECTS) ?? 0,
  }
}

function subjectsFromRows(rows: unknown[][]): Subject[] {
  const seen = new Set<string>()
  const subjects: Subject[] = []
  rows.forEach((row, index) => {
    const name = String(row[0] ?? '').trim()
    if (!name || seen.has(name.toLowerCase())) return
    seen.add(name.toLowerCase())
    subjects.push({ name, emoji: String(row[1] ?? '').trim(), row: index + 2 })
  })
  return subjects
}

function notesFromRows(rows: unknown[][]): Note[] {
  const notes: Note[] = []
  rows.forEach((row, index) => {
    const text = String(row[3] ?? '').trim()
    const student = String(row[1] ?? '').trim()
    if (!text && !student) return
    notes.push({
      row: index + 2,
      timestamp: timestampFromCell(row[0]),
      student,
      subject: String(row[2] ?? '').trim(),
      text,
    })
  })
  return notes
}

export async function renameSpreadsheet(spreadsheetId: string, title: string, token: string): Promise<string> {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('Give the notebook a name.')
  if (FAKE_GOOGLE) return fakeRenameSpreadsheet(spreadsheetId, trimmed)
  await googleFetch(`${API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ updateSpreadsheetProperties: { properties: { title: trimmed }, fields: 'title' } }] }),
  })
  return trimmed
}

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

export async function addStudents(spreadsheetId: string, names: string[], token: string): Promise<void> {
  if (!names.length) return
  if (FAKE_GOOGLE) return fakeAddStudents(spreadsheetId, names)
  await googleFetch(
    `${API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${TAB_ROSTER}'!A:B`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    token,
    { method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values: names.map((name) => [name]) }) },
  )
}

export type NoteDraft = Omit<Note, 'row'>
const noteValues = (note: NoteDraft): unknown[] => [note.timestamp.replace('T', ' '), note.student, note.subject, note.text]

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
      method: 'PUT', body: JSON.stringify({ majorDimension: 'ROWS', values: [noteValues(note)] }),
    })
  })
}

async function deleteRow(spreadsheetId: string, sheetId: number, row: number, token: string): Promise<void> {
  await googleFetch(`${API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }] }),
  })
}

export function deleteNote(spreadsheetId: string, notesSheetId: number, row: number, token: string): Promise<void> {
  if (FAKE_GOOGLE) return fakeDeleteNote(spreadsheetId, row)
  return withLock(spreadsheetId, () => deleteRow(spreadsheetId, notesSheetId, row, token))
}

export function addSubject(spreadsheetId: string, subject: Omit<Subject, 'row'>, token: string): Promise<Subject> {
  if (FAKE_GOOGLE) return fakeAddSubject(spreadsheetId, subject)
  return withLock(spreadsheetId, async () => {
    const row = await appendRows(spreadsheetId, token, [[subject.name, subject.emoji]], `'${TAB_SUBJECTS}'!A:B`)
    if (!row) throw new Error('The subject was saved, but its row could not be located. Refresh and try again.')
    return { ...subject, row }
  })
}

export function updateSubject(spreadsheetId: string, subject: Subject, token: string): Promise<void> {
  if (FAKE_GOOGLE) return fakeUpdateSubject(spreadsheetId, subject)
  return withLock(spreadsheetId, async () => {
    const range = encodeURIComponent(`'${TAB_SUBJECTS}'!A${subject.row}:B${subject.row}`)
    await googleFetch(`${API}/${encodeURIComponent(spreadsheetId)}/values/${range}?valueInputOption=RAW`, token, {
      method: 'PUT', body: JSON.stringify({ majorDimension: 'ROWS', values: [[subject.name, subject.emoji]] }),
    })
  })
}

export function deleteSubject(spreadsheetId: string, subjectsSheetId: number, row: number, token: string): Promise<void> {
  if (FAKE_GOOGLE) return fakeDeleteSubject(spreadsheetId, row)
  return withLock(spreadsheetId, () => deleteRow(spreadsheetId, subjectsSheetId, row, token))
}

export function isAuthorizationError(error: unknown): boolean {
  return error instanceof GoogleApiError && error.status === 401
}
