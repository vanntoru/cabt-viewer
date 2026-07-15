<script lang="ts">
  import PromptIcon from './primitives/PromptIcon.svelte';
  import PromptPanel from './primitives/PromptPanel.svelte';
  import {
    boardChoiceEnergyLabel,
    getCabtBoardChoices,
    type CabtBoardChoice,
    type CabtBoardChoiceSlot,
  } from '../../game/cabtBoardChoices';
  import { promptBlockedIndexes, promptOptions } from '../../game/prompts';
  import type { GameView, PromptView } from '../../game/types';

  type Props = {
    game: GameView;
    prompt: PromptView;
    resolving?: boolean;
    onresolve: (value: unknown) => void;
  };

  type PromptCopy = {
    title: string;
    subtitle: string;
    energyLabel: string;
  };

  let { game, prompt, resolving = false, onresolve }: Props = $props();

  let selectedIndexes = $state<number[]>([]);
  let choices = $derived(getCabtBoardChoices(game, prompt));
  let options = $derived(promptOptions(prompt));
  let minSelections = $derived(normalizeLimit(options.min, 0));
  let maxSelections = $derived(normalizeLimit(options.max, choices.length || 1));
  let blockedIndexes = $derived(new Set<number>(promptBlockedIndexes(prompt)));
  let selectionKind = $derived(typeof prompt.fields.selectionKind === 'string' ? prompt.fields.selectionKind : 'board-choice');
  let copy = $derived(copyForSelectionKind(selectionKind));
  let optionalSelection = $derived(minSelections === 0);
  let canSubmit = $derived(selectedIndexes.length >= minSelections && (!optionalSelection || selectedIndexes.length > 0));

  function toggleChoice(index: number) {
    if (blockedIndexes.has(index)) {
      return;
    }
    selectedIndexes = selectedIndexes.includes(index)
      ? selectedIndexes.filter((item) => item !== index)
      : maxSelections <= 1
        ? [index]
        : selectedIndexes.length < maxSelections
          ? [...selectedIndexes, index]
          : selectedIndexes;
  }

  function submit() {
    if (!canSubmit) {
      return;
    }
    onresolve(selectedIndexes);
    selectedIndexes = [];
  }

  function choiceAriaLabel(choice: CabtBoardChoice) {
    const source = choice.source ? slotAriaLabel(choice.source) : '';
    const energy = choice.selectedEnergy ? `${copy.energyLabel} ${boardChoiceEnergyLabel(choice.selectedEnergy)}` : '';
    const destination = choice.destination ? `移動先 ${slotAriaLabel(choice.destination)}` : '';
    return [source, energy, destination].filter(Boolean).join('。');
  }

  function slotAriaLabel(slot: CabtBoardChoiceSlot) {
    return `${slot.ownerLabel} ${slot.positionLabel} ${slot.pokemonName}`;
  }

  function attachedEnergySummary(slot: CabtBoardChoiceSlot) {
    return slot.energies.length
      ? slot.energies.map((card) => boardChoiceEnergyLabel(card)).join('・')
      : 'エネルギーなし';
  }

  function normalizeLimit(raw: unknown, fallback: number) {
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  function copyForSelectionKind(kind: string): PromptCopy {
    if (kind === 'move-energy') {
      return {
        title: '移動するエネルギーを選ぶ',
        subtitle: 'ポケモンと、バトル場・ベンチの位置を確認して選びます',
        energyLabel: '移動するエネルギー',
      };
    }
    if (kind === 'attach-destination') {
      return {
        title: 'エネルギーをつける先を選ぶ',
        subtitle: 'バトル場・ベンチの位置とポケモンを確認して選びます',
        energyLabel: '付いているエネルギー',
      };
    }
    if (kind === 'discard-energy') {
      return {
        title: 'トラッシュするエネルギーを選ぶ',
        subtitle: 'どのポケモンのエネルギーか確認して選びます',
        energyLabel: 'トラッシュするエネルギー',
      };
    }
    return {
      title: 'エネルギーの場所を選ぶ',
      subtitle: 'ポケモンと、バトル場・ベンチの位置を確認して選びます',
      energyLabel: '選ぶエネルギー',
    };
  }
</script>

<PromptPanel
  title={copy.title}
  subtitle={copy.subtitle}
  warning={!prompt.supported ? (prompt.unsupportedReason ?? 'この選択には高度な操作が必要です。') : undefined}
>
  {#snippet icon()}<PromptIcon name="energy" />{/snippet}

  <div class="board-choice-grid">
    {#each choices as choice}
      <button
        type="button"
        class="board-choice"
        class:selected={selectedIndexes.includes(choice.index)}
        disabled={resolving || blockedIndexes.has(choice.index)}
        aria-pressed={selectedIndexes.includes(choice.index)}
        aria-label={choiceAriaLabel(choice)}
        data-testid={`cabt-board-choice-${choice.index}`}
        onclick={() => toggleChoice(choice.index)}
      >
        {#if choice.source}
          <div class="choice-slot">
            <span class="slot-badges">
              <span class="owner-badge">{choice.source.ownerLabel}</span>
              <span class="position-badge">{choice.source.positionLabel}</span>
            </span>
            <strong>{choice.source.pokemonName}</strong>
            {#if choice.selectedEnergy}
              <span class="energy-detail">
                <small>{copy.energyLabel}</small>
                <b>{boardChoiceEnergyLabel(choice.selectedEnergy)}</b>
              </span>
            {:else}
              <span class="energy-summary">{attachedEnergySummary(choice.source)}</span>
            {/if}
          </div>
        {/if}

        {#if choice.source && choice.destination}
          <span class="choice-arrow" aria-hidden="true">→</span>
        {/if}

        {#if choice.destination}
          <div class="choice-slot destination-slot">
            <span class="slot-badges">
              <span class="owner-badge">{choice.destination.ownerLabel}</span>
              <span class="position-badge">{choice.destination.positionLabel}</span>
            </span>
            <strong>{choice.destination.pokemonName}</strong>
            <span class="energy-summary">{attachedEnergySummary(choice.destination)}</span>
          </div>
        {/if}
      </button>
    {/each}
  </div>

  {#snippet actions()}
    {#if options.allowCancel}
      <button disabled={resolving} onclick={() => onresolve(null)}>キャンセル</button>
    {/if}
    {#if optionalSelection}
      <button disabled={resolving} onclick={() => onresolve([])}>選ばない</button>
    {/if}
    <button class="primary" disabled={resolving || !canSubmit} onclick={submit}>決定</button>
  {/snippet}
</PromptPanel>

<style>
  .board-choice-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 10px;
  }

  .board-choice {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 9px;
    min-width: 0;
    min-height: 118px;
    padding: 12px;
    border: 1px solid var(--surface-inset-border);
    border-radius: var(--radius-md);
    background: var(--surface-inset-bg);
    color: var(--text-primary);
    text-align: left;
    touch-action: manipulation;
  }

  .board-choice.selected {
    border-color: var(--selection-border-strong);
    background: var(--selection-bg);
    box-shadow: var(--glow-selected-shadow);
  }

  .choice-slot {
    display: grid;
    align-content: start;
    gap: 7px;
    min-width: 0;
  }

  .slot-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .slot-badges span {
    padding: 4px 8px;
    border-radius: var(--radius-pill);
    font-size: 11px;
    font-weight: 850;
    line-height: 1.1;
  }

  .owner-badge {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }

  .position-badge {
    background: var(--surface-glass-bg);
    color: var(--text-secondary);
  }

  .choice-slot strong {
    min-width: 0;
    overflow: hidden;
    font-size: 15px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .energy-detail {
    display: grid;
    gap: 2px;
    min-width: 0;
    padding: 7px 9px;
    border-radius: var(--radius-sm);
    background: var(--warning-soft);
    color: var(--warning-strong);
  }

  .energy-detail small {
    font-size: 10px;
    font-weight: 750;
  }

  .energy-detail b,
  .energy-summary {
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.3;
    text-overflow: ellipsis;
  }

  .energy-summary {
    display: -webkit-box;
    color: var(--text-muted);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .choice-arrow {
    display: grid;
    place-items: center;
    color: var(--accent-strong);
    font-size: 20px;
    font-weight: 900;
  }

  .destination-slot {
    padding-top: 1px;
  }

  @media (min-width: 720px) {
    .board-choice:has(.choice-arrow) {
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
    }
  }

  @media (max-width: 520px) {
    .board-choice-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
