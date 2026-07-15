import { buildReplayQuestionPrompt } from '../lib/game/replayQuestionCopy';
import type { ReplaySnapshot, ReplayStep } from '../lib/game/replay';
import type { GameView, LogView } from '../lib/game/types';
import type { LiveTimelineCheckpoint } from '../lib/game/activeMatchCheckpoint';
import cardNamesJa from '../lib/cabt/cardNamesJa.generated.json';
import attackNamesJa from '../lib/cabt/attackNamesJa.generated.json';

type RawCabtLog = Record<string, unknown>;

const japaneseCardNames = cardNamesJa as Record<string, string>;
const japaneseAttackNames = attackNamesJa as Record<string, string>;

class LiveTimelineStore {
  replay = $state<ReplaySnapshot | null>(null);
  stepIndex = $state(0);
  copiedQuestionContext = $state(false);
  questionContextText = $state('');
  private accumulatedLogs: LogView[] = [];
  private lastSignature = '';
  private nextTurnTargets = new Map<number, Array<number | null>>();
  private nextTurnTargetStepCount = 0;

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

  get isBrowsingPast(): boolean {
    return !!this.replay && this.stepIndex < this.maxStepIndex;
  }

  reset(): void {
    this.replay = null;
    this.stepIndex = 0;
    this.copiedQuestionContext = false;
    this.questionContextText = '';
    this.accumulatedLogs = [];
    this.lastSignature = '';
    this.nextTurnTargets = new Map();
    this.nextTurnTargetStepCount = 0;
  }

  checkpoint(): LiveTimelineCheckpoint {
    return {
      replay: this.replay,
      stepIndex: this.stepIndex,
    };
  }

  restore(checkpoint: LiveTimelineCheckpoint): void {
    this.reset();
    const replay = checkpoint.replay;
    if (!replay?.views.length || !replay.steps.length) {
      return;
    }
    this.replay = replay;
    this.stepIndex = clampIndex(checkpoint.stepIndex, this.maxStepIndex);
    const latestView = replay.views.at(-1);
    this.accumulatedLogs = [...(latestView?.logs ?? [])];
    this.lastSignature = latestView ? viewSignature(latestView) : '';
  }

  replaceLatestView(view: GameView): void {
    const replay = this.replay;
    const latestStepIndex = (replay?.steps.length ?? 0) - 1;
    const latestStep = replay?.steps[latestStepIndex];
    if (!replay || !latestStep || latestStepIndex < 0) {
      this.capture(view);
      return;
    }
    const views = [...replay.views];
    views[latestStep.stateIndex] = view;
    const steps = [...replay.steps];
    steps[latestStepIndex] = {
      ...latestStep,
      liveHistoryLength: view.liveHistoryLength,
      payload: {
        ...(latestStep.payload && typeof latestStep.payload === 'object' ? latestStep.payload : {}),
        liveHistoryLength: view.liveHistoryLength,
      },
    };
    this.replay = {
      ...replay,
      views,
      steps,
      winner: view.winner ?? -1,
      turnCount: Math.max(...views.map((item) => item.turn), 0),
    };
    this.accumulatedLogs = [...(view.logs ?? [])];
    this.lastSignature = viewSignature(view);
    this.nextTurnTargets = new Map();
    this.nextTurnTargetStepCount = 0;
  }

  capture(view: GameView): void {
    const signature = viewSignature(view);
    if (signature === this.lastSignature) {
      return;
    }
    this.lastSignature = signature;

    const rawLogs = latestRawLogs(view);
    const nextLogEntries = rawLogs.map((log) => ({
      id: this.accumulatedLogs.length + 1,
      message: formatCabtLog(log),
      params: log,
    }));
    this.accumulatedLogs = [...this.accumulatedLogs, ...nextLogEntries];

    const snapshotView: GameView = {
      ...view,
      logs: this.accumulatedLogs.length ? [...this.accumulatedLogs] : view.logs,
    };
    const previous = this.replay;
    const views = [...(previous?.views ?? []), snapshotView];
    const steps = [
      ...(previous?.steps ?? []),
      liveStepForView(snapshotView, views.length - 1, previous?.steps.length ?? 0),
    ];

    this.replay = {
      id: previous?.id ?? `live-${Date.now().toString(36)}`,
      name: previous?.name ?? '手動対戦',
      created: previous?.created ?? Date.now(),
      players: snapshotView.players.map((player) => ({ userId: player.index, name: player.name })),
      winner: snapshotView.winner ?? -1,
      preferredPlayerIndex: 0,
      stateCount: views.length,
      actionCount: Math.max(0, steps.length - 1),
      turnCount: Math.max(...views.map((item) => item.turn), 0),
      cardNames: [],
      views,
      steps,
    };
    this.setStep(this.maxStepIndex, { keepCopyState: true });
  }

