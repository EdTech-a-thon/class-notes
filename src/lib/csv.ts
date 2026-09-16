import type { Note } from './types'

/** Quotes a cell the way spreadsheets expect: wrap when it holds a comma, quote, or line break. */
function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** One row per observation, with the date and time split so spreadsheets can sort and filter on either. */
export function notesToCsv(notes: readonly Note[]): string {
  const rows = notes
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id - b.id)
    .map((note) => [note.timestamp.slice(0, 10), note.timestamp.slice(11), note.student, note.category, note.text])
  return [['Date', 'Time', 'Student', 'Category', 'Note'], ...rows].map((row) => row.map(cell).join(',')).join('\r\n')
}

/** Hands the browser a file to save. The BOM makes Excel read accented names correctly. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function csvFilename(title: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'class'
  return `${slug}-observations.csv`
}
