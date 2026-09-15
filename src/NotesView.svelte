<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import Copy from '@lucide/svelte/icons/copy'
  import Search from '@lucide/svelte/icons/search'
  import X from '@lucide/svelte/icons/x'
  import { formatTimestamp } from './lib/time'
  import type { Note, Student, Subject } from './lib/types'

  interface Props {
    notes: Note[]
    students: Student[]
    subjects: Subject[]
    onedit: (note: Note) => void
  }

  let { notes, students, subjects, onedit }: Props = $props()
  let studentFilter = $state('')
  let subjectFilter = $state('')
  let query = $state('')
  let copied = $state('')

  const studentOptions = $derived([...new Set([...students.map((student) => student.name), ...notes.map((note) => note.student)])].filter(Boolean))
  const subjectOptions = $derived([...new Set([...subjects.map((subject) => subject.name), ...notes.map((note) => note.subject)])].filter(Boolean))
  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase()
    return notes
      .filter((note) => !studentFilter || note.student === studentFilter)
      .filter((note) => !subjectFilter || note.subject === subjectFilter)
      .filter((note) => !needle || note.text.toLowerCase().includes(needle))
      .slice()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id - a.id)
  })
  const groupBy = $derived(studentFilter ? 'subject' : 'student')
  const groups = $derived.by(() => {
    const buckets = new Map<string, Note[]>()
    filtered.forEach((note) => {
      const key = groupBy === 'student' ? note.student : note.subject
      buckets.set(key, [...(buckets.get(key) ?? []), note])
    })
    return [...buckets.entries()].map(([key, groupNotes]) => ({ key, notes: groupNotes }))
  })
  const activeFilters = $derived(!!studentFilter || !!subjectFilter || !!query.trim())

  const subjectLabel = (name: string) => {
    const emoji = subjects.find((subject) => subject.name === name)?.emoji
    return emoji ? `${emoji} ${name}` : name
  }
  const initials = (name: string) => students.find((student) => student.name === name)?.initials ?? '?'

  function clearFilters() {
    studentFilter = ''
    subjectFilter = ''
    query = ''
  }

  async function copyGroup(key: string, groupNotes: Note[]) {
    const heading = groupBy === 'student' ? key : `${studentFilter} — ${key}`
    const lines = groupNotes.map((note) => `${formatTimestamp(note.timestamp)} · ${groupBy === 'student' ? note.subject : note.student}: ${note.text}`)
    try {
      await navigator.clipboard.writeText([heading, ...lines].join('\n'))
      copied = key
      setTimeout(() => copied === key && (copied = ''), 1500)
    } catch {
      // Clipboard permission was unavailable; the notes remain visible.
    }
  }
</script>

<section class="page-heading">
  <div class="heading-text">
    <p class="eyebrow">Report-card helper</p>
    <h1>All observations</h1>
    <p class="subtext">Choose a student to see their notes grouped by subject.</p>
  </div>
</section>

{#if notes.length}
  <div class="filter-bar" role="group" aria-label="Filter observations">
    <label class="filter-field"><span>Student</span><select bind:value={studentFilter}><option value="">All students</option>{#each studentOptions as name}<option>{name}</option>{/each}</select></label>
    <label class="filter-field"><span>Subject</span><select bind:value={subjectFilter}><option value="">All subjects</option>{#each subjectOptions as name}<option value={name}>{subjectLabel(name)}</option>{/each}</select></label>
    <label class="filter-field filter-search"><span>Search notes</span><span class="search-box"><Search size={18} aria-hidden="true" /><input type="search" bind:value={query} placeholder="Try “counted” or “shared”" /></span></label>
    {#if activeFilters}<button class="text-button clear-filters" type="button" onclick={clearFilters}><X size={16} /> Clear</button>{/if}
  </div>
{/if}

{#if !notes.length}
  <section class="empty-state"><div class="empty-icon">📝</div><h2>No observations yet</h2><p>Tap a student on Today to write the first note.</p></section>
{:else if !groups.length}
  <section class="empty-state"><div class="empty-icon">🔍</div><h2>No matches</h2><p>Try a different student, subject, or search word.</p><button class="button secondary" onclick={clearFilters}>Clear filters</button></section>
{:else}
  <p class="group-explainer">{studentFilter ? `${studentFilter} · grouped by subject` : 'Grouped by student'} · newest first</p>
  <div class="note-groups">
    {#each groups as group (groupBy + group.key)}
      <section class="note-group">
        <header class="note-group-heading">
          {#if groupBy === 'student'}<span class="initials group-initials">{initials(group.key)}</span>{:else}<span class="group-emoji">{subjects.find((subject) => subject.name === group.key)?.emoji ?? '•'}</span>{/if}
          <h2>{group.key || 'Unfiled'}</h2><span class="group-count">{group.notes.length}</span>
          <button class="group-copy" type="button" onclick={() => copyGroup(group.key, group.notes)}>
            {#if copied === group.key}<Check size={16} /><span>Copied</span>{:else}<Copy size={16} /><span>Copy</span>{/if}
          </button>
        </header>
        <ul class="note-list">
          {#each group.notes as note (note.id)}
            <li><button class="note-card" type="button" onclick={() => onedit(note)}>
              <span class="note-topline"><time datetime={note.timestamp}>{formatTimestamp(note.timestamp)}</time><span class="note-tag">{groupBy === 'student' ? subjectLabel(note.subject) : note.student}</span></span>
              <span class="note-text">{note.text}</span>
            </button></li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}
