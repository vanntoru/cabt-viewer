<script lang="ts">
  import CardTile from './CardTile.svelte';
  import { energyIconSrc, pokemonTypeIconSrc, pokemonTypeLabelFor } from '../game/energyIcons';
  import { slotNameJa } from '../game/jaText';
  import type { PokemonSlotView } from '../game/types';
  import { cardPreviewStore } from '../../state/cardPreview.svelte';

  type Props = {
    slot: PokemonSlotView;
    active?: boolean;
    canDrop?: boolean;
    promptSelectable?: boolean;
    promptSelected?: boolean;
    slotDelta?: number;
    damageQuickAmounts?: number[];
    canAdjustDamage?: (amount: number) => boolean;
    adjustDamage?: (amount: number) => void;
    placement?: '' | 'top-active-slot' | 'bottom-active-slot';
    onclick?: (event: MouseEvent) => void;
    ondragover?: (event: DragEvent) => void;
    ondrop?: (event: DragEvent) => void;
  };

  let {
    slot,
    active = false,
    canDrop = false,
    promptSelectable = false,
    promptSelected = false,
    slotDelta = 0,
    damageQuickAmounts = [],
    canAdjustDamage,
    adjustDamage,
    placement = '',
    onclick,
    ondragover,
    ondrop,
  }: Props = $props();

  let stackedEnergy = $derived(slot.energy.length > 4);
  let displayHp = $derived(slot.hp || pokemonHp(slot.pokemon));
  let printedHp = $derived(pokemonHp(slot.pokemon));
  let hpModified = $derived(!!displayHp && !!printedHp && displayHp !== printedHp);
  let hpIncreased = $derived(hpModified && displayHp > printedHp);
  let hpDecreased = $derived(hpModified && displayHp < printedHp);
  let pokemonTypeIcon = $derived(pokemonTypeIconSrc(slot.pokemon?.cardType));
  let pokemonTypeLabel = $derived(pokemonTypeLabelFor(slot.pokemon?.cardType));
  let toolPreview = $derived(slot.tools[0]);
  let toolPreviewImageUrl = $derived(toolPreview?.imageUrl ?? toolPreview?.cardImage);
  let toolNames = $derived(slot.tools.map((tool) => tool.fullName || tool.name).join(', '));
  let failedToolImageUrl = $state('');
  let lastToolImageUrl = $state<string | undefined>();
  let showToolImage = $derived(!!toolPreviewImageUrl && failedToolImageUrl !== toolPreviewImageUrl);

  $effect(() => {
    if (toolPreviewImageUrl !== lastToolImageUrl) {
      failedToolImageUrl = '';
      lastToolImageUrl = toolPreviewImageUrl;
    }
  });

  function energyStackStyle(index: number) {
    if (!stackedEnergy) {
      return '';
    }
    const progress = slot.energy.length <= 1 ? 0 : index / (slot.energy.length - 1);
    const offsetPercent = progress * 75;
    const offsetPixels = progress * 1.5;
    return `--energy-offset: calc(${offsetPercent}% + ${offsetPixels}px); --energy-z: ${index + 1};`;
  }

  function hasPendingAttach(card: { pendingAttach?: unknown }) {
    return card.pendingAttach === true;
  }

  function pokemonHp(card: { hp?: unknown } | undefined) {
    return typeof card?.hp === 'number' && Number.isFinite(card.hp) ? card.hp : 0;
  }

  function showToolPreview(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (toolPreview) {
      cardPreviewStore.show(toolPreview, toolPreviewImageUrl);
    }
  }

  function showToolPreviewFromKey(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    showToolPreview(event);
  }

  function canAdjust(amount: number) {
    return canAdjustDamage?.(amount) ?? false;
  }

  function adjustFromControl(event: MouseEvent | KeyboardEvent, amount: number) {
    event.preventDefault();
    event.stopPropagation();
    if (canAdjust(amount)) {
      adjustDamage?.(amount);
    }
  }

  function stopControlPointer(event: PointerEvent) {
    event.stopPropagation();
  }

  let showDamageControls = $derived(promptSelectable && damageQuickAmounts.length > 0 && !!adjustDamage);
