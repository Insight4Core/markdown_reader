<script lang="ts">
  import { tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    open: boolean;
    query: string;
    currentIndex: number;
    matchCount: number;
    reducedMotion?: boolean;
    hasTabs?: boolean;
    onQueryChange: (next: string) => void;
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
  }

  let {
    open,
    query = $bindable(''),
    currentIndex,
    matchCount,
    reducedMotion = false,
    hasTabs = false,
    onQueryChange,
    onNext,
    onPrev,
    onClose,
  }: Props = $props();

  let inputEl = $state<HTMLInputElement | undefined>(undefined);

  export function focusInput(selectAll = true) {
    void tick().then(() => {
      if (!inputEl) return;
      inputEl.focus();
      if (selectAll) inputEl.select();
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) onPrev();
      else onNext();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  function handleInput(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    query = value;
    onQueryChange(value);
  }

  let hasQuery = $derived(query.trim().length > 0);
  let countText = $derived(
    !hasQuery ? '' : matchCount > 0 ? `${currentIndex + 1} / ${matchCount}` : '0 / 0'
  );
</script>

{#if open}
  <div
    class="find-bar"
    class:find-bar--under-tabs={hasTabs}
    role="search"
    aria-label={t('find.placeholder')}
    transition:fly={{ y: -8, duration: reducedMotion ? 0 : 140 }}
  >
    <span class="find-bar__icon" aria-hidden="true">⌕</span>
    <input
      bind:this={inputEl}
      type="text"
      value={query}
      oninput={handleInput}
      onkeydown={handleKeydown}
      placeholder={t('find.placeholder')}
      aria-label={t('find.placeholder')}
      spellcheck="false"
      autocomplete="off"
    />
    {#if hasQuery}
      <span
        class="find-bar__count"
        class:find-bar__count--empty={matchCount === 0}
        role="status"
        aria-live="polite"
      >
        {countText}
      </span>
    {/if}
    <span class="find-bar__divider" aria-hidden="true"></span>
    <button
      type="button"
      class="find-bar__btn"
      disabled={matchCount === 0}
      onclick={onPrev}
      aria-label={t('find.prev')}
      title={`${t('find.prev')} (Shift+Enter)`}
    >↑</button>
    <button
      type="button"
      class="find-bar__btn"
      disabled={matchCount === 0}
      onclick={onNext}
      aria-label={t('find.next')}
      title={`${t('find.next')} (Enter)`}
    >↓</button>
    <button
      type="button"
      class="find-bar__btn find-bar__close"
      onclick={onClose}
      aria-label={t('find.close')}
      title={`${t('find.close')} (Esc)`}
    >×</button>
  </div>
{/if}

<style>
  .find-bar {
    position: fixed;
    top: 62px;
    right: 24px;
    z-index: 45;
    display: flex;
    align-items: center;
    gap: 4px;
    width: min(360px, calc(100vw - 32px));
    padding: 6px 8px 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    color: var(--color-text-primary);
    background: color-mix(in srgb, var(--color-side-bg) 95%, var(--color-bg));
    box-shadow: 0 14px 36px color-mix(in srgb, var(--color-text-primary) 16%, transparent);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }
  .find-bar--under-tabs {
    top: 100px;
  }
  .find-bar__icon {
    flex: none;
    color: var(--color-primary);
    font-size: 16px;
    line-height: 1;
  }
  .find-bar input {
    flex: 1;
    min-width: 0;
    height: 28px;
    padding: 0 6px;
    border: 0;
    outline: 0;
    color: var(--color-text-primary);
    background: transparent;
    font: 13px var(--font-family-body);
  }
  .find-bar input::placeholder {
    color: var(--color-text-gray);
  }
  .find-bar__count {
    flex: none;
    padding: 0 4px;
    color: var(--color-text-gray);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .find-bar__count--empty {
    color: var(--color-danger);
    font-weight: 600;
  }
  .find-bar__divider {
    flex: none;
    width: 1px;
    height: 16px;
    margin: 0 2px;
    background: var(--color-border);
  }
  .find-bar__btn {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 7px;
    color: var(--color-text-secondary);
    background: transparent;
    font: 14px var(--font-family-body);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .find-bar__btn:hover:not(:disabled) {
    color: var(--color-primary);
    background: var(--color-primary-alpha-10);
  }
  .find-bar__btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .find-bar__close {
    font-size: 18px;
    line-height: 1;
  }
</style>
