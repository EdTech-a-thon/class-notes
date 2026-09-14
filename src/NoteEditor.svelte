<script lang="ts">
  // The note composer: tap the student(s), tap a subject, type what you saw. Everything a
  // kindergarten teacher does here happens with a tablet in one hand, so every target is a chip.
  import { tick } from 'svelte'
  import Check from '@lucide/svelte/icons/check'
  import Plus from '@lucide/svelte/icons/plus'
  import Trash from '@lucide/svelte/icons/trash'
  import X from '@lucide/svelte/icons/x'
  import type { NoteDraft } from './lib/sheets'
  import type { Note, Student, Subject } from './lib/types'

  interface Props {
    students: Student[]
    subjects: Subject[]
    todayKey: string
    saving: boolean
    error: string
    /** Resolves true when the notes were written; the dialog closes itself. */
    onsave: (drafts: NoteDraft[]) => Promise<boolean>
    onupdate: (note: Note) => Promise<boolean>
    ondelete: (note: Note) => Promise<boolean>
    onaddsubject: (subject: Subject) => Promise<boolean>
    onopenchange?: (open: boolean) => void
  }

  let { students, subjects, todayKey, saving, error, onsave, onupdate, ondelete, onaddsubject, onopenchange }: Props =
    $props()

  let dialog: HTMLDialogElement
  let textarea: HTMLTextAreaElement | undefined
  let subjectInput = $state<HTMLInputElement | undefined>() // inside an {#if}, so it must be reactive
  let editing = $state<Note | null>(null)
  let selected = $state<string[]>([]) // student names, roster order
  let subject = $state('')
  let text = $state('')
  let dateKey = $state('')
  let confirmingDelete = $state(false)
  let addingSubject = $state(false)
  let newSubjectName = $state('')
  let newSubjectEmoji = $state('')

  const mode = $derived(editing ? 'edit' : 'new')
  const validDate = $derived(/^\d{4}-\d{2}-\d{2}$/.test(dateKey))
  const canSave = $derived(selected.length > 0 && text.trim().length > 0 && validDate && !saving)
  // A note can name a student who has since left the roster; keep them pickable so the edit round-trips.
  const strayStudent = $derived(
    editing && !students.some((student) => student.name === editing!.student) ? editing.student : '',
  )
  const firstNames = $derived(
    [...students.map((student) => student.name), ...(strayStudent ? [strayStudent] : [])]
      .filter((name) => selected.includes(name))
      .map((name) => name.split(' ')[0]),
  )
  const subjectKnown = $derived(!subject || subjects.some((entry) => entry.name === subject))

  /** Opens the composer for a new note. `student` preselects one name (from the grade editor). */
  export async function open(student?: string) {
    editing = null
    selected = student ? [student] : []
    subject = ''
    text = ''
    dateKey = todayKey
    reset()
    dialog.showModal()
    onopenchange?.(true)
    if (student) {
      await tick()
      textarea?.focus()
    }
  }

  export async function edit(note: Note) {
    editing = note
    selected = [note.student]
    subject = note.subject
    text = note.text
    dateKey = note.dateKey || todayKey
    reset()
    dialog.showModal()
    onopenchange?.(true)
    await tick()
    textarea?.focus()
  }

  function reset() {
    confirmingDelete = false
    addingSubject = false
    newSubjectName = ''
    newSubjectEmoji = ''
  }

  function close() {
    if (!saving) dialog.close()
  }

  function toggleStudent(name: string) {
    if (mode === 'edit') {
      selected = [name]
      return
    }
    selected = selected.includes(name)
      ? selected.filter((entry) => entry !== name)
      : students.filter((student) => student.name === name || selected.includes(student.name)).map((s) => s.name)
  }

  function chooseSubject(name: string) {
    subject = subject === name ? '' : name
  }

  async function startAddSubject() {
    addingSubject = true
    await tick()
    subjectInput?.focus()
  }

  async function submitSubject() {
    const name = newSubjectName.trim().replace(/\s+/g, ' ')
    if (!name) return
    const existing = subjects.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      subject = existing.name
      addingSubject = false
      return
    }
    if (await onaddsubject({ name, emoji: newSubjectEmoji.trim() })) {
      subject = name
      addingSubject = false
      newSubjectName = ''
      newSubjectEmoji = ''
    }
  }

  async function save() {
    if (!canSave) return
    const body = text.trim()
    const ok = editing
      ? await onupdate({ ...editing, student: selected[0], subject, text: body, dateKey })
      : await onsave(selected.map((student) => ({ student, subject, text: body, dateKey })))
    if (ok) dialog.close()
  }

  async function remove() {
    if (!editing) return
    if (!confirmingDelete) {
      confirmingDelete = true
      return
    }
    if (await ondelete(editing)) dialog.close()
  }

  function onKeydown(event: KeyboardEvent) {
    // Cmd/Ctrl+Enter saves from the textarea; plain Enter keeps writing.
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void save()
    }
  }
</script>

<dialog
  bind:this={dialog}
  class="note-modal"
  onclose={() => onopenchange?.(false)}
  onclick={(event) => event.target === event.currentTarget && close()}
