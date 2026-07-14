import type { GameView } from '../lib/game/types';
import type { ReplaySnapshot, ReplayStep } from '../lib/game/replay';
import { cabtReplayToSnapshot } from '../lib/cabt/cabtReplay';
import { loadGameLogs, type GameLogEntry } from '../lib/home/catalog';
import { buildReplayQuestionPrompt } from '../lib/game/replayQuestionCopy';

type AdjacentReplay = {
  id: string;
  label: string;
};

class ReplayStore {
  replay = $state<ReplaySnapshot | null>(null);
  stepIndex = $state(0);
  loading = $state(false);
  error = $state('');
  copiedForkPoint = $state(false);
  copiedQuestionContext = $state(false);
  questionContextText = $state('');
  currentReplayId = $state('');
  replayLogs = $state<GameLogEntry[]>([]);
  replayPlaylistId = $state('');
  replayPlaylist = $state<GameLogEntry[]>([]);
  private loadSequence = 0;
  private replayCache = new Map<string, Promise<ReplaySnapshot>>();
  private nextTurnTargets = new Map<number, Array<number | null>>();

  get currentStep(): ReplayStep | null {
    return this.replay?.steps[this.stepIndex] ?? null;
  }

  get currentView(): GameView | null {
    const replay = this.replay;
    const step = this.currentStep;
    if (!replay || !step) {
      return null;
    }
    return replay.views[step.stateIndex] ?? null;
  }

  get maxStepIndex(): number {
    return Math.max(0, (this.replay?.steps.length ?? 1) - 1);
  }

  get previousReplay(): AdjacentReplay | null {
    return this.adjacentReplay(-1);
  }

  get nextReplay(): AdjacentReplay | null {
    return this.adjacentReplay(1);
  }

  async loadSaved(id = replayIdFromLocation() || 'kaggle-context.json', updateUrl = false): Promise<void> {
    const loadId = ++this.loadSequence;
    this.loading = true;
    this.error = '';
    this.copiedForkPoint = false;
    this.copiedQuestionContext = false;
    this.questionContextText = '';
    const normalizedId = normalizeReplayId(id);
    this.currentReplayId = normalizedId;
    const playlistId = playlistIdFromLocation();
    if (playlistId !== this.replayPlaylistId) {
      this.replayPlaylistId = playlistId;
      this.replayPlaylist = [];
    }
    try {
      await this.ensureReplayNavigation();
      const replay = await this.cachedReplay(normalizedId || id);
      if (loadId !== this.loadSequence) {
        return;
      }
      this.replay = replay;
      this.stepIndex = 0;
      this.nextTurnTargets = buildNextTurnTargets(replay);
      if (updateUrl) {
        updateReplayUrl(normalizedId || id);
      }
      this.prefetchAdjacentReplays();
    } catch (error) {
      if (loadId !== this.loadSequence) {
        return;
      }
      this.error = error instanceof Error ? error.message : String(error);
      this.replay = null;
      this.stepIndex = 0;
      this.nextTurnTargets = new Map();
    } finally {
      if (loadId === this.loadSequence) {
        this.loading = false;
      }
    }
  }

  clear(): void {
    this.loadSequence += 1;
    this.replay = null;
    this.stepIndex = 0;
    this.nextTurnTargets = new Map();
    this.loading = false;
    this.error = '';
    this.copiedForkPoint = false;
    this.copiedQuestionContext = false;
    this.questionContextText = '';
    this.currentReplayId = '';
    this.replayPlaylistId = '';
    this.replayPlaylist = [];
  }

  async previousSavedReplay(): Promise<void> {
    await this.loadAdjacentReplay(-1);
  }

  async nextSavedReplay(): Promise<void> {
    await this.loadAdjacentReplay(1);
  }

  private async loadAdjacentReplay(direction: -1 | 1): Promise<void> {
    await this.ensureReplayNavigation();
    const adjacent = this.adjacentReplay(direction);
    if (!adjacent) {
      return;
    }
    await this.loadSaved(adjacent.id, true);
  }

  private cachedReplay(id: string): Promise<ReplaySnapshot> {
    const normalizedId = normalizeReplayId(id);
    const existing = this.replayCache.get(normalizedId);
    if (existing) {
      return existing;
    }
    const promise = loadCabtReplay(normalizedId).catch((error) => {
      this.replayCache.delete(normalizedId);
      throw error;
    });
    this.replayCache.set(normalizedId, promise);
    promise.catch(() => undefined);
    this.trimReplayCache([normalizedId]);
    return promise;
  }

  private prefetchAdjacentReplays(): void {
    const ids = [this.previousReplay?.id, this.nextReplay?.id]
      .filter((id): id is string => !!id)
      .map(normalizeReplayId);
    for (const id of ids) {
      if (!this.replayCache.has(id)) {
        const promise = loadCabtReplay(id).catch((error) => {
          this.replayCache.delete(id);
          throw error;
        });
        this.replayCache.set(id, promise);
        promise.catch(() => undefined);
      }
    }
    this.trimReplayCache([normalizeReplayId(this.currentReplayId), ...ids]);
  }

