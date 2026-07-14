import cardRows from './cardData.generated.json';
import attackRows from './attackData.generated.json';
import attackNamesJa from './attackNamesJa.generated.json';
import cardNamesJa from './cardNamesJa.generated.json';
import { energyNameJa, playerNameJa, specialConditionJa, zoneNameJa } from '../game/jaText';
import { resolveCardImageUrl } from '../game/cardImages';
import { SlotType, targetFor, type CardView, type GameView, type LogView, type PlayerView, type PokemonSlotView } from '../game/types';
import type { ReplayDeckReference, ReplaySnapshot, ReplayStep } from '../game/replay';

type CardRow = {
  id: number;
  name: string;
  set: string;
  setNumber: string;
  kind: string;
  rule: string;
  evolvesFrom: string;
  hp: number | null;
  type: string;
  retreat: number | null;
  attackName: string;
  attackCost: string;
  attackDamage: string;
  attackText: string;
  retreatCost?: number;
  attacks?: number[];
};

type AttackRow = {
  attackId: number;
  name: string;
  text?: string;
  damage?: number;
  energies?: number[];
};

type CabtCardRef = {
  id: number;
  serial?: number;
  playerIndex?: number;
  name?: string;
};

type CabtPokemonRef = CabtCardRef & {
  hp?: number;
  maxHp?: number;
  energies?: number[];
  energyCards?: CabtCardRef[];
  tools?: CabtCardRef[];
  preEvolution?: CabtCardRef[];
};

type CabtPlayerFrame = {
  active?: CabtPokemonRef[];
  bench?: CabtPokemonRef[];
  benchMax?: number;
  deck?: CabtCardRef[];
  deckCount?: number;
  discard?: CabtCardRef[];
  hand?: CabtCardRef[];
  handCount?: number;
  prize?: Array<CabtCardRef | null>;
  poisoned?: boolean;
  burned?: boolean;
  asleep?: boolean;
  paralyzed?: boolean;
  confused?: boolean;
};

type CabtVisualizeFrame = {
  logs?: Array<Record<string, unknown>>;
  select?: Record<string, unknown> | null;
  selected?: unknown;
  action?: unknown;
  obs?: unknown;
  current: {
    turn: number;
    yourIndex: number;
    result: number;
    looking?: CabtCardRef[] | null;
    stadium?: CabtCardRef[];
    players: CabtPlayerFrame[];
  };
};

type KaggleContext = {
  candidate_slug?: string;
  workbench_focus_deck?: string;
  workbench_deck_reference?: Record<string, unknown>;
  target_player_index?: number;
  preferred_player_index?: number;
  environment?: {
    id?: string;
    title?: string;
    rewards?: number[];
    statuses?: string[];
    steps?: Array<Array<{ action?: unknown; observation?: Record<string, unknown>; status?: string; reward?: number }>>;
    info?: {
      TeamNames?: string[];
      EpisodeId?: string | number;
    };
  };
};

type CabtRunnerJson = {
  visualize?: CabtVisualizeFrame[];
  steps?: Array<{ index?: number; action?: unknown; observation?: unknown }>;
};

const cardDatabase = new Map<number, CardRow>((cardRows as CardRow[]).map((card) => [card.id, card]));
const attackDatabase = new Map<number, AttackRow>((attackRows as AttackRow[]).map((attack) => [attack.attackId, attack]));
const japaneseAttackNames = attackNamesJa as Record<string, string>;
const japaneseCardNames = cardNamesJa as Record<string, string>;