>
  <form method="dialog" onsubmit={(event) => event.preventDefault()}>
    <button class="modal-close" type="button" onclick={close} aria-label="Close note editor" disabled={saving}>
      <X size={22} aria-hidden="true" />
    </button>

    <header class="modal-heading note-heading">
      <div>
        <p class="eyebrow">{mode === 'edit' ? 'Edit note' : 'New note'}</p>
        <h2>
          {#if firstNames.length === 0}
            Who is this about?
          {:else if firstNames.length === 1}
            {firstNames[0]}
          {:else if firstNames.length === 2}
            {firstNames[0]} and {firstNames[1]}
          {:else}
            {firstNames[0]} and {firstNames.length - 1} others
          {/if}
        </h2>
      </div>
    </header>

    <fieldset class="chip-group">
      <legend>
        {mode === 'edit' ? 'Student' : 'Tap one or more students'}
      </legend>
      {#if students.length}
        <div class="chips">
          {#each students as student, index (student.name)}
            <button
              type="button"
              class="chip student-chip"
              class:selected={selected.includes(student.name)}
              aria-pressed={selected.includes(student.name)}
              onclick={() => toggleStudent(student.name)}
              disabled={saving}
            >
              <span class={'chip-initials color-' + ((index % 5) + 1)}>{student.initials}</span>
              <span class="chip-label">{student.name}</span>
              <span class="chip-check" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
            </button>
          {/each}
          {#if strayStudent}
            <button
              type="button"
              class="chip student-chip"
              class:selected={selected.includes(strayStudent)}
              aria-pressed={selected.includes(strayStudent)}
              onclick={() => toggleStudent(strayStudent)}
              disabled={saving}
              title="No longer on the roster"
            >
              <span class="chip-initials">?</span>
              <span class="chip-label">{strayStudent}</span>
              <span class="chip-check" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
            </button>
          {/if}
        </div>
      {:else}
        <p class="chip-empty">Add students to the roster first.</p>
      {/if}
    </fieldset>

    <fieldset class="chip-group">
      <legend>Subject or topic <span class="legend-hint">(optional)</span></legend>
      <div class="chips">
        {#each subjects as entry (entry.name)}
          <button
            type="button"
            class="chip subject-chip"
            class:selected={subject === entry.name}
            aria-pressed={subject === entry.name}
            onclick={() => chooseSubject(entry.name)}
            disabled={saving}
          >
            {#if entry.emoji}<span class="chip-emoji" aria-hidden="true">{entry.emoji}</span>{/if}
            <span class="chip-label">{entry.name}</span>
          </button>
        {/each}
        {#if !subjectKnown}
          <!-- The subject on this note was removed from the sheet; keep it selectable so the edit round-trips. -->
          <button type="button" class="chip subject-chip selected" aria-pressed="true" onclick={() => chooseSubject(subject)}>
            <span class="chip-label">{subject}</span>
          </button>
        {/if}
        {#if !addingSubject}
          <button type="button" class="chip add-chip" onclick={startAddSubject} disabled={saving}>
            <Plus size={16} aria-hidden="true" /><span class="chip-label">New subject</span>
          </button>
        {/if}
      </div>
      {#if addingSubject}
        <div class="new-subject">
          <input
            class="new-subject-emoji"
            type="text"
            bind:value={newSubjectEmoji}
            maxlength="4"
            placeholder="🙂"
            aria-label="Emoji (optional)"
            disabled={saving}
          />
          <input
            bind:this={subjectInput}
            class="new-subject-name"
            type="text"
            bind:value={newSubjectName}
            maxlength="60"
            placeholder="Subject name"
            aria-label="Subject name"
            disabled={saving}
            onkeydown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submitSubject()
              } else if (event.key === 'Escape') {
                event.stopPropagation()
                addingSubject = false
              }
            }}
          />
          <button class="button primary new-subject-add" type="button" onclick={submitSubject} disabled={saving || !newSubjectName.trim()}>
            Add
          </button>
          <button class="button secondary new-subject-cancel" type="button" onclick={() => (addingSubject = false)} disabled={saving} aria-label="Cancel new subject">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      {/if}
    </fieldset>

    <label class="note-label" for="note-text">What did you notice?</label>
    <textarea
      id="note-text"
      bind:this={textarea}
      bind:value={text}
      class="note-textarea"
      rows="4"
      placeholder="Counted the blocks, then sorted them by colour without being asked."
      disabled={saving}
      autocapitalize="sentences"
      onkeydown={onKeydown}
    ></textarea>

    <div class="note-meta">
      <label class="date-field">
        <span>Date</span>
        <input type="date" bind:value={dateKey} max={todayKey} required disabled={saving} />
      </label>
      {#if mode === 'new' && selected.length > 1}
        <p class="note-hint">One note will be saved for each of the {selected.length} students.</p>
      {/if}
    </div>

    {#if error}<p class="modal-error" role="alert">{error}</p>{/if}

    <footer class="modal-actions note-actions" class:with-delete={mode === 'edit'}>
      {#if mode === 'edit'}
        <button class="button danger" type="button" onclick={remove} disabled={saving}>
          <Trash size={18} aria-hidden="true" />
          <span>{confirmingDelete ? 'Really delete?' : 'Delete'}</span>
        </button>
      {/if}
      <button class="button secondary" type="button" onclick={close} disabled={saving}>Cancel</button>
      <button class="button primary" type="button" onclick={save} disabled={!canSave}>
        {#if saving}
          Saving…
        {:else if mode === 'edit'}
          Save changes
        {:else if selected.length > 1}
          Save {selected.length} notes
        {:else}
          Save note
        {/if}
      </button>
    </footer>
  </form>
</dialog>
