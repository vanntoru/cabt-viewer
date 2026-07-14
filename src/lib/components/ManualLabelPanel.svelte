<script lang="ts">
  import { onMount } from 'svelte';
  import type { GameView } from '../game/types';
  import type { ReplaySnapshot, ReplayStep } from '../game/replay';
  import { getManualLabelSet, type ManualLabel } from '../labeling/labelSets';
  import {
    findManualLabelRecord,
    loadManualLabelRecords,
    manualLabelDownloadName,
    manualLabelRecordsToJsonl,
    removeManualLabelRecord,
    removeManualLabelRecordsForSet,
    saveManualLabelNote,
    saveManualLabelRecord,
    type ManualLabelRecord,
  } from '../labeling/manualLabels';

  const VISIBILITY_STORAGE_KEY = 'cabt.manualLabelPanel.visible';

  type Props = {
    replay: ReplaySnapshot;
    step: ReplayStep;
    view: GameView | null;
    replayId?: string;
    labelSetId?: string;
  };

  let {
    replay,
    step,
    view = null,
    replayId = '',
    labelSetId = 'dragapult_lucario_route',
  }: Props = $props();

  let labelSet = $derived(getManualLabelSet(labelSetId));
  let currentRecord = $state<ManualLabelRecord | null>(null);
  let note = $state('');
  let exportStatus = $state('');
  let labelCount = $state(0);
  let panelVisible = $state(true);
  let effectiveReplayId = $derived(replayId || replay.id || replay.name);
  let currentStepKey = $derived(`${labelSet.id}::${effectiveReplayId}::${step.index}`);
  let stepLabel = $derived(`step ${step.index} / state ${step.stateIndex} / turn ${step.turn}`);

  onMount(() => {
    panelVisible = loadPanelVisibility(labelSet.id);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  $effect(() => {
    refreshCurrentRecord(currentStepKey);
  });

  function refreshCurrentRecord(_key: string) {
    const record = findManualLabelRecord(labelSet.id, effectiveReplayId, step.index);
    currentRecord = record;
    note = record?.note ?? '';
    labelCount = loadManualLabelRecords().filter((record) => record.labelSetId === labelSet.id).length;
  }

  function selectLabel(label: ManualLabel) {
    if (currentRecord?.labelId === label.id) {
      removeManualLabelRecord(labelSet.id, effectiveReplayId, step.index);
      currentRecord = null;
      note = '';
      labelCount = loadManualLabelRecords().filter((record) => record.labelSetId === labelSet.id).length;
      exportStatus = '';
      return;
    }
    currentRecord = saveManualLabelRecord({
      labelSetId: labelSet.id,
      labelId: label.id,
      label: label.label,
      replayId: effectiveReplayId,
      replayName: replay.name,
      stepIndex: step.index,
      stateIndex: step.stateIndex,
      turn: step.turn,
      activePlayerIndex: step.activePlayerIndex,
      candidateSlug: replay.candidateSlug ?? '',
      workbenchFocusDeck: replay.workbenchFocusDeck ?? '',
      note,
    });
    labelCount = loadManualLabelRecords().filter((record) => record.labelSetId === labelSet.id).length;
    exportStatus = '';
  }

  function saveNote() {
    if (!currentRecord) {
      return;
    }
    currentRecord = saveManualLabelNote(labelSet.id, effectiveReplayId, step.index, note);
    exportStatus = '';
  }

  function exportJsonl() {
    const records = loadManualLabelRecords().filter((record) => record.labelSetId === labelSet.id);
    const jsonl = manualLabelRecordsToJsonl(records);
    const blob = new Blob([jsonl], { type: 'application/x-ndjson;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = manualLabelDownloadName(labelSet.id);
    link.click();
    URL.revokeObjectURL(url);
    exportStatus = records.length ? `${records.length}件を書き出しました` : '保存済みラベルはまだありません';
  }

  function resetLabels() {
    const records = loadManualLabelRecords().filter((record) => record.labelSetId === labelSet.id);
    if (!records.length) {
      exportStatus = 'リセット対象はありません';
      return;
    }
    const ok = window.confirm(`${labelSet.title} の保存済みラベル ${records.length}件をすべて削除します。よろしいですか？`);
    if (!ok) {
      return;
    }
    const removedCount = removeManualLabelRecordsForSet(labelSet.id);
    currentRecord = null;
    note = '';
    labelCount = 0;
    exportStatus = `${removedCount}件をリセットしました`;
  }

  function setPanelVisible(nextVisible: boolean) {
    panelVisible = nextVisible;
    savePanelVisibility(labelSet.id, nextVisible);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!panelVisible || event.defaultPrevented || isTypingTarget(event.target)) {
      return;
    }
    const label = labelSet.labels.find((item) => item.shortcut === event.key);
    if (!label) {
      return;
    }
    event.preventDefault();
    selectLabel(label);
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function visibilityStorageKey(labelSetId: string) {
    return `${VISIBILITY_STORAGE_KEY}.${labelSetId}`;
  }

  function loadPanelVisibility(labelSetId: string): boolean {
    try {
      return window.localStorage.getItem(visibilityStorageKey(labelSetId)) !== 'false';
    } catch {
      return true;
    }
  }

  function savePanelVisibility(labelSetId: string, visible: boolean) {
    try {
      window.localStorage.setItem(visibilityStorageKey(labelSetId), visible ? 'true' : 'false');
    } catch {
      // localStorage may be unavailable in restricted browser modes.
    }
  }
</script>

<section class="manual-label-panel" class:collapsed={!panelVisible} aria-label="手動ルート判定">
  {#if panelVisible}
    <div class="manual-label-header">
      <div>
        <strong>{labelSet.title}</strong>
        <span>{stepLabel}</span>
      </div>
      <div class="header-actions">
        <button type="button" onclick={resetLabels}>全ラベルリセット</button>
        <button type="button" onclick={exportJsonl}>Export JSONL</button>
        <button
          type="button"
          class="visibility-toggle"
          aria-expanded="true"
          title="手動ルート判定を非表示"
          onclick={() => setPanelVisible(false)}
        >
          非表示
        </button>
      </div>
    </div>

    <div class="label-buttons" aria-label="局面ラベル">
      {#each labelSet.labels as label}
        <button
          type="button"
          class:active={currentRecord?.labelId === label.id}
          data-color={label.color}
          aria-pressed={currentRecord?.labelId === label.id}
          title={`${label.shortcut}: ${label.label}`}
          onclick={() => selectLabel(label)}
        >
          <kbd>{label.shortcut}</kbd>
          <span>{label.label}</span>
        </button>
      {/each}
    </div>

    <label class="label-note">
      <span>メモ</span>
      <textarea
        value={note}
        rows="2"
        placeholder="判断理由など"
        oninput={(event) => {
          note = event.currentTarget.value;
        }}
        onblur={saveNote}
      ></textarea>
    </label>

    <div class="label-footer">
      <span>現在: {currentRecord?.label ?? '未判定'}</span>
      <span>保存済み {labelCount}件</span>
      {#if exportStatus}
        <span>{exportStatus}</span>
      {/if}
      {#if view}
        <span>active P{view.activePlayerIndex}</span>
      {/if}
    </div>
  {:else}
    <button
      type="button"
      class="manual-label-show-button"
      aria-expanded="false"
      title="手動ルート判定を表示"
      onclick={() => setPanelVisible(true)}
    >
      ルート判定を表示
    </button>
  {/if}
</section>

<style>
  .manual-label-panel {
    position: absolute;
    left: 14px;
    bottom: calc(var(--replay-dock-h, 48px) + 12px);
    z-index: 13;
    width: min(560px, calc(100vw - var(--board-right-rail) - 28px));
    display: grid;
    gap: 8px;
    padding: 9px;
    border: 1px solid var(--surface-toolbar-border);
    border-radius: 7px;
    background: var(--surface-toolbar-bg);
    color: var(--text-primary);
    box-shadow: var(--surface-toolbar-shadow);
    backdrop-filter: blur(var(--backdrop-blur));
  }

  .manual-label-panel.collapsed {
    width: auto;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
  }

  .manual-label-header,
  .label-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .manual-label-header div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .manual-label-header strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 850;
  }

  .manual-label-header span,
  .label-footer,
  .label-note span {
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.2;
  }

  .header-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .manual-label-header button {
    flex: 0 0 auto;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--button-border);
    border-radius: 5px;
    background: var(--button-bg);
    color: var(--button-text);
    font-size: 11px;
    font-weight: 800;
  }

  .header-actions button:first-child {
    border-color: color-mix(in srgb, var(--button-border) 50%, #f87171);
    background: color-mix(in srgb, var(--button-bg) 82%, #fecaca);
  }

  .manual-label-show-button {
    height: 34px;
    padding: 0 12px;
    border: 1px solid var(--button-primary-border);
    border-radius: 5px;
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    box-shadow: var(--surface-toolbar-shadow);
    font-size: 12px;
    font-weight: 850;
  }

  .label-buttons {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }

  .label-buttons button {
    min-width: 0;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 8px;
    border: 1px solid var(--button-border);
    border-radius: 5px;
    background: var(--button-bg);
    color: var(--button-text);
    font-size: 11px;
    font-weight: 850;
    line-height: 1.1;
  }

  .label-buttons button.active {
    border-color: var(--button-primary-border);
    background: color-mix(in srgb, var(--button-bg) 62%, #8fd2ff);
    color: var(--text-primary);
  }

  .label-buttons button[data-color='green'].active {
    background: color-mix(in srgb, var(--button-bg) 60%, #86efac);
  }

  .label-buttons button[data-color='orange'].active {
    background: color-mix(in srgb, var(--button-bg) 60%, #fdba74);
  }

  .label-buttons button[data-color='purple'].active {
    background: color-mix(in srgb, var(--button-bg) 62%, #c4b5fd);
  }

  .label-buttons button span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  kbd {
    flex: 0 0 auto;
    min-width: 17px;
    padding: 2px 4px;
    border: 1px solid var(--surface-toolbar-border);
    border-radius: 4px;
    color: var(--text-secondary);
    font: 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  }

  .label-note {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: start;
    gap: 7px;
  }

  .label-note textarea {
    width: 100%;
    min-height: 40px;
    resize: vertical;
    border: 1px solid var(--input-border);
    border-radius: 5px;
    background: var(--input-bg);
    color: var(--input-text);
    font: 11px/1.35 inherit;
  }

  .label-footer {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  @media (max-width: 860px) {
    .manual-label-panel {
      left: 10px;
      right: 10px;
      bottom: calc(var(--replay-dock-h, 64px) + 10px);
      width: auto;
    }

    .label-buttons {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .manual-label-header {
      align-items: start;
    }

    .manual-label-panel.collapsed {
      left: auto;
      right: 10px;
      bottom: calc(env(safe-area-inset-bottom, 0px) + 10px);
      z-index: 14;
    }

    .manual-label-show-button {
      height: 34px;
      padding: 0 10px;
      box-shadow: none;
      font-size: 11px;
    }
  }

  @media (max-width: 640px) {
    .manual-label-panel.collapsed {
      max-width: min(46vw, 172px);
    }

    .manual-label-show-button {
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