export function cabtReplayToSnapshot(input: unknown): ReplaySnapshot {
  const visualFrames = extractVisualizeFrames(input);
  if (!visualFrames.length) {
    throw new Error('CABT replay did not include visualize frames.');
  }

  const environment = (input as KaggleContext)?.environment;
  const players = playerNames(input);
  const views: GameView[] = [];
  const steps: ReplayStep[] = [];
  const logs: LogView[] = [];
  let logId = 1;

  visualFrames.forEach((frame, index) => {
    for (const entry of frame.logs ?? []) {
      logs.push({ id: logId++, message: formatLog(entry), params: entry });
    }
    const view = frameToGameView(frame, players, logs);
    views.push(view);
    steps.push({
      index,
      label: stepLabel(frame, index, visualFrames[index - 1]),
      stateIndex: index,
      actionIndex: index === 0 ? null : index - 1,
      sequence: index,
      turn: view.turn,
      phase: view.phase,
      activePlayerIndex: view.activePlayerIndex,
      type: String(frame.select?.type ?? 'frame'),
      payload: {
        select: frame.select,
        selected: frame.selected,
        action: frame.action,
      },
    });
  });

  const finalView = views.at(-1);
  const winner = typeof finalView?.winner === 'number' ? finalView.winner : -1;
  const preferredPlayerIndex = replayPreferredPlayerIndex(input, players.length);
  return {
    id: String(environment?.id ?? 'cabt-local-replay'),
    name: environment?.title ? `${environment.title} リプレイ` : '対戦リプレイ',
    created: Date.now(),
    players: players.map((name, index) => ({ userId: index, name })),
    winner,
    preferredPlayerIndex,
    candidateSlug: stringValue((input as KaggleContext)?.candidate_slug),
    workbenchFocusDeck: stringValue((input as KaggleContext)?.workbench_focus_deck),
    deckReference: deckReferenceValue(input),
    stateCount: views.length,
    actionCount: Math.max(0, steps.length - 1),
    turnCount: Math.max(...views.map((view) => view.turn), 0),
    cardNames: [...new Set([...cardDatabase.values()].map((card) => cardName(card.id)))],
    views,
    steps,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function deckReferenceValue(input: unknown): ReplayDeckReference | undefined {
  const raw = (input as KaggleContext)?.workbench_deck_reference;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const reference: ReplayDeckReference = {
    focusDeck: stringValue(raw.focus_deck),
    deckId: stringValue(raw.deck_id),
    deckSourcePath: stringValue(raw.deck_source_path),
    deckCsvPath: stringValue(raw.deck_csv_path),
    replayCollectionId: stringValue(raw.replay_collection_id),
    sourceZipName: stringValue(raw.source_zip_name),
    sourceZipPath: stringValue(raw.source_zip_path),
    deckCsvMember: stringValue(raw.deck_csv_member),
    deckJsonMember: stringValue(raw.deck_json_member),
    deckHash: stringValue(raw.deck_hash),
    zipSha256: stringValue(raw.zip_sha256),
    candidateSource: stringValue(raw.candidate_source),
  };
  return Object.values(reference).some(Boolean) ? reference : undefined;
}

function replayPreferredPlayerIndex(input: unknown, playerCount: number): number | undefined {
  const raw =
    (input as KaggleContext)?.target_player_index ??
    (input as KaggleContext)?.preferred_player_index;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw >= playerCount) {
    return undefined;
  }
  return raw;
}

function extractVisualizeFrames(input: unknown): CabtVisualizeFrame[] {
  const runnerFrames = (input as CabtRunnerJson)?.visualize;
  if (Array.isArray(runnerFrames)) {
    return runnerFrames as CabtVisualizeFrame[];
  }

  const steps = (input as KaggleContext)?.environment?.steps;
  const frames = steps?.[0]?.[0]?.observation?.visualize;
  if (Array.isArray(frames)) {
    return frames as CabtVisualizeFrame[];
  }

  const firstStepFrames = (steps?.[0]?.[0] as { visualize?: unknown } | undefined)?.visualize;
  if (Array.isArray(firstStepFrames)) {
    return firstStepFrames as CabtVisualizeFrame[];
  }

  const nestedEnvironment = (input as { environment?: { steps?: unknown } })?.environment?.steps;
  if (Array.isArray(nestedEnvironment)) {
    const maybeFrames = (nestedEnvironment[0] as Array<Record<string, unknown>> | undefined)?.[0]?.visualize;
    if (Array.isArray(maybeFrames)) {
      return maybeFrames as CabtVisualizeFrame[];
    }
  }

  return [];
}

function frameToGameView(frame: CabtVisualizeFrame, playerNamesForReplay: string[], logs: LogView[]): GameView {
  const current = frame.current;
  const activePlayerIndex = clampPlayerIndex(current.yourIndex);
  const players = current.players.map((player, index) =>
    buildPlayerView(player, index, activePlayerIndex, playerNamesForReplay[index] ?? `プレイヤー${index + 1}`, current.stadium ?? []),
  );
  return {
    ready: true,
    phase: current.result >= 0 ? 7 : 2,
    phaseLabel: current.result >= 0 ? '試合終了' : '対戦リプレイ',
    turn: current.turn,
    activePlayerIndex,
    activePlayerId: players[activePlayerIndex]?.id,
    winner: current.result >= 0 && current.result <= 1 ? current.result : current.result === 2 ? 3 : undefined,
    players,
    prompts: [],
    logs: [...logs],
    events: [frame],
  };
}

function buildPlayerView(
  player: CabtPlayerFrame,
  index: number,
  activePlayerIndex: number,
  name: string,
  stadium: CabtCardRef[],
): PlayerView {
  const hand = player.hand ?? [];
  return {
    index,
    id: index,
    name,
    hand: hand.length ? hand.map(cardToView) : Array.from({ length: player.handCount ?? 0 }, () => faceDownCard()),
    deck: (player.deck ?? []).map(cardToView),
    deckCount: player.deckCount ?? 0,
    discard: (player.discard ?? []).map(cardToView),
    lostZone: [],
    stadium: stadium.map(cardToView),
    playZone: [],
    prize: (player.prize ?? []).filter((card): card is CabtCardRef => !!card).map(cardToView),
    prizesLeft: player.prize?.length ?? 0,
    active: pokemonToSlot(player.active?.[0] ?? null, index, 'active', 0, activePlayerIndex, player),
    bench: Array.from({ length: Math.max(player.benchMax ?? 5, player.bench?.length ?? 0) }, (_item, benchIndex) =>
      pokemonToSlot(player.bench?.[benchIndex] ?? null, index, 'bench', benchIndex, activePlayerIndex, player),
    ),
    playableCardIds: hand.map((card) => card.id),
    availableActions: {
      active: {
        attacks: [],
        abilities: [],
        retreat: { legal: false, targets: [] },
      },
      bench: (player.bench ?? []).map((_bench, benchIndex) => ({ index: benchIndex, abilities: [] })),
    },
  };
}

function pokemonToSlot(
  pokemonCard: CabtPokemonRef | null,
  ownerIndex: number,
  slot: 'active' | 'bench',
  index: number,
  activePlayerIndex: number,
  player: CabtPlayerFrame,
): PokemonSlotView {
  const slotType = slot === 'active' ? SlotType.ACTIVE : SlotType.BENCH;
  const pokemonView = pokemonCard ? cardToView(pokemonCard) : undefined;
  const maxHp = pokemonCard?.maxHp ?? pokemonView?.hp ?? 0;
  const currentHp = pokemonCard?.hp ?? maxHp;
  return {
    ownerIndex,
    slot,
    index,
    target: targetFor(activePlayerIndex, ownerIndex, slotType, index),
    empty: !pokemonCard,
    pokemon: pokemonView,
    cards: pokemonView ? [pokemonView, ...(pokemonCard?.preEvolution ?? []).map(cardToView)] : [],
    damage: Math.max(0, maxHp - currentHp),
    hp: maxHp,
    retreat: Array.from({ length: retreatCostFor(cardDatabase.get(pokemonCard?.id ?? -1)) }, () => 'Colorless'),
    energy: (pokemonCard?.energyCards ?? []).map(cardToView),
    tools: (pokemonCard?.tools ?? []).map(cardToView),
    specialConditions: [
      player.poisoned ? specialConditionJa('Poisoned') : null,
      player.burned ? specialConditionJa('Burned') : null,
      player.asleep ? specialConditionJa('Asleep') : null,
      player.paralyzed ? specialConditionJa('Paralyzed') : null,
      player.confused ? specialConditionJa('Confused') : null,
    ].filter((condition): condition is string => !!condition),
  };
}

function cardToView(cardRef: CabtCardRef): CardView {
  const data = cardDatabase.get(cardRef.id);
  const rawName = cardRef.name || data?.name || `カード${cardRef.id}`;
  const name = cardName(cardRef.id);
  const kind = data?.kind ?? '';
  const isPokemon = kind.includes('Pokémon') || !!data?.hp;
  const isEnergy = kind.includes('Energy') || /Energy\b/.test(rawName);
  const isTrainer = !isPokemon && !isEnergy;
  const view: CardView = {
    id: cardRef.id,
    serial: cardRef.serial,
    name,
    fullName: name,
    set: data?.set || undefined,
    setNumber: data?.setNumber || undefined,
    superType: isPokemon ? 'ポケモン' : isEnergy ? 'エネルギー' : 'トレーナーズ',
    cardType: isPokemon ? energySymbolToType(data?.type) : undefined,
    trainerType: isTrainer ? kind : undefined,
    energyType: isEnergy ? energySymbolToType(data?.type || rawName) : undefined,
    stage: stageLabel(kind),
    evolvesFrom: data?.evolvesFrom || undefined,
    hp: data?.hp ?? undefined,
    retreat: Array.from({ length: retreatCostFor(data) }, () => '無'),
    attacks: attacksForCard(data),
  };
  return {
    ...view,
    imageUrl: resolveCardImageUrl(view),
  };
}

function faceDownCard(): CardView {
  return {
    name: 'カード',
    fullName: 'カード',
  };
}

function playerNames(input: unknown): string[] {
  const names = (input as KaggleContext)?.environment?.info?.TeamNames;
  return names?.length ? names.map((name, index) => playerNameJa(name, index)) : ['プレイヤー1', 'プレイヤー2'];
}

function stepLabel(frame: CabtVisualizeFrame, index: number, previousFrame?: CabtVisualizeFrame): string {
  const selectedToHandLabel = selectedToHandStepLabel(frame, previousFrame);
  if (selectedToHandLabel) {
    return selectedToHandLabel;
  }

  const effectLabel = effectStepLabel(frame);
  if (effectLabel) {
    return effectLabel;
  }

  const attackLabel = attackStepLabel(frame.logs ?? []);
  if (attackLabel) {
    return attackLabel;
  }

  const playOrDrawLabel = playOrDrawStepLabel(frame.logs ?? []);
  if (playOrDrawLabel) {
    return playOrDrawLabel;
  }

  const latestLog = frame.logs?.at(-1);
  if (latestLog) {
    return formatLog(latestLog);
  }
  const selectType = frame.select?.type;
  const context = frame.select?.context;
  if (selectType || context) {
    return [selectLabel(selectType), selectLabel(context)].filter(Boolean).join(' · ');
  }
  return index === 0 ? '初期状態' : `フレーム${index}`;
}

function selectLabel(value: unknown): string {
  const text = String(value ?? '');
  return ({
    Attack: 'ワザ',
    Attach: 'エネルギーをつける',
    AttachFrom: 'つけるカード選択',
    Bench: 'ベンチ',
    Card: 'カード',
    Choose: '選択',
    Coin: 'コイン',
    Discard: 'トラッシュ',
    DiscardEnergy: 'エネルギーをトラッシュ',
    DamageCounterAny: 'ダメカン選択',
    Energy: 'エネルギー',
    Evolve: '進化',
    HasBasicPokemon: 'たね確認',
    IsFirst: '先攻選択',
    Main: 'メイン',
    None: '',
    Play: 'カードを出す',
    Retreat: 'にげる',
    Select: '選択',
    Shuffle: '山札を切る',
    Switch: '入れ替え',
    ToHand: '手札へ',
    YesNo: 'はい/いいえ',
    frame: 'フレーム',
  } as Record<string, string>)[text] ?? text;
}

function effectStepLabel(frame: CabtVisualizeFrame): string {
  const effect = frame.select?.effect as CabtCardRef | undefined;
  if (!effect || !Number.isFinite(Number(effect.id))) {
    return '';
  }

  const playerIndex = typeof effect.playerIndex === 'number' ? effect.playerIndex : undefined;
  const actor = playerIndex === undefined ? '試合' : `プレイヤー${playerIndex + 1}`;
  const context = selectLabel(frame.select?.context);
  return `${actor}: 効果 / ${cardName(Number(effect.id))}${context ? ` / ${context}` : ''}`;
}

function selectedToHandStepLabel(frame: CabtVisualizeFrame, previousFrame?: CabtVisualizeFrame): string {
  const selectionMoves = (frame.logs ?? []).filter((log) => log.type === 'MoveCard' && Number(log.fromArea) === 12);
  const toHandMoves = selectionMoves.filter((log) => Number(log.toArea) === 2);
  if (!toHandMoves.length) {
    return '';
  }

  const actor = actorName(toHandMoves[0]);
  const pickedCards = toHandMoves.map((log) => cardName(Number(log.cardId))).join('、');
  const effect = (frame.select?.effect ?? previousFrame?.select?.effect) as CabtCardRef | undefined;
  const seenCards = (previousFrame?.current.looking ?? []).map((card) => cardName(Number(card.id))).join('、');
  const bottomCards = selectionMoves
    .filter((log) => Number(log.toArea) === 14)
    .map((log) => cardName(Number(log.cardId)))
    .join('、');
  const movementParts = [
    seenCards ? `見たカード / ${seenCards}` : '',
    `手札へ / ${pickedCards}`,
    bottomCards ? `山札の下へ / ${bottomCards}` : '',
  ].filter(Boolean);
  if (effect && Number.isFinite(Number(effect.id))) {
    return `${actor}: 効果 / ${cardName(Number(effect.id))} / ${movementParts.join(' / ')}`;
  }
  return `${actor}: ${movementParts.join(' / ')}`;
}

function playOrDrawStepLabel(logs: Array<Record<string, unknown>>): string {
  const playLog = logs.find((log) => log.type === 'Play');
  const drawLogs = logs.filter((log) => log.type === 'Draw');

  if (playLog) {
    const parts = [eventLogLabel(playLog.type), cardName(Number(playLog.cardId))];
    const pickedCards = cardsMovedFromSelectionToHand(logs);
    if (pickedCards.length) {
      parts.push(`手札へ / ${pickedCards.join('、')}`);
    } else if (logs.some((log) => log.type === 'MoveCard' && Number(log.toArea) === 12)) {
      parts.push('手札へ / なし');
    }
    if (drawLogs.length > 1) {
      parts.push(`${drawLogs.length}枚ドロー`);
    } else if (drawLogs.length === 1) {
      parts.push('1枚ドロー');
    }
    return `${actorName(playLog)}: ${parts.filter(Boolean).join(' / ')}`;
  }

  if (drawLogs.length > 1) {
    return `${actorName(drawLogs[0])}: ${drawLogs.length}枚ドロー`;
  }

  return '';
}

function attackStepLabel(logs: Array<Record<string, unknown>>): string {
  const attackLog = logs.find((log) => log.type === 'Attack');
  if (!attackLog) {
    return '';
  }

  const parts = [eventLogLabel(attackLog.type)];
  if (Number.isFinite(Number(attackLog.cardId))) {
    parts.push(cardName(Number(attackLog.cardId)));
  }
  parts.push(attackNameForLog(attackLog));

  const damage = attackDamageSummary(logs);
  if (damage) {
    parts.push(damage);
  }

  return `${actorName(attackLog)}: ${parts.filter(Boolean).join(' / ')}`;
}

function attackDamageSummary(logs: Array<Record<string, unknown>>): string {
  const damageValues = logs
    .filter((log) => log.type === 'HpChange' || log.type === 'HPChange')
    .map((log) => Number(log.value))
    .filter((value) => Number.isFinite(value) && value < 0)
    .map((value) => Math.abs(value));

  if (!damageValues.length) {
    return '';
  }

  const totalDamage = damageValues.reduce((sum, value) => sum + value, 0);
  return `${totalDamage}ダメージ`;
}

function formatLog(log: Record<string, unknown>): string {
  const card = cardName(Number(log.cardId));
  const parts = [eventLogLabel(log.type)];

  if (Number.isFinite(Number(log.cardId))) {
    parts.push(card);
  }
  if (log.type === 'Attack') {
    parts.push(attackNameForLog(log));
  }
  if (log.type === 'MoveCard') {
    parts.push(`${areaName(log.fromArea)} → ${areaName(log.toArea)}`);
  }

  return `${actorName(log)}: ${parts.filter(Boolean).join(' / ')}`;
}

function actorName(log: Record<string, unknown>): string {
  const playerIndex = typeof log.playerIndex === 'number' ? log.playerIndex : undefined;
  return playerIndex === undefined ? '試合' : `プレイヤー${playerIndex + 1}`;
}

function cardsMovedFromSelectionToHand(logs: Array<Record<string, unknown>>): string[] {
  return logs
    .filter((log) => log.type === 'MoveCard' && Number(log.fromArea) === 12 && Number(log.toArea) === 2)
    .map((log) => cardName(Number(log.cardId)));
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
  } as Record<string, string>)[text] ?? 'イベント';
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
    14: '山札の下',
  };
  return areaMap[Number(area)] ?? zoneNameJa('zone');
}

