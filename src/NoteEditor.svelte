<script lang="ts">
  import { tick, untrack } from 'svelte'
  import Check from '@lucide/svelte/icons/check'
  import Clock from '@lucide/svelte/icons/clock'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import Trash from '@lucide/svelte/icons/trash'
  import X from '@lucide/svelte/icons/x'
  import { readDraft, removeDraft, writeDraft } from './lib/drafts'
  import { timestampNow } from './lib/time'
  import type { Note, NoteDraft, Subject } from './lib/types'

  interface Props {
    notebookId: string
    subjects: Subject[]
    error: string
    onsave: (drafts: NoteDraft[]) => boolean
    onupdate: (note: Note) => boolean
    ondelete: (note: Note) => boolean
    ondraftchange?: (student: string, hasDraft: boolean) => void
    onopenchange?: (open: boolean) => void
  }

  let { notebookId, subjects, error, onsave, onupdate, ondelete, ondraftchange, onopenchange }: Props = $props()
  let dialog: HTMLDialogElement
  let textarea: HTMLTextAreaElement | undefined
  let editing = $state<Note | null>(null)
  let student = $state('')
  let subject = $state('')
  let text = $state('')
  let timestamp = $state('')
  let isOpen = $state(false)
  let readyToDraft = $state(false)
  let draftStatus = $state('')
  let confirmingDelete = $state(false)

  const canSave = $derived(!!student && !!subject && !!text.trim() && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(timestamp))
  const straySubject = $derived(editing && !subjects.some((entry) => entry.name === editing!.subject) ? editing.subject : '')

  $effect(() => {
    const draft = { subject, text, timestamp }
    if (!isOpen || !readyToDraft || editing || !student) return
    const hasDraft = !!subject || !!text.trim()
    // Untracked so the parent's callback (which reads its own state) doesn't become a dependency and loop.
    untrack(() => {
      if (hasDraft) {
        writeDraft(notebookId, student, draft)
        draftStatus = 'Draft saved on this device'
      } else {
        removeDraft(notebookId, student)
        draftStatus = ''
      }
      ondraftchange?.(student, hasDraft)
    })
  })

  export async function open(selectedStudent: string) {
    editing = null
    student = selectedStudent
    confirmingDelete = false
    readyToDraft = false
    const saved = readDraft(notebookId, selectedStudent)
    subject = saved?.subject && subjects.some((entry) => entry.name === saved.subject) ? saved.subject : ''
    text = saved?.text ?? ''
    timestamp = saved?.timestamp || timestampNow()
    draftStatus = saved && (subject || saved.text.trim()) ? 'Draft restored' : ''
    dialog.showModal()
    isOpen = true
    onopenchange?.(true)
    await tick()
    readyToDraft = true
    textarea?.focus()
  }

  export async function edit(note: Note) {
    editing = note
    student = note.student
    subject = note.subject
    text = note.text
    timestamp = note.timestamp || timestampNow()
    draftStatus = ''
    confirmingDelete = false
    readyToDraft = false
    dialog.showModal()
    isOpen = true
    onopenchange?.(true)
    await tick()
    textarea?.focus()
  }

  function handleClose() {
    isOpen = false
    readyToDraft = false
    onopenchange?.(false)
  }

  function close() {
    dialog.close()
  }

  function clearDraft() {
    subject = ''
    text = ''
    timestamp = timestampNow()
    draftStatus = ''
    removeDraft(notebookId, student)
    ondraftchange?.(student, false)
    void tick().then(() => textarea?.focus())
  }

  function save() {
    if (!canSave) return
    const draft = { student, subject, text: text.trim(), timestamp }
    const ok = editing ? onupdate({ ...editing, ...draft }) : onsave([draft])
    if (ok) {
      if (!editing) {
        removeDraft(notebookId, student)
        ondraftchange?.(student, false)
      }
      dialog.close()
    }
  }

  function remove() {
    if (!editing) return
    if (!confirmingDelete) {
      confirmingDelete = true
      return
    }
    if (ondelete(editing)) dialog.close()
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      save()
    }
  }
</script>

<dialog bind:this={dialog} class="note-modal" onclose={handleClose} onclick={(event) => event.target === event.currentTarget && close()}>
  <form method="dialog" onsubmit={(event) => event.preventDefault()}>
    <header class="composer-heading">
      <div class="composer-student">
        <span class="composer-avatar" aria-hidden="true">{student.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}</span>
        <div><p class="eyebrow">{editing ? 'Edit observation' : 'New observation'}</p><h2>{student}</h2></div>
      </div>
      <div class="composer-heading-actions">
        {#if !editing}
          <button class="clear-draft" type="button" onclick={clearDraft} disabled={!subject && !text.trim()}><RotateCcw size={18} /><span>Clear</span></button>
        {/if}
        <button class="modal-close-inline" type="button" onclick={close} aria-label="Close note editor"><X size={23} /></button>
      </div>
    </header>

    <fieldset class="subject-picker">
      <legend>Subject or topic</legend>
      <div class="subject-tiles">
        {#each subjects as entry (entry.id)}
          <button type="button" class="subject-tile" class:selected={subject === entry.name} aria-pressed={subject === entry.name} onclick={() => (subject = entry.name)}>
            <span class="subject-tile-emoji" aria-hidden="true">{entry.emoji || '•'}</span>
            <span>{entry.name}</span>
            <span class="subject-tile-check" aria-hidden="true"><Check size={17} strokeWidth={3} /></span>
          </button>
        {/each}
        {#if straySubject}<button type="button" class="subject-tile selected" aria-pressed="true"><span>•</span><span>{straySubject}</span><Check size={17} /></button>{/if}
      </div>
      {#if !subjects.length}<p class="field-help">Add a subject on the Subjects screen before writing a note.</p>{/if}
    </fieldset>

    <label class="note-label" for="note-text">What did you notice?</label>
    <textarea id="note-text" bind:this={textarea} bind:value={text} class="note-textarea" rows="5" placeholder="Shared the toy car with a friend and let them choose the car." autocapitalize="sentences" onkeydown={onKeydown}></textarea>

    <div class="composer-meta">
      <label class="date-field"><span><Clock size={18} aria-hidden="true" /> Date and time</span><input type="datetime-local" bind:value={timestamp} required /></label>
      {#if draftStatus}<p class="draft-status"><Check size={16} /> {draftStatus}</p>{/if}
    </div>

    {#if error}<p class="modal-error" role="alert">{error}</p>{/if}
    <footer class="modal-actions note-actions" class:with-delete={!!editing}>
      {#if editing}<button class="button danger" type="button" onclick={remove}><Trash size={18} /><span>{confirmingDelete ? 'Delete for sure?' : 'Delete'}</span></button>{/if}
      <button class="button secondary" type="button" onclick={close}>Close</button>
      <button class="button primary save-note" type="button" onclick={save} disabled={!canSave}>{editing ? 'Save changes' : 'Save note'}</button>
    </footer>
  </form>
</dialog>
