<script lang="ts">
  import { onMount } from 'svelte';
  import type { ReplaySnapshot, ReplayStep } from '../game/replay';

  type Props = {
    replay: ReplaySnapshot;
    step: ReplayStep;
    displayLabel?: string;
    stepIndex: number;
    copiedForkPoint?: boolean;
    isPlaying?: boolean;
    setStep: (index: number) => void;
    setStateIndex: (index: number) => void;
    previousStep: () => void;
    nextStep: () => void;
    previousPlayerTurn: () => void;
    nextPlayerTurn: () => void;
    canPreviousPlayerTurn?: boolean;
    canNextPlayerTurn?: boolean;
    ownTurnsOnly?: boolean;
    toggleOwnTurnsOnly?: () => void;
    firstStep: () => void;
    lastStep: () => void;
    togglePlayback: () => void;
    backToReplayHome: () => void;
    previousReplay?: () => void;
    nextReplay?: () => void;
    canPreviousReplay?: boolean;
    canNextReplay?: boolean;
    playlistPosition?: string;
    copyForkPoint: () => void;
    copyForkPointFailed?: boolean;
    takeoverAvailable?: boolean;
    takeoverBusy?: boolean;
    takeoverLabel?: string;
    takeoverError?: string;
    startTakeover?: () => void;
  };

  let {
    replay,
    step,
    displayLabel,
    stepIndex,
    copiedForkPoint = false,
    isPlaying = false,
    setStep,
    setStateIndex,
    previousStep,
    nextStep,
    previousPlayerTurn,
    nextPlayerTurn,
    canPreviousPlayerTurn = false,
    canNextPlayerTurn = false,
    ownTurnsOnly = false,
    toggleOwnTurnsOnly = () => {},
    firstStep,
    lastStep,
    togglePlayback,
    backToReplayHome,
    previousReplay = () => {},
    nextReplay = () => {},
    canPreviousReplay = false,
    canNextReplay = false,
    playlistPosition = '',
    copyForkPoint,
    copyForkPointFailed = false,
    takeoverAvailable = false,
    takeoverBusy = false,
    takeoverLabel = 'Take over here',
    takeoverError = '',
    startTakeover = () => {},
  }: Props = $props();

  let maxStepIndex = $derived(Math.max(0, replay.steps.length - 1));
  let maxStateIndex = $derived(Math.max(0, replay.stateCount - 1));
  let actionValue = $derived(step.actionIndex === null ? 'Initial' : `${step.actionIndex + 1} / ${replay.actionCount}`);
  let stateValue = $derived(`${step.stateIndex} / ${maxStateIndex}`);
  let timelineLabel = $derived(displayLabel || step.label);
  let payloadPreview = $derived(formatPayload(step.payload));
  let createdLabel = $derived(Number.isFinite(replay.created) ? new Date(replay.created).toLocaleString() : '');
  let playerLabel = $derived(replay.players.map((player) => player.name).join(' vs '));

  function percentLabel(value: number | null): string {
    return value === null ? '算出不可' : `${(value * 100).toFixed(1)}%`;
  }

  function probabilityDetail(): string {
    const probability = step.phantomDiveProbability;
    if (!probability) {
      return '';
    }
    if (probability.status === 'exact_complete') {
      return '厳密値';
    }
    const interval = probability.confidenceInterval95;
    if (probability.status === 'estimated_complete' && interval) {
      return `推定・95%区間 ${percentLabel(interval[0])}–${percentLabel(interval[1])}`;
    }
    return '計算未完了';
  }

  function onStepInput(event: Event) {
    setStep(Number((event.currentTarget as HTMLInputElement).value));
  }

  function onStateInput(event: Event) {
    setStateIndex(Number((event.currentTarget as HTMLInputElement).value));
  }

  function formatPayload(payload: unknown): string {
    if (payload === null || payload === undefined) {
      return '';
    }
    const json = JSON.stringify(payload);
    return json.length > 180 ? `${json.slice(0, 177)}...` : json;
  }

  function isTextEntryTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
  }

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTextEntryTarget(event.target)) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        event.shiftKey ? previousPlayerTurn() : previousStep();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        event.shiftKey ? nextPlayerTurn() : nextStep();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
</script>

