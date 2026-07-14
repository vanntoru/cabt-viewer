<script lang="ts">
  type Props = {
    resultLabel: string;
    turn: number;
    onBack: () => void;
    onRematch: () => void;
  };

  let { resultLabel, turn, onBack, onRematch }: Props = $props();
</script>

<div class="end-game-overlay" role="dialog" aria-modal="true" aria-labelledby="end-game-title">
  <section class="end-game-panel">
    <div>
      <span>Game over</span>
      <h2 id="end-game-title">{resultLabel}</h2>
      <p>Finished on turn {turn}</p>
    </div>
    <div class="end-game-actions">
      <button class="primary" type="button" onclick={onRematch}>もう一戦</button>
      <button type="button" onclick={onBack}>元の画面に戻る</button>
    </div>
  </section>
</div>

<style>
  .end-game-overlay {
    position: absolute;
    inset: 0;
    z-index: 18;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--overlay-backdrop-bg);
    backdrop-filter: blur(5px);
  }

  .end-game-panel {
    width: min(420px, calc(100vw - 48px));
    display: grid;
    gap: 18px;
    padding: 20px;
    border-radius: 6px;
    border: 1px solid var(--surface-glass-border);
    background: var(--surface-glass-bg);
    color: var(--text-primary);
    box-shadow: var(--surface-glass-shadow);
  }

  .end-game-panel span {
    display: block;
    margin-bottom: 6px;
    color: var(--accent-strong);
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .end-game-panel h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 28px;
    line-height: 1.05;
  }

  .end-game-panel p {
    margin: 8px 0 0;
    color: var(--text-muted);
    font-size: 14px;
  }

  .end-game-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .end-game-panel button {
    min-height: 36px;
    border-radius: 5px;
    border: 1px solid var(--selection-border-strong);
    background: var(--button-bg);
    color: var(--button-text);
    padding: 9px 12px;
    font-weight: 900;
  }

  .end-game-panel button.primary {
    background: var(--accent-soft);
    color: var(--text-primary);
  }

  .end-game-panel button:hover,
  .end-game-panel button:focus-visible {
    border-color: var(--accent-strong);
    background: var(--accent-tint);
  }
</style>
