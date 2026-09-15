<script lang="ts">
  import { untrack } from 'svelte'
  import Save from '@lucide/svelte/icons/save'
  import Trash from '@lucide/svelte/icons/trash'
  import type { Subject } from './lib/types'

  interface Props {
    subject: Subject
    subjects: Subject[]
    onupdate: (subject: Subject) => boolean
    ondelete: (subject: Subject) => boolean
  }
  let { subject, subjects, onupdate, ondelete }: Props = $props()
  let name = $state(untrack(() => subject.name))
  let emoji = $state(untrack(() => subject.emoji))
  let confirming = $state(false)
  const changed = $derived(name.trim() !== subject.name || emoji.trim() !== subject.emoji)
  const duplicate = $derived(subjects.some((entry) => entry.id !== subject.id && entry.name.toLowerCase() === name.trim().toLowerCase()))

  function save() {
    const clean = name.trim().replace(/\s+/g, ' ')
    if (!clean || duplicate) return
    if (onupdate({ ...subject, name: clean, emoji: emoji.trim() })) confirming = false
  }

  function remove() {
    if (!confirming) {
      confirming = true
      return
    }
    ondelete(subject)
  }
</script>

<form class="subject-row" onsubmit={(event) => { event.preventDefault(); save() }}>
  <input class="emoji-input" bind:value={emoji} maxlength="4" aria-label={'Emoji for ' + subject.name} />
  <label><span class="sr-only">Subject name</span><input bind:value={name} maxlength="60" aria-label={'Subject name: ' + subject.name} /></label>
  <button class="icon-action save-action" type="submit" disabled={!changed || !name.trim() || duplicate} aria-label={'Save ' + subject.name}><Save size={18} /></button>
  <button class="icon-action delete-action" class:confirming type="button" onclick={remove} aria-label={(confirming ? 'Confirm delete ' : 'Delete ') + subject.name}><Trash size={18} /><span>{confirming ? 'Confirm' : ''}</span></button>
  {#if duplicate}<p class="row-error">That subject already exists.</p>{/if}
</form>
