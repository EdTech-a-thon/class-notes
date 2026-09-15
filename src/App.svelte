<script lang="ts">
  import { onMount, tick } from 'svelte'
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right'
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right'
  import BookOpen from '@lucide/svelte/icons/book-open'
  import Check from '@lucide/svelte/icons/check'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ClipboardPen from '@lucide/svelte/icons/clipboard-pen'
  import CopyPlus from '@lucide/svelte/icons/copy-plus'
  import FolderOpen from '@lucide/svelte/icons/folder-open'
  import LogOut from '@lucide/svelte/icons/log-out'
  import Plus from '@lucide/svelte/icons/plus'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import Users from '@lucide/svelte/icons/users'
  import X from '@lucide/svelte/icons/x'
  import {
    BrokerError, connectDrive, consumeArrivalError, describeArrivalError,
    getConnection, signIn, signOut, type DriveConnection,
  } from './lib/broker'
  import { authorize, clearAuthorization, missingTemplateConfig, pickSpreadsheet, templateCopyUrl } from './lib/google'
  import {
    getRecentSpreadsheets, getRememberedSpreadsheet, hasCopiedTemplate, markTemplateCopied,
    forgetEverything, rememberSpreadsheet, type RememberedSpreadsheet,
  } from './lib/setup'
  import { studentsWithDrafts } from './lib/drafts'
  import {
    addNotes, addStudents, addSubject, deleteNote, deleteSubject, isAuthorizationError,
    loadGradebook, parseRosterNames, updateNote, updateSubject, type NoteDraft,
  } from './lib/sheets'
  import type { Gradebook, Note, Student, Subject } from './lib/types'
  import NoteEditor from './NoteEditor.svelte'
  import NotesView from './NotesView.svelte'
  import SubjectsView from './SubjectsView.svelte'

  type Session = 'checking' | 'signed_out' | 'not_connected' | 'invalid' | 'ready'
  type View = 'today' | 'notes' | 'subjects'

  let session: Session = 'checking'
  let view: View = 'today'
  let connection: DriveConnection | null = null
  let gradebook: Gradebook | null = null
  let pendingGradebook: Gradebook | null = null
  let spreadsheet: RememberedSpreadsheet | null = null
  let recent: RememberedSpreadsheet[] = []
  let templateCopied = false
  let autoOpening = false
  let loading = false
  let saving = false
  let error = ''
  let notice = ''
  let switcherOpen = false
  let switcher: HTMLElement | undefined
  let rosterModal: HTMLDialogElement
  let rosterTextarea: HTMLTextAreaElement | undefined
  let rosterText = ''
  let rosterOpen = false
  let noteEditor: any
  let noteOpen = false
  let justSaved = ''
  let justSavedTimer: ReturnType<typeof setTimeout> | undefined
  let draftStudents = new Set<string>()

  $: todayNotes = gradebook?.notes.filter((note) => note.timestamp.slice(0, 10) === gradebook?.dayKey) ?? []
  $: observedToday = new Set(todayNotes.map((note) => note.student))
  $: rosterNames = parseRosterNames(rosterText, gradebook?.students.map((student) => student.name) ?? [])
  $: signedIn = session !== 'checking' && session !== 'signed_out'
  $: driveReady = session === 'ready'
  $: stepsDone = [signedIn, driveReady, templateCopied || !!spreadsheet, !!spreadsheet, false]
  $: currentStep = stepsDone.indexOf(false) + 1
  $: stepState = (step: number) => stepsDone[step - 1] ? 'done' : step === currentStep ? 'current' : 'locked'

  onMount(() => {
    spreadsheet = getRememberedSpreadsheet()
    templateCopied = hasCopiedTemplate()
    autoOpening = !!spreadsheet
    const arrival = consumeArrivalError()
    if (arrival === 'access_denied') notice = describeArrivalError(arrival)
    else if (arrival) error = describeArrivalError(arrival)
    void refreshSession()
  })

  function resetMessages() { error = ''; notice = '' }
  function refreshDraftStudents(book = gradebook) {
    draftStudents = book ? studentsWithDrafts(book.id, book.students.map((student) => student.name)) : new Set()
  }
  function updateDraftStudent(student: string, hasDraft: boolean) {
    const next = new Set(draftStudents)
    if (hasDraft) next.add(student)
    else next.delete(student)
    draftStudents = next
  }
  function showError(caught: unknown) { error = caught instanceof Error ? caught.message : 'Something went wrong. Please try again.' }
  function sessionFromConnection(current: DriveConnection | null): Session {
    if (!current) return 'signed_out'
    if (!current.connected) return 'not_connected'
    return current.status === 'invalid' ? 'invalid' : 'ready'
  }

  async function refreshSession() {
    try {
      connection = await getConnection()
      session = sessionFromConnection(connection)
    } catch (caught) {
      session = 'signed_out'
      showError(caught)
    }
    if (session === 'ready' && spreadsheet) await openGradebook(spreadsheet.id)
    autoOpening = false
  }

  function handleFailure(caught: unknown) {
    if (caught instanceof BrokerError) {
      if (caught.signedOut) session = 'signed_out'
      else if (caught.status === 404) session = 'not_connected'
      else if (caught.status === 409) session = 'invalid'
      if (caught.signedOut || caught.needsConnection) { clearAuthorization(); gradebook = null; pendingGradebook = null }
    } else if (isAuthorizationError(caught)) clearAuthorization()
    showError(caught)
  }

  async function startSignIn() {
    resetMessages(); loading = true
    try { await signIn() } catch (caught) { showError(caught); loading = false }
  }
  async function startConnectDrive() {
    resetMessages(); loading = true
    try { await connectDrive() } catch (caught) { showError(caught); loading = false }
  }
  async function endSession() {
    resetMessages(); loading = true
    try { await signOut() } catch (caught) { showError(caught) }
    finally {
      clearAuthorization(); forgetEverything(); gradebook = null; pendingGradebook = null; spreadsheet = null
      recent = []; view = 'today'; templateCopied = false; autoOpening = false; connection = null
      session = 'signed_out'; loading = false
    }
  }

  async function openGradebook(id: string) {
    resetMessages(); loading = true
    try {
      const token = await authorize()
      gradebook = await loadGradebook(id, token)
      refreshDraftStudents(gradebook)
      if (gradebook.title && gradebook.title !== spreadsheet?.name) {
        spreadsheet = { id, name: gradebook.title }; rememberSpreadsheet(spreadsheet)
      }
    } catch (caught) { handleFailure(caught) }
    finally { loading = false }
  }

  function copyTemplate() { markTemplateCopied(); templateCopied = true }
  async function chooseSpreadsheet() {
    resetMessages(); loading = true
    try {
      const picked = await pickSpreadsheet()
      if (!picked) return
      const token = await authorize()
      pendingGradebook = await loadGradebook(picked.id, token)
      spreadsheet = { id: picked.id, name: pendingGradebook.title || picked.name }
      rememberSpreadsheet(spreadsheet); templateCopied = true
    } catch (caught) { handleFailure(caught) }
    finally { loading = false }
  }
  function openNotebook() {
    if (!spreadsheet) return
    if (pendingGradebook) { resetMessages(); gradebook = pendingGradebook; refreshDraftStudents(gradebook); pendingGradebook = null; return }
    void openGradebook(spreadsheet.id)
  }

  async function openRosterEditor() {
    rosterText = ''; resetMessages(); rosterOpen = true; rosterModal.showModal(); await tick(); rosterTextarea?.focus()
  }
  async function saveRoster() {
    if (!gradebook || !rosterNames.length) return
    saving = true; resetMessages()
    try {
      const token = await authorize()
      await addStudents(gradebook.id, rosterNames, token)
      gradebook = await loadGradebook(gradebook.id, token)
      refreshDraftStudents(gradebook)
      rosterModal.close()
    } catch (caught) { handleFailure(caught); if (!gradebook) rosterModal.close() }
    finally { saving = false }
  }

  function flashSaved(name: string) {
    clearTimeout(justSavedTimer); justSaved = name
    justSavedTimer = setTimeout(() => (justSaved = ''), 1400)
  }
  function newNote(student: string) { resetMessages(); void noteEditor?.open(student) }
  function editNote(note: Note) { resetMessages(); void noteEditor?.edit(note) }

  async function saveNotes(drafts: NoteDraft[]): Promise<boolean> {
    if (!gradebook) return false
    saving = true; resetMessages()
    try {
      const token = await authorize()
      const added = await addNotes(gradebook.id, drafts, token)
      gradebook = { ...gradebook, notes: [...gradebook.notes, ...added] }
      if (added[0]) flashSaved(added[0].student)
      return true
    } catch (caught) { handleFailure(caught); return false }
    finally { saving = false }
  }
  async function saveNoteEdit(note: Note): Promise<boolean> {
    if (!gradebook) return false
    saving = true; resetMessages()
    try {
      const token = await authorize(); await updateNote(gradebook.id, note, token)
      gradebook = { ...gradebook, notes: gradebook.notes.map((entry) => entry.row === note.row ? note : entry) }
      return true
    } catch (caught) { handleFailure(caught); return false }
    finally { saving = false }
  }
  async function removeNote(note: Note): Promise<boolean> {
    if (!gradebook) return false
    saving = true; resetMessages()
    try {
      const token = await authorize(); await deleteNote(gradebook.id, gradebook.notesSheetId, note.row, token)
      gradebook = { ...gradebook, notes: gradebook.notes.filter((entry) => entry.row !== note.row).map((entry) => entry.row > note.row ? { ...entry, row: entry.row - 1 } : entry) }
      return true
    } catch (caught) { handleFailure(caught); return false }
    finally { saving = false }
  }

  async function createSubject(subject: Omit<Subject, 'row'>): Promise<boolean> {
    if (!gradebook) return false
    saving = true; resetMessages()
    try {
      const token = await authorize(); const added = await addSubject(gradebook.id, subject, token)
      gradebook = { ...gradebook, subjects: [...gradebook.subjects, added] }; return true
    } catch (caught) { handleFailure(caught); return false }
    finally { saving = false }
  }
  async function saveSubject(subject: Subject): Promise<boolean> {
    if (!gradebook) return false
    saving = true; resetMessages()
    try {
      const token = await authorize(); await updateSubject(gradebook.id, subject, token)
      gradebook = { ...gradebook, subjects: gradebook.subjects.map((entry) => entry.row === subject.row ? subject : entry) }; return true
    } catch (caught) { handleFailure(caught); return false }
    finally { saving = false }
  }
  async function removeSubject(subject: Subject): Promise<boolean> {
    if (!gradebook) return false
    saving = true; resetMessages()
    try {
      const token = await authorize(); await deleteSubject(gradebook.id, gradebook.subjectsSheetId, subject.row, token)
      gradebook = { ...gradebook, subjects: gradebook.subjects.filter((entry) => entry.row !== subject.row).map((entry) => entry.row > subject.row ? { ...entry, row: entry.row - 1 } : entry) }
      return true
    } catch (caught) { handleFailure(caught); return false }
    finally { saving = false }
  }

  function toggleSwitcher() { if (!switcherOpen) recent = getRecentSpreadsheets(); switcherOpen = !switcherOpen }
  function closeSwitcherOnOutsideClick(event: PointerEvent) { if (switcherOpen && switcher && !switcher.contains(event.target as Node)) switcherOpen = false }
  function closeSwitcherOnEscape(event: KeyboardEvent) { if (event.key === 'Escape') switcherOpen = false }
  async function switchTo(id: string, name: string) {
    switcherOpen = false; if (id === gradebook?.id) return; resetMessages(); loading = true
    try {
      const token = await authorize(); const next = await loadGradebook(id, token)
      spreadsheet = { id, name: next.title || name }; rememberSpreadsheet(spreadsheet); gradebook = next; view = 'today'
      refreshDraftStudents(next)
    } catch (caught) { handleFailure(caught) }
    finally { loading = false }
  }
  async function switchViaPicker() {
    switcherOpen = false; resetMessages(); loading = true
    try { const picked = await pickSpreadsheet(); if (picked) await switchTo(picked.id, picked.name) }
    catch (caught) { handleFailure(caught) }
    finally { loading = false }
  }
  const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`
</script>

<svelte:window onpointerdown={closeSwitcherOnOutsideClick} onkeydown={closeSwitcherOnEscape} />
<svelte:head><title>Observations</title><meta name="description" content="Quick classroom observations, organized by student and subject." /></svelte:head>

<div class="app-shell">
  <header class="topbar">
    <div class="brand"><span class="brand-mark"><ClipboardPen size={21} aria-hidden="true" /></span><span>Observations</span></div>
    {#if gradebook}
      <nav class="topbar-actions" aria-label="Notebook actions">
        <a class="nav-button" href={sheetUrl(gradebook.id)} target="_blank" rel="noreferrer"><span>Open sheet</span><ArrowUpRight size={18} /></a>
        <button class="nav-button icon-only" onclick={() => openGradebook(gradebook!.id)} disabled={loading} aria-label="Refresh"><RefreshCw size={20} class={loading ? 'spin' : ''} /></button>
        <div class="switcher" bind:this={switcher}>
          <button class="nav-button" onclick={toggleSwitcher} disabled={loading} aria-haspopup="menu" aria-expanded={switcherOpen}><ArrowLeftRight size={18} /><span>Switch class</span><ChevronDown size={16} /></button>
          {#if switcherOpen}
            <div class="menu" role="menu" aria-label="Switch class">
              {#each recent as sheet (sheet.id)}<button class="menu-item" role="menuitemradio" aria-checked={sheet.id === gradebook.id} onclick={() => switchTo(sheet.id, sheet.name)}><span class="menu-check"><Check size={18} /></span><span>{sheet.name}</span></button>{/each}
              {#if recent.length}<hr class="menu-divider" />{/if}
              <button class="menu-item" onclick={switchViaPicker}><FolderOpen size={18} /><span>Choose another notebook…</span></button>
              <a class="menu-item" class:disabled={missingTemplateConfig} href={templateCopyUrl(connection?.googleEmail)} target="_blank" rel="noreferrer" onclick={(event) => { if (missingTemplateConfig) event.preventDefault(); else switcherOpen = false }}><CopyPlus size={18} /><span>New class from template</span></a>
            </div>
          {/if}
        </div>
        <button class="nav-button icon-only" onclick={endSession} disabled={loading} aria-label="Sign out"><LogOut size={19} /></button>
      </nav>
    {:else if connection?.googleEmail}
      <nav class="topbar-actions"><span class="privacy-note">{connection.googleEmail}</span><button class="text-button" onclick={endSession}>Sign out</button></nav>
    {:else}<span class="privacy-note">🔒 Notes stay in your Google Drive</span>{/if}
  </header>

  {#if gradebook}
    <main class="notebook-view">
      {#if view === 'notes'}
        <NotesView notes={gradebook.notes} students={gradebook.students} subjects={gradebook.subjects} onedit={editNote} />
      {:else if view === 'subjects'}
        <SubjectsView subjects={gradebook.subjects} {saving} onadd={createSubject} onupdate={saveSubject} ondelete={removeSubject} />
      {:else}
        <section class="today-hero">
          <div><p class="eyebrow">{gradebook.dayLabel}</p><h1>{gradebook.title}</h1></div>
          <div class="today-progress"><strong>{observedToday.size}</strong><span>of {gradebook.students.length}</span><small>students noted today</small><div class="progress-track"><span style:width={(gradebook.students.length ? observedToday.size / gradebook.students.length * 100 : 0) + '%'}></span></div></div>
        </section>
        {#if gradebook.students.length}
          <section class="student-grid" aria-label="Students">
            {#each gradebook.students as student, index (student.name)}
              {@const count = todayNotes.filter((note) => note.student === student.name).length}
              {@const hasDraft = draftStudents.has(student.name)}
              <button class="student-card" class:just-saved={justSaved === student.name} onclick={() => newNote(student.name)}>
                <span class={'initials color-' + ((index % 5) + 1)}>{student.initials}</span>
                <span class="student-details"><span class="student-name">{student.name}</span><span class="student-observation-status" class:has-notes={count > 0} class:has-draft={hasDraft}>{hasDraft ? `Draft waiting${count ? ` · ${count} ${count === 1 ? 'note' : 'notes'} today` : ''}` : count ? `${count} ${count === 1 ? 'note' : 'notes'} today` : 'No notes yet today'}</span></span>
                <span class="add-observation"><Plus size={20} /><span>{hasDraft ? 'Resume' : 'Add note'}</span></span>
              </button>
            {/each}
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
  {:else if autoOpening}
    <main class="setup-view opening-view"><p>Opening your observation notebook…</p></main>
  {:else}
    <main class="setup-view">
      <section class="setup-intro"><div class="setup-mark"><ClipboardPen size={26} /></div><h1>Set up your observation notebook</h1><p>Notes go straight to a Google Sheet that only you control.</p></section>
      {#if error}<div class="banner error-banner" role="alert"><span>!</span>{error}</div>{/if}
      {#if notice}<div class="banner success-banner" role="status"><span>✓</span>{notice}</div>{/if}
      {#if missingTemplateConfig}<div class="banner error-banner"><span>!</span>The new observation template has not been connected yet.</div>{/if}
      <ol class="steps">
        <li class={'step ' + stepState(1)}><span class="step-mark">{signedIn ? '✓' : '1'}</span><div class="step-text"><strong>{signedIn ? 'Signed in' : 'Sign in with Google'}</strong><span>{signedIn ? connection?.googleEmail : 'Use the account where you keep your class files.'}</span></div><button class="button step-action" class:primary={stepState(1) === 'current'} class:secondary={stepState(1) !== 'current'} onclick={startSignIn} disabled={loading || stepState(1) !== 'current'}>{session === 'checking' ? 'Checking…' : 'Sign in'}</button></li>
        <li class={'step ' + stepState(2)}><span class="step-mark">{driveReady ? '✓' : '2'}</span><div class="step-text"><strong>{driveReady ? 'Google Drive connected' : 'Connect Google Drive'}</strong><span>The app can only open the sheet you choose.</span></div><button class="button step-action" class:primary={stepState(2) === 'current'} class:secondary={stepState(2) !== 'current'} onclick={startConnectDrive} disabled={loading || stepState(2) !== 'current'}>{session === 'invalid' ? 'Reconnect' : 'Connect'}</button></li>
        <li class={'step ' + stepState(3)}><span class="step-mark">{stepsDone[2] ? '✓' : '3'}</span><div class="step-text"><strong>{stepsDone[2] ? 'Template copied' : 'Make your notebook'}</strong><span>Make a private copy of the three-tab observation template.</span></div><a class="button step-action" class:primary={stepState(3) === 'current'} class:secondary={stepState(3) !== 'current'} class:disabled={stepState(3) !== 'current' || missingTemplateConfig} href={templateCopyUrl(connection?.googleEmail)} target="_blank" rel="noreferrer" onclick={(event) => { if (stepState(3) !== 'current' || missingTemplateConfig) event.preventDefault(); else copyTemplate() }}>Make a copy</a></li>
        <li class={'step ' + stepState(4)}><span class="step-mark">{stepsDone[3] ? '✓' : '4'}</span><div class="step-text"><strong>{stepsDone[3] ? 'Notebook selected' : 'Choose your copy'}</strong><span>{spreadsheet?.name || 'Pick the copy you just made.'}</span></div><button class="button step-action" class:primary={stepState(4) === 'current'} class:secondary={stepState(4) !== 'current'} onclick={chooseSpreadsheet} disabled={loading || stepState(4) !== 'current'}>Choose notebook</button></li>
        <li class={'step ' + stepState(5)}><span class="step-mark">5</span><div class="step-text"><strong>Start taking notes</strong><span>Your class list, subjects, and observations will stay in this sheet.</span></div><button class="button primary step-action" onclick={openNotebook} disabled={loading || stepState(5) !== 'current'}>Open notebook</button></li>
      </ol>
    </main>
  {/if}
</div>

{#if gradebook}
  <NoteEditor bind:this={noteEditor} notebookId={gradebook.id} subjects={gradebook.subjects} timeZone={gradebook.timeZone} {saving} {error} onsave={saveNotes} onupdate={saveNoteEdit} ondelete={removeNote} ondraftchange={updateDraftStudent} onopenchange={(open) => (noteOpen = open)} />
{/if}

<dialog bind:this={rosterModal} class="roster-modal" onclose={() => (rosterOpen = false)} onclick={(event) => event.target === event.currentTarget && !saving && rosterModal.close()}>
  <form method="dialog" onsubmit={(event) => { event.preventDefault(); void saveRoster() }}>
    <button class="modal-close" type="button" onclick={() => rosterModal.close()}><X size={22} /></button>
    <header class="modal-heading"><div><p class="eyebrow">Class list</p><h2>Add your students</h2></div></header>
    <label class="roster-label" for="roster">Paste one name per line</label>
    <textarea id="roster" bind:this={rosterTextarea} bind:value={rosterText} class="roster-textarea" placeholder={'Ava Martinez\nBen Okafor\nChloe Nguyen'}></textarea>
    <p class="roster-count">{rosterNames.length ? `${rosterNames.length} ${rosterNames.length === 1 ? 'student' : 'students'} ready to add` : ''}</p>
    {#if error}<p class="modal-error">{error}</p>{/if}
    <footer class="modal-actions"><button class="button secondary" type="button" onclick={() => rosterModal.close()}>Cancel</button><button class="button primary" type="submit" disabled={!rosterNames.length || saving}>{saving ? 'Adding…' : 'Add students'}</button></footer>
  </form>
</dialog>
