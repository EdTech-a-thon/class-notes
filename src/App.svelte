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
    forgetSpreadsheet,
    getRememberedSpreadsheet,
    hasCopiedTemplate,
    markTemplateCopied,
    rememberSpreadsheet,
    type RememberedSpreadsheet,
  } from './lib/setup'
  import { isAuthorizationError, loadGradebook, totalFor, updateGrade } from './lib/sheets'
  import { DIMENSIONS, type DimensionKey, type Gradebook, type Grades, type Student } from './lib/types'

  type Session = 'checking' | 'signed_out' | 'not_connected' | 'invalid' | 'ready'

  let session: Session = 'checking'
  let connection: DriveConnection | null = null
  let gradebook: Gradebook | null = null
  let pendingGradebook: Gradebook | null = null // validated at pick time, revealed by "Start grading"
  let spreadsheet: RememberedSpreadsheet | null = null
  let templateCopied = false
  let selectedStudent: Student | null = null
  let draftGrades: Grades | null = null
  let loading = false
  let saving = false
  let notice = ''
  let error = ''
  let modal: HTMLDialogElement

  onMount(() => {
    spreadsheet = getRememberedSpreadsheet()
    templateCopied = hasCopiedTemplate()
    const arrival = consumeArrivalError()
    if (arrival === 'access_denied') notice = describeArrivalError(arrival)
    else if (arrival) error = describeArrivalError(arrival)
    void refreshSession()
  })

  $: classPoints = gradebook?.students.reduce((sum, student) => sum + totalFor(student.grades), 0) ?? 0
  $: possiblePoints = (gradebook?.students.length ?? 0) * DIMENSIONS.length
  // Onboarding is a strict ladder: a step is only actionable once every step above it is done.
  $: signedIn = session !== 'checking' && session !== 'signed_out'
  $: driveReady = session === 'ready'
  $: stepsDone = [signedIn, driveReady, templateCopied || !!spreadsheet, !!spreadsheet, false]
  $: currentStep = stepsDone.indexOf(false) + 1
  $: stepState = (step: number) =>
    stepsDone[step - 1] ? 'done' : step === currentStep ? 'current' : 'locked'

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
        pendingGradebook = null
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
      pendingGradebook = null
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
      notice = 'Ready for ' + gradebook.dayLabel + '.'
    } catch (caught) {
      handleFailure(caught)
    } finally {
      loading = false
    }
  }

  function copyTemplate() {
    markTemplateCopied()
    templateCopied = true
  }

  async function chooseSpreadsheet() {
    resetMessages()
    loading = true
    try {
      const picked = await pickSpreadsheet()
      if (!picked) return
      // Check the tabs now so a wrong file is caught on this step, not the next one.
      const token = await authorize()
      pendingGradebook = await loadGradebook(picked.id, token)
      spreadsheet = { id: picked.id, name: pendingGradebook.title || picked.name }
      rememberSpreadsheet(spreadsheet)
      templateCopied = true
    } catch (caught) {
      handleFailure(caught)
    } finally {
      loading = false
    }
  }

  async function startGrading() {
    if (!spreadsheet) return
    if (pendingGradebook) {
      resetMessages()
      gradebook = pendingGradebook
      pendingGradebook = null
      notice = 'Ready for ' + gradebook.dayLabel + '.'
      return
    }
    await openGradebook(spreadsheet.id)
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

  function switchSpreadsheet() {
    forgetSpreadsheet()
    spreadsheet = null
    pendingGradebook = null
    gradebook = null
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
        <button class="text-button" onclick={switchSpreadsheet}>Switch grade book</button>
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
        <p>Five quick steps. Each one unlocks the next.</p>
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

      <ol class="steps" aria-label="Setup steps">
        <!-- 1. Sign in -->
        <li class={'step ' + stepState(1)} aria-current={stepState(1) === 'current' ? 'step' : undefined}>
          <span class="step-mark" aria-hidden="true">{signedIn ? '✓' : '1'}</span>
          <div class="step-text">
            <strong>{signedIn ? 'Signed in with Google' : 'Sign in with Google'}</strong>
            <span>
              {#if signedIn && connection?.googleEmail}
                {connection.googleEmail}
              {:else if session === 'checking'}
                Checking whether you are already signed in…
              {:else}
                So we know which Google account to work with.
              {/if}
            </span>
          </div>
          <button class="button primary step-action" onclick={startSignIn} disabled={loading || stepState(1) !== 'current'}>
            {signedIn ? 'Signed in' : loading && currentStep === 1 ? 'Opening Google…' : 'Sign in with Google'}
          </button>
        </li>

        <!-- 2. Connect Drive -->
        <li class={'step ' + stepState(2)} aria-current={stepState(2) === 'current' ? 'step' : undefined}>
          <span class="step-mark" aria-hidden="true">{driveReady ? '✓' : '2'}</span>
          <div class="step-text">
            <strong>{driveReady ? 'Google Drive connected' : session === 'invalid' ? 'Reconnect Google Drive' : 'Connect Google Drive'}</strong>
            <span>
              {#if driveReady}
                Access is limited to the files you pick.
              {:else if session === 'invalid' && connection?.lastError === 'admin_policy_enforced'}
                Your Google Workspace administrator has blocked this app. Ask them to allow it, then reconnect.
              {:else if session === 'invalid'}
                Google stopped accepting our access to your Drive. Reconnecting takes one click.
              {:else}
                Google will ask permission for files you choose — nothing else in your Drive.
              {/if}
            </span>
          </div>
          <button class="button primary step-action" onclick={startConnectDrive} disabled={loading || stepState(2) !== 'current'}>
            {driveReady ? 'Connected' : loading && currentStep === 2 ? 'Opening Google…' : session === 'invalid' ? 'Reconnect Drive' : 'Connect Drive'}
          </button>
        </li>

        <!-- 3. Make a copy -->
        <li class={'step ' + stepState(3)} aria-current={stepState(3) === 'current' ? 'step' : undefined}>
          <span class="step-mark" aria-hidden="true">{stepsDone[2] ? '✓' : '3'}</span>
          <div class="step-text">
            <strong>{stepsDone[2] ? 'Template copied' : 'Make your copy of the template'}</strong>
            <span>
              {#if stepsDone[2]}
                Your copy is in your Google Drive.
              {:else}
                Google Sheets opens in a new tab. Press <em>Make a copy</em>, then come back here.
                {#if stepState(3) === 'current'}
                  <button type="button" class="link-button" onclick={copyTemplate}>I already have a copy</button>
                {/if}
              {/if}
            </span>
          </div>
          <a
            class="button primary step-action"
            class:disabled={stepState(3) !== 'current' || missingTemplateConfig}
            href={templateCopyUrl()}
            target="_blank"
            rel="noreferrer"
            aria-disabled={stepState(3) !== 'current' || missingTemplateConfig}
            tabindex={stepState(3) === 'current' && !missingTemplateConfig ? 0 : -1}
            onclick={(event) => {
              if (stepState(3) !== 'current' || missingTemplateConfig) return event.preventDefault()
              copyTemplate()
            }}
          >{stepsDone[2] ? 'Copied' : 'Make a copy ↗'}</a>
        </li>

        <!-- 4. Pick the copy -->
        <li class={'step ' + stepState(4)} aria-current={stepState(4) === 'current' ? 'step' : undefined}>
          <span class="step-mark" aria-hidden="true">{spreadsheet ? '✓' : '4'}</span>
          <div class="step-text">
            <strong>{spreadsheet ? 'Spreadsheet chosen' : 'Pick your copy'}</strong>
            <span>
              {#if spreadsheet}
                {spreadsheet.name || 'Your grade book'}
                <button type="button" class="link-button" onclick={switchSpreadsheet} disabled={loading}>Change</button>
              {:else}
                Choose the copy you just made. We’ll check it has the right tabs.
              {/if}
            </span>
          </div>
          <button class="button primary step-action" onclick={chooseSpreadsheet} disabled={loading || stepState(4) !== 'current'}>
            {spreadsheet ? 'Chosen' : loading && currentStep === 4 ? 'Opening Google…' : 'Choose spreadsheet'}
          </button>
        </li>

        <!-- 5. Start grading -->
        <li class={'step ' + stepState(5)} aria-current={stepState(5) === 'current' ? 'step' : undefined}>
          <span class="step-mark" aria-hidden="true">5</span>
          <div class="step-text">
            <strong>Start grading</strong>
            <span>Today’s roster, one tap per student. Everything saves straight to your sheet.</span>
          </div>
          <button class="button primary step-action" onclick={startGrading} disabled={loading || stepState(5) !== 'current'}>
            {loading && currentStep === 5 ? 'Loading…' : 'Start grading'}
          </button>
        </li>
      </ol>

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
