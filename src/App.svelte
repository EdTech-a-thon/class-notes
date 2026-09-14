<script lang="ts">
  import { onMount } from 'svelte'
  import {
    BrokerError,
    connectDrive,
    consumeArrivalError,
    describeArrivalError,
    getConnection,
    signIn,
    signOut,
    type DriveConnection,
  } from './lib/broker'
  import {
    authorize,
    clearAuthorization,
    missingTemplateConfig,
    pickSpreadsheet,
    templateCopyUrl,
  } from './lib/google'
  import {
    forgetLastSpreadsheetId,
    getLastSpreadsheetId,
    isAuthorizationError,
    loadGradebook,
    totalFor,
    updateGrade,
  } from './lib/sheets'
  import { DIMENSIONS, type DimensionKey, type Gradebook, type Grades, type Student } from './lib/types'

  type Session = 'checking' | 'signed_out' | 'not_connected' | 'invalid' | 'ready'

  let session: Session = 'checking'
  let connection: DriveConnection | null = null
  let gradebook: Gradebook | null = null
  let savedSpreadsheetId = ''
  let selectedStudent: Student | null = null
  let draftGrades: Grades | null = null
  let loading = false
  let saving = false
  let notice = ''
  let error = ''
  let modal: HTMLDialogElement

  onMount(() => {
    savedSpreadsheetId = getLastSpreadsheetId()
    const arrival = consumeArrivalError()
    if (arrival === 'access_denied') notice = describeArrivalError(arrival)
    else if (arrival) error = describeArrivalError(arrival)
    void refreshSession()
  })

  $: classPoints = gradebook?.students.reduce((sum, student) => sum + totalFor(student.grades), 0) ?? 0
  $: possiblePoints = (gradebook?.students.length ?? 0) * DIMENSIONS.length
  $: canUseDrive = session === 'ready'

  function resetMessages() {
    notice = ''
    error = ''
  }

  function showError(caught: unknown) {
    error = caught instanceof Error ? caught.message : 'Something went wrong. Please try again.'
  }

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
  }

  // Broker failures change what the setup screen should offer; Google 401s mean the token is dead.
  function handleFailure(caught: unknown) {
    if (caught instanceof BrokerError) {
      if (caught.signedOut) session = 'signed_out'
      else if (caught.status === 404) session = 'not_connected'
      else if (caught.status === 409) session = 'invalid'
      if (caught.signedOut || caught.needsConnection) {
        clearAuthorization()
        gradebook = null
      }
    } else if (isAuthorizationError(caught)) {
      clearAuthorization()
    }
    showError(caught)
  }

  async function startSignIn() {
    resetMessages()
    loading = true
    try {
      await signIn()
    } catch (caught) {
      showError(caught)
      loading = false
    }
  }

  async function startConnectDrive() {
    resetMessages()
    loading = true
    try {
      await connectDrive()
    } catch (caught) {
      showError(caught)
      loading = false
    }
  }

  async function endSession() {
    resetMessages()
    loading = true
    try {
      await signOut()
    } catch (caught) {
      showError(caught)
    } finally {
      clearAuthorization()
      gradebook = null
      selectedStudent = null
      connection = null
      session = 'signed_out'
      loading = false
    }
  }

  async function openGradebook(id: string) {
    resetMessages()
    loading = true
    try {
      const token = await authorize()
      gradebook = await loadGradebook(id, token)
      savedSpreadsheetId = id
      notice = 'Ready for ' + gradebook.dayLabel + '.'
    } catch (caught) {
      handleFailure(caught)
    } finally {
      loading = false
    }
  }

  async function chooseGradebook() {
    resetMessages()
    loading = true
    try {
      const picked = await pickSpreadsheet()
      if (picked) await openGradebook(picked.id)
    } catch (caught) {
      handleFailure(caught)
    } finally {
      loading = false
    }
  }

  function editStudent(student: Student) {
    selectedStudent = student
    draftGrades = { ...student.grades }
    resetMessages()
    modal.showModal()
  }

  function toggleDimension(key: DimensionKey) {
    if (draftGrades) draftGrades = { ...draftGrades, [key]: !draftGrades[key] }
  }

  async function saveGrade() {
    if (!gradebook || !selectedStudent || !draftGrades) return
    saving = true
    resetMessages()
    const original = selectedStudent
    const updated: Student = { ...original, grades: { ...draftGrades } }

    try {
      const token = await authorize()
      updated.row = await updateGrade(gradebook.id, updated, gradebook.dayKey, token)
      gradebook = {
        ...gradebook,
        students: gradebook.students.map((student) =>
          student.name === original.name ? updated : student,
        ),
      }
      notice = updated.name + ' saved at ' + totalFor(updated.grades) + '/5.'
      modal.close()
    } catch (caught) {
      handleFailure(caught)
      if (!gradebook) modal.close()
    } finally {
      saving = false
    }
  }

  function switchGradebook() {
    forgetLastSpreadsheetId()
    gradebook = null
    savedSpreadsheetId = ''
    selectedStudent = null
    resetMessages()
  }

  function sheetUrl(id: string) {
    return 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(id) + '/edit'
  }
