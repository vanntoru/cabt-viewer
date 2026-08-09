import { describe, expect, it } from 'vitest';

import { adjacentPlayerTurnStepIndex, playerStepIndexFrom, type ReplayStep } from './replay';

function step(index: number, activePlayerIndex: number): ReplayStep {
  return {
    index,
    label: `step ${index}`,
    stateIndex: index,
    actionIndex: index,
    turn: Math.floor(index / 2),
    phase: 0,
    activePlayerIndex,
    type: 'test',
    payload: null,
  };
}

describe('adjacentPlayerTurnStepIndex', () => {
  const steps = [
    step(0, 0),
    step(1, 0),
    step(2, 1),
    step(3, 1),
    step(4, 0),
    step(5, 0),
    step(6, 1),
  ];

  it('skips an opponent segment to the first step of the next tracked-player turn', () => {
    expect(adjacentPlayerTurnStepIndex(steps, 2, 0, 1)).toBe(4);
  });

  it('moves from the tracked player current turn to their following turn', () => {
    expect(adjacentPlayerTurnStepIndex(steps, 1, 0, 1)).toBe(4);
  });

  it('moves backward to the first step of the previous tracked-player turn', () => {
    expect(adjacentPlayerTurnStepIndex(steps, 6, 0, -1)).toBe(4);
    expect(adjacentPlayerTurnStepIndex(steps, 4, 0, -1)).toBe(0);
  });

  it('stays put when there is no adjacent tracked-player turn', () => {
    expect(adjacentPlayerTurnStepIndex(steps, 0, 0, -1)).toBe(0);
    expect(adjacentPlayerTurnStepIndex(steps, 5, 0, 1)).toBe(5);
  });
});

describe('playerStepIndexFrom', () => {
  const steps = [step(0, 0), step(1, 0), step(2, 1), step(3, 1), step(4, 0)];

  it('finds the next visible own step across an opponent turn', () => {
    expect(playerStepIndexFrom(steps, 2, 0, 1)).toBe(4);
  });

  it('finds the previous visible own step across an opponent turn', () => {
    expect(playerStepIndexFrom(steps, 3, 0, -1)).toBe(1);
  });

  it('returns null when no tracked-player step exists in that direction', () => {
    expect(playerStepIndexFrom(steps, 4, 1, 1)).toBeNull();
  });
});
