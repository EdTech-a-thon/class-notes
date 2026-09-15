// Everything the app knows lives in this browser's localStorage. There is no server and no
// account: one entry per class, an index of classes, and which class is open.

import { removeDraftsFor } from './drafts'
import { DEFAULT_SUBJECTS, type Note, type NoteDraft, type Notebook, type NotebookSummary, type Student, type Subject } from './types'

const INDEX_KEY = 'observations-local.notebooks'
const CURRENT_KEY = 'observations-local.current'
const notebookKey = (id: string) => `observations-local.notebook:${id}`

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function write(key: string, value: string | null): void {
  if (value === null) {
    try { localStorage.removeItem(key) } catch { /* Already gone or storage unavailable. */ }
    return
  }
  try {
    localStorage.setItem(key, value)
  } catch {
    throw new Error('This device could not save. Free up some browser storage and try again.')
  }
}

function deriveInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 3)
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

export function listNotebooks(): NotebookSummary[] {
  try {
    const parsed: unknown = JSON.parse(read(INDEX_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is NotebookSummary => !!entry && typeof entry.id === 'string' && !!entry.id)
      .map((entry) => ({ id: entry.id, title: typeof entry.title === 'string' ? entry.title : '' }))
  } catch {
    return []
  }
}

function writeIndex(summaries: NotebookSummary[]): void {
  write(INDEX_KEY, JSON.stringify(summaries))
}

export function getCurrentNotebookId(): string {
  return read(CURRENT_KEY)
}

export function setCurrentNotebook(id: string): void {
  write(CURRENT_KEY, id)
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

export function loadNotebook(id: string): Notebook | null {
  try {
    const parsed = JSON.parse(read(notebookKey(id)) || 'null')
    if (!parsed || typeof parsed !== 'object') return null
    const students: Student[] = (Array.isArray(parsed.students) ? parsed.students : [])
      .map((entry: any) => ({ id: num(entry?.id), name: str(entry?.name).trim(), initials: str(entry?.initials).trim() }))
      .filter((student: Student) => student.name)
      .map((student: Student) => ({ ...student, initials: student.initials || deriveInitials(student.name) }))
    const subjects: Subject[] = (Array.isArray(parsed.subjects) ? parsed.subjects : [])
      .map((entry: any) => ({ id: num(entry?.id), name: str(entry?.name).trim(), emoji: str(entry?.emoji).trim() }))
      .filter((subject: Subject) => subject.name)
    const notes: Note[] = (Array.isArray(parsed.notes) ? parsed.notes : [])
      .map((entry: any) => ({ id: num(entry?.id), timestamp: str(entry?.timestamp), student: str(entry?.student).trim(), subject: str(entry?.subject).trim(), text: str(entry?.text).trim() }))
      .filter((note: Note) => note.text || note.student)
    const highest = Math.max(0, ...students.map((s) => s.id), ...subjects.map((s) => s.id), ...notes.map((n) => n.id))
    return {
      id,
      title: str(parsed.title).trim() || 'My class',
      students,
      subjects,
      notes,
      nextId: Math.max(num(parsed.nextId), highest + 1, 1),
    }
  } catch {
    return null
  }
}

export function saveNotebook(notebook: Notebook): Notebook {
  write(notebookKey(notebook.id), JSON.stringify(notebook))
  const index = listNotebooks()
  const mine = { id: notebook.id, title: notebook.title }
  writeIndex(index.some((entry) => entry.id === notebook.id)
    ? index.map((entry) => (entry.id === notebook.id ? mine : entry))
    : [...index, mine])
  return notebook
}

function assignIds<T>(notebook: Notebook, items: Omit<T, 'id'>[]): { items: T[]; nextId: number } {
  let nextId = notebook.nextId
  const withIds = items.map((item) => ({ ...item, id: nextId++ }) as T)
  return { items: withIds, nextId }
}

/** Starts a new class with the default subjects, makes it current, and returns it. */
export function createNotebook(title: string, names: string[]): Notebook {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const empty: Notebook = { id, title: title.trim() || 'My class', students: [], subjects: [], notes: [], nextId: 1 }
  const subjects = assignIds<Subject>(empty, [...DEFAULT_SUBJECTS])
  const withSubjects = { ...empty, subjects: subjects.items, nextId: subjects.nextId }
  const students = assignIds<Student>(withSubjects, names.map((name) => ({ name, initials: deriveInitials(name) })))
  const notebook = saveNotebook({ ...withSubjects, students: students.items, nextId: students.nextId })
  setCurrentNotebook(id)
  return notebook
}

export function deleteNotebook(id: string): void {
  write(notebookKey(id), null)
  writeIndex(listNotebooks().filter((entry) => entry.id !== id))
  removeDraftsFor(id)
  if (getCurrentNotebookId() === id) write(CURRENT_KEY, null)
}

export function addStudents(notebook: Notebook, names: string[]): Notebook {
  if (!names.length) return notebook
  const added = assignIds<Student>(notebook, names.map((name) => ({ name, initials: deriveInitials(name) })))
  return saveNotebook({ ...notebook, students: [...notebook.students, ...added.items], nextId: added.nextId })
}

export function addNotes(notebook: Notebook, drafts: NoteDraft[]): { notebook: Notebook; added: Note[] } {
  if (!drafts.length) return { notebook, added: [] }
  const added = assignIds<Note>(notebook, drafts)
  return { notebook: saveNotebook({ ...notebook, notes: [...notebook.notes, ...added.items], nextId: added.nextId }), added: added.items }
}

export function updateNote(notebook: Notebook, note: Note): Notebook {
  return saveNotebook({ ...notebook, notes: notebook.notes.map((entry) => (entry.id === note.id ? note : entry)) })
}

export function deleteNote(notebook: Notebook, id: number): Notebook {
  return saveNotebook({ ...notebook, notes: notebook.notes.filter((entry) => entry.id !== id) })
}

export function addSubject(notebook: Notebook, subject: Omit<Subject, 'id'>): Notebook {
  const added = assignIds<Subject>(notebook, [subject])
  return saveNotebook({ ...notebook, subjects: [...notebook.subjects, ...added.items], nextId: added.nextId })
}

export function updateSubject(notebook: Notebook, subject: Subject): Notebook {
  return saveNotebook({ ...notebook, subjects: notebook.subjects.map((entry) => (entry.id === subject.id ? subject : entry)) })
}

export function deleteSubject(notebook: Notebook, id: number): Notebook {
  return saveNotebook({ ...notebook, subjects: notebook.subjects.filter((entry) => entry.id !== id) })
}
