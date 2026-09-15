export interface SavedNoteDraft {
  subject: string
  text: string
  timestamp: string
}

const prefix = 'observations-v2.draft:'

function key(notebookId: string, student: string) {
  return `${prefix}${encodeURIComponent(notebookId)}:${encodeURIComponent(student)}`
}

export function readDraft(notebookId: string, student: string): SavedNoteDraft | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(notebookId, student)) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return null
    return {
      subject: typeof parsed.subject === 'string' ? parsed.subject : '',
      text: typeof parsed.text === 'string' ? parsed.text : '',
      timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : '',
    }
  } catch {
    return null
  }
}

export function writeDraft(notebookId: string, student: string, draft: SavedNoteDraft): void {
  try {
    localStorage.setItem(key(notebookId, student), JSON.stringify(draft))
  } catch {
    // The note stays in the open editor if device storage is unavailable.
  }
}

export function removeDraft(notebookId: string, student: string): void {
  try {
    localStorage.removeItem(key(notebookId, student))
  } catch {
    // Nothing else to clear.
  }
}

export function studentsWithDrafts(notebookId: string, students: readonly string[]): Set<string> {
  return new Set(students.filter((student) => {
    const draft = readDraft(notebookId, student)
    return !!draft && (!!draft.subject || !!draft.text.trim())
  }))
}
