import type { GameView, CardView, LogView, PlayerView, PokemonSlotView } from './types';
import type { ReplaySnapshot, ReplayStep } from './replay';

type ReplayQuestionContext = {
  replay: ReplaySnapshot;
  step: ReplayStep;
  view: GameView;
  sourceId?: string;
};

const CARD_VIEWER_BASE_URL = 'http://127.0.0.1:8766/index.html#id=';
const RECENT_LOG_LIMIT = 14;
const MACHINE_CONTEXT_KEY = 'codex_replay_context_v2';

export function buildReplayQuestionPrompt({ replay, step, view, sourceId = '' }: ReplayQuestionContext): string {
  const latestLog = view.logs.at(-1);
  const replayFile = sourceId || replay.id;
  const replayJsonPath = formatReplayJsonPath(replayFile);
  const turnContext = buildReplayTurnContext(replay, step.index);
  return [
    'このCABTリプレイの現在ターンについて質問します。',
    '質問: ',
    '',
    '確認ルール:',
    '- 回答前に必ず保存済みリプレイJSONを開き、この貼り付け内容と照合してください。',
    '- この貼り付け内容は入口情報です。貼り付け内容だけで断定しないでください。',
    '- ファイルを読めない場合は「リプレイ未確認」と明記し、仮説として答えてください。',
    '- 推測が必要な場合は、どの情報が足りないかも明記してください。',
    '',
    'リプレイ位置:',
    `- replay_file: ${replayFile}`,
    `- replay_json_path: ${replayJsonPath}`,
    `- replay_id: ${replay.id}`,
    `- replay_name: ${replay.name}`,
    `- candidate_slug: ${replay.candidateSlug || replay.workbenchFocusDeck || 'unknown'}`,
    `- workbench_focus_deck: ${replay.workbenchFocusDeck || 'unknown'}`,
    `- players: ${replay.players.map((player) => `${player.userId}:${player.name}`).join(' vs ')}`,
    `- step_index: ${step.index} / ${Math.max(0, replay.steps.length - 1)}`,
    `- state_index: ${step.stateIndex} / ${Math.max(0, replay.stateCount - 1)}`,
    `- action_index: ${step.actionIndex === null ? 'initial' : step.actionIndex}`,
    `- log_index: ${latestLog?.id ?? 'none'}`,
    `- turn: ${view.turn}`,
    `- active_player_index: ${view.activePlayerIndex}`,
    `- phase: ${view.phaseLabel}`,
    `- step_label: ${step.label}`,
    `- step_type: ${step.type}`,
    '',
    '機械可読コンテキスト:',
    jsonBlock({ [MACHINE_CONTEXT_KEY]: buildMachineReplayContext(replay, step, view, replayFile, replayJsonPath, turnContext) }),
    '',
    '自ターン確認範囲:',
    ...formatTurnWindow(turnContext),
    '',
    'デッキ参照:',
    ...formatDeckReference(replay),
    '',
    'ターン開始時の盤面:',
    ...formatTurnStartBoard(turnContext),
    '',
    '盤面:',
    ...view.players.flatMap(formatPlayer),
    '',
    'このターンの行動ログ:',
    ...formatTurnLogs(turnContext, view.logs),
    '',
    'このターンの選択/アクション payload:',
    ...formatTurnStepPayloads(turnContext, step),
    '',
    '現在ステップの選択/アクション payload:',
    jsonBlock(step.payload),
  ].join('\n');
}

function buildMachineReplayContext(
  replay: ReplaySnapshot,
  step: ReplayStep,
  view: GameView,
  replayFile: string,
  replayJsonPath: string,
  turnContext: ReplayTurnContext | null,
): Record<string, unknown> {
  return {
    replay_file: replayFile,
    replay_json_path: replayJsonPath,
    replay_id: replay.id,
    replay_name: replay.name,
    candidate_slug: replay.candidateSlug || replay.workbenchFocusDeck || 'unknown',
    workbench_focus_deck: replay.workbenchFocusDeck || 'unknown',
    step_index: step.index,
    state_index: step.stateIndex,
    action_index: step.actionIndex === null ? 'initial' : step.actionIndex,
    turn: view.turn,
    active_player_index: view.activePlayerIndex,
    step_index_range: turnContext ? [turnContext.fromStepIndex, turnContext.toStepIndex] : null,
    state_index_range: turnContext ? [turnContext.fromStateIndex, turnContext.toStateIndex] : null,
    log_index_range: turnContext ? [turnContext.fromLogIndex, turnContext.toLogIndex] : null,
  };
}