  private trimReplayCache(pinnedIds: string[]): void {
    const pinned = new Set(pinnedIds.filter(Boolean));
    const maxEntries = 5;
    for (const key of this.replayCache.keys()) {
      if (this.replayCache.size <= maxEntries) {
        break;
      }
      if (!pinned.has(key)) {
        this.replayCache.delete(key);
      }
    }
  }

  private async ensureReplayNavigation(): Promise<void> {
    if (this.replayPlaylistId) {
      await this.ensureReplayPlaylist();
      return;
    }
    await this.ensureReplayLogs();
  }

  private async ensureReplayPlaylist(): Promise<void> {
    if (this.replayPlaylist.length > 1) {
      return;
    }
    try {
      this.replayPlaylist = await loadReplayPlaylist(this.replayPlaylistId);
    } catch (error) {
      console.warn('Unable to load replay playlist navigation.', error);
      this.replayPlaylist = [];
    }
  }

  private async ensureReplayLogs(): Promise<void> {
    if (this.replayLogs.length > 1) {
      return;
    }
    try {
      this.replayLogs = await loadGameLogs();
    } catch (error) {
      console.warn('Unable to load replay log navigation.', error);
      this.replayLogs = [];
    }
  }

  private adjacentReplay(direction: -1 | 1): AdjacentReplay | null {
    const sourceLogs = this.replayPlaylistId && this.replayPlaylist.length ? this.replayPlaylist : this.replayLogs;
    const playableLogs = sourceLogs.filter((log) => log.file);
    if (!playableLogs.length || !this.currentReplayId) {
      return null;
    }
    const current = normalizeReplayId(this.currentReplayId);
    const index = playableLogs.findIndex((log) => {
      const ids = [log.file, log.id].filter((value): value is string => !!value).map(normalizeReplayId);
      return ids.includes(current);
    });
    if (index < 0) {
      return null;
    }
    const next = playableLogs[index + direction];
    if (!next) {
      return null;
    }
    const id = next.file;
    if (!id) {
      return null;
    }
    return {
      id,
      label: next.name || next.description || id,
    };
  }

  setStep(index: number): void {
    this.stepIndex = clampIndex(index, this.maxStepIndex);
    this.copiedForkPoint = false;
    this.copiedQuestionContext = false;
    this.questionContextText = '';
  }

  nextStep(): void {
    this.setStep(this.stepIndex + 1);
  }

  previousStep(): void {
    this.setStep(this.stepIndex - 1);
  }

  firstStep(): void {
    this.setStep(0);
  }

  lastStep(): void {
    this.setStep(this.maxStepIndex);
  }

  nextPlayerTurnStepIndex(playerIndex: number): number | null {
    const replay = this.replay;
    const currentStep = this.currentStep;
    if (!replay || !currentStep) {
      return null;
    }
    return this.nextTurnTargets.get(playerIndex)?.[this.stepIndex] ?? null;
  }

  canSkipOpponentTurn(playerIndex: number): boolean {
    return this.nextPlayerTurnStepIndex(playerIndex) !== null;
  }

  skipOpponentTurn(playerIndex: number): void {
    const nextIndex = this.nextPlayerTurnStepIndex(playerIndex);
    if (nextIndex !== null) {
      this.setStep(nextIndex);
    }
  }

  setStateIndex(stateIndex: number): void {
    const replay = this.replay;
    if (!replay) {
      return;
    }
    const clampedState = clampIndex(stateIndex, Math.max(0, replay.stateCount - 1));
    const exact = replay.steps.findIndex((step) => step.stateIndex === clampedState);
    if (exact !== -1) {
      this.setStep(exact);
      return;
    }

    let bestIndex = 0;
    for (let index = 0; index < replay.steps.length; index += 1) {
      if (replay.steps[index].stateIndex <= clampedState) {
        bestIndex = index;
      }
    }
    this.setStep(bestIndex);
  }

  async copyForkPoint(): Promise<void> {
    const replay = this.replay;
    const step = this.currentStep;
    if (!replay || !step || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(JSON.stringify({
      replayId: replay.id,
      replayName: replay.name,
      stepIndex: step.index,
      stateIndex: step.stateIndex,
      actionIndex: step.actionIndex,
      actionType: step.type,
      turn: step.turn,
    }));
    this.copiedForkPoint = true;
  }

  async copyQuestionContext(): Promise<void> {
    const replay = this.replay;
    const step = this.currentStep;
    const view = this.currentView;
    if (!replay || !step || !view) {
      return;
    }

    const text = buildReplayQuestionPrompt({
      replay,
      step,
      view,
      sourceId: this.currentReplayId,
    });
    this.questionContextText = '';
    if (await writeClipboardText(text)) {
      this.copiedQuestionContext = true;
      return;
    }
    this.questionContextText = text;
    this.copiedQuestionContext = false;
  }

  clearQuestionContextText(): void {
    this.questionContextText = '';
  }
}

async function writeClipboardText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_error) {
      // Fall through to the textarea-based copy path used on non-secure LAN/Tailscale origins.
    }
  }
  if (typeof document === 'undefined') {
    return false;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch (_error) {
    return false;
  } finally {
    textarea.remove();
  }
}

