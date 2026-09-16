<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import Plus from '@lucide/svelte/icons/plus'
  import Star from '@lucide/svelte/icons/star'
  import CategoryRow from './CategoryRow.svelte'
  import type { Category } from './lib/types'

  interface Props {
    categories: Category[]
    /** Whether new classes already start with exactly this set. */
    isDefault: boolean
    onadd: (category: Omit<Category, 'id'>) => boolean
    onupdate: (category: Category) => boolean
    ondelete: (category: Category) => boolean
    onmakedefault: () => boolean
  }
  let { categories, isDefault, onadd, onupdate, ondelete, onmakedefault }: Props = $props()
  let name = $state('')
  let emoji = $state('')
  let justAdded = $state(false)

  function add() {
    const clean = name.trim().replace(/\s+/g, ' ')
    if (!clean || categories.some((category) => category.name.toLowerCase() === clean.toLowerCase())) return
    if (onadd({ name: clean, emoji: emoji.trim() })) {
      name = ''
      emoji = ''
      justAdded = true
      setTimeout(() => (justAdded = false), 1200)
    }
  }
</script>

<section class="page-heading categories-heading">
  <div class="heading-text"><p class="eyebrow">Your filing system</p><h1>Categories</h1><p class="subtext">These are the choices that appear when you write a note.</p></div>
  {#if isDefault}
    <p class="default-status"><Check size={18} /> New classes start with these categories</p>
  {:else if categories.length}
    <button class="button secondary default-button" type="button" onclick={onmakedefault}><Star size={18} /> Use for new classes</button>
  {/if}
</section>

<form class="category-add" onsubmit={(event) => { event.preventDefault(); add() }}>
  <label><span>Emoji <small>optional</small></span><input class="emoji-input" bind:value={emoji} maxlength="4" placeholder="🌱" aria-label="Category emoji" /></label>
  <label><span>Category</span><input bind:value={name} maxlength="60" placeholder="Outdoor learning" aria-label="New category name" /></label>
  <button class="button primary" type="submit" disabled={!name.trim()}>{#if justAdded}<Check size={18} /> Added{:else}<Plus size={18} /> Add category{/if}</button>
</form>

<div class="category-list">
  {#each categories as category (category.id)}
    <CategoryRow {category} {categories} {onupdate} {ondelete} />
  {/each}
</div>

{#if !categories.length}<section class="empty-state"><div class="empty-icon">🏷️</div><h2>Add your first category</h2><p>A note needs a category so it can be found later.</p></section>{/if}