</script>

<svelte:head>
  <title>Participation Grade Book</title>
  <meta name="description" content="Record daily participation directly in your own Google Sheet." />
</svelte:head>

<div class="app-shell">
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span>
      </span>
      <span>Participation Grade Book</span>
    </div>

    {#if gradebook}
      <nav class="topbar-actions" aria-label="Grade book actions">
        <a href={sheetUrl(gradebook.id)} target="_blank" rel="noreferrer">Open sheet</a>
        <button class="text-button" onclick={() => openGradebook(gradebook!.id)} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <button class="text-button" onclick={switchGradebook}>Switch grade book</button>
        <button class="text-button" onclick={endSession} disabled={loading}>Sign out</button>
      </nav>
    {:else if connection?.googleEmail}
      <nav class="topbar-actions" aria-label="Account">
        <span class="privacy-note">{connection.googleEmail}</span>
        <button class="text-button" onclick={endSession} disabled={loading}>Sign out</button>
      </nav>
    {:else}
      <span class="privacy-note">🔒 Your data stays in Google Drive</span>
    {/if}
  </header>

  {#if gradebook}
    <main class="gradebook-view">
      <section class="page-heading" aria-labelledby="roster-heading">
        <div>
          <p class="eyebrow">{gradebook.title}</p>
          <h1 id="roster-heading">Today’s participation</h1>
          <p class="subtext">{gradebook.dayLabel} · {gradebook.students.length} students</p>
        </div>
        <div class="class-total" aria-label={classPoints + ' out of ' + possiblePoints + ' class points'}>
          <strong>{classPoints}</strong><span> / {possiblePoints}</span>
          <small>class points</small>
        </div>
      </section>

      {#if error}
        <div class="banner error-banner" role="alert"><span>!</span>{error}</div>
      {/if}
      {#if notice}
        <div class="banner success-banner" role="status"><span>✓</span>{notice}</div>
      {/if}

      {#if gradebook.students.length}
        <section class="student-grid" aria-label="Student participation">
          {#each gradebook.students as student, index (student.name)}
            <button class="student-card" title={student.name} onclick={() => editStudent(student)}>
              <span class={'initials color-' + ((index % 5) + 1)}>{student.initials}</span>
              <span class="student-details">
                <span class="student-name">{student.name}</span>
                <span class="bubbles" aria-label={totalFor(student.grades) + ' of 5'}>
                  {#each DIMENSIONS as dimension}
                    <span class:on={student.grades[dimension.key]} title={dimension.label}>
                      {dimension.emoji}
                    </span>
                  {/each}
                </span>
              </span>
              <span class:perfect={totalFor(student.grades) === 5} class="score">
                {totalFor(student.grades)}<small>/5</small>
              </span>
              <span class="chevron" aria-hidden="true">›</span>
            </button>
          {/each}
        </section>
      {:else}
        <section class="empty-state">
          <div class="empty-icon" aria-hidden="true">👋</div>
          <h2>No students on the roster yet</h2>
          <p>Add names to the “Class Roster” tab, then refresh this page.</p>
          <a class="button primary" href={sheetUrl(gradebook.id)} target="_blank" rel="noreferrer">Open class roster</a>
        </section>
      {/if}
    </main>
  {:else}
    <main class="setup-view">
      <section class="setup-intro">
        <div class="setup-icon" aria-hidden="true">✓</div>
        <h1>Set up your grade book</h1>
        <p>Make a copy of the template, then choose your copy. That’s it.</p>
      </section>

      {#if error}
        <div class="banner error-banner setup-banner" role="alert"><span>!</span>{error}</div>
      {/if}
      {#if notice}
        <div class="banner success-banner setup-banner" role="status"><span>✓</span>{notice}</div>
      {/if}
      {#if missingTemplateConfig}
        <div class="banner error-banner setup-banner" role="alert">
          <span>!</span>The template spreadsheet is not configured yet. Follow the README before connecting.
        </div>
      {/if}

      {#if session === 'checking'}
        <section class="resume-panel auth-panel">
          <div>
            <p class="eyebrow">One moment</p>
            <h2>Checking your Google sign-in…</h2>
          </div>
        </section>
      {:else if session === 'signed_out'}
        <section class="resume-panel auth-panel">
          <div>
            <p class="eyebrow">Start here</p>
            <h2>Sign in with Google</h2>
            <p class="panel-note">You will come straight back here once Google confirms who you are.</p>
          </div>
          <button class="button primary" onclick={startSignIn} disabled={loading}>
            {loading ? 'Opening Google…' : 'Sign in with Google'}
          </button>
        </section>
      {:else if session === 'not_connected'}
        <section class="resume-panel auth-panel">
          <div>
            <p class="eyebrow">Almost there</p>
            <h2>Connect Google Drive</h2>
            <p class="panel-note">Google will ask for access to files you choose — nothing else in your Drive.</p>
          </div>
          <button class="button primary" onclick={startConnectDrive} disabled={loading}>
            {loading ? 'Opening Google…' : 'Connect Google Drive'}
          </button>
        </section>
      {:else if session === 'invalid'}
        <section class="resume-panel auth-panel warning">
          <div>
            <p class="eyebrow">Action needed</p>
            <h2>Reconnect Google Drive</h2>
            <p class="panel-note">
              {connection?.lastError === 'admin_policy_enforced'
                ? 'Your Google Workspace administrator has blocked this app. Ask them to allow it, then reconnect.'
                : 'Google stopped accepting our access to your Drive. Reconnecting takes one click.'}
            </p>
          </div>
          <button class="button primary" onclick={startConnectDrive} disabled={loading}>
            {loading ? 'Opening Google…' : 'Reconnect Google Drive'}
          </button>
        </section>
      {/if}

      {#if savedSpreadsheetId && canUseDrive}
        <section class="resume-panel">
          <div>
            <p class="eyebrow">Welcome back</p>
            <h2>Continue with your saved grade book</h2>
          </div>
          <button class="button primary" onclick={() => openGradebook(savedSpreadsheetId)} disabled={loading}>
            {loading ? 'Opening…' : 'Continue'}
          </button>
        </section>
        <p class="divider"><span>or set up another grade book</span></p>
      {/if}

      <section class="setup-grid" aria-label="Set up your grade book">
        <article class="setup-card">
          <span class="step-number coral">1</span>
          <div>
            <p class="eyebrow">First</p>
            <h2>Make your copy</h2>
            <p>The template already has the roster, daily records, week ranges, and grade formulas.</p>
          </div>
          <a
            class:disabled={missingTemplateConfig}
            class="button secondary"
            href={templateCopyUrl()}
            target="_blank"
            rel="noreferrer"
            aria-disabled={missingTemplateConfig}
            onclick={(event) => missingTemplateConfig && event.preventDefault()}
          >Make a copy ↗</a>
        </article>

        <div class="process-arrow" aria-hidden="true">→</div>

        <article class="setup-card">
          <span class="step-number blue">2</span>
          <div>
            <p class="eyebrow">Then</p>
            <h2>Choose your spreadsheet</h2>
            <p>Choose the copy you just made. We’ll check it and load today’s class.</p>
          </div>
          <button class="button primary" onclick={chooseGradebook} disabled={loading || !canUseDrive}>
            {loading ? 'Opening Google…' : 'Choose spreadsheet'}
          </button>
        </article>
      </section>

      <p class="privacy-line">🔒 The app can access only the file you choose. Student data is never sent to an app server.</p>
    </main>
  {/if}
</div>

<dialog
  bind:this={modal}
  class="grade-modal"
  onclose={() => (selectedStudent = null)}
  onclick={(event) => event.target === event.currentTarget && modal.close()}
>
  {#if selectedStudent && draftGrades}
    <form method="dialog">
      <button class="modal-close" value="cancel" aria-label="Close grade editor">×</button>

      <header class="modal-heading">
        <div class="initials modal-initials">{selectedStudent.initials}</div>
        <div>
          <p class="eyebrow">Today’s grade</p>
          <h2>{selectedStudent.name}</h2>
        </div>
        <div class="modal-score" aria-live="polite">
          <strong>{totalFor(draftGrades)}</strong><span>/5</span>
        </div>
      </header>

      <fieldset class="dimensions">
        <legend>Participation habits</legend>
        {#each DIMENSIONS as dimension}
          <button
            type="button"
            class:checked={draftGrades[dimension.key]}
            class="dimension-row"
            onclick={() => toggleDimension(dimension.key)}
            aria-pressed={draftGrades[dimension.key]}
          >
            <span class="dimension-emoji">{dimension.emoji}</span>
            <span class="dimension-copy">
              <strong>{dimension.label}</strong>
              <small>{dimension.description}</small>
            </span>
            <span class="toggle"><span></span></span>
          </button>
        {/each}
      </fieldset>

      {#if error}<p class="modal-error" role="alert">{error}</p>{/if}

      <footer class="modal-actions">
        <button class="button secondary" value="cancel" disabled={saving}>Cancel</button>
        <button class="button primary" type="button" onclick={saveGrade} disabled={saving}>
          {saving ? 'Saving…' : 'Save grade'}
        </button>
      </footer>
    </form>
  {/if}
</dialog>
