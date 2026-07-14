<script lang="ts">
  import type { ReplaySnapshot, ReplayStep } from '../game/replay';

  type Props = {
    replay: ReplaySnapshot;
    step: ReplayStep;
    stepIndex: number;
    copiedForkPoint?: boolean;
    copiedQuestionContext?: boolean;
    questionContextText?: string;
    setStep: (index: number) => void;
    setStateIndex: (index: number) => void;
    previousStep: () => void;
    nextStep: () => void;
    firstStep: () => void;
    lastStep: () => void;
    canSkipOpponentTurn?: boolean;
    canReplayFromStep?: boolean;
    skipOpponentTurn: () => void;
    replayFromStep: () => void;
    copyForkPoint: () => void;
    copyQuestionContext: () => void;
    clearQuestionContextText: () => void;
    showMatchControls?: boolean;
    showStateControls?: boolean;
    workbenchUrl?: string;
    previousReplayLabel?: string;
    nextReplayLabel?: string;
    previousReplay: () => void;
    nextReplay: () => void;
  };

  let {
    replay,
    step,
    stepIndex,
    copiedForkPoint = false,
    copiedQuestionContext = false,
    questionContextText = '',
    setStep,
    setStateIndex,
    previousStep,
    nextStep,
    firstStep,
    lastStep,
    canSkipOpponentTurn = false,
    canReplayFromStep = false,
    skipOpponentTurn,
    replayFromStep,
    copyForkPoint,
    copyQuestionContext,
    clearQuestionContextText,
    showMatchControls = true,
    showStateControls = true,
    workbenchUrl = '',
    previousReplayLabel = '',
    nextReplayLabel = '',
    previousReplay,
    nextReplay,
  }: Props = $props();

  let maxStepIndex = $derived(Math.max(0, replay.steps.length - 1));
  let maxStateIndex = $derived(Math.max(0, replay.stateCount - 1));
  let actionValue = $derived(step.actionIndex === null ? '初期' : `${step.actionIndex + 1} / ${replay.actionCount}`);
  let stateValue = $derived(`${step.stateIndex} / ${maxStateIndex}`);
  let createdLabel = $derived(Number.isFinite(replay.created) ? new Date(replay.created).toLocaleString() : '');
  let playerLabel = $derived(replay.players.map((player) => player.name).join(' 対 '));

  function onStepInput(event: Event) {
    setStep(Number((event.currentTarget as HTMLInputElement).value));
  }

  function onStateInput(event: Event) {
    setStateIndex(Number((event.currentTarget as HTMLInputElement).value));
  }

  function selectText(event: Event) {
    (event.currentTarget as HTMLTextAreaElement).select();
  }

  function runControl(event: Event, action: () => void) {
    event.preventDefault();
    event.stopPropagation();
    action();
  }

</script>

