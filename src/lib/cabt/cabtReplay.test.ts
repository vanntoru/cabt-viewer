import { describe, expect, it } from 'vitest';
import { cabtReplayToSnapshot } from './cabtReplay';

describe('cabtReplayToSnapshot', () => {
  it('preserves Workbench deck reference metadata for question copy', () => {
    const snapshot = cabtReplayToSnapshot({
      candidate_slug: 'codex-dragapult-v1',
      workbench_focus_deck: 'ドラパルトex',
      workbench_deck_reference: {
        focus_deck: 'ドラパルトex',
        deck_source_path: '/repo/src/codex-dragapult-v1',
        deck_csv_path: '/repo/src/codex-dragapult-v1/deck.csv',
        replay_collection_id: 'collection-1',
        source_zip_name: 'dragapult-replays.zip',
      },
      visualize: [{
        current: {
          turn: 1,
          yourIndex: 0,
          result: -1,
          players: [{
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }, {
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }],
        },
      }],
    });

    expect(snapshot.candidateSlug).toBe('codex-dragapult-v1');
    expect(snapshot.workbenchFocusDeck).toBe('ドラパルトex');
    expect(snapshot.deckReference).toEqual({
      focusDeck: 'ドラパルトex',
      deckSourcePath: '/repo/src/codex-dragapult-v1',
      deckCsvPath: '/repo/src/codex-dragapult-v1/deck.csv',
      replayCollectionId: 'collection-1',
      sourceZipName: 'dragapult-replays.zip',
      deckId: undefined,
      sourceZipPath: undefined,
      deckCsvMember: undefined,
      deckJsonMember: undefined,
      deckHash: undefined,
      zipSha256: undefined,
      candidateSource: undefined,
    });
  });

  it('renders physical attached energy cards instead of provided energy units', () => {
    const snapshot = cabtReplayToSnapshot({
      visualize: [{
        current: {
          turn: 1,
          yourIndex: 0,
          result: -1,
          players: [{
            active: [{
              id: 710,
              serial: 10,
              hp: 180,
              maxHp: 180,
              energies: [1, 1],
              energyCards: [{ id: 1, serial: 20, playerIndex: 0, name: 'Basic {G} Energy' }],
            }],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }, {
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }],
        },
      }],
    });

    expect(snapshot.views[0].players[0].active.energy).toHaveLength(1);
    expect(snapshot.views[0].players[0].active.energy[0].name).toBe('基本【草】エネルギー');
  });

  it('does not render provided energy units as attached cards', () => {
    const snapshot = cabtReplayToSnapshot({
      visualize: [{
        current: {
          turn: 1,
          yourIndex: 0,
          result: -1,
          players: [{
            active: [{
              id: 710,
              serial: 10,
              hp: 180,
              maxHp: 180,
              energies: [1, 1],
            }],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }, {
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }],
        },
      }],
    });

    expect(snapshot.views[0].players[0].active.energy).toHaveLength(0);
  });

  it('keeps inspectable deck and prize cards on the replay player view', () => {
    const snapshot = cabtReplayToSnapshot({
      visualize: [{
        current: {
          turn: 1,
          yourIndex: 0,
          result: -1,
          players: [{
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deck: [{ id: 96, serial: 1, playerIndex: 0 }],
            deckCount: 1,
            prize: [{ id: 1261, serial: 2, playerIndex: 0 }],
          }, {
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deck: [],
            deckCount: 0,
            prize: [],
          }],
        },
      }],
    });

    expect(snapshot.views[0].players[0].deck?.map((card) => card.id)).toEqual([96]);
    expect(snapshot.views[0].players[0].prize?.map((card) => card.id)).toEqual([1261]);
    expect(snapshot.views[0].players[0].deckCount).toBe(1);
    expect(snapshot.views[0].players[0].prizesLeft).toBe(1);
  });

  it('labels multi-log frames with the latest event without interpreting the move', () => {
    const snapshot = cabtReplayToSnapshot({
      visualize: [{
        logs: [
          { type: 'MoveCard', playerIndex: 0, cardId: 96, fromArea: 6, toArea: 2 },
          { type: 'MoveCard', playerIndex: 0, cardId: 1261, fromArea: 6, toArea: 2 },
        ],
        current: {
          turn: 8,
          yourIndex: 0,
          result: -1,
          players: [{
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }, {
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }],
        },
      }],
    });

    expect(snapshot.steps[0].label).toBe('プレイヤー1: カード移動 / 活力の森 / サイド → 手札');
  });

  it('keeps the attack name visible when follow-up damage and card moves happen in the same frame', () => {
    const snapshot = cabtReplayToSnapshot({
      visualize: [{
        logs: [
          { type: 'Attack', playerIndex: 0, cardId: 96, serial: 3, attackId: 120 },
          { type: 'HpChange', playerIndex: 1, cardId: 150, serial: 72, value: -270, putDamageCounter: false },
          { type: 'MoveCard', playerIndex: 1, cardId: 1, serial: 111, fromArea: 8, toArea: 3 },
        ],
        current: {
          turn: 7,
          yourIndex: 0,
          result: -1,
          players: [{
            active: [{ id: 96, serial: 3, hp: 210, maxHp: 210 }],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }, {
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }],
        },
      }],
    });

    expect(snapshot.steps[0].label).toBe('プレイヤー1: ワザ / オーガポン みどりのめんex / まんようしぐれ / 270ダメージ');
  });

  it('labels effect source frames before showing the follow-up cost or movement', () => {
    const snapshot = cabtReplayToSnapshot({
      visualize: [{
        select: {
          context: 'Discard',
          effect: { id: 675, playerIndex: 0, serial: 8 },
          type: 'Card',
        },
        current: {
          turn: 7,
          yourIndex: 0,
          result: -1,
          players: [{
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }, {
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }],
        },
      }],
    });

    expect(snapshot.steps[0].label).toBe('プレイヤー1: 効果 / ルナトーン / トラッシュ');
  });

  it('shows the played supporter before summarizing multiple draws', () => {
    const snapshot = cabtReplayToSnapshot({
      visualize: [{
        logs: [
          { type: 'Play', playerIndex: 0, cardId: 1192, serial: 43 },
          { type: 'MoveCard', playerIndex: 0, cardId: 6, serial: 56, fromArea: 2, toArea: 3 },
          { type: 'Draw', playerIndex: 0, cardId: 1252, serial: 49 },
          { type: 'Draw', playerIndex: 0, cardId: 6, serial: 53 },
          { type: 'Draw', playerIndex: 0, cardId: 1227, serial: 47 },
        ],
        current: {
          turn: 1,
          yourIndex: 0,
          result: -1,
          players: [{
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }, {
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }],
        },
      }],
    });

    expect(snapshot.steps[0].label).toBe('プレイヤー1: カードを出す / ゼイユ / 3枚ドロー');
  });

  it('summarizes multiple draws even when no played card is in the same frame', () => {
    const snapshot = cabtReplayToSnapshot({
      visualize: [{
        logs: [
          { type: 'MoveCard', playerIndex: 0, cardId: 6, serial: 62, fromArea: 2, toArea: 3 },
          { type: 'Draw', playerIndex: 0, cardId: 1252, serial: 48 },
          { type: 'Draw', playerIndex: 0, cardId: 675, serial: 7 },
          { type: 'Draw', playerIndex: 0, cardId: 1102, serial: 20 },
        ],
        current: {
          turn: 7,
          yourIndex: 0,
          result: -1,
          players: [{
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }, {
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }],
        },
      }],
    });

    expect(snapshot.steps[0].label).toBe('プレイヤー1: 3枚ドロー');
  });

  it('shows the card moved to hand by the previous effect selection', () => {
    const players = [{
      active: [],
      bench: [],
      benchMax: 5,
      handCount: 0,
      deckCount: 0,
      prize: [],
    }, {
      active: [],
      bench: [],
      benchMax: 5,
      handCount: 0,
      deckCount: 0,
      prize: [],
    }];
    const snapshot = cabtReplayToSnapshot({
      visualize: [{
        select: {
          context: 'ToHand',
          effect: { id: 1102, playerIndex: 0, serial: 20 },
          type: 'Card',
        },
        logs: [
          { type: 'Play', playerIndex: 0, cardId: 1102, serial: 20 },
          { type: 'MoveCard', playerIndex: 0, cardId: 677, serial: 13, fromArea: 1, toArea: 12 },
        ],
        current: {
          turn: 7,
          yourIndex: 0,
          result: -1,
          players,
        },
      }, {
        logs: [
          { type: 'MoveCard', playerIndex: 0, cardId: 677, serial: 13, fromArea: 12, toArea: 2 },
          { type: 'Shuffle', playerIndex: 0 },
        ],
        current: {
          turn: 7,
          yourIndex: 0,
          result: -1,
          players,
        },
      }],
    });

    expect(snapshot.steps[1].label).toBe('プレイヤー1: 効果 / ダークボール / 手札へ / リオル');
  });

  it('shows looked and bottomed cards for Drakloak scouting selections', () => {
    const players = [{
      active: [],
      bench: [],
      benchMax: 5,
      handCount: 0,
      deckCount: 0,
      prize: [],
    }, {
      active: [],
      bench: [],
      benchMax: 5,
      handCount: 0,
      deckCount: 0,
      prize: [],
    }];
    const snapshot = cabtReplayToSnapshot({
      visualize: [{
        select: {
          context: 'ToHand',
          effect: { id: 120, playerIndex: 1, serial: 80 },
          type: 'Card',
          option: [
            { area: 12, index: 0, playerIndex: 1, type: 'Card' },
            { area: 12, index: 1, playerIndex: 1, type: 'Card' },
          ],
        },
        logs: [
          { type: 'MoveCard', playerIndex: 1, cardId: 235, serial: 92, fromArea: 1, toArea: 12 },
          { type: 'MoveCard', playerIndex: 1, cardId: 2, serial: 64, fromArea: 1, toArea: 12 },
        ],
        current: {
          turn: 3,
          yourIndex: 1,
          result: -1,
          looking: [
            { id: 235, playerIndex: 1, serial: 92 },
            { id: 2, playerIndex: 1, serial: 64 },
          ],
          players,
        },
      }, {
        logs: [
          { type: 'MoveCard', playerIndex: 1, cardId: 2, serial: 64, fromArea: 12, toArea: 2 },
          { type: 'MoveCard', playerIndex: 1, cardId: 235, serial: 92, fromArea: 12, toArea: 14 },
        ],
        current: {
          turn: 3,
          yourIndex: 1,
          result: -1,
          players,
        },
      }],
    });

    expect(snapshot.steps[1].label).toBe(
      'プレイヤー2: 効果 / ドロンチ / 見たカード / スボミー、基本【炎】エネルギー / 手札へ / 基本【炎】エネルギー / 山札の下へ / スボミー',
    );
    expect(snapshot.views[1].logs.at(-1)?.message).toBe('プレイヤー2: カード移動 / スボミー / 選択 → 山札の下');
  });

  it('shows when a played search card did not move a selected card to hand', () => {
    const snapshot = cabtReplayToSnapshot({
      visualize: [{
        logs: [
          { type: 'Play', playerIndex: 0, cardId: 1102, serial: 22 },
          { type: 'MoveCard', playerIndex: 0, cardId: 1252, serial: 49, fromArea: 1, toArea: 12 },
          { type: 'MoveCard', playerIndex: 0, cardId: 1252, serial: 49, fromArea: 12, toArea: 1 },
          { type: 'Shuffle', playerIndex: 0 },
        ],
        current: {
          turn: 4,
          yourIndex: 0,
          result: -1,
          players: [{
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }, {
            active: [],
            bench: [],
            benchMax: 5,
            handCount: 0,
            deckCount: 0,
            prize: [],
          }],
        },
      }],
    });

    expect(snapshot.steps[0].label).toBe('プレイヤー1: カードを出す / ダークボール / 手札へ / なし');
  });
});
