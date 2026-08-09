import { describe, expect, it } from 'vitest';
import { buildReplayForkPoint } from './replayForkPoint';

describe('buildReplayForkPoint', () => {
  const input = {
    replayId: 'cabt-local-replay',
    replayName: 'CABT replay',
    stepIndex: 6,
    stateIndex: 3,
    actionIndex: 5,
    actionType: 'MoveCard',
    turn: 0,
  };

  it('includes the replay file, playlist, and an exact-position URL', () => {
    const point = buildReplayForkPoint(
      input,
      'http://example.test/?view=replay&replay=match-001.json&playlist=batch-01',
    );

    expect(point).toMatchObject({
      replayFile: 'match-001.json',
      playlist: 'batch-01',
    });
    expect(point.url).toBe(
      'http://example.test/?view=replay&replay=match-001.json&playlist=batch-01&step=6&state=3',
    );
  });

  it('preserves a remote replay URL as the source identity', () => {
    const point = buildReplayForkPoint(
      input,
      'http://example.test/?view=replay&replayUrl=https%3A%2F%2Ffiles.example%2Fmatch.json',
    );

    expect(point.replayUrl).toBe('https://files.example/match.json');
    expect(point).not.toHaveProperty('replayFile');
  });
});
