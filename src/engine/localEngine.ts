import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { cabtObservationToGameView, projectDecision, type CabtDataMaps } from '../lib/cabt/cabtProjection';
import { markPassAnnounceEvents, stepAnimationPhases } from '../lib/cabt/cabtReplay';
import { cabtLogsToTimeline } from '../lib/cabt/logFormat';
import { LiveObservationNormalizer, logsWithSynthesizedAnnounce } from './liveSteps';
import { workspaceAgentPath } from './workspaceAgents';
import {
  type CabtAttack,
  type CabtCardData,
  type CabtObservation,
} from '../lib/cabt/types';
import rawCardRows from '../lib/cabt/cardData.generated.json';
import type { ActionTimelineEvent, EngineResponse, GameView, LogView, SeatView } from '../lib/game/types';

type Command = {
  type: string;
  payload?: any;
};

type BridgeResponse = {
  ok: boolean;
  id: number;
  error?: string;
  traceback?: string;
  observation?: CabtObservation;
  autoSteps?: CabtObservation[];
  autoActions?: Array<number[] | null>;
  cards?: CabtCardData[];
  attacks?: CabtAttack[];
  takeover?: {
    schemaVersion: string;
    worldMode: string;
    seed: number;
    rootActor: number;
    humanSeat: number;
    worldSha256: string;
    world: Record<string, unknown>;
  };
};

type PendingBridgeCall = {
  resolve: (value: BridgeResponse) => void;
  reject: (error: Error) => void;
};

type PlayerControl = 'self' | 'agent';

type HumanDemonstrationAction = {
  step: number;
  seat: number;
  source: 'human' | 'agent';
  indexes: number[];
  beforeRawFrame: number;
  turn: number | null;
  turnActionCount: number | null;
  selectContext: unknown;
  minCount: number | null;
  maxCount: number | null;
  optionCount: number;
};

type HumanExperimentMetadata = {
  schemaVersion: 'ptcg-human-experiment-v1';
  collectionBatch: string;
  startedAt: string;
  humanSeat: number | null;
  opponentSeat: number | null;
  focusDeckSlug: string | null;
  opponentDeckSlug: string | null;
  opponentAgentId: string | null;
  controls: PlayerControl[];
  playerDeckSlugs: Array<string | null>;
  playerAgentIds: Array<string | null>;
  sourceSnapshotManifest: string | null;
  sourceSnapshotSha256: string | null;
  analysisSnapshotPath: string | null;
  focusAgentSha256: string | null;
  focusDeckSha256: string | null;
  opponentAgentSha256: string | null;
  opponentDeckSha256: string | null;
};



type HumanTakeoverMetadata = {
  schemaVersion: 'ptcg-human-takeover-v1';
  sourceReplayFile: string;
  sourceReplayId: string | null;
  sourceReplaySha256: string;
  sourceStateIndex: number;
  sourceTurn: number | null;
  sourceActor: number;
  humanSeat: number;
  opponentSeat: number;
  opponentAgentId: string;
  worldMode: string;
  worldSeed: number;
  worldReceiptPath: string;
  worldSha256: string;
  originalResult: number | null;
  startedAt: string;
};

type SaveReplayResponse = {
  ok: boolean;
  file?: string;
  id?: string;
  error?: string;
};

type AgentManifest = {
  agents?: Array<{
    id: string;
    path?: string;
    deckUrl?: string;
  }>;
};

const CARD_ROWS = rawCardRows as Array<{
  id: number;
  name: string;
  set: string;
  setNumber: string;
}>;
const CARD_ROWS_BY_ID = new Map<number, (typeof CARD_ROWS)[number]>();
for (const row of CARD_ROWS) {
  if (!CARD_ROWS_BY_ID.has(row.id)) {
    CARD_ROWS_BY_ID.set(row.id, row);
  }
}

const BRIDGE_TIMEOUT_MS = Math.max(1000, Number(process.env.CABT_BRIDGE_TIMEOUT_MS ?? 120_000));

// The value-head eval sidecar (agent-lab/viewer/eval_server.py). A separate
// process from the game bridge on purpose: value queries must never share the
// bridge's stdin/stdout gameplay protocol. Missing/unreachable sidecar degrades
// to pWin=null (the bar hides itself) — it can never break gameplay.
const EVAL_BASE_URL = process.env.CABT_EVAL_URL
  ?? `http://127.0.0.1:${process.env.CABT_EVAL_PORT ?? 8097}`;
const EVAL_TIMEOUT_MS = Math.max(500, Number(process.env.CABT_EVAL_TIMEOUT_MS ?? 5000));

export type EvalResult = { ok: true; pWin: number | null; seat: number; ready: boolean };

