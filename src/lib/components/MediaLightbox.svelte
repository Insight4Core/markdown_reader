<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import {
    LIGHTBOX_ZOOM_MAX,
    LIGHTBOX_ZOOM_MIN,
    clampZoom,
    formatZoomPercent,
    stepZoom,
  } from '$lib/media-lightbox';

  export type LightboxItem =
    | { kind: 'image'; src: string; alt: string }
    | { kind: 'svg'; markup: string; width: number; height: number; label: string };

  interface Props {
    item: LightboxItem | null;
    onClose: () => void;
  }

  let { item, onClose }: Props = $props();

  let scale = $state(1);
  let offsetX = $state(0);
  let offsetY = $state(0);
  let dragging = $state(false);
  let darkImageBg = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;

  $effect(() => {
    void item;
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    dragging = false;
    darkImageBg = false;
  });

  function showModalDialog(node: HTMLDialogElement) {
    node.showModal();
    node.querySelector<HTMLButtonElement>('.media-lightbox__close')?.focus({ preventScroll: true });
    return {
      destroy() {
        if (node.open) node.close();
      },
    };
  }

  function applyScale(next: number) {
    scale = clampZoom(next);
    if (scale <= 1) {
      offsetX = 0;
      offsetY = 0;
    }
  }

  function zoomIn() {
    applyScale(stepZoom(scale, 1));
  }

  function zoomOut() {
    applyScale(stepZoom(scale, -1));
  }

  function resetZoom() {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomIn();
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomOut();
    } else if (event.key === '0') {
      event.preventDefault();
      resetZoom();
    }
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1 : -1;
    applyScale(stepZoom(scale, delta));
  }

  function handlePointerDown(event: PointerEvent) {
    if (scale <= 1 || event.button !== 0) return;
    dragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragOriginX = offsetX;
    dragOriginY = offsetY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragging) return;
    offsetX = dragOriginX + (event.clientX - dragStartX);
    offsetY = dragOriginY + (event.clientY - dragStartY);
  }

  function handlePointerUp(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  function handleStageClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

{#if item}
  <dialog
    class="media-lightbox"
    use:showModalDialog
    aria-label={t('lightbox.label')}
    oncancel={(event) => { event.preventDefault(); onClose(); }}
    onkeydown={handleKeydown}
  >
    <div class="media-lightbox__controls" role="toolbar" aria-label={t('lightbox.label')}>
      <button
        type="button"
        onclick={zoomOut}
        disabled={scale <= LIGHTBOX_ZOOM_MIN}
        aria-label={t('lightbox.zoom_out')}
        title={`${t('lightbox.zoom_out')} (-)`}
      >−</button>
      <button
        type="button"
        class="media-lightbox__percent"
        onclick={resetZoom}
        aria-label={t('lightbox.reset')}
        title={`${t('lightbox.reset')} (0)`}
      >{formatZoomPercent(scale)}</button>
      <button
        type="button"
        onclick={zoomIn}
        disabled={scale >= LIGHTBOX_ZOOM_MAX}
        aria-label={t('lightbox.zoom_in')}
        title={`${t('lightbox.zoom_in')} (+)`}
      >＋</button>
      {#if item.kind === 'image'}
        <span class="media-lightbox__divider" aria-hidden="true"></span>
        <button
          type="button"
          class="media-lightbox__bg-toggle"
          aria-pressed={darkImageBg}
          aria-label={t('lightbox.toggle_bg')}
          title={t('lightbox.toggle_bg')}
          onclick={() => darkImageBg = !darkImageBg}
        >
          <span class="media-lightbox__swatch" class:media-lightbox__swatch--dark={darkImageBg} aria-hidden="true"></span>
        </button>
      {/if}
      <span class="media-lightbox__divider" aria-hidden="true"></span>
      <button
        type="button"
        class="media-lightbox__close"
        onclick={onClose}
        aria-label={t('lightbox.close')}
        title={`${t('lightbox.close')} (Esc)`}
      >×</button>
    </div>

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="media-lightbox__stage"
      class:media-lightbox__stage--pannable={scale > 1}
      class:media-lightbox__stage--dragging={dragging}
      onclick={handleStageClick}
      onwheel={handleWheel}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerUp}
    >
      <div
        class="media-lightbox__content"
        class:media-lightbox__content--svg={item.kind === 'svg'}
        style="transform: translate({offsetX}px, {offsetY}px) scale({scale});"
      >
        {#if item.kind === 'image'}
          <img
            class="media-lightbox__img"
            class:media-lightbox__img--dark-bg={darkImageBg}
            src={item.src}
            alt={item.alt}
            draggable="false"
          />
        {:else}
          <div
            class="media-lightbox__svg-wrap"
            style:min-width={item.width ? `${Math.min(item.width, 960)}px` : undefined}
          >
            {@html item.markup}
          </div>
        {/if}
      </div>
    </div>

    {#if item.kind === 'image' && item.alt}
      <p class="media-lightbox__caption">{item.alt}</p>
    {:else if item.kind === 'svg'}
      <p class="media-lightbox__caption">{item.label || t('lightbox.diagram')}</p>
    {/if}
  </dialog>
{/if}

<style>
  .media-lightbox {
    position: fixed;
    inset: 0;
    z-index: 160;
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    color: var(--color-text-primary);
    background: transparent;
    overflow: hidden;
  }
  .media-lightbox::backdrop {
    background: color-mix(in srgb, #0b0f0d 78%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .media-lightbox__controls {
    position: fixed;
    top: 20px;
    right: 24px;
    z-index: 10;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 5px;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    background: color-mix(in srgb, var(--color-side-bg) 94%, transparent);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(18px);
  }
  .media-lightbox__controls button {
    display: grid;
    place-items: center;
    min-width: 32px;
    height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    color: var(--color-text-primary);
    background: transparent;
    font: 500 14px var(--font-family-body);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .media-lightbox__controls button:hover:not(:disabled) {
    color: var(--color-primary);
    background: var(--color-primary-alpha-10);
  }
  .media-lightbox__controls button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .media-lightbox__percent {
    min-width: 56px !important;
    font-size: 12px !important;
    font-variant-numeric: tabular-nums;
  }
  .media-lightbox__close {
    font-size: 20px !important;
    line-height: 1;
  }
  .media-lightbox__divider {
    width: 1px;
    height: 18px;
    margin: 0 4px;
    background: var(--color-border);
  }
  .media-lightbox__stage {
    flex: 1;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 72px 32px 64px;
    overflow: hidden;
    user-select: none;
    cursor: zoom-out;
  }
  .media-lightbox__stage--pannable {
    cursor: grab;
  }
  .media-lightbox__stage--dragging {
    cursor: grabbing;
  }
  .media-lightbox__content {
    display: grid;
    place-items: center;
    transform-origin: center center;
    transition: transform 0.12s ease-out;
    will-change: transform;
  }
  .media-lightbox__stage--dragging .media-lightbox__content {
    transition: none;
  }
  .media-lightbox__content img {
    max-width: min(90vw, 1400px);
    max-height: calc(100vh - 150px);
    border-radius: 10px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.42);
    object-fit: contain;
    pointer-events: none;
  }
  .media-lightbox__img {
    background: #ffffff;
  }
  .media-lightbox__img--dark-bg {
    background: #111111;
  }
  .media-lightbox__swatch {
    display: block;
    width: 14px;
    height: 14px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: #ffffff;
  }
  .media-lightbox__swatch--dark {
    background: #111111;
  }
  .media-lightbox__content--svg {
    padding: 24px 28px;
    border: 1px solid var(--color-border);
    border-radius: 14px;
    background: var(--color-bg);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.42);
  }
  .media-lightbox__svg-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: min(86vw, 1320px);
    max-height: calc(100vh - 190px);
  }
  .media-lightbox__svg-wrap :global(svg) {
    max-width: 100%;
    max-height: calc(100vh - 200px);
    height: auto;
  }
  .media-lightbox__caption {
    position: fixed;
    left: 50%;
    bottom: 20px;
    z-index: 10;
    max-width: min(640px, calc(100vw - 48px));
    margin: 0;
    padding: 6px 14px;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    color: var(--color-text-secondary);
    background: color-mix(in srgb, var(--color-side-bg) 92%, transparent);
    font-size: 12px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transform: translateX(-50%);
    backdrop-filter: blur(14px);
  }
</style>