export type ReplayTurnContext = {
  playerIndex: number;
  turn: number;
  fromStepIndex: number;
  toStepIndex: number;
  fromStateIndex: number;
  toStateIndex: number;
  fromLogIndex: number | null;
  toLogIndex: number | null;
  startView: GameView | null;
  steps: ReplayStep[];
  logs: LogView[];
};

export function buildReplayTurnContext(replay: ReplaySnapshot, currentStepIndex: number): ReplayTurnContext | null {
  const currentStep = replay.steps[currentStepIndex];
  if (!currentStep) {
    return null;
  }
  const ownerIndex = stepOwnerIndex(currentStep);
  let startIndex = currentStepIndex;
  while (startIndex > 0) {
    const previous = replay.steps[startIndex - 1];
    if (previous.turn !== currentStep.turn || stepOwnerIndex(previous) !== ownerIndex) {
      break;
    }
    startIndex -= 1;
  }

  const startStep = replay.steps[startIndex];
  const previousStep = startIndex > 0 ? replay.steps[startIndex - 1] : null;
  const previousView = previousStep ? replay.views[previousStep.stateIndex] : null;
  const currentView = replay.views[currentStep.stateIndex] ?? null;
  const previousLastLogId = previousView?.logs.at(-1)?.id ?? null;
  const currentLogs = currentView?.logs ?? [];
  const turnLogs = previousLastLogId === null
    ? currentLogs
    : currentLogs.filter((log) => log.id > previousLastLogId);

  return {
    playerIndex: ownerIndex,
    turn: currentStep.turn,
    fromStepIndex: startIndex,
    toStepIndex: currentStepIndex,
    fromStateIndex: startStep.stateIndex,
    toStateIndex: currentStep.stateIndex,
    fromLogIndex: turnLogs.at(0)?.id ?? null,
    toLogIndex: turnLogs.at(-1)?.id ?? null,
    startView: replay.views[startStep.stateIndex] ?? null,
    steps: replay.steps.slice(startIndex, currentStepIndex + 1),
    logs: turnLogs,
  };
}

function stepOwnerIndex(step: ReplayStep): number {
  const match = /^プレイヤー(\d+):/.exec(step.label);
  if (match) {
    return Number(match[1]) - 1;
  }
  return step.activePlayerIndex;
}

function formatReplayJsonPath(replayFile: string): string {
  if (!replayFile) {
    return 'unknown';
  }
  if (/^https?:\/\//.test(replayFile) || replayFile.startsWith('/')) {
    return replayFile;
  }
  return `tools/cabt_viewer/public/game-logs/${replayFile}`;
}

function formatTurnWindow(turnContext: ReplayTurnContext | null): string[] {
  if (!turnContext) {
    return ['- (自ターン範囲を特定できませんでした)'];
  }
  return [
    `- player_index: ${turnContext.playerIndex}`,
    `- turn: ${turnContext.turn}`,
    `- step_index_range: ${turnContext.fromStepIndex}..${turnContext.toStepIndex}`,
    `- state_index_range: ${turnContext.fromStateIndex}..${turnContext.toStateIndex}`,
    `- log_index_range: ${turnContext.fromLogIndex ?? 'none'}..${turnContext.toLogIndex ?? 'none'}`,
    '- 確認対象: 上記step範囲のactions、上記log範囲、ターン開始時と現在の盤面',
  ];
}

function formatTurnStartBoard(turnContext: ReplayTurnContext | null): string[] {
  if (!turnContext?.startView) {
    return ['- (ターン開始時の盤面を特定できませんでした)'];
  }
  return turnContext.startView.players.flatMap(formatPlayer);
}

function formatTurnLogs(turnContext: ReplayTurnContext | null, fallbackLogs: LogView[]): string[] {
  const logs = turnContext?.logs.length ? turnContext.logs : fallbackLogs.slice(-RECENT_LOG_LIMIT);
  if (!logs.length) {
    return ['- (none)'];
  }
  return logs.map((log) => `- [${log.id}] ${log.message}`);
}

