import type { GameView } from './types';
import type { ActionTimelineEvent } from './types';

export type ReplayPlayerInfo = {
  userId: number;
  name: string;
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
  type: string;
  payload: unknown;
  actionTimeline?: ActionTimelineEvent[];
  displayView?: GameView;
  animationPhases?: ReplayAnimationPhase[];
  phantomDiveProbability?: ReplayPhantomDiveProbability;
};

export type ReplayPhantomDiveProbability = {
  playerIndex: number;
  ownTurn: number;
  status: string;
  method: string;
  probability: number | null;
  confidenceInterval95: [number, number] | null;
  evaluationTrials: number;
};

export type ReplayAnimationPhase = {
  key: string;
  label?: string;
  view: GameView;
  actionTimeline: ActionTimelineEvent[];
  durationMs: number;
};

export const replayAnimationPhaseGapMs = 120;

export function replayStepPlaybackDelayMs(step: ReplayStep | null | undefined, fallbackDelayMs: number): number {
  const phases = step?.animationPhases;
  if (!phases?.length) {
    return fallbackDelayMs;
  }
  const phaseDurationMs = phases.reduce((totalMs, phase) => totalMs + phase.durationMs + replayAnimationPhaseGapMs, 0);
  return Math.max(fallbackDelayMs, phaseDurationMs);
}

export type ReplaySnapshot = {
  id: string;
  name: string;
  created: number;
  players: ReplayPlayerInfo[];
  winner: number;
  stateCount: number;
  actionCount: number;
  turnCount: number;
  preferredPlayerIndex?: 0 | 1;
  cardNames: string[];
  views: GameView[];
  steps: ReplayStep[];
};

export function adjacentPlayerTurnStepIndex(
  steps: ReplayStep[],
  currentStepIndex: number,
  playerIndex: number,
  direction: -1 | 1,
): number {
  if (!steps.length || currentStepIndex < 0 || currentStepIndex >= steps.length) {
    return currentStepIndex;
  }

  let index = currentStepIndex;
  if (steps[index].activePlayerIndex === playerIndex) {
    while (
      index + direction >= 0
      && index + direction < steps.length
      && steps[index + direction].activePlayerIndex === playerIndex
    ) {
      index += direction;
    }
  }

  for (index += direction; index >= 0 && index < steps.length; index += direction) {
    if (steps[index].activePlayerIndex !== playerIndex) {
      continue;
    }
    if (direction === 1) {
      return index;
    }
    while (index > 0 && steps[index - 1].activePlayerIndex === playerIndex) {
      index -= 1;
    }
    return index;
  }
  return currentStepIndex;
}

export function playerStepIndexFrom(
  steps: ReplayStep[],
  requestedStepIndex: number,
  playerIndex: number,
  direction: -1 | 1,
): number | null {
  if (!steps.length) {
    return null;
  }
  const start = Math.min(steps.length - 1, Math.max(0, Math.round(requestedStepIndex)));
  for (let index = start; index >= 0 && index < steps.length; index += direction) {
    if (steps[index].activePlayerIndex === playerIndex) {
      return index;
    }
  }
  return null;
}
