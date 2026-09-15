<script lang="ts">
  import { onMount, tick } from 'svelte'
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right'
  import BookOpen from '@lucide/svelte/icons/book-open'
  import Check from '@lucide/svelte/icons/check'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ClipboardPen from '@lucide/svelte/icons/clipboard-pen'
  import Plus from '@lucide/svelte/icons/plus'
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import Trash from '@lucide/svelte/icons/trash'
  import Users from '@lucide/svelte/icons/users'
  import X from '@lucide/svelte/icons/x'
  import { studentsWithDrafts } from './lib/drafts'
  import {
    addNotes, addStudents, addSubject, createNotebook, deleteNote, deleteNotebook, deleteSubject,
    getCurrentNotebookId, listNotebooks, loadNotebook, parseRosterNames, setCurrentNotebook, updateNote, updateSubject,
  } from './lib/notebook'
  import { today } from './lib/time'
  import type { Note, NoteDraft, Notebook, NotebookSummary, Subject } from './lib/types'
  import NoteEditor from './NoteEditor.svelte'
  import NotesView from './NotesView.svelte'
  import SubjectsView from './SubjectsView.svelte'

  type View = 'today' | 'notes' | 'subjects'

  let notebook: Notebook | null = null
  let classes: NotebookSummary[] = []
  let day = today()
  let view: View = 'today'
  let creating = false
  let error = ''
  let switcherOpen = false
  let switcher: HTMLElement | undefined
  let setupName = ''
  let setupText = ''
  let rosterModal: HTMLDialogElement
  let rosterTextarea: HTMLTextAreaElement | undefined
  let rosterText = ''
  let noteEditor: any
  let noteOpen = false
  let justSaved = ''
  let justSavedTimer: ReturnType<typeof setTimeout> | undefined
  let draftStudents = new Set<string>()

  $: todayNotes = notebook?.notes.filter((note) => note.timestamp.slice(0, 10) === day.key) ?? []
  $: observedToday = new Set(todayNotes.map((note) => note.student))
  $: rosterNames = parseRosterNames(rosterText, notebook?.students.map((student) => student.name) ?? [])
  $: setupNames = parseRosterNames(setupText)

  onMount(() => {
    classes = listNotebooks()
    const current = loadNotebook(getCurrentNotebookId()) ?? (classes[0] ? loadNotebook(classes[0].id) : null)
    if (current) show(current)
  })

  function show(next: Notebook) {
    notebook = next
    day = today()
    draftStudents = studentsWithDrafts(next.id, next.students.map((student) => student.name))
    setCurrentNotebook(next.id)
    classes = listNotebooks()
  }
  /** Applies a store write. Every write throws only when this device cannot save. */
  function commit(work: () => Notebook): boolean {
    error = ''
    try {
      notebook = work()
      day = today()
      return true
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Something went wrong. Please try again.'
      return false
    }
  }
  function updateDraftStudent(student: string, hasDraft: boolean) {
    const next = new Set(draftStudents)
    if (hasDraft) next.add(student)
    else next.delete(student)
    draftStudents = next
  }

  function createClass() {
    if (!setupNames.length) return
    error = ''
    try {
      show(createNotebook(setupName, setupNames))
      setupName = ''; setupText = ''; creating = false; view = 'today'
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Something went wrong. Please try again.'
    }
  }
  function startNewClass() { switcherOpen = false; error = ''; creating = true }
  function cancelNewClass() { creating = false; error = '' }
  function switchTo(id: string) {
    switcherOpen = false
    if (id === notebook?.id) return
    const next = loadNotebook(id)
    if (!next) { error = 'That class could not be opened on this device.'; classes = listNotebooks(); return }
    error = ''; view = 'today'; show(next)
  }
  function removeClass() {
    switcherOpen = false
    if (!notebook) return
    if (!window.confirm(`Delete “${notebook.title}” and all of its notes from this device? This cannot be undone.`)) return
    deleteNotebook(notebook.id)
    notebook = null; classes = listNotebooks(); view = 'today'; error = ''
    const next = classes[0] ? loadNotebook(classes[0].id) : null
    if (next) show(next)
  }

  async function openRosterEditor() {
    rosterText = ''; error = ''; rosterModal.showModal(); await tick(); rosterTextarea?.focus()
  }
  function saveRoster() {
    if (!notebook || !rosterNames.length) return
    const book = notebook
    if (commit(() => addStudents(book, rosterNames))) rosterModal.close()
  }

  function flashSaved(name: string) {
    clearTimeout(justSavedTimer); justSaved = name
    justSavedTimer = setTimeout(() => (justSaved = ''), 1400)
  }
  function newNote(student: string) { error = ''; void noteEditor?.open(student) }
  function editNote(note: Note) { error = ''; void noteEditor?.edit(note) }

  function saveNotes(drafts: NoteDraft[]): boolean {
    if (!notebook) return false
    const book = notebook
    return commit(() => {
      const result = addNotes(book, drafts)
      if (result.added[0]) flashSaved(result.added[0].student)
      return result.notebook
    })
  }
  const saveNoteEdit = (note: Note) => !!notebook && commit(() => updateNote(notebook!, note))
  const removeNote = (note: Note) => !!notebook && commit(() => deleteNote(notebook!, note.id))
  const createSubject = (subject: Omit<Subject, 'id'>) => !!notebook && commit(() => addSubject(notebook!, subject))
  const saveSubject = (subject: Subject) => !!notebook && commit(() => updateSubject(notebook!, subject))
  const removeSubject = (subject: Subject) => !!notebook && commit(() => deleteSubject(notebook!, subject.id))

  function toggleSwitcher() { if (!switcherOpen) classes = listNotebooks(); switcherOpen = !switcherOpen }
  function closeSwitcherOnOutsideClick(event: PointerEvent) { if (switcherOpen && switcher && !switcher.contains(event.target as Node)) switcherOpen = false }
  function closeSwitcherOnEscape(event: KeyboardEvent) { if (event.key === 'Escape') switcherOpen = false }
