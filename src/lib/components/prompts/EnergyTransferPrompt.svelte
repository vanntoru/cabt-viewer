<script lang="ts">
  import EnergyTransferTargetButton from './EnergyTransferTargetButton.svelte';
  import PromptPanel from './primitives/PromptPanel.svelte';
  import PromptIcon from './primitives/PromptIcon.svelte';
  import {
    energyCardLabel,
    getEnergyTransferDestinationTargets,
    getEnergyTransferSourceTargets,
    type EnergyTransferTargetOption,
  } from '../../game/energyTransfer';
  import { promptOptions } from '../../game/prompts';
  import { sameTarget } from '../../game/targets';
  import type { CardTarget, GameView, PromptView } from '../../game/types';

  type Props = {
    game: GameView;
    prompt: PromptView;
    resolving?: boolean;
    onresolve: (value: unknown) => void;
  };

  let { game, prompt, resolving = false, onresolve }: Props = $props();

  let sourceTarget = $state<CardTarget | null>(null);
  let selectedTargets = $state<CardTarget[]>([]);
  let attachEnergyIndex = $state(0);
  let options = $derived(promptOptions(prompt));
  let sourceTargets = $derived(getEnergyTransferSourceTargets(game, prompt));
  let destinationTargets = $derived(getEnergyTransferDestinationTargets(game, prompt));
  let sourceOption = $derived(
    sourceTarget
      ? sourceTargets.find((option) => sameTarget(option.target, sourceTarget!))
      : undefined,
  );
  let sourceEnergies = $derived(sourceOption?.energies ?? []);
  let availableDestinations = $derived(
    sourceTarget
      ? destinationTargets.filter((option) => !sameTarget(option.target, sourceTarget!))
      : [],
  );
  let selectionPoolSize = $derived(destinationTargets.length || 1);
  let maxSelections = $derived(normalizeSelectionLimit(options.max, normalizeSelectionLimit(options.count, selectionPoolSize)));
  let isDiscard = $derived(prompt.className === 'DiscardEnergyPrompt');
  let selectedEnergy = $derived(sourceEnergies[attachEnergyIndex]);
  let canSubmit = $derived(
    !!sourceTarget && !!selectedEnergy && (isDiscard || selectedTargets.length > 0),
  );

  function selectSource(option: EnergyTransferTargetOption) {
    sourceTarget = option.target;
    attachEnergyIndex = 0;
    selectedTargets = selectedTargets.filter((target) => !sameTarget(target, option.target));
  }

  function clearSource() {
    sourceTarget = null;
    attachEnergyIndex = 0;
    selectedTargets = [];
  }

  function toggleTarget(target: CardTarget) {
    if (!sourceTarget || sameTarget(sourceTarget, target)) {
      return;
    }
    const exists = selectedTargets.some((item) => sameTarget(item, target));
    if (exists) {
      selectedTargets = selectedTargets.filter((item) => !sameTarget(item, target));
      return;
    }
    if (maxSelections <= 1) {
      selectedTargets = [target];
      return;
    }
    if (selectedTargets.length < maxSelections) {
      selectedTargets = [...selectedTargets, target];
    }
  }

  function submit() {
    if (!sourceTarget || !selectedEnergy) {
      return;
    }
    if (isDiscard) {
      onresolve([{ from: sourceTarget, index: attachEnergyIndex }]);
    } else if (selectedTargets.length > 0) {
      onresolve([{ from: sourceTarget, to: selectedTargets[0], index: attachEnergyIndex }]);
    }
  }

  function normalizeSelectionLimit(raw: unknown, fallback: number) {
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  function targetTestId(kind: 'source' | 'destination', target: CardTarget) {
    return `energy-transfer-${kind}-${target.player}-${target.slot}-${target.index}`;
  }
</script>

<PromptPanel
  title={isDiscard ? 'エネルギーをトラッシュ' : 'エネルギーを付け替える'}
  subtitle={isDiscard
    ? '場所とポケモンを確認して、トラッシュするエネルギーを選びます'
    : '移動元 → エネルギー → 移動先の順に選びます'}
  warning={!prompt.supported ? (prompt.unsupportedReason ?? 'この選択には高度な操作が必要です。') : undefined}
>
  {#snippet icon()}<PromptIcon name="energy" />{/snippet}

  <section class="transfer-step">
    <h3><span>1</span>{isDiscard ? 'トラッシュ元を選ぶ' : '移動元を選ぶ'}</h3>
    {#if sourceOption}
      <div class="selected-source-row">
        <EnergyTransferTargetButton
          option={sourceOption}
          roleLabel={isDiscard ? 'トラッシュ元' : '移動元'}
          selected
          disabled={resolving}
          testId={targetTestId('source', sourceOption.target)}
          onclick={() => {}}
        />
        <button type="button" class="change-source" disabled={resolving} onclick={clearSource}>
          {isDiscard ? 'トラッシュ元を変更' : '移動元を変更'}
        </button>
      </div>
    {:else}
      <div class="energy-transfer-target-grid">
        {#each sourceTargets as option}
          <EnergyTransferTargetButton
            {option}
            roleLabel={isDiscard ? 'トラッシュ元' : '移動元'}
            disabled={resolving}
            testId={targetTestId('source', option.target)}
            onclick={() => selectSource(option)}
          />
        {/each}
      </div>
    {/if}
  </section>

  {#if sourceOption}
    <section class="transfer-step">
      <h3><span>2</span>{isDiscard ? 'トラッシュするエネルギーを選ぶ' : '移動するエネルギーを選ぶ'}</h3>
      <div class="energy-choice-grid">
        {#each sourceEnergies as energy, index}
          <button
            type="button"
            class:selected={attachEnergyIndex === index}
            disabled={resolving}
            aria-pressed={attachEnergyIndex === index}
            data-testid={`energy-transfer-energy-${index}`}
            onclick={() => (attachEnergyIndex = index)}
          >
            <span>エネルギー {index + 1}</span>
            <strong>{energyCardLabel(energy)}</strong>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if sourceOption && !isDiscard}
    <section class="transfer-step">
      <h3><span>3</span>移動先を選ぶ</h3>
      <div class="energy-transfer-target-grid">
        {#each availableDestinations as option}
          <EnergyTransferTargetButton
            {option}
            roleLabel="移動先"
            selected={selectedTargets.some((target) => sameTarget(target, option.target))}
            disabled={resolving}
            testId={targetTestId('destination', option.target)}
            onclick={() => toggleTarget(option.target)}
          />
        {/each}
      </div>
    </section>
  {/if}

  {#snippet actions()}
    {#if options.allowCancel}
      <button disabled={resolving} onclick={() => onresolve(null)}>キャンセル</button>
    {/if}
    <button class="primary" disabled={resolving || !canSubmit} onclick={submit}>決定</button>
  {/snippet}
</PromptPanel>

<style>
  .transfer-step {
    display: grid;
    gap: 8px;
  }

  .transfer-step h3 {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    color: var(--text-primary);
    font-size: 13px;
  }

  .transfer-step h3 span {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-pill);
    background: var(--accent-base);
    color: #fff;
    font-size: 11px;
  }

  .energy-transfer-target-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .selected-source-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: stretch;
  }

  .change-source {
    min-width: 92px;
    min-height: 44px;
    padding-inline: 10px;
    touch-action: manipulation;
  }

  .energy-choice-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .energy-choice-grid button {
    display: grid;
    gap: 4px;
    min-width: 0;
    min-height: 58px;
    padding: 8px 10px;
    text-align: left;
    touch-action: manipulation;
  }

  .energy-choice-grid button.selected {
    border-color: var(--selection-border-strong);
    background: var(--selection-bg);
    box-shadow: var(--glow-selected-shadow);
  }

  .energy-choice-grid span {
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 750;
  }

  .energy-choice-grid strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text-primary);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 360px) {
    .selected-source-row {
      grid-template-columns: 1fr;
    }

    .change-source {
      width: 100%;
    }
  }
</style>
