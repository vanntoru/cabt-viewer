import type { GameView } from './types';

export type ReplayPlayerInfo = {
  userId: number;
  name: string;
};

export type ReplayDeckReference = {
  focusDeck?: string;
  deckId?: string;
  deckSourcePath?: string;
  deckCsvPath?: string;
  replayCollectionId?: string;
  sourceZipName?: string;
  sourceZipPath?: string;
  deckCsvMember?: string;
  deckJsonMember?: string;
  deckHash?: string;
  zipSha256?: string;
  candidateSource?: string;
};

export type ReplayStep = {
  index: number;
  label: string;
  stateIndex: number;
  actionIndex: number | null;
  sequence?: number;
  turn: number;
  phase: number;
  activePlayerIndex: number;
  liveHistoryLength?: number;
  type: string;
  payload: unknown;
};

export type ReplaySnapshot = {
  id: string;
  name: string;
  created: number;
  players: ReplayPlayerInfo[];
  winner: number;
  preferredPlayerIndex?: number;
  candidateSlug?: string;
  workbenchFocusDeck?: string;
  deckReference?: ReplayDeckReference;
  stateCount: number;
  actionCount: number;
  turnCount: number;
  cardNames: string[];
  views: GameView[];
  steps: ReplayStep[];
};

export type ReplayLoadResponse = {
  ok: boolean;
  replay?: ReplaySnapshot;
  error?: string;
};