  setStep(index: number, options: { keepCopyState?: boolean } = {}): void {
    this.stepIndex = clampIndex(index, this.maxStepIndex);
    if (!options.keepCopyState) {
      this.copiedQuestionContext = false;
      this.questionContextText = '';
    }
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

  trimFutureFromStep(index: number, replacementView?: GameView): void {
    const replay = this.replay;
    if (!replay) {
      return;
    }
    const targetIndex = clampIndex(index, Math.max(0, replay.steps.length - 1));
    const existingView = replay.views[replay.steps[targetIndex]?.stateIndex ?? targetIndex];
    const view = replacementView ?? existingView;
    if (!view) {
      return;
    }
    const keepCount = targetIndex + 1;
    const views = replay.views.slice(0, keepCount);
    views[targetIndex] = view;
    const steps = replay.steps.slice(0, keepCount).map((step, index) => {
      const isTarget = index === targetIndex;
      const liveHistoryLength = isTarget ? view.liveHistoryLength : step.liveHistoryLength;
      return {
        ...step,
        index,
        stateIndex: Math.min(step.stateIndex, views.length - 1),
        actionIndex: index === 0 ? null : index - 1,
        sequence: index,
        liveHistoryLength,
        payload: {
          ...(step.payload && typeof step.payload === 'object' ? step.payload : {}),
          liveHistoryLength,
        },
      };
    });
    this.replay = {
      ...replay,
      views,
      steps,
      stateCount: views.length,
      actionCount: Math.max(0, steps.length - 1),
      turnCount: Math.max(...views.map((item) => item.turn), 0),
      winner: view.winner ?? -1,
    };
    this.stepIndex = this.maxStepIndex;
    this.accumulatedLogs = [...(view.logs ?? [])];
    this.lastSignature = viewSignature(view);
    this.copiedQuestionContext = false;
    this.questionContextText = '';
    this.nextTurnTargets = new Map();
    this.nextTurnTargetStepCount = 0;
  }

  setStateIndex(index: number): void {
    this.setStep(index);
  }

  nextPlayerTurnStepIndex(playerIndex: number): number | null {
    const replay = this.replay;
    const currentStep = this.currentStep;
    if (!replay || !currentStep) {
      return null;
    }
    this.ensureNextTurnTargets();
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
      sourceId: replay.id,
    }).replace('このCABTリプレイの現在ターンについて質問します。', 'このCABT手動対戦の現在ターンについて質問します。');
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

  private ensureNextTurnTargets(): void {
    const replay = this.replay;
    if (!replay || this.nextTurnTargetStepCount === replay.steps.length) {
      return;
    }
    this.nextTurnTargets = buildNextTurnTargets(replay);
    this.nextTurnTargetStepCount = replay.steps.length;
  }
}

function liveStepForView(view: GameView, stateIndex: number, stepIndex: number): ReplayStep {
  const rawLogs = latestRawLogs(view);
  return {
    index: stepIndex,
    label: liveStepLabel(view, rawLogs, stepIndex),
    stateIndex,
    actionIndex: stepIndex === 0 ? null : stepIndex - 1,
    sequence: stepIndex,
    turn: view.turn,
    phase: view.phase,
    activePlayerIndex: view.activePlayerIndex,
    liveHistoryLength: view.liveHistoryLength,
    type: rawLogs.at(-1)?.type ? String(rawLogs.at(-1)?.type) : view.prompts[0]?.className ?? 'state',
    payload: {
      liveHistoryLength: view.liveHistoryLength,
      prompt: view.prompts[0] ?? null,
      logs: rawLogs,
    },
  };
}

function liveStepLabel(view: GameView, rawLogs: RawCabtLog[], stepIndex: number): string {
  const selectedToHand = selectedToHandLabel(rawLogs);
  if (selectedToHand) {
    return selectedToHand;
  }
  const playOrDraw = playOrDrawLabel(rawLogs);
  if (playOrDraw) {
    return playOrDraw;
  }
  const attack = attackLabel(rawLogs);
  if (attack) {
    return attack;
  }
  const latest = rawLogs.at(-1);
  if (latest) {
    return formatCabtLog(latest);
  }
  const prompt = view.prompts[0];
  if (prompt) {
    return `${playerName(prompt.playerIndex)}: ${prompt.message || prompt.className}`;
  }
  return stepIndex === 0 ? '対戦開始' : `${playerName(view.activePlayerIndex)}の局面`;
}

function latestRawLogs(view: GameView): RawCabtLog[] {
  const event = view.events.at(-1) as { logs?: unknown[] } | undefined;
  if (!Array.isArray(event?.logs)) {
    return [];
  }
  return event.logs.filter((log): log is RawCabtLog => !!log && typeof log === 'object');
}

