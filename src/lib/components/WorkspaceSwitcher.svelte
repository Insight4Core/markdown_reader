<script lang="ts">
  import { fly } from 'svelte/transition';
  import { t } from '$lib/i18n.svelte';
  import {
    normalizeWorkspacePath,
    workspaceDisplayName,
    workspaceParentPath,
  } from '$lib/recent-workspaces';

  interface Props {
    folderPath: string;
    workspaceName: string;
    recentWorkspaces: string[];
    open: boolean;
    reducedMotion?: boolean;
    onGoHome: () => void;
    onSelectWorkspace: (path: string) => void;
    onRemoveWorkspace: (path: string) => void;
    onOpenFolder: () => void;
    onNewWorkspace: () => void;
  }

  let {
    folderPath,
    workspaceName,
    recentWorkspaces,
    open = $bindable(false),
    reducedMotion = false,
    onGoHome,
    onSelectWorkspace,
    onRemoveWorkspace,
    onOpenFolder,
    onNewWorkspace,
  }: Props = $props();

  let currentKey = $derived(normalizeWorkspacePath(folderPath));

  function isCurrent(path: string): boolean {
    return Boolean(currentKey) && normalizeWorkspacePath(path) === currentKey;
  }

  function handleSelect(path: string) {
    open = false;
    if (!isCurrent(path)) {
      onSelectWorkspace(path);
    }
  }

  function handleRemove(event: MouseEvent, path: string) {
    event.stopPropagation();
    onRemoveWorkspace(path);
  }
</script>