async function evalSidecar<T>(path: string, body: unknown, timeoutMs = EVAL_TIMEOUT_MS): Promise<T | null> {
  try {
    const response = await fetch(`${EVAL_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '..', '..');
const WORKSPACE_ROOT = path.resolve(FRONTEND_ROOT, '..');
const BRIDGE_PATH = path.join(FRONTEND_ROOT, 'src', 'engine', 'cabt_bridge.py');
const GAME_LOGS_DIR = path.join(FRONTEND_ROOT, 'public', 'game-logs');
const GAME_LOGS_MANIFEST = path.join(GAME_LOGS_DIR, 'logs.json');


function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeReplayPath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('A saved local replay file is required for takeover.');
  }
  const file = path.basename(value.trim());
  if (!file.endsWith('.json')) {
    throw new Error('Takeover supports saved local JSON replays only.');
  }
  const resolved = path.resolve(GAME_LOGS_DIR, file);
  const root = `${path.resolve(GAME_LOGS_DIR)}${path.sep}`;
  if (!resolved.startsWith(root) || !fs.existsSync(resolved)) {
    throw new Error(`Saved replay not found: ${file}`);
  }
  return resolved;
}

function takeoverStateRoot(): string {
  const configured = process.env.CABT_HUMAN_TAKEOVER_STATE_DIR;
  if (!configured) {
    throw new Error('CABT_HUMAN_TAKEOVER_STATE_DIR is not configured. Re-run the PTCG-ABC viewer setup.');
  }
  const resolved = path.resolve(configured);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function inferredAgentId(replay: any, seat: number, fallback?: string): string {
  const experiment = replay?.experiment ?? {};
  const direct = Array.isArray(experiment?.playerAgentIds) ? experiment.playerAgentIds[seat] : null;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }
  if (experiment?.opponentSeat === seat && typeof experiment?.opponentAgentId === 'string') {
    return experiment.opponentAgentId;
  }
  const slug = Array.isArray(experiment?.playerDeckSlugs) ? experiment.playerDeckSlugs[seat] : null;
  if (typeof slug === 'string' && slug.trim()) {
    return `ptcg-abc:${slug.trim()}`;
  }
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim();
  }
  throw new Error(`No frozen agent is recorded for seat ${seat + 1}. Select the matching opponent agent before takeover.`);
}

function writeTakeoverWorldReceipt(payload: {
  sourceReplayFile: string;
  sourceReplaySha256: string;
  sourceStateIndex: number;
  receipt: NonNullable<BridgeResponse['takeover']>;
}): { path: string; sha256: string } {
  const body = {
    schemaVersion: 'ptcg-human-takeover-world-v1',
    sourceReplayFile: payload.sourceReplayFile,
    sourceReplaySha256: payload.sourceReplaySha256,
    sourceStateIndex: payload.sourceStateIndex,
    worldMode: payload.receipt.worldMode,
    seed: payload.receipt.seed,
    rootActor: payload.receipt.rootActor,
    humanSeat: payload.receipt.humanSeat,
    worldSha256: payload.receipt.worldSha256,
    world: payload.receipt.world,
    createdAt: new Date().toISOString(),
  };
  const json = `${JSON.stringify(body, null, 2)}\n`;
  const digest = sha256Text(json);
  const file = `takeover-${digest.slice(0, 20)}.json`;
  const target = path.join(takeoverStateRoot(), file);
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, json, { mode: 0o600 });
  }
  return { path: target, sha256: digest };
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readHumanSnapshotManifest(): any {
  const manifestPath = nullableText(process.env.CABT_HUMAN_SNAPSHOT_MANIFEST);
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function snapshotReceipt(manifest: any, slug: string | null): any {
  if (!slug || !Array.isArray(manifest?.decks)) {
    return null;
  }
  return manifest.decks.find((row: any) => row?.slug === slug) ?? null;
}

function buildHumanExperiment(
  payload: any,
  controls: [PlayerControl, PlayerControl],
): HumanExperimentMetadata {
  const deckSlugs = [nullableText(payload?.player1?.deckId), nullableText(payload?.player2?.deckId)];
  const agentIds = [nullableText(payload?.player1?.agentId), nullableText(payload?.player2?.agentId)];
  const humanSeats = controls.flatMap((control, seat) => (control === 'self' ? [seat] : []));
  const humanSeat = humanSeats.length === 1 ? humanSeats[0] : null;
  const opponentSeat = humanSeat === null ? null : 1 - humanSeat;
  const focusDeckSlug = humanSeat === null ? null : deckSlugs[humanSeat];
  const opponentDeckSlug = opponentSeat === null ? null : deckSlugs[opponentSeat];
  const manifest = readHumanSnapshotManifest();
  const focusReceipt = snapshotReceipt(manifest, focusDeckSlug);
  const opponentReceipt = snapshotReceipt(manifest, opponentDeckSlug);
  return {
    schemaVersion: 'ptcg-human-experiment-v1',
    collectionBatch: nullableText(process.env.CABT_HUMAN_COLLECTION_BATCH) ?? 'unlabeled',
    startedAt: new Date().toISOString(),
    humanSeat,
    opponentSeat,
    focusDeckSlug,
    opponentDeckSlug,
    opponentAgentId: opponentSeat === null ? null : agentIds[opponentSeat],
    controls: [...controls],
    playerDeckSlugs: deckSlugs,
    playerAgentIds: agentIds,
    sourceSnapshotManifest: nullableText(process.env.CABT_HUMAN_SNAPSHOT_MANIFEST),
    sourceSnapshotSha256: nullableText(process.env.CABT_HUMAN_SOURCE_SNAPSHOT_SHA256),
    analysisSnapshotPath: nullableText(process.env.CABT_HUMAN_ANALYSIS_SNAPSHOT),
    focusAgentSha256: nullableText(focusReceipt?.main_sha256),
    focusDeckSha256: nullableText(focusReceipt?.deck_sha256),
    opponentAgentSha256: nullableText(opponentReceipt?.main_sha256),
    opponentDeckSha256: nullableText(opponentReceipt?.deck_sha256),
  };
}

export class LocalEngineController {
  private readonly bridge: CabtBridgeClient;
  private observation: CabtObservation | null = null;
  private dataMaps: CabtDataMaps = { cardData: {}, attacks: {} };
  private logs: LogView[] = [];
  private logId = 1;
  private actionTimeline: ActionTimelineEvent[] = [];
  private timelineId = 1;
  private normalizer = new LiveObservationNormalizer();
  private lastNewLogs: Array<Record<string, unknown>> = [];
  // Carries "did the current turn attack yet" across observations/selects, so
  // a TurnEnd reached without ever attacking (explicit pass, forced pass, an
  // effect ending the turn) gets flagged for the Pass announce — see
  // markPassAnnounceEvents in cabtReplay.ts, the rule shared with replay.
  private passAnnounceState = { attackedThisTurn: false };
  private pendingSequence: GameView[] = [];
  private sessionId = '';
  private decisionSeq = 0;
  private replayFrames: CabtObservation[] = [];
  // The pre-conceal (raw) observations, one per replay frame. Each carries the
  // ACTING seat's own hidden info (its hand), which the normalizer hides in
  // replayFrames for a human game. Persisted as `rawVisualize` so the replay
  // eval graph can score BOTH seats' own-view lines (the seat-1 line needs
  // seat 1's hand, absent from the concealed playback frames).
  private rawFrames: CabtObservation[] = [];
  private humanActions: HumanDemonstrationAction[] = [];
  private humanExperiment: HumanExperimentMetadata | null = null;
  private replayTakeover: HumanTakeoverMetadata | null = null;
  // Each seat's LAST raw decision observation (with its own hand), so the live
  // eval bar can score BOTH perspectives — the tracked seat's current decision
  // and the opponent's most recent one.
  private rawObservationBySeat: [CabtObservation | null, CabtObservation | null] = [null, null];
  private replayPlayerLabels: [string, string] = ['Player 1', 'Player 2'];
  private replayModeLabel = 'Self vs Agent';
  private playerControls: [PlayerControl, PlayerControl] = ['self', 'agent'];
  // The resolved 60-card decks by seat, kept so the eval sidecar can rebuild
  // the acting seat's deck-conditioned observation encoding.
  private decks: [number[], number[]] = [[], []];

  constructor() {
    this.bridge = new CabtBridgeClient(() => this.invalidateSession('CABT bridge exited.'));
  }

  async handle(command: Command): Promise<EngineResponse> {
    try {
      if (command.type !== 'startGame' && command.type !== 'startTakeover') {
        this.assertSession(command.payload);
      }
      switch (command.type) {
        case 'startGame':
          return await this.start(command.payload);
        case 'state':
          return this.viewResponse();
        case 'startTakeover':
          return await this.startTakeover(command.payload);
        case 'select':
          return await this.select(command.payload);
        default:
          return { ok: false, error: `Unsupported command: ${command.type}`, view: this.view() };
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        view: this.view(),
      };
    }
  }

  saveReplay(): SaveReplayResponse {
    if (!this.replayFrames.length) {
      return { ok: false, error: 'No local match is available to save.' };
    }
    const finalFrame = this.replayFrames.at(-1);
    const winner = finalFrame?.current?.result;
    const created = new Date();
    const stamp = compactIsoTimestamp(created);
    const id = `local-${stamp}`;
    const file = `${id}.json`;
    const name = `Local ${this.replayModeLabel} ${created.toLocaleString()}`;
    const replay = {
      visualize: this.replayFrames,
      // Raw (pre-conceal) frames for both-seat eval — playback still uses the
      // concealed `visualize`; this only feeds the value head.
      rawVisualize: this.rawFrames,
      // Persist both seats' decks so the replay eval graph can rebuild the
      // deck-conditioned observation encoding losslessly (a single observation
      // can't recover the full deck — prizes/deck stay hidden).
      decks: this.decks,
      humanDemonstration: {
        schemaVersion: 'ptcg-human-demonstration-v1',
        controls: [...this.playerControls],
        actions: this.humanActions,
      },
      experiment: this.humanExperiment,
      takeover: this.replayTakeover,
      environment: {
        id,
        title: name,
        info: {
          TeamNames: this.replayPlayerLabels,
        },
      },
    };

    fs.mkdirSync(GAME_LOGS_DIR, { recursive: true });
    fs.writeFileSync(path.join(GAME_LOGS_DIR, file), `${JSON.stringify(replay)}\n`);
    writeGameLogManifest({
      id,
      name,
      file,
      createdAt: created.toISOString(),
      players: this.replayPlayerLabels,
      description: `Saved local ${this.replayModeLabel} match${typeof winner === 'number' && winner >= 0 ? `, result ${winner}` : ''}.`,
    });
    return { ok: true, id, file };
  }

  // Value-head win probability for `seat` at the CURRENT interactive position,
  // via the eval sidecar. The value head is asymmetric (it reads one player's
  // own hidden-info observation), so we only answer when `seat` is the acting
  // player of the settled observation — otherwise pWin is null and the caller
  // holds the last value. The raw observation and deck never leave this process.
  async evaluate(seat: number): Promise<EvalResult> {
    // Use the seat's own LAST decision observation (raw, with its hand). For the
    // tracked seat that's the current interactive decision; for the opponent
    // it's its last turn's decision — so both perspectives are scorable live,
    // each from what only it can see. The raw observation and deck never leave
    // this process, and this path is read-only.
    const obs = this.rawObservationBySeat[seat];
    const deck = this.decks[seat];
    if (!obs?.current || !obs.select || !deck?.length) {
      return { ok: true, pWin: null, seat, ready: false };
    }
    const result = await evalSidecar<{ ok: boolean; pWin: number | null }>('/evaluate', {
      observation: { current: obs.current, select: obs.select },
      deck,
    });
    return { ok: true, pWin: result?.pWin ?? null, seat, ready: !!result };
  }

  // Batch value curve over a whole episode for the replay eval graph. Each frame
  // is an observation ({current, select}); we score only those whose acting seat
  // is `seat` (a consistent fixed perspective), returning {stateIndex, pWin} so
  // the caller can plot points at real decision states and interpolate between.
  async evaluateReplay(
    frames: Array<{ current: CabtObservation['current']; select: CabtObservation['select']; stateIndex: number }>,
    seat: number,
    deck: number[],
  ): Promise<{ ok: true; points: Array<{ stateIndex: number; pWin: number }>; ready: boolean }> {
    const scored = frames.filter(
      (frame) => frame.current && frame.select && frame.current.yourIndex === seat && (frame.current.result ?? -1) < 0,
    );
    // A deck sharpens the deck-conditioned encoding but isn't required — replays
    // without persisted decks (Kaggle/spectator, legacy saves) still get a
    // slightly-degraded curve rather than nothing (the sidecar pads a neutral
    // deck). Only bail when the seat never acts.
    if (!scored.length) {
      return { ok: true, points: [], ready: false };
    }
    // A whole-episode batch scored one-at-a-time through the model lock takes
    // seconds (and both seats' batches serialize there), so allow far longer
    // than the latency-sensitive live path's timeout.
    const result = await evalSidecar<{ ok: boolean; pWins: Array<number | null> }>('/evaluate-batch', {
      items: scored.map((frame) => ({ observation: { current: frame.current, select: frame.select }, deck })),
    }, 120_000);
    if (!result?.pWins) {
      return { ok: true, points: [], ready: false };
    }
    const points: Array<{ stateIndex: number; pWin: number }> = [];
    result.pWins.forEach((pWin, index) => {
      if (typeof pWin === 'number') {
        points.push({ stateIndex: scored[index].stateIndex, pWin });
      }
    });
    return { ok: true, points, ready: true };
  }

  // The near-omniscient "judge's line" (#45 T2): for each of `seat`'s decisions,
  // an EXCHANGE-depth search that pins the opponent's hidden state to what the
  // replay recorded (their exact deck + hand as of their last decision). Returns
  // the judge's win-prob for `seat` on that seat's own axis. On-demand + heavy;
  // one batch per episode, cached by the caller. Needs BOTH decks and each
  // acting frame's `searchBeginInput` (the engine's search seed) — frames without
  // it (legacy/Kaggle) are skipped, so the line degrades to unavailable.
  async analyzeReplayOmniscient(
    frames: Array<{ current: CabtObservation['current']; select: CabtObservation['select'];
                    stateIndex: number; searchBeginInput: string | null }>,
    seat: number,
    deckSelf: number[],
    oppDeck: number[],
  ): Promise<{ ok: true; points: Array<{ stateIndex: number; qWin: number }>; ready: boolean }> {
    const scored = frames.filter(
      (frame) => frame.current && frame.select && frame.current.yourIndex === seat
        && (frame.current.result ?? -1) < 0 && typeof frame.searchBeginInput === 'string',
    );
    // The judge needs the real matchup on BOTH sides; without either deck (or
    // without the engine's search seed on the frames) there is no true line.
    if (!scored.length || !deckSelf.length || !oppDeck.length) {
      return { ok: true, points: [], ready: false };
    }
    const items = scored.map((frame) => ({
      observation: { current: frame.current, select: frame.select,
                     search_begin_input: frame.searchBeginInput },
      deckSelf,
      oppDeck,
      oppLastHand: lastKnownHand(frames, frame.stateIndex, seat === 0 ? 1 : 0),
    }));
    // Exchange-depth search per decision is seconds each; a whole episode is
    // minutes. The engine proxy holds a long timeout; this is the on-demand path.
    const result = await evalSidecar<{ ok: boolean; qValues: Array<number | null> }>(
      '/analyze-omniscient-batch', { items }, 1_800_000);
    if (!result?.qValues) {
      return { ok: true, points: [], ready: false };
    }
    const points: Array<{ stateIndex: number; qWin: number }> = [];
    result.qValues.forEach((qWin, index) => {
      if (typeof qWin === 'number') {
        points.push({ stateIndex: scored[index].stateIndex, qWin });
      }
    });
    return { ok: true, points, ready: true };
  }

  close(): void {
    this.bridge.close();
    this.invalidateSession('CABT bridge closed.');
  }

  private async start(payload: any): Promise<EngineResponse> {
    const playerControls = normalizePlayerControls(payload);
    const player1Deck = resolveDeck(payload?.player1?.deck ?? [], 'Your deck');
    const player2Deck = resolveDeck(payload?.player2?.deck ?? [], 'Player 2 deck');
    this.decks = [player1Deck, player2Deck];
    const agentPaths = [
      playerControls[0] === 'agent' ? agentPathForId(payload?.player1?.agentId) : undefined,
      playerControls[1] === 'agent' ? agentPathForId(payload?.player2?.agentId) : undefined,
    ];
    this.bridge.stop();
    this.sessionId = createSessionId();
    this.decisionSeq = 0;
    this.actionTimeline = [];
    this.timelineId = 1;
    this.normalizer = new LiveObservationNormalizer(concealedSeats(playerControls));
    this.lastNewLogs = [];
    this.passAnnounceState = { attackedThisTurn: false };
    this.pendingSequence = [];
    this.replayFrames = [];
    this.rawFrames = [];
    this.humanActions = [];
    this.humanExperiment = null;
    this.replayTakeover = null;
    this.rawObservationBySeat = [null, null];
    this.playerControls = playerControls;
    this.humanExperiment = buildHumanExperiment(payload, playerControls);
    this.replayModeLabel = `${controlLabel(playerControls[0])} vs ${controlLabel(playerControls[1])}`;
    this.replayPlayerLabels = [
      payload?.player1?.name ?? 'Player 1',
      payload?.player2?.name ?? 'Player 2',
    ];
    this.logs = [{
      id: this.logId++,
      message: `Started real CABT match (${this.replayModeLabel}).`,
    }];
    const response = await this.bridge.request({
      command: 'start',
      deck0: player1Deck,
      deck1: player2Deck,
      agentPaths,
      agentControlled: playerControls.map((control) => control === 'agent'),
    }, { allowStart: true });
    this.applyBridgeResponse(response);
    return this.viewResponse();
  }



  private async startTakeover(payload: any): Promise<EngineResponse> {
    const replayPath = safeReplayPath(payload?.replayFile);
    const replayText = fs.readFileSync(replayPath, 'utf8');
    const replay = JSON.parse(replayText);
    const frames = Array.isArray(replay?.rawVisualize) && replay.rawVisualize.length
      ? replay.rawVisualize
      : replay?.visualize;
    if (!Array.isArray(frames)) {
      throw new Error('The saved replay has no CABT observation frames.');
    }
    const stateIndex = Number(payload?.stateIndex);
    if (!Number.isInteger(stateIndex) || stateIndex < 0 || stateIndex >= frames.length) {
      throw new Error(`Invalid takeover state index ${payload?.stateIndex}.`);
    }
    const rootObservation = frames[stateIndex];
    if (!rootObservation?.search_begin_input) {
      throw new Error('This replay state cannot be resumed: search_begin_input is unavailable.');
    }
    if (!rootObservation?.select || Number(rootObservation?.current?.result ?? -1) >= 0) {
      throw new Error('Select a non-terminal replay decision before taking over.');
    }
    if (!Array.isArray(replay?.decks) || replay.decks.length !== 2) {
      throw new Error('This replay does not contain both saved 60-card decks.');
    }
    const decks = [
      resolveDeck(replay.decks[0], 'Saved player 1 deck'),
      resolveDeck(replay.decks[1], 'Saved player 2 deck'),
    ] as [number[], number[]];
    const sourceActor = Number(rootObservation.current.yourIndex);
    const requestedSeat = Number(payload?.humanSeat);
    const humanSeat = requestedSeat === 0 || requestedSeat === 1 ? requestedSeat : sourceActor;
    const opponentSeat = 1 - humanSeat;
    const opponentAgentId = inferredAgentId(replay, opponentSeat, payload?.opponentAgentId);
    const focusAgentId = inferredAgentId(replay, humanSeat, `ptcg-abc:${replay?.experiment?.focusDeckSlug ?? ''}`);
    const agentIds = humanSeat === 0
      ? [focusAgentId, opponentAgentId]
      : [opponentAgentId, focusAgentId];
    const controls: [PlayerControl, PlayerControl] = humanSeat === 0
      ? ['self', 'agent']
      : ['agent', 'self'];
    const sourceReplaySha256 = sha256Text(replayText);
    const seed = Number.parseInt(
      sha256Text(`${sourceReplaySha256}:${stateIndex}:${humanSeat}`).slice(0, 12),
      16,
    );

    this.bridge.stop();
    this.sessionId = createSessionId();
    this.decisionSeq = 0;
    this.actionTimeline = [];
    this.timelineId = 1;
    this.normalizer = new LiveObservationNormalizer(concealedSeats(controls));
    this.lastNewLogs = [];
    this.passAnnounceState = { attackedThisTurn: false };
    this.pendingSequence = [];
    this.replayFrames = [];
    this.rawFrames = [];
    this.rawObservationBySeat = [null, null];
    this.humanActions = [];
    this.playerControls = controls;
    this.decks = decks;
    this.replayModeLabel = 'Replay takeover';
    const names = replay?.environment?.info?.TeamNames;
    this.replayPlayerLabels = Array.isArray(names) && names.length >= 2
      ? [String(names[0]), String(names[1])]
      : ['Player 1', 'Player 2'];
    this.logs = [{
      id: this.logId++,
      message: `Started replay takeover at state ${stateIndex} as Player ${humanSeat + 1}.`,
    }];

    const response = await this.bridge.request({
      command: 'startTakeover',
      deck0: decks[0],
      deck1: decks[1],
      rootObservation,
      humanSeat,
      agentPaths: agentIds.map((id) => agentPathForId(id)),
      seed,
    }, { allowStart: true });
    if (!response.takeover) {
      throw new Error('CABT bridge did not return a takeover world receipt.');
    }
    const worldReceipt = writeTakeoverWorldReceipt({
      sourceReplayFile: path.basename(replayPath),
      sourceReplaySha256,
      sourceStateIndex: stateIndex,
      receipt: response.takeover,
    });
    const originalResult = Number(replay?.rawVisualize?.at?.(-1)?.current?.result
      ?? replay?.visualize?.at?.(-1)?.current?.result);
    this.replayTakeover = {
      schemaVersion: 'ptcg-human-takeover-v1',
      sourceReplayFile: path.basename(replayPath),
      sourceReplayId: typeof replay?.environment?.id === 'string' ? replay.environment.id : null,
      sourceReplaySha256,
      sourceStateIndex: stateIndex,
      sourceTurn: typeof rootObservation?.current?.turn === 'number' ? rootObservation.current.turn : null,
      sourceActor,
      humanSeat,
      opponentSeat,
      opponentAgentId,
      worldMode: response.takeover.worldMode,
      worldSeed: response.takeover.seed,
      worldReceiptPath: worldReceipt.path,
      worldSha256: response.takeover.worldSha256,
      originalResult: Number.isFinite(originalResult) ? originalResult : null,
      startedAt: new Date().toISOString(),
    };
    const sourceExperiment = replay?.experiment;
    this.humanExperiment = sourceExperiment && typeof sourceExperiment === 'object'
      ? {
          ...sourceExperiment,
          collectionBatch: nullableText(process.env.CABT_HUMAN_COLLECTION_BATCH)
            ?? nullableText(sourceExperiment.collectionBatch)
            ?? 'unlabeled',
          startedAt: new Date().toISOString(),
          humanSeat,
          opponentSeat,
          opponentAgentId,
          controls: [...controls],
        }
      : null;
    this.applyBridgeResponse(response);
    return this.viewResponse();
  }

  // The one gameplay command: answer the engine's current select with option
  // indexes. `seq` must match the decision the client saw, so a selection can
  // never land on a select it wasn't made for.
  private async select(payload: any): Promise<EngineResponse> {
    const select = this.observation?.select;
    if (!select) {
      throw new Error('No CABT decision is currently available.');
    }
    if (payload?.seq !== this.decisionSeq) {
      throw new Error('That decision is no longer current.');
    }
    const indexes = payload?.indexes;
    if (!Array.isArray(indexes)
      || !indexes.every((index) => Number.isInteger(index) && index >= 0 && index < select.option.length)) {
      throw new Error('Decision option indexes are required.');
    }
    if (indexes.length < select.minCount || indexes.length > select.maxCount) {
      throw new Error(`Selection must contain ${select.minCount}-${select.maxCount} option(s).`);
    }
    const response = await this.bridge.request({
      command: 'select',
      selection: indexes,
    });
    this.applyBridgeResponse(response);
    return this.viewResponse();
  }

  private applyBridgeResponse(response: BridgeResponse): void {
    if (!response.ok) {
      throw new Error(response.traceback ? `${response.error}\n${response.traceback}` : (response.error ?? 'CABT bridge failed.'));
    }
    if (response.cards && response.attacks) {
      this.dataMaps = {
        cardData: Object.fromEntries(response.cards.map((card) => [card.cardId, enrichCardData(card)])),
        attacks: Object.fromEntries(response.attacks.map((attack) => [attack.attackId, attack])),
      };
    }
    this.pendingSequence = [...this.pendingSequence, ...this.appendSteps(response)];
    if (!response.observation) {
      this.observation = null;
    }
    // Every applied engine step invalidates whatever decision came before it.
    this.decisionSeq += 1;
  }

  private viewResponse(): EngineResponse {
    const sequence = this.pendingSequence;
    this.pendingSequence = [];
    return {
      ok: true,
      view: this.view(),
      sequence: sequence.length ? sequence : undefined,
      sessionId: this.sessionId || undefined,
      takeover: this.replayTakeover
        ? {
            schemaVersion: this.replayTakeover.schemaVersion,
            sourceReplayFile: this.replayTakeover.sourceReplayFile,
            sourceReplayId: this.replayTakeover.sourceReplayId,
            sourceStateIndex: this.replayTakeover.sourceStateIndex,
            humanSeat: this.replayTakeover.humanSeat,
            opponentSeat: this.replayTakeover.opponentSeat,
            opponentAgentId: this.replayTakeover.opponentAgentId,
            worldMode: this.replayTakeover.worldMode,
            worldSha256: this.replayTakeover.worldSha256,
          }
        : undefined,
    };
  }

  private view(): GameView {
    const view = cabtObservationToGameView(this.observation, this.logs, this.dataMaps, this.actionTimeline);
    return {
      ...view,
      decision: this.observation ? projectDecision(this.observation, this.decisionSeq, this.dataMaps) : undefined,
      seats: this.seats(),
    };
  }

  private seats(): SeatView[] {
    return this.playerControls.map((control, index) => ({
      control,
      name: this.replayPlayerLabels[index] ?? `Player ${index + 1}`,
    }));
  }

  // Live playback steps, shaped like replay's: each observation contributes
  // exactly its own canonical events against the board state at that
  // observation (seat-stabilized by the normalizer). Steps carry no prompts —
  // they are history frames; only the final interactive view prompts.
  private appendSteps(response: BridgeResponse): GameView[] {
    const observations = response.autoSteps?.length ? response.autoSteps : response.observation ? [response.observation] : [];
    const actions = response.autoActions ?? [];
    const steps: GameView[] = [];
    let previous = this.observation;
    let previousRaw = this.rawFrames.at(-1) ?? null;
    for (let index = 0; index < observations.length; index += 1) {
      const rawObservation = observations[index];
      const selectedAction = actions[index] ?? null;
      if (selectedAction && previousRaw?.current && previousRaw.select) {
        const seat = previousRaw.current.yourIndex;
        this.humanActions.push({
          step: this.humanActions.length + 1,
          seat,
          source: this.playerControls[seat] === 'agent' ? 'agent' : 'human',
          indexes: [...selectedAction],
          beforeRawFrame: Math.max(0, this.rawFrames.length - 1),
          turn: typeof previousRaw.current.turn === 'number' ? previousRaw.current.turn : null,
          turnActionCount: typeof previousRaw.current.turnActionCount === 'number'
            ? previousRaw.current.turnActionCount
            : null,
          selectContext: previousRaw.select.context,
          minCount: typeof previousRaw.select.minCount === 'number' ? previousRaw.select.minCount : null,
          maxCount: typeof previousRaw.select.maxCount === 'number' ? previousRaw.select.maxCount : null,
          optionCount: previousRaw.select.option?.length ?? 0,
        });
      }
      const { observation, newLogs } = this.normalizer.push(rawObservation);
      const previousObservation = previous;
      // The engine never logs ability usage; synthesize it from the selection
      // that produced this observation (and from a triggered attach), same as
      // replay's logsWithSynthesizedAbility.
      const stepLogs = logsWithSynthesizedAnnounce(previousObservation, actions[index] ?? null, this.lastNewLogs, newLogs, this.dataMaps);
      previous = observation;
      this.lastNewLogs = newLogs;
      this.observation = observation;
      this.replayFrames.push(observation);
      const rawObs = observations[index];
      this.rawFrames.push(rawObs);
      previousRaw = rawObs;
      // Remember each seat's most recent decision (raw, with its hand) for the
      // live both-perspective bar.
      if (rawObs?.select && rawObs.current && (rawObs.current.yourIndex === 0 || rawObs.current.yourIndex === 1)) {
        this.rawObservationBySeat[rawObs.current.yourIndex] = rawObs;
      }
      if (!stepLogs.length) {
        continue;
      }
      // The engine resolves whole effects instantly; the player must watch
      // them happen. Replay's phase machinery splits the batch into typed
      // animation phases, each carrying the view of the world BEFORE that
      // phase resolves (pre-draw hands for both seats, the dying Pokemon
      // still standing for its knock-out, both switchers at their source
      // slots for a retreat). One live step per phase.
      const step = this.buildStep(observation, stepLogs);
      markPassAnnounceEvents(step.actionTimeline ?? [], this.passAnnounceState);
      const previousView = previousObservation
        ? {
            ...cabtObservationToGameView(previousObservation, this.logs, this.dataMaps, []),
            seats: this.seats(),
          }
        : undefined;
      const phases = previousView
        ? stepAnimationPhases(previousView, step, step.actionTimeline ?? [])
        : undefined;
      if (phases?.length) {
        for (const phase of phases) {
          steps.push({ ...phase.view, seats: this.seats() });
        }
      } else {
        steps.push(step);
      }
    }
    return steps;
  }

  // Steps are history frames: projected without a decision, so playback
  // never renders an interactive affordance. They carry seats like the
  // interactive view does — hand concealment reads them.
  private buildStep(observation: CabtObservation, stepLogs: Array<Record<string, unknown>>): GameView {
    const result = cabtLogsToTimeline(stepLogs, { nextId: this.timelineId });
    this.timelineId = result.nextId;
    this.actionTimeline = [...this.actionTimeline, ...result.events].slice(-200);
    for (const event of result.events) {
      this.logs = [...this.logs, { id: this.logId++, message: event.message }];
    }
    return {
      ...cabtObservationToGameView(observation, this.logs, this.dataMaps, result.events),
      seats: this.seats(),
    };
  }

  private assertSession(payload?: any): void {
    if (!this.sessionId) {
      throw new Error('No active CABT session. Start a new game.');
    }
    const payloadSessionId = payload?.sessionId;
    if (typeof payloadSessionId !== 'string' || !payloadSessionId) {
      throw new Error('CABT session id is required. Start a new game.');
    }
    if (payloadSessionId !== this.sessionId) {
      throw new Error('CABT session expired. Start a new game.');
    }
  }

  private invalidateSession(message: string): void {
    this.sessionId = '';
    this.observation = null;
    this.decisionSeq = 0;
    this.actionTimeline = [];
    this.timelineId = 1;
    this.normalizer = new LiveObservationNormalizer();
    this.lastNewLogs = [];
    this.passAnnounceState = { attackedThisTurn: false };
    this.pendingSequence = [];
    this.replayFrames = [];
    this.rawFrames = [];
    this.humanActions = [];
    this.humanExperiment = null;
    this.replayTakeover = null;
    this.rawObservationBySeat = [null, null];
    this.decks = [[], []];
    this.logs = [...this.logs, { id: this.logId++, message }];
  }
}

class CabtBridgeClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingBridgeCall>();
  private stderr = '';
  private generation = 0;

  constructor(private readonly onExit: () => void) {}

  async request(payload: Record<string, unknown>, options: { allowStart?: boolean } = {}): Promise<BridgeResponse> {
    await this.ensureStarted(!!options.allowStart);
    const child = this.child;
    if (!child) {
      throw new Error('CABT session expired. Start a new game.');
    }

    const id = this.nextId++;
    const message = { id, ...payload };
    const response = new Promise<BridgeResponse>((resolve, reject) => {
      // A wedged engine or lost response must surface as an error instead of
      // an HTTP request that hangs forever.
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`CABT bridge did not respond within ${BRIDGE_TIMEOUT_MS}ms.`));
        }
      }, BRIDGE_TIMEOUT_MS);
      timer.unref?.();
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
    child.stdin.write(`${JSON.stringify(message)}\n`);
    return response;
  }

  close(): void {
    const child = this.child;
    if (!child) {
      return;
    }
    this.generation += 1;
    this.child = null;
    this.rejectPending(new Error('CABT bridge was closed.'));
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
    child.kill('SIGKILL');
  }

  stop(): void {
    this.close();
  }

  private async ensureStarted(allowStart: boolean): Promise<void> {
    if (this.child && !this.child.killed) {
      return;
    }
    if (!allowStart) {
      return;
    }

    const { command, args } = bridgeProcessCommand();
    const generation = this.generation;
    this.stderr = '';
    const child = spawn(command, args, {
      cwd: WORKSPACE_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;

    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on('line', (line) => this.handleLine(line));
    child.stderr.on('data', (chunk) => {
      this.stderr += String(chunk);
      if (this.stderr.length > 12000) {
        this.stderr = this.stderr.slice(-12000);
      }
    });
    child.on('exit', (code, signal) => {
      if (this.child !== child || this.generation !== generation) {
        return;
      }
      const error = new Error(`CABT bridge exited (${code ?? signal}).${this.stderr ? `\n${this.stderr}` : ''}`);
      this.rejectPending(error);
      this.child = null;
      this.onExit();
    });
  }

  private handleLine(line: string): void {
    let response: BridgeResponse;
    try {
      response = JSON.parse(line) as BridgeResponse;
    } catch {
      // Agents that print to stdout would otherwise corrupt the protocol.
      process.stderr.write(`[cabt-bridge] ignoring non-JSON output: ${line.slice(0, 200)}\n`);
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    this.pending.delete(response.id);
    pending.resolve(response);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function bridgeProcessCommand(): { command: string; args: string[] } {
  if (useNativeBridge()) {
    return { command: process.env.PYTHON ?? 'python3', args: [BRIDGE_PATH] };
  }
  const dockerBridgePath = `/workspace/${toPosixPath(path.relative(WORKSPACE_ROOT, BRIDGE_PATH))}`;
  const sampleSubmissionDir = process.env.CABT_SAMPLE_SUBMISSION_DIR
    ? path.resolve(process.env.CABT_SAMPLE_SUBMISSION_DIR)
    : '';
  const sampleSubmissionArgs = sampleSubmissionDir
    ? [
        '-v',
        `${sampleSubmissionDir}:/cabt-sample-submission:ro`,
        '-e',
        'CABT_SAMPLE_SUBMISSION_DIR=/cabt-sample-submission',
      ]
    : [];
  return {
    command: 'docker',
    args: [
      'run',
      '--rm',
      '-i',
      '--platform',
      'linux/amd64',
      '-v',
      `${WORKSPACE_ROOT}:/workspace`,
      ...sampleSubmissionArgs,
      '-w',
      '/workspace',
      process.env.CABT_DOCKER_IMAGE ?? 'python:3.11-slim',
      'python',
      dockerBridgePath,
    ],
  };
}

// Native (local Python) vs Docker selection. Native on Linux, when explicitly
// asked (CABT_ENGINE_MODE=native), or on macOS when a native libcg.dylib is
// present in the sample submission — the compiled arm64 engine runs far faster
// than the Linux library through Docker. Docker stays the macOS fallback when
// no dylib is present; CABT_ENGINE_MODE=docker forces it even when one is.
function useNativeBridge(): boolean {
  if (process.env.CABT_ENGINE_MODE === 'docker') {
    return false;
  }
  if (process.env.CABT_ENGINE_MODE === 'native' || process.platform === 'linux') {
    return true;
  }
  return process.platform === 'darwin' && hasNativeMacLibrary();
}

function hasNativeMacLibrary(): boolean {
  const sampleSubmissionDir = process.env.CABT_SAMPLE_SUBMISSION_DIR
    ? path.resolve(process.env.CABT_SAMPLE_SUBMISSION_DIR)
    : path.join(FRONTEND_ROOT, 'sample_submission');
  return fs.existsSync(path.join(sampleSubmissionDir, 'cg', 'libcg.dylib'));
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

// The opponent's hand as of THEIR most recent decision at or before `beforeState`
// -- the last frame the replay recorded that seat's own (exact) hand. This is the
// ground truth the near-omniscient world pins; the Python side carries it forward
// and samples only the cards drawn since. null when the seat never revealed a hand
// (the world builder then samples the whole hand from the exact deck).
function lastKnownHand(
  frames: Array<{ current: CabtObservation['current']; stateIndex: number }>,
  beforeState: number,
  seat: number,
): number[] | null {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (frame.stateIndex > beforeState) {
      continue;
    }
    const current = frame.current;
    if (!current || current.yourIndex !== seat) {
      continue;
    }
    const hand = current.players?.[seat]?.hand;
    if (Array.isArray(hand)) {
      return hand.map((card) => card?.id).filter((id): id is number => typeof id === 'number');
    }
  }
  return null;
}

function createSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePlayerControls(payload: any): [PlayerControl, PlayerControl] {
  const player1Control = payload?.player1?.control === 'agent' ? 'agent' : 'self';
  if (payload?.player2?.control === 'self' || payload?.manualOpponent || payload?.player2?.manualOpponent) {
    return [player1Control, 'self'];
  }
  return [player1Control, 'agent'];
}

// Agent seats' hidden information (their draws) is downgraded to the
// opponent-facing encoding when a human is playing; a pure agent-vs-agent
// game keeps the omniscient spectator view.
function concealedSeats(playerControls: [PlayerControl, PlayerControl]): Set<number> {
  if (!playerControls.includes('self')) {
    return new Set();
  }
  return new Set(playerControls.flatMap((control, seat) => (control === 'agent' ? [seat] : [])));
}

function controlLabel(control: PlayerControl): string {
  return control === 'agent' ? 'Agent' : 'Self';
}

function compactIsoTimestamp(date: Date): string {
  return date.toISOString().replace(/\D/g, '').slice(0, 14);
}

function writeGameLogManifest(entry: {
  id: string;
  name: string;
  file: string;
  createdAt: string;
  players: string[];
  description: string;
}): void {
  const manifest = readGameLogManifest();
  const logs = Array.isArray(manifest.logs) ? manifest.logs.filter((item: any) => item?.id !== entry.id) : [];
  manifest.logs = [entry, ...logs];
  fs.writeFileSync(GAME_LOGS_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

function readGameLogManifest(): { logs: unknown[] } {
  if (!fs.existsSync(GAME_LOGS_MANIFEST)) {
    return { logs: [] };
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(GAME_LOGS_MANIFEST, 'utf8'));
    return manifest && typeof manifest === 'object' && Array.isArray(manifest.logs) ? manifest : { logs: [] };
  } catch {
    return { logs: [] };
  }
}

function resolveDeck(cards: unknown[], label: string): number[] {
  const ids = cards.map((card, index) => resolveCardId(card, `${label} card ${index + 1}`));
  if (ids.length !== 60) {
    throw new Error(`${label} must contain exactly 60 cards, found ${ids.length}.`);
  }
  return ids;
}

function resolveCardId(card: unknown, label: string): number {
  if (typeof card === 'number' && Number.isInteger(card)) {
    return card;
  }
  if (typeof card !== 'string') {
    throw new Error(`${label}: expected card name or id.`);
  }
  if (/^\d+$/.test(card.trim())) {
    return Number(card.trim());
  }

  const tokens = card.trim().split(/\s+/);
  const set = tokens.at(-1);
  const name = normalizeCardName(tokens.slice(0, -1).join(' '));
  const candidates = uniqueCardRows().filter((row) => row.set === set && normalizeCardName(row.name) === name);
  if (candidates.length === 1) {
    return candidates[0].id;
  }
  if (candidates.length > 1) {
    throw new Error(`${label}: ${card} matches multiple CABT card IDs.`);
  }
  throw new Error(`${label}: could not resolve "${card}" to a CABT card ID.`);
}

function enrichCardData(card: CabtCardData): CabtCardData {
  const row = CARD_ROWS_BY_ID.get(card.cardId);
  if (!row) {
    return card;
  }
  return {
    ...card,
    set: row.set,
    setNumber: row.setNumber,
  };
}

function uniqueCardRows() {
  return [...CARD_ROWS_BY_ID.values()];
}

function normalizeCardName(name: string): string {
  const withoutAccents = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normalized = withoutAccents.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const energy = /^([a-z]+) energy$/.exec(normalized);
  if (!energy) {
    return normalized;
  }
  const energySymbols: Record<string, string> = {
    grass: 'g',
    fire: 'r',
    water: 'w',
    lightning: 'l',
    psychic: 'p',
    fighting: 'f',
    darkness: 'd',
    metal: 'm',
  };
  return energySymbols[energy[1]] ? `basic {${energySymbols[energy[1]]}} energy` : normalized;
}

function agentPathForId(agentId: string | undefined): string | undefined {
  if (!agentId) {
    return undefined;
  }
  const manifestPath = path.join(FRONTEND_ROOT, 'public', 'agents', 'agents.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as AgentManifest;
    const bundled = manifest.agents?.find((agent) => agent.id === agentId)?.path;
    if (bundled) {
      return bundled;
    }
  }
  return workspaceAgentPath(agentId);
}