function selectedToHandLabel(logs: RawCabtLog[]): string {
  const moves = logs.filter((log) => log.type === 'MoveCard' && Number(log.fromArea) === 12 && Number(log.toArea) === 2);
  if (!moves.length) {
    return '';
  }
  return `${actorName(moves[0])}: 手札へ / ${moves.map((log) => cardName(Number(log.cardId))).join('、')}`;
}

function playOrDrawLabel(logs: RawCabtLog[]): string {
  const playLog = logs.find((log) => log.type === 'Play');
  const drawLogs = logs.filter((log) => log.type === 'Draw');
  if (playLog) {
    const parts = ['カードを出す', cardName(Number(playLog.cardId))];
    if (drawLogs.length) {
      parts.push(`${drawLogs.length}枚ドロー`);
    }
    return `${actorName(playLog)}: ${parts.filter(Boolean).join(' / ')}`;
  }
  if (drawLogs.length) {
    return `${actorName(drawLogs[0])}: ${drawLogs.length}枚ドロー`;
  }
  return '';
}

function attackLabel(logs: RawCabtLog[]): string {
  const attackLog = logs.find((log) => log.type === 'Attack');
  if (!attackLog) {
    return '';
  }
  const damage = logs
    .filter((log) => log.type === 'HpChange' || log.type === 'HPChange')
    .map((log) => Number(log.value))
    .filter((value) => Number.isFinite(value) && value < 0)
    .reduce((sum, value) => sum + Math.abs(value), 0);
  return `${actorName(attackLog)}: ワザ / ${cardName(Number(attackLog.cardId))} / ${attackName(attackLog)}${damage ? ` / ${damage}ダメージ` : ''}`;
}

function formatCabtLog(log: RawCabtLog): string {
  const parts = [eventLogLabel(log.type)];
  if (Number.isFinite(Number(log.cardId))) {
    parts.push(cardName(Number(log.cardId)));
  }
  if (log.type === 'Attack') {
    parts.push(attackName(log));
  }
  if (log.type === 'MoveCard') {
    parts.push(`${areaName(log.fromArea)} -> ${areaName(log.toArea)}`);
  }
  return `${actorName(log)}: ${parts.filter(Boolean).join(' / ')}`;
}

function actorName(log: RawCabtLog): string {
  return typeof log.playerIndex === 'number' ? playerName(log.playerIndex) : '試合';
}

function playerName(index: unknown): string {
  return typeof index === 'number' ? `プレイヤー${index + 1}` : 'プレイヤー';
}

function eventLogLabel(value: unknown): string {
  const text = String(value ?? '');
  return ({
    Attach: 'エネルギーをつける',
    Attack: 'ワザ',
    Coin: 'コイン',
    Discard: 'トラッシュ',
    Draw: 'ドロー',
    Evolve: '進化',
    HasBasicPokemon: 'たね確認',
    HPChange: 'HP変更',
    HpChange: 'HP変更',
    MoveCard: 'カード移動',
    Play: 'カードを出す',
    Result: '結果',
    Shuffle: '山札を切る',
    Switch: '入れ替え',
    TurnEnd: '番終了',
    TurnStart: '番開始',
  } as Record<string, string>)[text] ?? (text || 'イベント');
}

function areaName(area: unknown): string {
  const areaMap: Record<number, string> = {
    1: '山札',
    2: '手札',
    3: 'トラッシュ',
    4: 'バトル場',
    5: 'ベンチ',
    6: 'サイド',
    7: 'スタジアム',
    8: 'エネルギー',
    9: 'どうぐ',
    10: '進化元',
    11: 'プレイヤー',
    12: '選択',
  };
  return areaMap[Number(area)] ?? 'ゾーン';
}

function cardName(id: number): string {
  return japaneseCardNames[String(id)] ?? (Number.isFinite(id) ? `カード${id}` : 'カード');
}

function attackName(log: RawCabtLog): string {
  const attackId = Number(log.attackId);
  if (!Number.isFinite(attackId)) {
    return 'ワザ';
  }
  return japaneseAttackNames[String(attackId)] ?? `ワザ${attackId}`;
}

function viewSignature(view: GameView): string {
  const current = view.events.at(-1) as { current?: { turn?: number; turnActionCount?: number; yourIndex?: number; result?: number } } | undefined;
  return [
    current?.current?.turn ?? view.turn,
    current?.current?.turnActionCount ?? '',
    current?.current?.yourIndex ?? view.activePlayerIndex,
    current?.current?.result ?? view.winner ?? '',
    view.prompts[0]?.id ?? '',
    view.logs.at(-1)?.id ?? '',
  ].join(':');
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

async function writeClipboardText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_error) {
      // Fall through to the textarea copy path for non-secure LAN origins.
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

export const liveTimelineStore = new LiveTimelineStore();
