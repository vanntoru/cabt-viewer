<script lang="ts">
  import CardTile from './CardTile.svelte';
  import type { PlayerView } from '../game/types';

  type Props = {
    player: PlayerView;
    selectedHand?: { playerIndex: number; handIndex: number } | null;
    disabled?: boolean;
    concealed?: boolean;
    playableIndexes?: number[];
    placedIndexes?: number[];
    expandable?: boolean;
    forceCollapsed?: boolean;
    onSelect: (playerIndex: number, handIndex: number) => void;
    onDrag: (playerIndex: number, handIndex: number, event: DragEvent) => void;
    onDragEnd?: () => void;
  };

  let {
    player,
    selectedHand = null,
    disabled = false,
    concealed = false,
    playableIndexes = [],
    placedIndexes = [],
    expandable = false,
    forceCollapsed = false,
    onSelect,
    onDrag,
    onDragEnd = () => {},
  }: Props = $props();

  let playableSet = $derived(new Set(playableIndexes));
  let placedSet = $derived(new Set(placedIndexes));
  let hasPlayableFilter = $derived(playableIndexes.length > 0);
  let handElement = $state<HTMLDivElement>();
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  let pinnedExpanded = $state(false);

  function updateScrollIndicators() {
    if (!handElement || concealed) {
      canScrollLeft = false;
      canScrollRight = false;
      return;
    }
    const maxScrollLeft = handElement.scrollWidth - handElement.clientWidth;
    canScrollLeft = handElement.scrollLeft > 1;
    canScrollRight = maxScrollLeft - handElement.scrollLeft > 1;
  }

  $effect(() => {
    player.hand.length;
    placedIndexes.length;
    concealed;
    if (!expandable || concealed) {
      pinnedExpanded = false;
    }
    updateScrollIndicators();
  });

  $effect(() => {
    if (!handElement || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(updateScrollIndicators);
    observer.observe(handElement);
    return () => observer.disconnect();
  });

  function togglePinnedExpanded() {
    if (!expandable || concealed) {
      return;
    }
    pinnedExpanded = !pinnedExpanded;
  }
</script>

<div
  bind:this={handElement}
  class:disabled
  class:concealed
  class:expandable
  class:force-collapsed={forceCollapsed}
  class:pinned-expanded={pinnedExpanded}
  class:can-scroll-left={canScrollLeft}
  class:can-scroll-right={canScrollRight}
  class="hand"
  data-card-count={player.hand.length}
  onscroll={updateScrollIndicators}
>
  {#if expandable && !concealed}
    <button
      type="button"
      class="hand-expand-handle"
      class:pinned-expanded={pinnedExpanded}
      aria-label={pinnedExpanded ? '手札の固定表示を解除' : '手札を固定表示'}
      onclick={togglePinnedExpanded}
    ></button>
  {/if}
  {#each player.hand as card, index}
    {@const cardDisabled = disabled || (hasPlayableFilter && (!playableSet.has(index) || placedSet.has(index)))}
    {#if !placedSet.has(index)}
      <CardTile
        {card}
        compact
        selected={selectedHand?.playerIndex === player.index && selectedHand.handIndex === index}
        playable={playableSet.has(index)}
        draggable={!cardDisabled && !concealed}
        disabled={cardDisabled}
        interactive={!cardDisabled && !concealed}
        faceDown={concealed}
        previewable={!concealed}
        testId={`hand-card-${player.index}-${index}`}
        onclick={() => onSelect(player.index, index)}
        ondragstart={(event) => onDrag(player.index, index, event)}
        ondragend={onDragEnd}
      />
    {/if}
  {/each}
</div>

<style>
	  .hand {
    --hand-fade-size: calc(var(--card-w) * 0.68);
    --hand-scroll-mask: linear-gradient(90deg, #000 0%, #000 100%);
    position: relative;
    z-index: 1;
    min-width: 0;
    min-height: calc(var(--card-w) * 1.42);
    flex: 1;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: calc(var(--card-w) * 0.1);
    overflow-x: auto;
    overflow-y: hidden;
    padding: 10px 4px;
    pointer-events: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
    -webkit-mask-image: var(--hand-scroll-mask);
    mask-image: var(--hand-scroll-mask);
	    -webkit-overflow-scrolling: touch;
	    transition: transform 150ms ease, filter 150ms ease;
	  }

  .hand:not(.concealed).can-scroll-left {
    --hand-scroll-mask: linear-gradient(90deg, transparent 0, #000 var(--hand-fade-size), #000 100%);
  }

  .hand:not(.concealed).can-scroll-right {
    --hand-scroll-mask: linear-gradient(90deg, #000 0, #000 calc(100% - var(--hand-fade-size)), transparent 100%);
  }

  .hand:not(.concealed).can-scroll-left.can-scroll-right {
    --hand-scroll-mask: linear-gradient(
      90deg,
      transparent 0,
      #000 var(--hand-fade-size),
      #000 calc(100% - var(--hand-fade-size)),
      transparent 100%
    );
  }

  .hand:not(.concealed)::before,
  .hand:not(.concealed)::after {
    content: '';
    pointer-events: none;
    flex: 1 0 0;
  }

	  .hand:not(.concealed) :global(.card-tile) {
	    flex: 0 0 auto;
	  }

  .hand.disabled {
    opacity: 1;
    cursor: default;
  }

	  .hand-expand-handle {
	    position: absolute;
	    top: 4px;
	    left: 50%;
	    z-index: 5;
	    width: 44px;
	    height: 10px;
	    transform: translateX(-50%);
	    border: 0;
	    border-radius: 999px;
	    background: rgba(30, 41, 59, 0.34);
	    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
	  }

	  .hand-expand-handle:hover,
	  .hand-expand-handle.pinned-expanded {
	    background: rgba(20, 184, 166, 0.72);
	  }

  :global(.debug-zones) .hand {
    outline: 2px dashed rgba(236, 72, 153, 0.86);
    outline-offset: -4px;
    background: rgba(236, 72, 153, 0.08);
  }

  .hand.concealed {
    justify-content: center;
    min-height: calc(var(--card-w) * 1.42);
    overflow: visible;
    pointer-events: none;
    -webkit-mask-image: none;
    mask-image: none;
  }

  .hand.concealed :global(.card-tile) {
    width: calc(var(--card-w) * 0.78);
    margin-right: calc(var(--card-w) * -0.46);
    transform: translateY(calc(var(--card-w) * -0.52));
  }

  .hand.concealed :global(.card-tile.compact) {
    width: calc(var(--card-w) * 0.8);
  }

  .hand.concealed::after {
    content: attr(data-card-count);
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 4;
    min-width: 34px;
    min-height: 34px;
    display: grid;
    place-items: center;
    transform: translate(-50%, -50%);
    border-radius: var(--radius-pill);
    border: 1px solid var(--pile-count-border);
    background: var(--pile-count-bg);
    color: var(--pile-count-text);
    box-shadow: var(--surface-toolbar-shadow);
    font-size: 17px;
    font-weight: 900;
    pointer-events: none;
  }

  :global(.player-panel.top) .hand {
    height: 100%;
    min-height: 0;
    padding: 0 4px;
    align-items: end;
    overflow: visible;
  }

  :global(.player-panel.top) .hand.concealed :global(.card-tile) {
    width: var(--card-w);
    transform: none;
  }

  :global(.player-panel.top) .hand.concealed::after {
    top: calc(100% + 2px);
  }

	  :global(.player-panel.bottom) .hand {
	    min-height: 0;
	    align-items: start;
	    padding-top: var(--hand-hover-clearance);
	    padding-bottom: var(--hand-shadow-clearance);
	  }

	  :global(.player-panel.bottom) .hand.expandable:not(.concealed) {
	    transform: translateY(var(--bottom-hand-rest-offset, calc(var(--card-w) * 0.72)));
	  }

	  :global(.player-panel.bottom) .hand.expandable:not(.concealed):hover,
	  :global(.player-panel.bottom) .hand.expandable:not(.concealed):focus-within,
	  :global(.player-panel.bottom) .hand.expandable.pinned-expanded:not(.concealed) {
	    transform: translateY(0);
	    filter: none;
	  }

	  :global(.player-panel.bottom) .hand.expandable.force-collapsed:not(.concealed) {
	    transform: translateY(var(--bottom-hand-rest-offset, calc(var(--card-w) * 0.72)));
	  }

  @media (max-width: 860px) {
    :global(.player-panel.bottom) .hand.expandable:not(.concealed) {
      transform: translateY(var(--bottom-hand-rest-offset, calc(var(--card-w) * 0.42)));
    }

    :global(.player-panel.bottom) .hand.expandable.force-collapsed:not(.concealed) {
      transform: translateY(var(--bottom-hand-rest-offset, calc(var(--card-w) * 0.42)));
    }
  }
	</style>
