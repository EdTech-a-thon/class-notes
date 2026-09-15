const pad = (value: number) => String(value).padStart(2, '0')

/** Local wall time as yyyy-mm-ddTHH:mm, the value a datetime-local input expects. */
export function timestampNow(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export function today(now = new Date()) {
  return {
    key: timestampNow(now).slice(0, 10),
    label: new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now),
  }
}

export function formatTimestamp(timestamp: string): string {
  const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return timestamp
  const [, year, month, day, hour, minute] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  const sameYear = Number(year) === new Date().getFullYear()
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }), hour: 'numeric', minute: '2-digit',
  }).format(date)
}
