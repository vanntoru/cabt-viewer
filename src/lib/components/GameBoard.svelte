<script lang="ts">
  import ActiveDuel from './ActiveDuel.svelte';
  import BenchZone from './BenchZone.svelte';
  import CenterPiles from './CenterPiles.svelte';
  import { zoneNameJa } from '../game/jaText';
  import type { CardView, PlayerView, PokemonSlotView } from '../game/types';
  import { cardPreviewStore } from '../../state/cardPreview.svelte';

  type ZoneName = 'deck' | 'discard' | 'lostZone' | 'prize' | 'stadium' | 'playZone';

  type Props = {
    topPlayer: PlayerView;
    bottomPlayer: PlayerView;
    topBenchSlots?: PokemonSlotView[];
    bottomBenchSlots?: PokemonSlotView[];
    topActiveSlot: PokemonSlotView;
    bottomActiveSlot: PokemonSlotView;
    currentStadium?: CardView;
    currentStadiumOwner?: PlayerView;
    canPlayToBenchArea: (player: PlayerView) => boolean;
    canPlaceSetupBench: (player: PlayerView) => boolean;
    playToBenchArea: (player: PlayerView) => void;
    placeSetupBench: () => void;
    allowBenchDrop: (event: DragEvent, player: PlayerView) => void;
    dropToBenchArea: (player: PlayerView, event: DragEvent) => void;
    isPlayableTarget: (slot: PokemonSlotView) => boolean;
    isBoardPromptSelectable: (slot: PokemonSlotView) => boolean;
    isBoardPromptSelected: (slot: PokemonSlotView) => boolean;
    boardSlotDelta: (slot: PokemonSlotView) => number;
    damageQuickAmounts?: (slot: PokemonSlotView) => number[];
    canAdjustSlotDamage?: (slot: PokemonSlotView, amount: number) => boolean;
    adjustSlotDamage?: (slot: PokemonSlotView, amount: number) => void;
    clickSlot: (slot: PokemonSlotView) => void;
    allowDrop: (event: DragEvent, slot: PokemonSlotView) => void;
    dropToSlot: (slot: PokemonSlotView, event: DragEvent) => void;
    canPlaceSetupActive: (slot: PokemonSlotView) => boolean;
    placeSetupActive: () => void;
    showZone: (playerIndex: number, zone: ZoneName, title: string, faceDown?: boolean) => void;
    canPlayOnBoard?: boolean;
    clickBoardPlay: (event: MouseEvent) => void;
    allowBoardPlayDrop: (event: DragEvent) => void;
    dropToBoardPlay: (event: DragEvent) => void;
    boardTilt?: number;
    boardPerspective?: number;
    boardScaleY?: number;
    boardLift?: number;
    onProjectedPileHoverChange?: (pileKey: string) => void;
  };

  let {
    topPlayer,
    bottomPlayer,
    topBenchSlots = [],
    bottomBenchSlots = [],
    topActiveSlot,
    bottomActiveSlot,
    currentStadium,
    currentStadiumOwner,
    canPlayToBenchArea,
    canPlaceSetupBench,
    playToBenchArea,
    placeSetupBench,
    allowBenchDrop,
    dropToBenchArea,
    isPlayableTarget,
    isBoardPromptSelectable,
    isBoardPromptSelected,
    boardSlotDelta,
    damageQuickAmounts = () => [],
    canAdjustSlotDamage = () => false,
    adjustSlotDamage = () => {},
    clickSlot,
    allowDrop,
    dropToSlot,
    canPlaceSetupActive,
    placeSetupActive,
    showZone,
    canPlayOnBoard = false,
    clickBoardPlay,
    allowBoardPlayDrop,
    dropToBoardPlay,
    boardTilt = 8,
    boardPerspective = 1250,
    boardScaleY = 98,
    boardLift = 0,
    onProjectedPileHoverChange,
  }: Props = $props();

  let topLostPileElement = $state<HTMLButtonElement>();
  let topDiscardPileElement = $state<HTMLButtonElement>();
  let bottomLostPileElement = $state<HTMLButtonElement>();
  let bottomDiscardPileElement = $state<HTMLButtonElement>();
  let projectedHoverPile = $state('');

  type ProjectedPileKey = 'top-lost' | 'top-discard' | 'bottom-lost' | 'bottom-discard';

  function projectedPiles(): Array<[ProjectedPileKey, HTMLButtonElement | undefined, () => void]> {
    return [
      ['top-lost', topLostPileElement, () => showZone(topPlayer.index, 'lostZone', `${topPlayer.name}の${zoneNameJa('lostZone')}`)],
      ['top-discard', topDiscardPileElement, () => showZone(topPlayer.index, 'discard', `${topPlayer.name}の${zoneNameJa('discard')}`)],
      ['bottom-lost', bottomLostPileElement, () => showZone(bottomPlayer.index, 'lostZone', `${bottomPlayer.name}の${zoneNameJa('lostZone')}`)],
      ['bottom-discard', bottomDiscardPileElement, () => showZone(bottomPlayer.index, 'discard', `${bottomPlayer.name}の${zoneNameJa('discard')}`)],
    ];
  }

  function containsPoint(element: HTMLElement | undefined, event: MouseEvent) {
    if (!element) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  function clickProjectedPile(event: MouseEvent) {
    const pile = projectedPiles().find(([, element]) => containsPoint(element, event));
    if (!pile) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    pile[2]();
    return true;
  }

  function clickProjectedStadium(event: MouseEvent) {
    if (!currentStadium || !currentStadiumOwner) {
      return false;
    }
    const board = event.currentTarget;
    if (!(board instanceof HTMLElement)) {
      return false;
    }
    const stadiumElement = Array.from(board.querySelectorAll<HTMLElement>('.stadium-card'))
      .find((element) => containsPoint(element, event));
    if (!stadiumElement) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    showZone(currentStadiumOwner.index, 'stadium', `${currentStadiumOwner.name}の${zoneNameJa('stadium')}`);
    return true;
  }

  function isInteractiveBoardTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      target.closest('button, a, input, textarea, select, .board-slot, .card-tile, .bench-drop-surface, .stack-pile, .stadium-card')
    );
  }

  function slotForElement(element: HTMLElement) {
    const ownerIndex = Number(element.dataset.ownerIndex);
    const slotKind = element.dataset.slotKind;
    const slotIndex = Number(element.dataset.slotIndex);
    if (!Number.isFinite(ownerIndex) || (slotKind !== 'active' && slotKind !== 'bench') || !Number.isFinite(slotIndex)) {
      return undefined;
    }
    if (ownerIndex === topPlayer.index) {
      return slotKind === 'active' ? topActiveSlot : topBenchSlots.find((slot) => slot.index === slotIndex);
    }
    if (ownerIndex === bottomPlayer.index) {
      return slotKind === 'active' ? bottomActiveSlot : bottomBenchSlots.find((slot) => slot.index === slotIndex);
    }
    return undefined;
  }

  function distanceFromElementCenter(element: HTMLElement, event: MouseEvent) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return Math.hypot(event.clientX - centerX, event.clientY - centerY);
  }

  function suppressTouchLandscapePreview() {
    return typeof window !== 'undefined'
      && window.matchMedia('(pointer: coarse) and (orientation: landscape)').matches;
  }

  function clickProjectedSlot(event: MouseEvent) {
    if (isInteractiveBoardTarget(event.target)) {
      return false;
    }
    const board = event.currentTarget;
    if (!(board instanceof HTMLElement)) {
      return false;
    }
    const slotElement = Array.from(
      board.querySelectorAll<HTMLElement>('.board-slot[data-owner-index][data-slot-kind][data-slot-index]')
    )
      .filter((element) => containsPoint(element, event))
      .sort((a, b) => distanceFromElementCenter(a, event) - distanceFromElementCenter(b, event))[0];
    const slot = slotElement ? slotForElement(slotElement) : undefined;
    if (!slot || slot.empty) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    if (slot.pokemon) {
      if (suppressTouchLandscapePreview()) {
        return true;
      }
      cardPreviewStore.show(slot.pokemon);
      return true;
    }
    clickSlot(slot);
    return true;
  }

  function setProjectedPileHover(pileKey: string) {
    if (projectedHoverPile === pileKey) {
      return;
    }
    projectedHoverPile = pileKey;
    onProjectedPileHoverChange?.(pileKey);
  }

  function updateProjectedPileHover(event: MouseEvent) {
    setProjectedPileHover(projectedPiles().find(([, element]) => containsPoint(element, event))?.[0] ?? '');
  }

  $effect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.addEventListener('mousemove', updateProjectedPileHover, { passive: true });
    return () => {
      window.removeEventListener('mousemove', updateProjectedPileHover);
    };
  });

  let boardPerspectiveStyle = $derived([
    `--board-tilt: ${boardTilt}deg`,
    `--board-perspective: ${boardPerspective}px`,
    `--board-scale-y: ${boardScaleY / 100}`,
    `--board-lift: ${boardLift}px`,
  ].join('; '));

  function clickBoardSurface(event: MouseEvent) {
    if (clickProjectedPile(event)) {
      return;
    }
    if (clickProjectedStadium(event)) {
      return;
    }
    if (clickProjectedSlot(event)) {
      return;
    }
    if (!canPlayOnBoard) {
      return;
    }
    if (isInteractiveBoardTarget(event.target)) {
      return;
    }
    clickBoardPlay(event);
  }

  function showLostZone(player: PlayerView) {
    showZone(player.index, 'lostZone', `${player.name}の${zoneNameJa('lostZone')}`);
  }

  function showDiscard(player: PlayerView) {
    showZone(player.index, 'discard', `${player.name}の${zoneNameJa('discard')}`);
  }

  function showDeck(player: PlayerView) {
    showZone(player.index, 'deck', `${player.name}の${zoneNameJa('deck')}`);
  }

  function showPrize(player: PlayerView) {
    showZone(player.index, 'prize', `${player.name}の${zoneNameJa('prize')}`);
  }