function cardName(id: number): string {
  const japaneseName = japaneseCardNames[String(id)];
  if (japaneseName) {
    return japaneseName;
  }
  return displayName(cardDatabase.get(id)?.name ?? (Number.isFinite(id) ? `カード${id}` : 'カード'));
}

function attackNameForLog(log: Record<string, unknown>): string {
  const attackId = Number(log.attackId);
  if (!Number.isFinite(attackId)) {
    return 'ワザ';
  }
  return japaneseAttackNames[String(attackId)] ?? attackDatabase.get(attackId)?.name ?? `ワザ${attackId}`;
}

function attacksForCard(data: CardRow | undefined): CardView['attacks'] {
  if (!data) {
    return undefined;
  }
  const engineAttacks = data.attacks
    ?.map((attackId) => attackDatabase.get(attackId))
    .filter((attack): attack is AttackRow => !!attack);
  if (engineAttacks?.length) {
    return engineAttacks.map((attack) => ({
      name: japaneseAttackNames[String(attack.attackId)] ?? attack.name,
      cost: (attack.energies ?? []).map(energyName),
      damage: attack.damage ? String(attack.damage) : '',
      text: attack.text ?? '',
    }));
  }
  if (!data.attackName) {
    return undefined;
  }
  return [{
    name: data.attackDamage ? `ワザ ${data.attackDamage}` : 'ワザ',
    cost: energyCostLabels(data.attackCost),
    damage: data.attackDamage,
    text: data.attackText,
  }];
}