<div class="workspace-switcher">
  {#if folderPath}
    <div class="workspace-switcher__bar">
      <button
        type="button"
        class="workspace-switcher__home"
        onclick={onGoHome}
        aria-label={t('workspace.home')}
        title={t('workspace.home')}
      >
        <span class="workspace-switcher__mark">✦</span>
        <span class="workspace-switcher__meta">
          <small>{t('misc.reader_title')}</small>
          <strong>{workspaceName}</strong>
        </span>
      </button>
      <button
        type="button"
        class="workspace-switcher__trigger"
        class:workspace-switcher__trigger--open={open}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="workspace-switcher-menu"
        aria-label={t('workspace.switch')}
        title={t('workspace.switch')}
        onclick={() => open = !open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>
    </div>
  {:else}
    <div class="workspace-switcher__bar workspace-switcher__bar--standalone">
      <button
        type="button"
        class="workspace-switcher__home"
        onclick={onOpenFolder}
        aria-label={t('workspace.open_folder')}
      >
        <span class="workspace-switcher__mark">✦</span>
        <span class="workspace-switcher__meta">
          <small>{t('misc.reader_title')}</small>
          <strong>{t('workspace.open_folder')}</strong>
        </span>
      </button>
      {#if recentWorkspaces.length > 0}
        <button
          type="button"
          class="workspace-switcher__trigger"
          class:workspace-switcher__trigger--open={open}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="workspace-switcher-menu"
          aria-label={t('workspace.switch')}
          title={t('workspace.switch')}
          onclick={() => open = !open}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="m7 10 5 5 5-5" />
          </svg>
        </button>
      {/if}
    </div>
  {/if}

  {#if open}
    <div
      id="workspace-switcher-menu"
      class="workspace-switcher__menu"
      role="menu"
      aria-label={t('workspace.switch')}
      transition:fly={{ y: -4, duration: reducedMotion ? 0 : 140 }}
    >
      {#if recentWorkspaces.length > 0}
        <p class="workspace-switcher__label">{t('workspace.recent_spaces')}</p>
        <div class="workspace-switcher__list">
          {#each recentWorkspaces as space (space)}
            {@const active = isCurrent(space)}
            <div class="workspace-switcher__row" class:workspace-switcher__row--active={active}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={active}
                class="workspace-switcher__item"
                title={space}
                onclick={() => handleSelect(space)}
              >
                <span class="workspace-switcher__item-name">
                  <strong>{workspaceDisplayName(space)}</strong>
                  {#if active}<i aria-hidden="true">✓</i>{/if}
                </span>
                <small>{workspaceParentPath(space)}</small>
              </button>
              {#if !active}
                <button
                  type="button"
                  class="workspace-switcher__remove"
                  aria-label={`${t('workspace.remove_recent')} · ${workspaceDisplayName(space)}`}
                  title={t('workspace.remove_recent')}
                  onclick={(event) => handleRemove(event, space)}
                >×</button>
              {/if}
            </div>
          {/each}
        </div>
        <span class="workspace-switcher__divider" aria-hidden="true"></span>
      {/if}
      <button
        type="button"
        role="menuitem"
        class="workspace-switcher__action"
        onclick={() => { open = false; onOpenFolder(); }}
      >
        <span>↗</span>{t('workspace.open_other')}
      </button>
      <button
        type="button"
        role="menuitem"
        class="workspace-switcher__action"
        onclick={() => { open = false; onNewWorkspace(); }}
      >
        <span>＋</span>{t('workspace.new')}
      </button>
    </div>
  {/if}
</div>

<style>
  .workspace-switcher {
    position: relative;
    margin: 0 14px 14px;
  }
  .workspace-switcher__bar {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .workspace-switcher__bar--standalone {
    margin-bottom: 6px;
  }
  .workspace-switcher__home {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 9px;
    padding: 8px;
    border: 0;
    border-radius: 11px;
    color: var(--color-text-primary);
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.18s ease;
  }
  .workspace-switcher__home:hover {
    background: var(--color-primary-alpha-10);
  }
  .workspace-switcher__mark {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 10px;
    color: var(--color-primary);
    background: var(--color-primary-alpha-10);
    font-size: 15px;
  }
  .workspace-switcher__meta {
    display: grid;
    min-width: 0;
    gap: 2px;
  }
  .workspace-switcher__meta small {
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1.2;
  }
  .workspace-switcher__meta strong {
    overflow: hidden;
    color: var(--color-text-primary);
    font-size: 14px;
    font-weight: 650;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .workspace-switcher__trigger {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 9px;
    color: var(--color-text-gray);
    background: transparent;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
  }
  .workspace-switcher__trigger:hover,
  .workspace-switcher__trigger--open {
    color: var(--color-primary);
    background: var(--color-primary-alpha-10);
  }
  .workspace-switcher__trigger--open svg {
    transform: rotate(180deg);
  }
  .workspace-switcher__menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    z-index: 60;
    display: grid;
    gap: 2px;
    padding: 6px;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    color: var(--color-text-primary);
    background: var(--color-bg);
    box-shadow: 0 16px 38px color-mix(in srgb, var(--color-text-primary) 16%, transparent);
  }
  .workspace-switcher__label {
    margin: 2px 8px 4px;
    color: var(--color-text-gray);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .workspace-switcher__list {
    display: grid;
    gap: 2px;
    max-height: 240px;
    overflow-y: auto;
  }
  .workspace-switcher__row {
    display: flex;
    align-items: center;
    border-radius: 8px;
    transition: background 0.15s ease;
  }
  .workspace-switcher__row:hover {
    background: var(--color-primary-alpha-10);
  }
  .workspace-switcher__row--active {
    background: var(--color-primary-alpha-10);
  }
  .workspace-switcher__item {
    display: grid;
    flex: 1;
    min-width: 0;
    gap: 2px;
    padding: 7px 8px;
    border: 0;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .workspace-switcher__item-name {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .workspace-switcher__item-name strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }
  .workspace-switcher__item-name i {
    flex: none;
    color: var(--color-primary);
    font-style: normal;
    font-size: 12px;
    font-weight: 700;
  }
  .workspace-switcher__item small {
    overflow: hidden;
    color: var(--color-text-gray);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .workspace-switcher__remove {
    display: grid;
    place-items: center;
    flex: none;
    width: 22px;
    height: 22px;
    margin-right: 4px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--color-text-gray);
    background: transparent;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
  }
  .workspace-switcher__row:hover .workspace-switcher__remove,
  .workspace-switcher__remove:focus-visible {
    opacity: 0.75;
  }
  .workspace-switcher__remove:hover {
    opacity: 1;
    color: var(--color-danger);
    background: var(--color-danger-alpha-10);
  }
  .workspace-switcher__divider {
    height: 1px;
    margin: 4px 6px;
    background: var(--color-border);
  }
  .workspace-switcher__action {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 8px;
    border: 0;
    border-radius: 8px;
    color: var(--color-text-secondary);
    background: transparent;
    font: 500 12px var(--font-family-body);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .workspace-switcher__action:hover {
    color: var(--color-primary);
    background: var(--color-primary-alpha-10);
  }
  .workspace-switcher__action span {
    width: 14px;
    text-align: center;
    color: var(--color-primary);
  }
</style>
