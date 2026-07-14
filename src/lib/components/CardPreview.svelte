<script lang="ts">
  import { cardPreviewStore } from '../../state/cardPreview.svelte';

  let failedImageUrl = $state('');
  let lastImageUrl = $state('');
  let card = $derived(cardPreviewStore.card);
  let imageUrl = $derived(cardPreviewStore.imageUrl);
  let label = $derived(card?.fullName || card?.name || 'カード');
  let showImage = $derived(!!imageUrl && failedImageUrl !== imageUrl);

  $effect(() => {
    if (imageUrl !== lastImageUrl) {
      failedImageUrl = '';
      lastImageUrl = imageUrl;
    }
  });

  function close() {
    cardPreviewStore.close();
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (card && event.key === 'Escape') {
      close();
    }
  }
</script>

<svelte:window onkeydown={closeOnEscape} />

{#if card}
  <button type="button" class="card-preview-backdrop" aria-label="カード拡大表示を閉じる" onclick={close}></button>
  <div class="card-preview-dialog" role="dialog" aria-modal="true" aria-label={label}>
    <div class="card-preview-header">
      <strong>{label}</strong>
      <button type="button" onclick={close}>閉じる</button>
    </div>
    {#if showImage}
      <img
        class="card-preview-image"
        src={imageUrl}
        alt={label}
        decoding="async"
        draggable="false"
        onerror={() => (failedImageUrl = imageUrl)}
      />
    {:else}
      <div class="card-preview-fallback">
        <strong>{card.name}</strong>
        {#if card.set}
          <span>{card.set} {card.setNumber}</span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .card-preview-backdrop {
    position: fixed;
    inset: 0;
    z-index: 3000;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: rgba(11, 18, 32, 0.58);
    box-shadow: none;
    backdrop-filter: blur(7px);
    cursor: zoom-out;
  }

  .card-preview-dialog {
    position: fixed;
    inset: 50% auto auto 50%;
    z-index: 3001;
    width: min(430px, calc(100vw - 28px));
    max-height: calc(100vh - 28px);
    transform: translate(-50%, -50%);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.56);
    border-radius: 8px;
    background: rgba(248, 250, 252, 0.96);
    box-shadow: 0 28px 80px rgba(11, 18, 32, 0.42);
    color: #182231;
  }

  .card-preview-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
  }

  .card-preview-header strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .card-preview-header button {
    min-height: 30px;
    padding: 0 12px;
    border: 1px solid rgba(90, 103, 121, 0.28);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.9);
    color: #182231;
    font-size: 12px;
    font-weight: 800;
  }

  .card-preview-image {
    width: min(100%, calc((100vh - 96px) * 63 / 88));
    max-height: calc(100vh - 96px);
    justify-self: center;
    border-radius: 8px;
    object-fit: contain;
    box-shadow: 0 16px 34px rgba(11, 18, 32, 0.3);
    -webkit-user-drag: none;
  }

  .card-preview-fallback {
    min-height: 420px;
    display: grid;
    place-items: center;
    gap: 8px;
    border-radius: 8px;
    background: #eef2f7;
    text-align: center;
  }

  @media (max-width: 640px) {
    .card-preview-dialog {
      width: min(360px, calc(100vw - 20px));
      padding: 10px;
    }

    .card-preview-image {
      max-height: calc(100vh - 86px);
    }
  }
</style>
