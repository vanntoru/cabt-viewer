<script lang="ts">
  import { energyCardLabel, type EnergyTransferTargetOption } from '../../game/energyTransfer';

  type Props = {
    option: EnergyTransferTargetOption;
    roleLabel: '移動元' | '移動先' | 'トラッシュ元';
    selected?: boolean;
    disabled?: boolean;
    testId?: string;
    onclick: () => void;
  };

  let {
    option,
    roleLabel,
    selected = false,
    disabled = false,
    testId = '',
    onclick,
  }: Props = $props();

  let energySummary = $derived(
    option.energies.length
      ? option.energies.map(energyCardLabel).join('・')
      : 'エネルギーなし',
  );
</script>

<button
  type="button"
  class="energy-transfer-target"
  class:selected
  {disabled}
  aria-pressed={selected}
  aria-label={`${roleLabel}：${option.ownerLabel} ${option.positionLabel} ${option.pokemonName}。${energySummary}`}
  data-testid={testId || undefined}
  {onclick}
>
  <span class="target-badges">
    <span class="owner-badge">{option.ownerLabel}</span>
    <span class="position-badge">{option.positionLabel}</span>
    {#if selected}<span class="selected-badge">{roleLabel}</span>{/if}
  </span>
  <strong>{option.pokemonName}</strong>
  <span class="target-energy">{energySummary}</span>
</button>

<style>
  .energy-transfer-target {
    display: grid;
    align-content: start;
    gap: 7px;
    min-width: 0;
    min-height: 94px;
    padding: 10px;
    border: 1px solid var(--surface-inset-border);
    border-radius: var(--radius-md);
    background: var(--surface-inset-bg);
    color: var(--text-primary);
    text-align: left;
    touch-action: manipulation;
  }

  .energy-transfer-target.selected {
    border-color: var(--selection-border-strong);
    background: var(--selection-bg);
    box-shadow: var(--glow-selected-shadow);
  }

  .target-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  }

  .target-badges span {
    padding: 3px 6px;
    border-radius: var(--radius-pill);
    font-size: 10px;
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

  .selected-badge {
    background: var(--warning-soft);
    color: var(--warning-strong);
  }

  .energy-transfer-target strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text-primary);
    font-size: 13px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .target-energy {
    display: -webkit-box;
    min-width: 0;
    overflow: hidden;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.25;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
</style>
