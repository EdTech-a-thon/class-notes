export const DIMENSIONS = [
  { key: 'Timely-ness', label: 'On time', emoji: '⏰', description: 'Ready when class starts' },
  { key: 'Prepared-ness', label: 'Prepared', emoji: '✏️', description: 'Materials are ready' },
  { key: 'Attentive-ness', label: 'Focused', emoji: '👀', description: 'Listening and learning' },
  { key: 'Contribution-ness', label: 'Participated', emoji: '💬', description: 'Joined the discussion' },
  { key: 'Collaboration-ness', label: 'Teamwork', emoji: '🤝', description: 'Worked kindly with others' },
] as const

export type DimensionKey = (typeof DIMENSIONS)[number]['key']
export type Grades = Record<DimensionKey, boolean>

export interface Student {
  name: string
  initials: string
  row: number
  grades: Grades
}

/** A subject or topic a note can be filed under. Teachers edit the list on the "Subjects" tab. */
export interface Subject {
  name: string
  emoji: string
}

/** Written into a fresh "Subjects" tab. Broad enough for early years; every row is editable. */
export const DEFAULT_SUBJECTS: readonly Subject[] = [
  { name: 'Literacy', emoji: '📖' },
  { name: 'Math', emoji: '🔢' },
  { name: 'Science & Inquiry', emoji: '🔬' },
  { name: 'Social-Emotional', emoji: '💛' },
  { name: 'Self-Regulation', emoji: '🧘' },
  { name: 'Play & Collaboration', emoji: '🧩' },
  { name: 'Fine Motor', emoji: '✂️' },
  { name: 'Gross Motor', emoji: '🏃' },
  { name: 'Arts & Creativity', emoji: '🎨' },
  { name: 'Language & Communication', emoji: '🗣️' },
]

/** One observation about one student, one row on the "Notes" tab. */
export interface Note {
  row: number
  dateKey: string // yyyy-mm-dd in the spreadsheet's time zone
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
  notesSheetId: number // gid of the "Notes" tab, needed to delete rows
}

export interface PickedSpreadsheet {
  id: string
  name: string
  url: string
}
