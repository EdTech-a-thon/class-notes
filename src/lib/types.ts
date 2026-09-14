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

export interface Gradebook {
  id: string
  title: string
  timeZone: string
  dayKey: string
  dayLabel: string
  students: Student[]
}

export interface PickedSpreadsheet {
  id: string
  name: string
  url: string
}