</script>

<section
  class="playmat"
  class:can-play-on-board={canPlayOnBoard}
  class:has-projected-pile-hover={projectedHoverPile !== ''}
  style={boardPerspectiveStyle}
  role="presentation"
  onclick={clickBoardSurface}
  onmousemove={updateProjectedPileHover}
  onmouseleave={() => setProjectedPileHover('')}
  ondragover={allowBoardPlayDrop}
  ondrop={dropToBoardPlay}
>
  <div
    class="game-board-plane"
    class:can-play-on-board={canPlayOnBoard}
    role="presentation"
    ondragover={allowBoardPlayDrop}
    ondrop={dropToBoardPlay}
  >
    <BenchZone
      player={topPlayer}
      slots={topBenchSlots}
      opponent
      {canPlayToBenchArea}
      {canPlayOnBoard}
      {clickBoardPlay}
      {canPlaceSetupBench}
      {playToBenchArea}
      {placeSetupBench}
      {allowBenchDrop}
      {dropToBenchArea}
      {isPlayableTarget}
      {isBoardPromptSelectable}
      {isBoardPromptSelected}
      {boardSlotDelta}
      {damageQuickAmounts}
      {canAdjustSlotDamage}
      {adjustSlotDamage}
      {clickSlot}
      {allowDrop}
      {dropToSlot}
    />

    <CenterPiles
      {topPlayer}
      {bottomPlayer}
      {boardTilt}
      {projectedHoverPile}
      bind:topLostPileElement
      bind:topDiscardPileElement
      bind:bottomLostPileElement
      bind:bottomDiscardPileElement
      {showLostZone}
      {showDiscard}
      {showDeck}
      {showPrize}
    />

    <ActiveDuel
      {topPlayer}
      {bottomPlayer}
      {topActiveSlot}
      {bottomActiveSlot}
      {currentStadium}
      {currentStadiumOwner}
      {isPlayableTarget}
      {isBoardPromptSelectable}
      {isBoardPromptSelected}
      {boardSlotDelta}
      {damageQuickAmounts}
      {canAdjustSlotDamage}
      {adjustSlotDamage}
      {clickSlot}
      {allowDrop}
      {dropToSlot}
      {canPlaceSetupActive}
      {placeSetupActive}
      {showZone}
    />

    <BenchZone
      player={bottomPlayer}
      slots={bottomBenchSlots}
      {canPlayToBenchArea}
      {canPlayOnBoard}
      {clickBoardPlay}
      {canPlaceSetupBench}
      {playToBenchArea}
      {placeSetupBench}
      {allowBenchDrop}
      {dropToBenchArea}
      {isPlayableTarget}
      {isBoardPromptSelectable}
      {isBoardPromptSelected}
      {boardSlotDelta}
      {damageQuickAmounts}
      {canAdjustSlotDamage}
      {adjustSlotDamage}
      {clickSlot}
      {allowDrop}
      {dropToSlot}
    />
  </div>

