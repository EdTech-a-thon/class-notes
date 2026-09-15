<script lang="ts">
  import { untrack } from 'svelte'
  import Save from '@lucide/svelte/icons/save'
  import Trash from '@lucide/svelte/icons/trash'
  import type { Category } from './lib/types'

  interface Props {
    category: Category
    categories: Category[]
    onupdate: (category: Category) => boolean
    ondelete: (category: Category) => boolean
  }
  let { category, categories, onupdate, ondelete }: Props = $props()
  let name = $state(untrack(() => category.name))
  let emoji = $state(untrack(() => category.emoji))
  let confirming = $state(false)
  const changed = $derived(name.trim() !== category.name || emoji.trim() !== category.emoji)
  const duplicate = $derived(categories.some((entry) => entry.id !== category.id && entry.name.toLowerCase() === name.trim().toLowerCase()))

  function save() {
    const clean = name.trim().replace(/\s+/g, ' ')
    if (!clean || duplicate) return
    if (onupdate({ ...category, name: clean, emoji: emoji.trim() })) confirming = false
  }

  function remove() {
    if (!confirming) {
      confirming = true
      return
    }
    ondelete(category)
  }
</script>

<form class="category-row" onsubmit={(event) => { event.preventDefault(); save() }}>
  <input class="emoji-input" bind:value={emoji} maxlength="4" aria-label={'Emoji for ' + category.name} />
  <label><span class="sr-only">Category name</span><input bind:value={name} maxlength="60" aria-label={'Category name: ' + category.name} /></label>
  <button class="icon-action save-action" type="submit" disabled={!changed || !name.trim() || duplicate} aria-label={'Save ' + category.name}><Save size={18} /></button>
  <button class="icon-action delete-action" class:confirming type="button" onclick={remove} aria-label={(confirming ? 'Confirm delete ' : 'Delete ') + category.name}><Trash size={18} /><span>{confirming ? 'Confirm' : ''}</span></button>
  {#if duplicate}<p class="row-error">That category already exists.</p>{/if}
</form>