async function loadCabtReplay(id: string): Promise<ReplaySnapshot> {
  const candidates = replayCandidates(id);
  const failures: string[] = [];
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        failures.push(`${url}: ${response.status}`);
        continue;
      }
      return cabtReplayToSnapshot(await response.json());
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Unable to load CABT replay. Tried ${failures.join('; ')}`);
}

async function loadReplayPlaylist(id: string): Promise<GameLogEntry[]> {
  if (!id) {
    return [];
  }
  const response = await fetch(`/game-logs/playlists/${encodePath(id)}.json`);
  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new Error(`/game-logs/playlists/${id}.json: ${response.status}`);
  }
  const json = await response.json();
  const items = Array.isArray(json) ? json : json?.items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item): GameLogEntry | null => {
      if (typeof item === 'string') {
        return { id: normalizeReplayId(item), name: normalizeReplayId(item), file: normalizeReplayId(item) };
      }
      if (!item || typeof item !== 'object') {
        return null;
      }
      const file = typeof item.file === 'string' ? normalizeReplayId(item.file) : '';
      const idValue = typeof item.id === 'string' ? normalizeReplayId(item.id) : file;
      if (!idValue || !file) {
        return null;
      }
      return {
        id: idValue,
        name: typeof item.name === 'string' ? item.name : idValue,
        file,
        description: typeof item.description === 'string' ? item.description : undefined,
      };
    })
    .filter((item): item is GameLogEntry => item !== null);
}

function replayCandidates(id: string): string[] {
  const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const replayUrl = params.get('replayUrl');
  if (!id && replayUrl) {
    return [replayUrl];
  }
  const file = id || params.get('replay') || replayUrl || '';
  if (/^https?:\/\//.test(file) || file.startsWith('/')) {
    return [file];
  }
  return [
    `/game-logs/${encodePath(file)}`,
    `/cabt-artifacts/${encodePath(file)}`,
    '/cabt-artifacts/kaggle-context.json',
    '/cabt-artifacts/cabt-match.json',
  ];
}

function replayIdFromLocation(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('replay') || params.get('replayUrl') || '';
}

function playlistIdFromLocation(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('playlist') || '';
}

function normalizeReplayId(id: string): string {
  const value = String(id || '').trim();
  const parts = value.split('/');
  return parts[parts.length - 1] || value;
}

function updateReplayUrl(id: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  params.set('view', 'replay');
  params.set('replay', normalizeReplayId(id));
  const playlistId = playlistIdFromLocation();
  if (playlistId) {
    params.set('playlist', playlistId);
  }
  params.delete('replayUrl');
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
}

function encodePath(path: string): string {
  return path.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function clampIndex(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(max, Math.max(0, Math.round(value)));
}

function buildNextTurnTargets(replay: ReplaySnapshot): Map<number, Array<number | null>> {
  const playerIndexes = new Set<number>();
  for (const player of replay.players) {
    playerIndexes.add(player.userId);
  }
  for (const step of replay.steps) {
    playerIndexes.add(step.activePlayerIndex);
  }

  const targets = new Map<number, Array<number | null>>();
  for (const playerIndex of playerIndexes) {
    const playerTargets = new Array<number | null>(replay.steps.length).fill(null);
    let nextOwnedStep: number | null = null;
    let nextOwnedStepAfterOpponent: number | null = null;
    for (let index = replay.steps.length - 1; index >= 0; index -= 1) {
      const ownerIndex = stepOwnerIndex(replay.steps[index]);
      if (ownerIndex === playerIndex) {
        playerTargets[index] = nextOwnedStepAfterOpponent;
        nextOwnedStep = index;
      } else {
        playerTargets[index] = nextOwnedStep;
        if (nextOwnedStep !== null) {
          nextOwnedStepAfterOpponent = nextOwnedStep;
        }
      }
      if (playerTargets[index] === null && index < replay.steps.length - 1) {
        playerTargets[index] = replay.steps.length - 1;
      }
    }
    targets.set(playerIndex, playerTargets);
  }

  return targets;
}

function stepOwnerIndex(step: ReplayStep): number {
  const match = /^プレイヤー(\d+):/.exec(step.label);
  if (match) {
    return Number(match[1]) - 1;
  }
  return step.activePlayerIndex;
}

export const replayStore = new ReplayStore();