<button class="replay-back-button" aria-label="Back to replay list" onclick={backToReplayHome}>Back</button>
{#if playlistPosition}
  <nav class="replay-playlist-nav" aria-label="Replay playlist navigation">
    <button aria-label="Previous replay" onclick={previousReplay} disabled={!canPreviousReplay}>前のリプレイ</button>
    <span>{playlistPosition}</span>
    <button aria-label="Next replay" onclick={nextReplay} disabled={!canNextReplay}>次のリプレイ</button>
  </nav>
{/if}
<button
  class="mobile-copy-fork-point"
  class:below-playlist={!!playlistPosition}
  aria-label="盤面情報をコピー"
  onclick={copyForkPoint}
>
  {copiedForkPoint ? 'コピー済み' : copyForkPointFailed ? 'コピー失敗' : '盤面コピー'}
</button>

<section class="replay-dock" aria-label="Replay timeline">
  <div class="replay-caption" title={timelineLabel}>
    <span>{timelineLabel}</span>
    {#if step.phantomDiveProbability}
      <strong class="mobile-phantom-probability" aria-label="モバイル 2ターン目攻撃成功率">
        2T攻撃 {percentLabel(step.phantomDiveProbability.probability)}
      </strong>
    {/if}
    {#if ownTurnsOnly}
      {#key step.turn}
        <strong class="own-turn-status" aria-live="polite">自分 Turn {step.turn}</strong>
      {/key}
    {/if}
  </div>
  <div class="replay-controls" aria-label="Replay playback controls">
    <button class="edge-jump" aria-label="First action" onclick={firstStep} disabled={stepIndex === 0}>|&lt;</button>
    <button
      class="turn-jump"
      aria-label="Previous tracked-player turn"
      title="前の自分ターンへ（Shift+←）"
      onclick={previousPlayerTurn}
      disabled={!canPreviousPlayerTurn}
    >自分←</button>
    <button class="action-step" aria-label="Previous action" onclick={previousStep} disabled={stepIndex === 0}>戻る</button>
    <button
      class="playback-toggle"
      aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
      aria-pressed={isPlaying}
      onclick={togglePlayback}
      disabled={maxStepIndex === 0}
    >
      {#if isPlaying}
        <span class="pause-icon" aria-hidden="true"><span></span><span></span></span>
      {:else}
        <span class="play-icon" aria-hidden="true"></span>
      {/if}
    </button>
    <input
      aria-label="Action step"
      type="range"
      min="0"
      max={maxStepIndex}
      value={stepIndex}
      oninput={onStepInput}
    />
    <button class="action-step" aria-label="Next action" onclick={nextStep} disabled={stepIndex >= maxStepIndex}>次へ</button>
    <button
      class="turn-jump"
      aria-label="Next tracked-player turn"
      title="次の自分ターンへ（Shift+→）"
      onclick={nextPlayerTurn}
      disabled={!canNextPlayerTurn}
    >→自分</button>
    <button class="edge-jump" aria-label="Last action" onclick={lastStep} disabled={stepIndex >= maxStepIndex}>&gt;|</button>
    <button
      class="own-turn-toggle"
      aria-label="Show tracked-player turns only"
      aria-pressed={ownTurnsOnly}
      title="相手ターンを自動で飛ばし、盤面を自分側に固定"
      onclick={toggleOwnTurnsOnly}
    >自分ターンのみ</button>
  </div>
</section>

<aside class="replay-details" aria-label="Replay details">
  <div class="replay-meta">
    <strong>{replay.name}</strong>
    <span>{playerLabel}</span>
    <span>{createdLabel}</span>
  </div>

  {#if step.phantomDiveProbability}
    <div class="phantom-probability" aria-label="2ターン目攻撃成功率">
      <span>2ターン目攻撃成功率</span>
      <strong>{percentLabel(step.phantomDiveProbability.probability)}</strong>
      <small>{probabilityDetail()}</small>
    </div>
  {/if}

  <div class="replay-readout">
    <span>Action <b>{actionValue}</b></span>
    <span>State <b>{stateValue}</b></span>
    <span>Turn <b>{step.turn}</b></span>
    <span>{timelineLabel}</span>
  </div>

  <div class="state-controls">
    <label>
      State
      <input
        aria-label="State index"
        type="number"
        min="0"
        max={maxStateIndex}
        value={step.stateIndex}
        oninput={onStateInput}
      />
    </label>
    <button onclick={copyForkPoint}>
      {copiedForkPoint ? 'Fork point copied' : copyForkPointFailed ? 'Copy failed' : 'Copy fork point'}
    </button>
    <button
      class="takeover-button"
      onclick={startTakeover}
      disabled={!takeoverAvailable || takeoverBusy}
      title={takeoverAvailable ? 'Start an interactive continuation from this decision.' : 'Select a saved local decision with a search seed.'}
    >{takeoverBusy ? 'Preparing takeover…' : takeoverLabel}</button>
    {#if takeoverError}<span class="takeover-error">{takeoverError}</span>{/if}
  </div>

  {#if payloadPreview}
    <pre>{payloadPreview}</pre>
  {/if}
</aside>

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

  .replay-back-button {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 16;
    height: 34px;
    min-width: 64px;
    padding: 0 14px;
    border: 1px solid var(--button-border);
    border-radius: 5px;
    background: var(--button-bg);
    color: var(--button-text);
    box-shadow: var(--surface-toolbar-shadow);
    backdrop-filter: blur(var(--backdrop-blur));
    font-size: 12px;
    font-weight: 850;
  }

  .replay-playlist-nav {
    position: absolute;
    top: 14px;
    left: 88px;
    z-index: 16;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 34px;
  }

  .replay-playlist-nav button {
    height: 34px;
    padding: 0 12px;
    border: 1px solid var(--button-border);
    border-radius: 5px;
    background: var(--button-bg);
    color: var(--button-text);
    font-size: 11px;
    font-weight: 850;
  }

  .replay-playlist-nav span {
    min-width: 38px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 800;
  }

  .replay-caption {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 7px);
    width: min(920px, calc(100% - 44px));
    transform: translateX(-50%);
    display: flex;
    justify-content: center;
    pointer-events: none;
    gap: 8px;
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

  .own-turn-status {
    flex: 0 0 auto;
    padding: 7px 11px;
    border: 1px solid color-mix(in srgb, var(--accent-base) 65%, var(--surface-toolbar-border));
    border-radius: 999px;
    background: var(--surface-toolbar-bg);
    color: var(--accent-strong);
    box-shadow: var(--surface-toolbar-shadow);
    animation: own-turn-change 280ms ease-out;
  }

  .mobile-phantom-probability {
    display: none;
  }

  .mobile-copy-fork-point {
    display: none;
  }

  .own-turn-toggle[aria-pressed='true'] {
    border-color: var(--accent-base);
    color: var(--accent-strong);
  }

  @keyframes own-turn-change {
    from { transform: scale(1.12); }
    to { transform: scale(1); }
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

  .phantom-probability {
    display: grid;
    gap: 3px;
    padding: 7px;
    border: 1px solid color-mix(in srgb, var(--accent-base) 55%, var(--surface-toolbar-border));
    border-radius: 5px;
    background: color-mix(in srgb, var(--accent-base) 8%, transparent);
  }

  .phantom-probability span,
  .phantom-probability small {
    color: var(--text-secondary);
    font-size: 9px;
    line-height: 1.25;
  }

  .phantom-probability strong {
    color: var(--accent-strong);
    font-size: 20px;
    line-height: 1;
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
    width: 100%;
    display: grid;
    grid-template-columns: 32px 52px 44px 36px minmax(60px, 1fr) 44px 52px 32px 96px;
    align-items: center;
    gap: 8px;
  }

  .replay-controls button,
  .state-controls button {
    min-width: 0;
    border-radius: 5px;
    border: 1px solid var(--button-border);
    background: var(--button-bg);
    color: var(--button-text);
    font-size: 11px;
    font-weight: 800;
  }

  .replay-controls button {
    width: 32px;
    height: 30px;
    padding: 0;
  }

  .replay-controls .playback-toggle {
    width: 36px;
  }

  .replay-controls .action-step {
    width: 44px;
  }

  .replay-controls .turn-jump {
    width: 52px;
  }

  .replay-controls .own-turn-toggle {
    width: 96px;
  }

  .play-icon {
    display: block;
    width: 0;
    height: 0;
    margin: 0 auto;
    border-top: 7px solid transparent;
    border-bottom: 7px solid transparent;
    border-left: 11px solid currentColor;
    transform: translateX(1px);
  }

  .pause-icon {
    display: flex;
    justify-content: center;
    gap: 4px;
  }

  .pause-icon span {
    width: 4px;
    height: 14px;
    border-radius: 1px;
    background: currentColor;
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

  .state-controls .takeover-button {
    border-color: rgba(40, 122, 78, 0.55);
    font-weight: 900;
  }

  .takeover-error {
    color: #b42318;
    font-size: 10px;
    line-height: 1.25;
    white-space: normal;
  }

  input[type='range'] {
    width: 100%;
  }

  pre {
    margin: 0;
    max-height: 66px;
    overflow: auto;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 10px;
  }

  @media (max-width: 860px) {
    .replay-dock {
      right: 0;
      padding: 7px 10px;
    }

    .replay-caption {
      width: min(640px, calc(100% - 20px));
      bottom: calc(100% + 5px);
    }

    .replay-caption span {
      padding: 6px 10px;
      font-size: 12px;
    }

    .mobile-phantom-probability {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      padding: 6px 10px;
      border: 1px solid color-mix(in srgb, var(--accent-base) 65%, var(--surface-toolbar-border));
      border-radius: 999px;
      background: var(--surface-toolbar-bg);
      color: var(--accent-strong);
      box-shadow: var(--surface-toolbar-shadow);
      white-space: nowrap;
      font-size: 12px;
      line-height: 1;
    }

    .replay-details {
      display: none;
    }

    .replay-back-button {
      top: 10px;
      left: 10px;
      height: 32px;
      min-width: 60px;
      padding: 0 12px;
    }

    .replay-playlist-nav {
      top: 10px;
      left: 78px;
      height: 32px;
    }

    .replay-playlist-nav button {
      height: 32px;
      padding: 0 9px;
    }

    .mobile-copy-fork-point {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 16;
      display: block;
      height: 36px;
      min-width: 92px;
      padding: 0 12px;
      border: 1px solid var(--button-border);
      border-radius: 5px;
      background: var(--button-bg);
      color: var(--button-text);
      box-shadow: var(--surface-toolbar-shadow);
      font-size: 11px;
      font-weight: 850;
    }

    .mobile-copy-fork-point.below-playlist {
      top: 50px;
    }
  }

  @media (max-width: 560px) {
    .replay-dock {
      padding: 7px 10px;
    }

    .replay-controls {
      grid-template-columns: 44px 52px 44px minmax(24px, 1fr) 52px 44px 76px;
      gap: 4px;
    }

    .replay-controls button {
      height: 44px;
      font-size: 11px;
    }

    .replay-controls .playback-toggle {
      width: 44px;
    }

    .replay-controls .turn-jump {
      width: 44px;
      font-size: 10px;
    }

    .replay-controls .action-step {
      width: 52px;
      font-size: 12px;
      font-weight: 900;
    }

    .replay-controls .own-turn-toggle {
      width: 76px;
      font-size: 10px;
    }

    .replay-controls .edge-jump {
      display: none;
    }

    .mobile-copy-fork-point {
      min-height: 44px;
    }
  }
</style>