</section>

<style>
  .playmat {
    --active-preferred-w: calc(var(--board-card-w) * 1.48);
    --active-fit-w: max(
      calc(var(--board-card-w) * 1.15),
      calc((var(--board-h) - (var(--bench-row-h) * 2) - (var(--board-row-gap) * 2) - var(--active-gap)) / 2.794)
    );
    --active-w: min(var(--active-preferred-w), var(--active-fit-w));
    --active-h: calc(var(--active-w) * 1.397);
    --pile-w: calc(var(--board-card-w) * 1.28);
    --prize-card-w: calc(var(--board-card-w) * 0.96);
    --prize-grid-w: calc(var(--prize-card-w) * 1.98);
    --prize-grid-h: calc((var(--prize-card-w) * 1.397) + (var(--prize-card-w) * 1.42));
    --side-field-w: max(var(--prize-grid-w), var(--pile-w));
    --bench-gap: calc(var(--board-card-w) * 0.18);
    position: absolute;
    inset: var(--board-top-inset) var(--board-right-rail) var(--board-bottom-inset) 0;
    min-width: 0;
    perspective: var(--board-perspective, 1250px);
    perspective-origin: 50% 68%;
    transform-style: preserve-3d;
    pointer-events: none;
  }

  .playmat.has-projected-pile-hover {
    cursor: pointer;
  }

  :global(.debug-zones) .playmat {
    outline: 2px solid rgba(37, 99, 235, 0.9);
    outline-offset: -2px;
    background: rgba(37, 99, 235, 0.05);
  }

  .game-board-plane {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-areas:
      "top-left top-bench top-right"
      "battle-left battle battle-right"
      "bottom-left bottom-bench bottom-right";
    grid-template-columns:
      minmax(var(--side-field-w), calc(var(--side-field-w) + (var(--board-card-w) * 0.42)))
      minmax(0, 1fr)
      minmax(var(--side-field-w), calc(var(--side-field-w) + (var(--board-card-w) * 0.42)));
    grid-template-rows:
      var(--bench-row-h)
      minmax(calc((var(--active-h) * 2) + var(--active-gap)), 1fr)
      var(--bench-row-h);
    gap: var(--board-row-gap);
    align-items: stretch;
    justify-items: stretch;
    padding: var(--board-content-inset-y) var(--board-content-inset-x);
    background: var(--board-plane-bg);
    overflow: visible;
    transform: rotateX(var(--board-tilt, 8deg)) scaleY(var(--board-scale-y, 0.94)) translateY(var(--board-lift, 0px));
    transform-origin: 50% 58%;
    transform-style: preserve-3d;
    will-change: transform;
    pointer-events: auto;
  }

  :global(.debug-zones) .game-board-plane {
    outline: 2px solid rgba(14, 165, 233, 0.9);
    outline-offset: -4px;
    background: var(--board-plane-debug-bg);
  }

  .game-board-plane::before {
    content: "";
    position: absolute;
    inset: var(--board-outline-pad-y) var(--board-edge-pad-x);
    z-index: 0;
    border: 2px solid var(--board-border);
    border-radius: 18px;
    box-shadow:
      inset 0 0 0 1px var(--board-inset-highlight),
      var(--board-shadow);
    pointer-events: none;
  }

  .game-board-plane::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 0;
    width: clamp(180px, min(21vw, 32vh), 300px);
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    background: url("/assets/pokeball.svg") center / contain no-repeat;
    opacity: var(--board-center-opacity);
    pointer-events: none;
  }

  .game-board-plane.can-play-on-board {
    cursor: pointer;
  }

  .game-board-plane.can-play-on-board::before {
    border-color: var(--selection-border-strong);
    background: var(--board-play-bg);
    box-shadow: var(--board-play-shadow);
  }

  @media (max-width: 980px) {
    .game-board-plane {
      padding-inline: 12px;
    }
  }

  @media (max-width: 860px) {
    .playmat {
      perspective: none;
    }

    .game-board-plane {
      gap: calc(var(--board-row-gap) * 0.72);
      padding: 8px 18px;
      transform: none;
    }

    .game-board-plane::before {
      border-radius: 12px;
    }

    .game-board-plane::after {
      width: clamp(140px, 42vw, 210px);
    }
  }
</style>
