export interface Student {
  id: number
  name: string
  initials: string
}

/** A teacher-controlled subject or developmental topic. */
export interface Subject {
  id: number
  name: string
  emoji: string
}

export const DEFAULT_SUBJECTS: readonly Omit<Subject, 'id'>[] = [
  { name: 'Literacy', emoji: '📖' },
  { name: 'Math', emoji: '🔢' },
  { name: 'Science & Inquiry', emoji: '🔎' },
  { name: 'Social & Emotional', emoji: '💛' },
  { name: 'Play & Collaboration', emoji: '🧩' },
  { name: 'Physical Development', emoji: '🏃' },
  { name: 'Arts & Creativity', emoji: '🎨' },
]

/** One observation about one student. Timestamp is local wall time: yyyy-mm-ddTHH:mm. */
export interface Note {
  id: number
  timestamp: string
  student: string
  subject: string
  text: string
}

export type NoteDraft = Omit<Note, 'id'>

/** One class. Everything about it lives in a single localStorage entry. */
export interface Notebook {
  id: string
  title: string
  students: Student[]
  subjects: Subject[]
  notes: Note[]
  /** Next id handed to a student, subject, or note. Ids are never reused, so deleting is safe. */
  nextId: number
}

export interface NotebookSummary {
  id: string
  title: string
}
