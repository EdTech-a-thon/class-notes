<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import Plus from '@lucide/svelte/icons/plus'
  import SubjectRow from './SubjectRow.svelte'
  import type { Subject } from './lib/types'

  interface Props {
    subjects: Subject[]
    saving: boolean
    onadd: (subject: Omit<Subject, 'row'>) => Promise<boolean>
    onupdate: (subject: Subject) => Promise<boolean>
    ondelete: (subject: Subject) => Promise<boolean>
  }
  let { subjects, saving, onadd, onupdate, ondelete }: Props = $props()
  let name = $state('')
  let emoji = $state('')
  let justAdded = $state(false)

  async function add() {
    const clean = name.trim().replace(/\s+/g, ' ')
    if (!clean || subjects.some((subject) => subject.name.toLowerCase() === clean.toLowerCase())) return
    if (await onadd({ name: clean, emoji: emoji.trim() })) {
      name = ''
      emoji = ''
      justAdded = true
      setTimeout(() => (justAdded = false), 1200)
    }
  }
</script>

<section class="page-heading subjects-heading">
  <div class="heading-text"><p class="eyebrow">Your filing system</p><h1>Subjects & topics</h1><p class="subtext">These are the choices that appear when you write a note.</p></div>
</section>

<form class="subject-add" onsubmit={(event) => { event.preventDefault(); void add() }}>
  <label><span>Emoji <small>optional</small></span><input class="emoji-input" bind:value={emoji} maxlength="4" placeholder="🌱" aria-label="Subject emoji" /></label>
  <label><span>Subject or topic</span><input bind:value={name} maxlength="60" placeholder="Outdoor learning" aria-label="New subject name" /></label>
  <button class="button primary" type="submit" disabled={saving || !name.trim()}>{#if justAdded}<Check size={18} /> Added{:else}<Plus size={18} /> Add subject{/if}</button>
</form>

<div class="subject-list">
  {#each subjects as subject (subject.row)}
    <SubjectRow {subject} {subjects} {saving} {onupdate} {ondelete} />
  {/each}
</div>

{#if !subjects.length}<section class="empty-state"><div class="empty-icon">🏷️</div><h2>Add your first subject</h2><p>A note needs a subject so it can be found later.</p></section>{/if}
