<script lang="ts">
  type Props = {
    phaseLabel: string;
    turn: number;
    activePlayerName?: string;
    resultLabel?: string;
    gameFinished?: boolean;
  };

  let { phaseLabel, turn, activePlayerName = '', resultLabel = '', gameFinished = false }: Props = $props();
</script>

<div class="game-status">
  <strong>{resultLabel || phaseLabel}</strong>
  <span>ターン {turn}</span>
  {#if !gameFinished}
    <span>{activePlayerName}</span>
  {/if}
</div>

<style>
  .game-status {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 9;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    pointer-events: auto;
    padding: 5px 9px;
    border-radius: 999px;
    border: 1px solid var(--surface-toolbar-border);
    background: var(--surface-toolbar-bg);
    color: var(--text-secondary);
    box-shadow: var(--surface-toolbar-shadow);
    backdrop-filter: blur(var(--backdrop-blur));
    font-size: 11px;
  }

  .game-status strong {
    color: var(--accent-strong);
  }

  @media (max-width: 860px) {
    .game-status {
      top: 8px;
      right: auto;
      left: 8px;
      max-width: calc(100vw - 64px);
      gap: 6px;
      padding: 5px 8px;
      font-size: 10px;
      line-height: 1.1;
    }

    .game-status span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