</script>

<svelte:window onpointerdown={closeSwitcherOnOutsideClick} onkeydown={closeSwitcherOnEscape} />
<svelte:head><title>Observations</title><meta name="description" content="Quick classroom observations, organized by student and subject." /></svelte:head>

<div class="app-shell">
  <header class="topbar">
    <div class="brand"><span class="brand-mark"><ClipboardPen size={21} aria-hidden="true" /></span><span>Observations</span></div>
    {#if notebook && !creating}
      <nav class="topbar-actions" aria-label="Notebook actions">
        <div class="switcher" bind:this={switcher}>
          <button class="nav-button" onclick={toggleSwitcher} aria-haspopup="menu" aria-expanded={switcherOpen}><ArrowLeftRight size={18} /><span>Switch class</span><ChevronDown size={16} /></button>
          {#if switcherOpen}
            <div class="menu" role="menu" aria-label="Switch class">
              {#each classes as entry (entry.id)}<button class="menu-item" role="menuitemradio" aria-checked={entry.id === notebook.id} onclick={() => switchTo(entry.id)}><span class="menu-check"><Check size={18} /></span><span>{entry.title}</span></button>{/each}
              <hr class="menu-divider" />
              <button class="menu-item" role="menuitem" onclick={startNewClass}><Plus size={18} /><span>New class…</span></button>
              <button class="menu-item menu-item-danger" role="menuitem" onclick={removeClass}><Trash size={18} /><span>Delete this class</span></button>
            </div>
          {/if}
        </div>
      </nav>
    {:else}<span class="privacy-note">🔒 Notes stay on this device</span>{/if}
  </header>

  {#if notebook && !creating}
    <main class="notebook-view">
      {#if view === 'notes'}
        <NotesView notes={notebook.notes} students={notebook.students} subjects={notebook.subjects} onedit={editNote} />
      {:else if view === 'subjects'}
        <SubjectsView subjects={notebook.subjects} onadd={createSubject} onupdate={saveSubject} ondelete={removeSubject} />
      {:else}
        <section class="today-hero">
          <div><p class="eyebrow">{day.label}</p><h1>{notebook.title}</h1></div>
          <div class="today-progress"><strong>{observedToday.size}</strong><span>of {notebook.students.length}</span><small>students noted today</small><div class="progress-track"><span style:width={(notebook.students.length ? observedToday.size / notebook.students.length * 100 : 0) + '%'}></span></div></div>
        </section>
        {#if notebook.students.length}
          <section class="student-grid" aria-label="Students">
            {#each notebook.students as student, index (student.id)}
              {@const count = todayNotes.filter((note) => note.student === student.name).length}
              {@const hasDraft = draftStudents.has(student.name)}
              <button class="student-card" class:just-saved={justSaved === student.name} onclick={() => newNote(student.name)}>
                <span class={'initials color-' + ((index % 5) + 1)}>{student.initials}</span>
                <span class="student-details"><span class="student-name">{student.name}</span><span class="student-observation-status" class:has-notes={count > 0} class:has-draft={hasDraft}>{hasDraft ? `Draft waiting${count ? ` · ${count} ${count === 1 ? 'note' : 'notes'} today` : ''}` : count ? `${count} ${count === 1 ? 'note' : 'notes'} today` : 'No notes yet today'}</span></span>
                <span class="add-observation"><Plus size={20} /><span>{hasDraft ? 'Resume' : 'Add note'}</span></span>
              </button>
            {/each}
            <button class="student-card add-students-card" onclick={openRosterEditor}><span class="initials add-students-mark"><Plus size={22} /></span><span class="student-details"><span class="student-name">Add students</span><span class="student-observation-status">Paste more names</span></span></button>
          </section>
        {:else}
          <section class="empty-state"><div class="empty-icon">👋</div><h2>Add your students</h2><p>Paste your class list once, then tap a name whenever you want to save an observation.</p><button class="button primary" onclick={openRosterEditor}>Add class list</button></section>
        {/if}
      {/if}
    </main>
    <nav class="bottom-nav" aria-label="Main views">
      <button aria-current={view === 'today' ? 'page' : undefined} onclick={() => (view = 'today')}><Users size={23} /><span>Today</span></button>
      <button aria-current={view === 'notes' ? 'page' : undefined} onclick={() => (view = 'notes')}><BookOpen size={23} /><span>All notes</span></button>
      <button aria-current={view === 'subjects' ? 'page' : undefined} onclick={() => (view = 'subjects')}><Settings2 size={23} /><span>Subjects</span></button>
    </nav>
    {#if error && !noteOpen}<div class="toast" role="alert"><span class="toast-icon">!</span><span class="toast-text">{error}</span><button class="toast-dismiss" onclick={() => (error = '')} aria-label="Dismiss">×</button></div>{/if}
  {:else}
    <main class="setup-view">
      <section class="setup-intro"><div class="setup-mark"><ClipboardPen size={26} /></div><h1>Add your roster</h1><p>Paste your class list to start taking notes. Everything stays on this device.</p></section>
      {#if error}<div class="banner error-banner" role="alert"><span>!</span>{error}</div>{/if}
      <form class="setup-form" onsubmit={(event) => { event.preventDefault(); createClass() }}>
        <label class="setup-field"><span>Class name <small>optional</small></span><input bind:value={setupName} maxlength="60" placeholder="Room 4" autocomplete="off" /></label>
        <label class="setup-field"><span>Students, one per line</span><textarea bind:value={setupText} class="roster-textarea" placeholder={'Ava Martinez\nBen Okafor\nChloe Nguyen'}></textarea></label>
        <p class="roster-count">{setupNames.length ? `${setupNames.length} ${setupNames.length === 1 ? 'student' : 'students'} ready` : ''}</p>
        <footer class="modal-actions setup-actions" class:with-cancel={creating}>
          {#if creating}<button class="button secondary" type="button" onclick={cancelNewClass}>Cancel</button>{/if}
          <button class="button primary" type="submit" disabled={!setupNames.length}>Start taking notes</button>
        </footer>
      </form>
    </main>
  {/if}
</div>

{#if notebook && !creating}
  <NoteEditor bind:this={noteEditor} notebookId={notebook.id} subjects={notebook.subjects} {error} onsave={saveNotes} onupdate={saveNoteEdit} ondelete={removeNote} ondraftchange={updateDraftStudent} onopenchange={(open) => (noteOpen = open)} />
{/if}

<dialog bind:this={rosterModal} class="roster-modal" onclick={(event) => event.target === event.currentTarget && rosterModal.close()}>
  <form method="dialog" onsubmit={(event) => { event.preventDefault(); saveRoster() }}>
    <button class="modal-close" type="button" onclick={() => rosterModal.close()}><X size={22} /></button>
    <header class="modal-heading"><div><p class="eyebrow">Class list</p><h2>Add your students</h2></div></header>
    <label class="roster-label" for="roster">Paste one name per line</label>
    <textarea id="roster" bind:this={rosterTextarea} bind:value={rosterText} class="roster-textarea" placeholder={'Ava Martinez\nBen Okafor\nChloe Nguyen'}></textarea>
    <p class="roster-count">{rosterNames.length ? `${rosterNames.length} ${rosterNames.length === 1 ? 'student' : 'students'} ready to add` : ''}</p>
    {#if error}<p class="modal-error">{error}</p>{/if}
    <footer class="modal-actions"><button class="button secondary" type="button" onclick={() => rosterModal.close()}>Cancel</button><button class="button primary" type="submit" disabled={!rosterNames.length}>Add students</button></footer>
  </form>
</dialog>
