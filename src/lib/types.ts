export interface Student {
  name: string
  initials: string
  row: number
}

/** A teacher-controlled subject or developmental topic. */
export interface Subject {
  name: string
  emoji: string
  row: number
}

export const DEFAULT_SUBJECTS: readonly Omit<Subject, 'row'>[] = [
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
  row: number
  timestamp: string
  student: string
  subject: string
  text: string
}

export interface Gradebook {
  id: string
  title: string
  timeZone: string
  dayKey: string
  dayLabel: string
  students: Student[]
  subjects: Subject[]
  notes: Note[]
  notesSheetId: number
  subjectsSheetId: number
}

export interface PickedSpreadsheet {
  id: string
  name: string
  url: string
}