</script>

<div
  class:active
  class={`board-slot-frame ${placement}`}
>
  <button
    type="button"
    class:active
    class:empty={slot.empty}
    class:can-drop={canDrop}
    class:prompt-selectable={promptSelectable}
    class:prompt-selected={promptSelected}
    class="board-slot"
    data-testid={`slot-${slot.ownerIndex}-${slot.slot}-${slot.index}`}
    data-owner-index={slot.ownerIndex}
    data-slot-kind={slot.slot}
    data-slot-index={slot.index}
    title={slot.pokemon?.fullName ?? slotNameJa(slot.slot, slot.index)}
    {onclick}
    {ondragover}
    {ondrop}
  >
    {#if slotDelta !== 0}
      <div class="prompt-damage-badge" class:negative={slotDelta < 0}>
        {slotDelta > 0 ? '+' : '−'}{Math.abs(slotDelta)}
      </div>
    {/if}

    {#if slot.pokemon}
      <CardTile card={slot.pokemon} />
      {#if displayHp || pokemonTypeIcon}
        <div class="pokemon-status">
          <span
            class="pokemon-hp-bubble"
            class:hp-increased={hpIncreased}
            class:hp-decreased={hpDecreased}
            title={`${displayHp ? `${displayHp} HP${hpModified ? ` (印刷値 ${printedHp})` : ''}` : 'ポケモン'}${pokemonTypeIcon ? ` · ${pokemonTypeLabel}` : ''}`}
          >
            {#if displayHp}
              <span>{displayHp}</span>
            {/if}
            {#if pokemonTypeIcon}
              <img src={pokemonTypeIcon} alt={pokemonTypeLabel} />
            {/if}
          </span>
        </div>
      {/if}
      {#if slot.energy.length}
        <div class="energy-badges" class:stacked-energy={stackedEnergy} title={`ついているエネルギー ${slot.energy.length}枚`}>
          {#each slot.energy as energy, energyIndex}
            <img
              src={energyIconSrc(energy)}
              alt={energy.name || 'エネルギー'}
              class:pending-energy={hasPendingAttach(energy)}
              style={energyStackStyle(energyIndex)}
            />
          {/each}
        </div>
      {/if}
      {#if slot.tools.length}
        <div
          class="tool-card-preview"
          role="button"
          tabindex="0"
          title={slot.tools.length > 1 ? `ついているどうぐ ${slot.tools.length}枚: ${toolNames}` : toolNames}
          aria-label={slot.tools.length > 1 ? `ついているどうぐ ${slot.tools.length}枚` : `ついているどうぐ ${toolPreview?.name ?? ''}`}
          onclick={showToolPreview}
          onkeydown={showToolPreviewFromKey}
        >
          {#if showToolImage}
            <img
              src={toolPreviewImageUrl}
              alt={toolPreview?.name || 'ポケモンのどうぐ'}
              loading="lazy"
              decoding="async"
              draggable="false"
              onerror={() => (failedToolImageUrl = toolPreviewImageUrl ?? '')}
            />
          {:else}
            <span>{slot.tools.length > 1 ? `どうぐ${slot.tools.length}枚` : 'どうぐ'}</span>
          {/if}
          {#if slot.tools.length > 1}
            <span class="tool-count" aria-label={`ついているどうぐ ${slot.tools.length}枚`}>{slot.tools.length}</span>
          {/if}
        </div>
      {/if}
      {#if slot.damage > 0}
        <span class="damage-counter board-damage-counter" class:triple-digit={slot.damage >= 100} title={`${slot.damage}ダメージ`}>
          <span class="damage-counter-value">{slot.damage}</span>
        </span>
      {/if}
      <div class="slot-badges" title={displayHp ? `残りHP ${Math.max(0, displayHp - slot.damage)}/${displayHp}` : undefined}>
        {#if slot.specialConditions.length}
          <span>{slot.specialConditions.length} S</span>
        {/if}
      </div>
    {:else}
      <div class="empty-zone"></div>
    {/if}
  </button>

  {#if showDamageControls}
    <div class="damage-quick-controls" aria-label="ダメカン配分">
      <button
        type="button"
        disabled={!canAdjust(-10)}
        title="-10"
        onpointerdown={stopControlPointer}
        onclick={(event) => adjustFromControl(event, -10)}
      >−10</button>
      {#each damageQuickAmounts as amount}
        <button
          type="button"
          disabled={!canAdjust(amount)}
          title={`+${amount}`}
          onpointerdown={stopControlPointer}
          onclick={(event) => adjustFromControl(event, amount)}
        >+{amount}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .board-slot-frame {
    --slot-card-w: var(--card-w);
    position: relative;
    z-index: 5;
    width: var(--card-w);
    min-width: 0;
    aspect-ratio: 63 / 88;
    pointer-events: auto;
  }

  .board-slot-frame.active {
    --slot-card-w: var(--active-w);
    width: var(--active-w);
  }

  .board-slot {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    box-shadow: none;
    display: block;
    transition:
      background var(--transition-fast),
      box-shadow var(--transition-fast),
      filter var(--transition-fast);
  }

  :global(.debug-zones) .board-slot {
    outline: 2px solid rgba(34, 197, 94, 0.78);
    outline-offset: 4px;
    background: rgba(34, 197, 94, 0.06);
  }

  .board-slot.empty {
    border: 1px dashed var(--slot-empty-border);
    background: var(--slot-empty-bg);
  }

  .board-slot.can-drop,
  .board-slot.prompt-selectable {
    outline: 0;
    background: var(--selection-bg);
    box-shadow: var(--glow-playable-shadow);
    filter: saturate(1.04);
  }

  .board-slot.prompt-selected {
    background: var(--selection-bg);
    box-shadow: var(--glow-selected-shadow);
  }

  .board-slot > :global(.card-tile) {
    width: 100%;
    height: 100%;
  }

  .prompt-damage-badge {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 7;
    min-width: 34px;
    padding: 5px 8px;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    background: #c2410c;
    color: #fff7ed;
    box-shadow: 0 8px 18px rgba(94, 36, 12, 0.28);
    font-size: 14px;
    font-weight: 900;
    line-height: 1;
    text-align: center;
    pointer-events: none;
  }

  .prompt-damage-badge.negative {
    background: #166e5b;
    box-shadow: 0 8px 18px rgba(15, 60, 49, 0.32);
  }

  .damage-quick-controls {
    position: absolute;
    left: 50%;
    bottom: calc(var(--slot-card-w) * 0.06);
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px;
    width: calc(var(--slot-card-w) * 0.82);
    transform: translate3d(-50%, 0, 96px);
    pointer-events: auto;
  }

  .damage-quick-controls button {
    display: grid;
    place-items: center;
    min-height: clamp(17px, calc(var(--slot-card-w) * 0.16), 24px);
    padding: 0;
    border: 1px solid rgba(129, 71, 21, 0.46);
    border-radius: 5px;
    background: rgba(255, 247, 237, 0.96);
    box-shadow: 0 4px 9px rgba(94, 36, 12, 0.18);
    color: #7c2d12;
    font-size: clamp(8px, calc(var(--slot-card-w) * 0.085), 11px);
    font-weight: 950;
    line-height: 1;
    cursor: pointer;
    user-select: none;
  }

  .damage-quick-controls button:not(:disabled):hover,
  .damage-quick-controls button:not(:disabled):focus-visible {
    border-color: rgba(234, 88, 12, 0.85);
    background: #ffedd5;
    outline: 2px solid rgba(251, 146, 60, 0.42);
    outline-offset: 1px;
  }

  .damage-quick-controls button:disabled {
    opacity: 0.36;
    cursor: default;
  }

  .empty-zone {
    width: 100%;
    height: 100%;
  }

  .slot-badges {
    position: absolute;
    inset: auto -9px -9px auto;
    z-index: 4;
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 120%;
    pointer-events: none;
  }

  .slot-badges span {
    display: inline-grid;
    place-items: center;
    min-width: 19px;
    min-height: 19px;
    padding: 1px 5px;
    border-radius: var(--radius-pill);
    background: var(--slot-badge-bg);
    box-shadow: var(--slot-badge-shadow);
    color: var(--text-primary);
    font-size: 9px;
    font-weight: 800;
  }

  .pokemon-status {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 6;
    display: grid;
    justify-items: end;
    gap: clamp(2px, calc(var(--slot-card-w) * 0.025), 5px);
    max-width: 100%;
    pointer-events: none;
  }

  .pokemon-hp-bubble {
    display: inline-flex;
    align-items: center;
    gap: clamp(2px, calc(var(--slot-card-w) * 0.03), 5px);
    min-height: clamp(18px, calc(var(--slot-card-w) * 0.16), 26px);
    padding: clamp(1px, calc(var(--slot-card-w) * 0.018), 3px) clamp(3px, calc(var(--slot-card-w) * 0.04), 6px) clamp(1px, calc(var(--slot-card-w) * 0.018), 3px) clamp(6px, calc(var(--slot-card-w) * 0.055), 10px);
    border-radius: 5px;
    border: 1px solid var(--slot-status-border);
    background: var(--slot-status-bg);
    box-shadow: var(--slot-status-shadow);
    color: var(--slot-status-text);
    font-size: clamp(11px, calc(var(--slot-card-w) * 0.105), 16px);
    font-weight: 950;
    line-height: 1;
    white-space: nowrap;
    letter-spacing: 0;
  }

  .pokemon-hp-bubble.hp-increased {
    color: #15803d;
  }

  .pokemon-hp-bubble.hp-decreased {
    color: #b91c1c;
  }

  .pokemon-hp-bubble img {
    width: clamp(13px, calc(var(--slot-card-w) * 0.12), 19px);
    height: clamp(13px, calc(var(--slot-card-w) * 0.12), 19px);
    object-fit: contain;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.28));
  }

  .energy-badges {
    --energy-gap: clamp(2px, calc(var(--slot-card-w) * 0.018), 3px);
    --energy-icon-size: calc((var(--slot-card-w) - (var(--energy-gap) * 3)) / 4);
    position: absolute;
    left: 0;
    bottom: calc(var(--slot-card-w) * -0.095);
    z-index: 5;
    width: 100%;
    min-height: var(--energy-icon-size);
    display: flex;
    align-items: center;
    gap: var(--energy-gap);
    pointer-events: none;
  }

  .energy-badges img {
    flex: 0 0 var(--energy-icon-size);
    width: var(--energy-icon-size);
    height: var(--energy-icon-size);
    border-radius: 999px;
    object-fit: contain;
    filter: drop-shadow(0 3px 4px rgba(23, 30, 38, 0.38));
  }

  .energy-badges img.pending-energy {
    opacity: 0.5;
  }

  .energy-badges.stacked-energy {
    display: block;
  }

  .energy-badges.stacked-energy img {
    position: absolute;
    left: var(--energy-offset);
    bottom: 0;
    z-index: var(--energy-z);
  }

  .tool-card-preview {
    --tool-preview-top: calc(var(--slot-card-w) * 0.38);
    --tool-preview-width: calc(var(--slot-card-w) * 0.5);
    --tool-art-crop-width: 118%;
    --tool-art-crop-height: 260%;
    --tool-art-crop-left: -9%;
    --tool-art-crop-top: -36.3%;
    position: absolute;
    right: 0;
    top: var(--tool-preview-top);
    z-index: 6;
    width: var(--tool-preview-width);
    aspect-ratio: 1.58;
    overflow: hidden;
    display: grid;
    place-items: center;
    border-radius: clamp(3px, calc(var(--slot-card-w) * 0.035), 6px);
    border: 1px solid rgba(255, 255, 255, 0.72);
    background:
      linear-gradient(180deg, rgba(250, 252, 255, 0.92), rgba(210, 218, 227, 0.9));
    box-shadow:
      0 5px 10px rgba(23, 30, 38, 0.34),
      inset 0 0 0 1px rgba(26, 31, 39, 0.18);
    cursor: zoom-in;
    pointer-events: auto;
  }

  .tool-card-preview:hover {
    border-color: rgba(20, 184, 166, 0.9);
    box-shadow:
      0 8px 16px rgba(15, 118, 110, 0.3),
      inset 0 0 0 1px rgba(13, 148, 136, 0.34);
  }

  .tool-card-preview img {
    position: absolute;
    width: var(--tool-art-crop-width);
    height: var(--tool-art-crop-height);
    left: var(--tool-art-crop-left);
    top: var(--tool-art-crop-top);
    display: block;
    object-fit: fill;
    pointer-events: none;
    -webkit-user-drag: none;
  }

  .tool-card-preview > span:not(.tool-count) {
    padding: 0 5px;
    color: #2f3742;
    font-size: clamp(8px, calc(var(--slot-card-w) * 0.07), 11px);
    font-weight: 900;
    line-height: 1;
    white-space: nowrap;
  }

  .tool-count {
    position: absolute;
    right: -1px;
    bottom: -1px;
    min-width: clamp(13px, calc(var(--slot-card-w) * 0.12), 18px);
    min-height: clamp(13px, calc(var(--slot-card-w) * 0.12), 18px);
    display: grid;
    place-items: center;
    border-radius: 999px 0 0 0;
    background: rgba(20, 25, 32, 0.82);
    color: #fff;
    font-size: clamp(8px, calc(var(--slot-card-w) * 0.07), 11px);
    font-weight: 900;
    line-height: 1;
  }

  .damage-counter {
    position: absolute;
    top: 32%;
    left: 50%;
    z-index: 12;
    display: inline-grid;
    place-items: center;
    width: clamp(34px, calc(var(--slot-card-w, var(--card-w, 88px)) * 0.38), 66px);
    height: clamp(34px, calc(var(--slot-card-w, var(--card-w, 88px)) * 0.38), 66px);
    padding: 0;
    border-radius: 999px;
    border: 1px solid rgba(128, 76, 18, 0.46);
    background:
      radial-gradient(circle at 34% 24%, rgba(255, 232, 121, 0.9), transparent 34%),
      linear-gradient(180deg, #ffb03d 0%, #f39023 54%, #c97018 100%);
    box-shadow:
      0 3px 8px rgba(95, 48, 13, 0.28),
      inset 0 2px 2px rgba(255, 236, 155, 0.7),
      inset 0 -2px 3px rgba(128, 60, 10, 0.34);
    color: #fff8df;
    font-size: clamp(15px, calc(var(--slot-card-w, var(--card-w, 88px)) * 0.19), 30px);
    font-weight: 950;
    line-height: 1;
    -webkit-text-stroke: 1.3px #1f1f1f;
    paint-order: stroke fill;
    transform: translate(-50%, -50%);
    pointer-events: none;
    text-shadow: none;
  }

  .damage-counter-value {
    display: inline-block;
  }

  .damage-counter.triple-digit {
    font-size: clamp(13px, calc(var(--slot-card-w, var(--card-w, 88px)) * 0.165), 26px);
  }
</style>