function formatTurnStepPayloads(turnContext: ReplayTurnContext | null, fallbackStep: ReplayStep): string[] {
  const steps = turnContext?.steps.length ? turnContext.steps : [fallbackStep];
  return steps.flatMap((turnStep) => [
    `## step ${turnStep.index}: ${turnStep.label}`,
    `- state_index: ${turnStep.stateIndex}`,
    `- action_index: ${turnStep.actionIndex === null ? 'initial' : turnStep.actionIndex}`,
    `- step_type: ${turnStep.type}`,
    jsonBlock(turnStep.payload),
  ]);
}

function formatDeckReference(replay: ReplaySnapshot): string[] {
  const reference = replay.deckReference;
  const rows: Array<[string, string | undefined]> = [
    ['対象デッキ', reference?.focusDeck || replay.workbenchFocusDeck || replay.candidateSlug],
    ['デッキID', reference?.deckId],
    ['デッキソースディレクトリ', reference?.deckSourcePath],
    ['deck.csv', reference?.deckCsvPath],
    ['リプレイコレクションID', reference?.replayCollectionId],
    ['インポートZIP名', reference?.sourceZipName],
    ['保存ZIPパス', reference?.sourceZipPath],
    ['ZIP内deck.csv', reference?.deckCsvMember],
    ['ZIP内deck.json', reference?.deckJsonMember],
    ['デッキハッシュ', reference?.deckHash],
    ['ZIP SHA256', reference?.zipSha256],
    ['候補ソース', reference?.candidateSource],
  ];
  const lines = rows
    .filter((row): row is [string, string] => typeof row[1] === 'string' && row[1].trim().length > 0)
    .map(([label, value]) => `- ${label}: ${value}`);
  return lines.length ? lines : ['- (参照情報なし)'];
}

function formatPlayer(player: PlayerView): string[] {
  return [
    `## player ${player.index}: ${player.name}`,
    `- active: ${formatPokemonSlot(player.active)}`,
    `- bench: ${formatBench(player.bench)}`,
    `- hand (${player.hand.length}): ${formatCards(player.hand)}`,
    `- deck (${player.deckCount}): ${formatDeck(player.deck, player.deckCount)}`,
    `- discard (${player.discard.length}): ${formatCards(player.discard)}`,
    `- lost_zone (${player.lostZone.length}): ${formatCards(player.lostZone)}`,
    `- prize (${player.prizesLeft}): ${formatCards(player.prize ?? [])}`,
    `- stadium: ${formatCards(player.stadium)}`,
  ];
}

function formatBench(bench: PokemonSlotView[]): string {
  const occupied = bench.filter((slot) => !slot.empty);
  if (!occupied.length) {
    return '(none)';
  }
  return occupied.map((slot) => `[${slot.index}] ${formatPokemonSlot(slot)}`).join('; ');
}

function formatPokemonSlot(slot: PokemonSlotView): string {
  if (slot.empty || !slot.pokemon) {
    return '(empty)';
  }
  const parts = [
    `${formatCard(slot.pokemon)} HP ${Math.max(0, slot.hp - slot.damage)}/${slot.hp}`,
  ];
  if (slot.damage) {
    parts.push(`damage ${slot.damage}`);
  }
  if (slot.energy.length) {
    parts.push(`energy: ${formatCards(slot.energy)}`);
  }
  if (slot.tools.length) {
    parts.push(`tools: ${formatCards(slot.tools)}`);
  }
  const evolution = slot.cards.slice(1);
  if (evolution.length) {
    parts.push(`pre_evolution: ${formatCards(evolution)}`);
  }
  if (slot.specialConditions.length) {
    parts.push(`conditions: ${slot.specialConditions.join(', ')}`);
  }
  return parts.join(' | ');
}

function formatDeck(deck: CardView[] | undefined, deckCount: number): string {
  if (!deck?.length) {
    return deckCount ? '(cards hidden)' : '(empty)';
  }
  return formatCards(deck);
}

function formatCards(cards: CardView[]): string {
  if (!cards.length) {
    return '(none)';
  }
  return cards.map(formatCard).join(', ');
}

function formatCard(card: CardView): string {
  const name = card.name || card.fullName || 'unknown card';
  if (typeof card.id !== 'number') {
    return name;
  }
  return `[${name}](${CARD_VIEWER_BASE_URL}${card.id}) (#${card.id})`;
}

function jsonBlock(value: unknown): string {
  try {
    return ['```json', JSON.stringify(value, null, 2), '```'].join('\n');
  } catch (_error) {
    return String(value);
  }
}
