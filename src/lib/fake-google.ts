import { DEFAULT_SUBJECTS, type Gradebook, type Note, type PickedSpreadsheet, type Student, type Subject } from './types'
import type { NoteDraft } from './sheets'

export const FAKE_GOOGLE = import.meta.env.VITE_FAKE_GOOGLE === 'true'

const EMPTY_ROSTER = new URLSearchParams(window.location.search).has('emptyRoster')
const ROSTER = EMPTY_ROSTER
  ? []
  : ['Ava Martinez', 'Ben Okafor', 'Chloe Nguyen', 'Diego Rossi', 'Emma Fischer', 'Farah Haddad']
const SHEET: PickedSpreadsheet = { id: 'fake-sheet-id', name: 'Room 4 Observations', url: '#' }

let students: Student[] | null = null
let subjects: Subject[] = DEFAULT_SUBJECTS.map((subject, index) => ({ ...subject, row: index + 2 }))
let notes: Note[] | null = null

function localTimestamp(daysAgo: number, hour: number, minute: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, minute, 0, 0)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const SAMPLE_NOTES: NoteDraft[] = EMPTY_ROSTER ? [] : [
  { timestamp: localTimestamp(0, 9, 18), student: 'Ben Okafor', subject: 'Social & Emotional', text: 'Shared the toy car with Diego and let him choose which one to keep.' },
  { timestamp: localTimestamp(0, 10, 42), student: 'Chloe Nguyen', subject: 'Math', text: 'Counted the blocks she was playing with and sorted them by colour without being asked.' },
  { timestamp: localTimestamp(0, 11, 26), student: 'Ben Okafor', subject: 'Literacy', text: 'Wrote his name with all letters facing the right way.' },
  { timestamp: localTimestamp(1, 13, 5), student: 'Ava Martinez', subject: 'Social & Emotional', text: 'Used the calm-down corner on her own after the block tower fell.' },
  { timestamp: localTimestamp(3, 9, 50), student: 'Chloe Nguyen', subject: 'Math', text: 'Made an AB pattern with the bear counters and explained it to Farah.' },
  { timestamp: localTimestamp(4, 14, 12), student: 'Emma Fischer', subject: 'Science & Inquiry', text: 'Asked why the ice melted faster near the window and tested it with two cups.' },
]

export function fakePickSpreadsheet(): Promise<PickedSpreadsheet | null> {
  const ok = window.confirm(`[Fake Google Picker]\n\nPick “${SHEET.name}”?\n\nCancel simulates closing the picker.`)
  return Promise.resolve(ok ? SHEET : null)
}

function today() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  const key = new Date(now.getTime() - offset).toISOString().slice(0, 10)
  return {
    key,
    label: new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now),
  }
}

export async function fakeLoadGradebook(spreadsheetId: string): Promise<Gradebook> {
  await delay(220)
  if (spreadsheetId !== SHEET.id) throw new Error('This file is not an observation notebook.')
  students ??= ROSTER.map((name, index) => ({
    name,
    initials: name.split(' ').map((part) => part[0]).join(''),
    row: index + 2,
  }))
  notes ??= SAMPLE_NOTES.map((draft, index) => ({ ...draft, row: index + 2 }))
  const current = today()
  return {
    id: SHEET.id,
    title: SHEET.name,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dayKey: current.key,
    dayLabel: current.label,
    students: students.map((student) => ({ ...student })),
    subjects: subjects.map((subject) => ({ ...subject })),
    notes: notes.map((note) => ({ ...note })),
    notesSheetId: 3,
    subjectsSheetId: 2,
  }
}

export async function fakeAddNotes(spreadsheetId: string, drafts: NoteDraft[]): Promise<Note[]> {
  await delay(180)
  assertSheet(spreadsheetId)
  notes ??= []
  const added = drafts.map((draft, index) => ({ ...draft, row: notes!.length + index + 2 }))
  notes.push(...added)
  return added.map((note) => ({ ...note }))
}

export async function fakeUpdateNote(spreadsheetId: string, note: Note): Promise<void> {
  await delay(160)
  assertSheet(spreadsheetId)
  const index = notes?.findIndex((entry) => entry.row === note.row) ?? -1
  if (index < 0 || !notes) throw new Error('No such note in the fake sheet.')
  notes[index] = { ...note }
}

export async function fakeDeleteNote(spreadsheetId: string, row: number): Promise<void> {
  await delay(160)
  assertSheet(spreadsheetId)
  notes = (notes ?? []).filter((note) => note.row !== row).map((note) => note.row > row ? { ...note, row: note.row - 1 } : note)
}

export async function fakeAddSubject(spreadsheetId: string, subject: Omit<Subject, 'row'>): Promise<Subject> {
  await delay(140)
  assertSheet(spreadsheetId)
  const added = { ...subject, row: subjects.length + 2 }
  subjects = [...subjects, added]
  return { ...added }
}

export async function fakeUpdateSubject(spreadsheetId: string, subject: Subject): Promise<void> {
  await delay(140)
  assertSheet(spreadsheetId)
  const index = subjects.findIndex((entry) => entry.row === subject.row)
  if (index < 0) throw new Error('No such subject in the fake sheet.')
  subjects[index] = { ...subject }
}

export async function fakeDeleteSubject(spreadsheetId: string, row: number): Promise<void> {
  await delay(140)
  assertSheet(spreadsheetId)
  subjects = subjects.filter((subject) => subject.row !== row).map((subject) => subject.row > row ? { ...subject, row: subject.row - 1 } : subject)
}

export async function fakeAddStudents(spreadsheetId: string, names: string[]): Promise<void> {
  await delay(180)
  assertSheet(spreadsheetId)
  students ??= []
  names.forEach((name) => students!.push({
    name,
    initials: name.split(' ').map((part) => part[0]).join(''),
    row: students!.length + 2,
  }))
}

export async function fakeRenameSpreadsheet(spreadsheetId: string, title: string): Promise<string> {
  await delay(140)
  assertSheet(spreadsheetId)
  SHEET.name = title
  return title
}

function assertSheet(spreadsheetId: string) {
  if (spreadsheetId !== SHEET.id) throw new Error('No such spreadsheet in the fake Drive.')
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