function retreatCostFor(data: CardRow | undefined): number {
  return data?.retreat ?? data?.retreatCost ?? 0;
}

function displayName(name: string): string {
  return name
    .replaceAll('{G}', '草')
    .replaceAll('{R}', '炎')
    .replaceAll('{W}', '水')
    .replaceAll('{L}', '雷')
    .replaceAll('{P}', '超')
    .replaceAll('{F}', '闘')
    .replaceAll('{D}', '悪')
    .replaceAll('{M}', '鋼')
    .replaceAll('{C}', '無');
}

function energySymbolToType(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  if (value.includes('{G}') || /grass/i.test(value)) return 1;
  if (value.includes('{R}') || /fire/i.test(value)) return 2;
  if (value.includes('{W}') || /water/i.test(value)) return 3;
  if (value.includes('{L}') || /lightning/i.test(value)) return 4;
  if (value.includes('{P}') || /psychic/i.test(value)) return 5;
  if (value.includes('{F}') || /fighting/i.test(value)) return 6;
  if (value.includes('{D}') || /dark/i.test(value)) return 7;
  if (value.includes('{M}') || /metal/i.test(value)) return 8;
  return 0;
}

function energyCostLabels(cost: string): string[] {
  return [...cost.matchAll(/\{([A-Z])\}/g)].map((match) => displayName(`{${match[1]}}`));
}

function energyName(energy: number): string {
  return [
    '無',
    '草',
    '炎',
    '水',
    '雷',
    '超',
    '闘',
    '悪',
    '鋼',
    'ドラゴン',
    '虹',
    'ロケット団',
  ][energy] ?? '無';
}

function stageLabel(kind: string): string | undefined {
  const translated = energyNameJa(kind);
  if (kind.includes('Basic Pokémon')) return 'たね';
  if (kind.includes('Stage 1')) return '1進化';
  if (kind.includes('Stage 2')) return '2進化';
  if (translated !== kind) return translated;
  return undefined;
}

function clampPlayerIndex(index: number): number {
  return index === 1 ? 1 : 0;
}