<section class="replay-dock" aria-label="リプレイのタイムライン">
  <div class="replay-caption" title={step.label}>
    <span>{step.label}</span>
  </div>
  {#if showMatchControls}
    <div class="replay-match-controls" aria-label="試合移動">
      {#if workbenchUrl}
        <a class="workbench-dock-link" href={workbenchUrl}>Workbench</a>
      {/if}
      <button
        aria-label="前の試合"
        title={previousReplayLabel ? `前の試合: ${previousReplayLabel}` : '前の試合はありません'}
        type="button"
        onclick={(event) => runControl(event, previousReplay)}
        disabled={!previousReplayLabel}
      >
        前の試合
      </button>
      <button
        aria-label="次の試合"
        title={nextReplayLabel ? `次の試合: ${nextReplayLabel}` : '次の試合はありません'}
        type="button"
        onclick={(event) => runControl(event, nextReplay)}
        disabled={!nextReplayLabel}
      >
        次の試合
      </button>
    </div>
  {/if}
  <div
    class="replay-controls"
    class:without-match-controls={!showMatchControls}
    class:with-replay-from-step={canReplayFromStep}
    aria-label="リプレイ再生操作"
  >
    <button class="jump-step first-step" type="button" aria-label="最初の操作" onclick={(event) => runControl(event, firstStep)} disabled={stepIndex === 0}>|&lt;</button>
    <button class="step-button previous-step" type="button" aria-label="前の操作" onclick={(event) => runControl(event, previousStep)} disabled={stepIndex === 0}>&lt;</button>
    <input
      class="step-range"
      aria-label="操作ステップ"
      type="range"
      min="0"
      max={maxStepIndex}
      value={stepIndex}
      oninput={onStepInput}
    />
    <button class="step-button next-step" type="button" aria-label="次の操作" onclick={(event) => runControl(event, nextStep)} disabled={stepIndex >= maxStepIndex}>&gt;</button>
    <button class="jump-step last-step" type="button" aria-label="最後の操作" onclick={(event) => runControl(event, lastStep)} disabled={stepIndex >= maxStepIndex}>&gt;|</button>
    <button
      class="copy-question-context"
      type="button"
      aria-label="自分の現在ターンをコピー"
      title="自分の現在ターンをCodexに貼れる形式でコピー"
      onclick={(event) => runControl(event, copyQuestionContext)}
    >
      {copiedQuestionContext ? 'コピー済み' : 'ターンコピー'}
    </button>
    <button
      class="skip-opponent-turn"
      type="button"
      aria-label="次の自分ターンへ進む"
      title="次の自分側の局面へ進む"
      onclick={(event) => runControl(event, skipOpponentTurn)}
      disabled={!canSkipOpponentTurn}
    >
      次の自分ターン
    </button>
    {#if canReplayFromStep}
      <button
        class="replay-from-step"
        type="button"
        aria-label="この位置からやり直す"
        title="表示中の局面を現在地にして、ここから対戦を続ける"
        onclick={(event) => runControl(event, replayFromStep)}
      >
        ここからやり直す
      </button>
    {/if}
  </div>
</section>

<aside class="replay-details" aria-label="リプレイ詳細">
  <div class="replay-meta">
    <strong>{replay.name}</strong>
    <span>{playerLabel}</span>
    <span>{createdLabel}</span>
  </div>

  <div class="replay-readout">
    <span>操作 <b>{actionValue}</b></span>
    <span>状態 <b>{stateValue}</b></span>
    <span>ターン <b>{step.turn}</b></span>
    <span>{step.label}</span>
  </div>

  {#if showStateControls}
    <div class="state-controls">
      <label>
        状態
        <input
          aria-label="状態番号"
          type="number"
          min="0"
          max={maxStateIndex}
          value={step.stateIndex}
          oninput={onStateInput}
        />
      </label>
      <button onclick={copyForkPoint}>{copiedForkPoint ? '分岐点をコピー済み' : '分岐点をコピー'}</button>
    </div>
  {/if}

</aside>

{#if questionContextText}
  <section class="question-copy-panel" aria-label="ターンコピー手動欄">
    <div class="question-copy-header">
      <strong>手動コピー</strong>
      <button type="button" onclick={clearQuestionContextText}>閉じる</button>
    </div>
    <textarea
      readonly
      value={questionContextText}
      aria-label="Codexに貼る局面テキスト"
      onclick={selectText}
      onfocus={selectText}
    ></textarea>
  </section>
{/if}

<style>
  .replay-dock {
    position: absolute;
    left: 0;
    right: var(--board-right-rail);
    bottom: 0;
    z-index: 12;
    height: var(--replay-dock-h, 48px);
    display: flex;
    align-items: center;
    padding: 7px 16px;
    border-top: 1px solid var(--surface-toolbar-border);
    background: var(--surface-toolbar-bg);
    color: var(--text-primary);
    box-shadow: var(--surface-toolbar-shadow);
    backdrop-filter: blur(var(--backdrop-blur));
  }

  .replay-match-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 174px;
    margin-right: 10px;
  }

  .replay-caption {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 7px);
    width: min(520px, calc(100% - 44px));
    transform: translateX(-50%);
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .replay-caption span {
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    padding: 7px 13px;
    border: 1px solid var(--surface-toolbar-border);
    border-radius: 999px;
    background: var(--surface-toolbar-bg);
    color: var(--text-primary);
    box-shadow: var(--surface-toolbar-shadow);
    backdrop-filter: blur(var(--backdrop-blur));
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 850;
    line-height: 1;
  }

  .replay-details {
    position: absolute;
    top: 414px;
    right: 14px;
    z-index: 9;
    width: 148px;
    display: grid;
    gap: 8px;
    padding: 7px;
    border: 1px solid var(--surface-toolbar-border);
    border-radius: 6px;
    background: var(--surface-toolbar-bg);
    color: var(--text-primary);
    box-shadow: var(--surface-toolbar-shadow);
    backdrop-filter: blur(var(--backdrop-blur));
  }

  .replay-meta,
  .replay-readout,
  .state-controls {
    display: grid;
    gap: 5px;
    min-width: 0;
    font-size: 11px;
    line-height: 1.2;
  }

  .replay-meta span,
  .replay-readout span {
    min-width: 0;
    overflow: hidden;
    color: var(--text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .replay-meta strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .replay-controls {
    flex: 1 1 auto;
    min-width: 0;
    width: 100%;
    display: grid;
    grid-template-columns: 32px 32px minmax(120px, 1fr) 32px 32px minmax(86px, auto) minmax(108px, auto);
    align-items: center;
    gap: 8px;
  }

  .replay-controls.without-match-controls {
    margin-left: 0;
  }

  .replay-controls.with-replay-from-step {
    grid-template-columns: 32px 32px minmax(120px, 1fr) 32px 32px minmax(86px, auto) minmax(108px, auto) minmax(120px, auto);
  }

  .replay-match-controls button,
  .workbench-dock-link,
  .replay-controls button,
  .state-controls button {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    border: 1px solid var(--button-border);
    background: var(--button-bg);
    color: var(--button-text);
    font-size: 11px;
    font-weight: 800;
  }

  .replay-match-controls button {
    min-width: 82px;
    height: 30px;
    padding: 0 9px;
    white-space: nowrap;
  }

  .workbench-dock-link {
    min-width: 92px;
    height: 30px;
    padding: 0 10px;
    border-color: var(--button-primary-border);
    color: var(--accent-strong);
    text-decoration: none;
    white-space: nowrap;
    touch-action: manipulation;
  }

  .replay-controls button {
    width: 32px;
    height: 30px;
    padding: 0;
  }

  .replay-controls .skip-opponent-turn {
    width: auto;
    min-width: 108px;
    padding: 0 10px;
    white-space: nowrap;
  }

  .replay-controls .replay-from-step {
    width: auto;
    min-width: 120px;
    padding: 0 10px;
    border-color: color-mix(in srgb, var(--button-border) 40%, #34d399);
    background: color-mix(in srgb, var(--button-bg) 72%, #86efac);
    white-space: nowrap;
  }

  .replay-controls .copy-question-context {
    width: auto;
    min-width: 86px;
    padding: 0 10px;
    border-color: color-mix(in srgb, var(--button-border) 45%, #8fd2ff);
    background: color-mix(in srgb, var(--button-bg) 70%, #87cefa);
    color: var(--button-text);
    white-space: nowrap;
  }

  .state-controls {
    align-items: stretch;
  }

  .state-controls label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
  }

  .state-controls input {
    width: 100%;
    height: 26px;
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    background: var(--input-bg);
    color: var(--input-text);
    font: inherit;
    font-weight: 800;
  }

  .state-controls button {
    height: 26px;
    padding: 0 9px;
  }

  .question-copy-panel {
    position: absolute;
    right: calc(var(--board-right-rail) + 16px);
    bottom: calc(var(--replay-dock-h, 48px) + 14px);
    z-index: 16;
    width: min(520px, calc(100vw - var(--board-right-rail) - 42px));
    display: grid;
    gap: 7px;
    padding: 9px;
    border: 1px solid var(--surface-toolbar-border);
    border-radius: 7px;
    background: var(--surface-toolbar-bg);
    color: var(--text-primary);
    box-shadow: var(--surface-toolbar-shadow);
    backdrop-filter: blur(var(--backdrop-blur));
  }

  .question-copy-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    font-weight: 850;
  }

  .question-copy-header button {
    height: 26px;
    border-radius: 5px;
    border: 1px solid var(--button-border);
    background: var(--button-bg);
    color: var(--button-text);
    font-size: 11px;
    font-weight: 800;
  }

  .question-copy-panel textarea {
    width: 100%;
    height: 190px;
    resize: vertical;
    border: 1px solid var(--input-border);
    border-radius: 5px;
    background: var(--input-bg);
    color: var(--input-text);
    font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  }

  input[type='range'] {
    width: 100%;
  }

  @media (max-width: 860px) {
    .replay-dock {
      right: 0;
      min-height: var(--replay-dock-h, 64px);
      padding: 8px 10px;
      gap: 6px;
    }

    .replay-match-controls {
      min-width: 142px;
      gap: 4px;
      margin-right: 6px;
    }

    .replay-match-controls button,
    .workbench-dock-link {
      min-width: 68px;
      height: 40px;
      padding: 0 8px;
      font-size: 10px;
    }

    .replay-controls {
      gap: 7px;
      grid-template-columns: 40px 40px minmax(72px, 1fr) 40px 40px minmax(82px, auto) minmax(104px, auto);
    }

    .replay-controls button {
      width: 40px;
      height: 40px;
      font-size: 14px;
    }

    .replay-controls .copy-question-context {
      min-width: 72px;
      padding: 0 7px;
      font-size: 10px;
    }

    .replay-controls .skip-opponent-turn {
      min-width: 84px;
      padding: 0 7px;
      font-size: 10px;
    }

    .replay-caption {
      width: min(420px, calc(100% - 20px));
      bottom: calc(100% + 5px);
    }

    .replay-caption span {
      padding: 6px 10px;
      font-size: 12px;
    }

    .replay-details {
      display: none;
    }

    .question-copy-panel {
      right: 10px;
      left: 10px;
      bottom: calc(var(--replay-dock-h, 48px) + 10px);
      width: auto;
    }
  }

  @media (max-width: 640px) {
    .replay-dock {
      height: var(--replay-dock-h, 168px);
      flex-direction: column;
      align-items: stretch;
      justify-content: start;
      padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px));
    }

    .replay-match-controls {
      order: 3;
      width: 100%;
      min-width: 0;
      margin-top: 4px;
      margin-right: 0;
      padding-top: 8px;
      border-top: 1px solid var(--surface-inset-border);
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .replay-match-controls button,
    .workbench-dock-link {
      width: 100%;
      min-width: 0;
      height: 34px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .replay-controls {
      order: 1;
      grid-template-columns: 44px 44px minmax(0, 1fr) 44px 44px;
      grid-auto-rows: 42px;
      gap: 8px;
    }

    .replay-controls button {
      width: 44px;
      height: 42px;
      font-size: 15px;
    }

    .replay-controls .copy-question-context {
      grid-column: 1 / 3;
      width: 100%;
      min-width: 0;
    }

    .replay-controls .skip-opponent-turn {
      grid-column: 3 / 6;
      width: 100%;
      min-width: 0;
    }

    .replay-caption {
      width: min(340px, calc(100vw - 18px));
      bottom: calc(100% + 6px);
    }

    .replay-caption span {
      font-size: 11px;
    }
  }

  @media (max-width: 860px) and (pointer: coarse) {
    .replay-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-auto-rows: 46px;
      gap: 8px;
    }

    .replay-controls .jump-step,
    .replay-controls .step-range {
      display: none;
    }

    .replay-controls .step-button,
    .replay-controls .copy-question-context,
    .replay-controls .skip-opponent-turn {
      width: 100%;
      min-width: 0;
      height: 46px;
      padding: 0 10px;
    }

    .replay-controls .step-button {
      font-size: 20px;
    }

    .previous-step,
    .copy-question-context {
      grid-column: 1;
    }

    .next-step,
    .skip-opponent-turn {
      grid-column: 2;
    }

    .copy-question-context,
    .skip-opponent-turn {
      font-size: 12px;
    }
  }

  @media (min-width: 641px) and (max-width: 860px) and (pointer: coarse) {
    .replay-dock {
      display: grid;
      grid-template-columns: minmax(0, 182px) minmax(0, 1fr);
      align-items: stretch;
      gap: 10px;
    }

    .replay-match-controls {
      width: 100%;
      min-width: 0;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-auto-rows: 46px;
      align-items: stretch;
      gap: 8px;
    }

    .workbench-dock-link {
      grid-column: 1 / 3;
    }

    .replay-match-controls button,
    .workbench-dock-link {
      width: 100%;
      min-width: 0;
      height: 46px;
      padding: 0 6px;
      font-size: 11px;
    }
  }
</style>
