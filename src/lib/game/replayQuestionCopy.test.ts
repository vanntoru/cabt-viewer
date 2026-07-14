import { describe, expect, it } from 'vitest';
import { buildReplayQuestionPrompt } from './replayQuestionCopy';
import type { GameView } from './types';
import type { ReplaySnapshot, ReplayStep } from './replay';
import { SlotType, targetFor } from './types';

describe('buildReplayQuestionPrompt', () => {
  it('copies replay position, current turn evidence, board zones, logs, and card links', () => {
    const step: ReplayStep = {
      index: 3,
      label: 'プレイヤー1: ワザ',
      stateIndex: 3,
      actionIndex: 2,
      turn: 2,
      phase: 2,
      activePlayerIndex: 0,
      type: 'Card',
      payload: { selected: [0] },
    };
    const previousTurnView = {
      ready: true,
      phase: 2,
      phaseLabel: '対戦リプレイ',
      turn: 1,
      activePlayerIndex: 1,
      players: [],
      prompts: [],
      logs: [{ id: 7, message: 'Player B ended their turn.' }],
      events: [],
    } satisfies GameView;
    const view: GameView = {
      ready: true,
      phase: 2,
      phaseLabel: '対戦リプレイ',
      turn: 2,
      activePlayerIndex: 0,
      players: [{
        index: 0,
        id: 0,
        name: 'Player A',
        hand: [{ id: 1086, name: 'Buddy-Buddy Poffin', fullName: 'Buddy-Buddy Poffin' }],
        deck: [{ id: 3, name: 'Basic Water Energy', fullName: 'Basic Water Energy' }],
        deckCount: 1,
        discard: [{ id: 1123, name: 'Switch', fullName: 'Switch' }],
        lostZone: [],
        stadium: [],
        playZone: [],
        prize: [],
        prizesLeft: 0,
        active: {
          ownerIndex: 0,
          slot: 'active',
          index: 0,
          target: targetFor(0, 0, SlotType.ACTIVE),
          empty: false,
          pokemon: { id: 1031, name: 'Mega Starmie ex', fullName: 'Mega Starmie ex' },
          cards: [{ id: 1031, name: 'Mega Starmie ex', fullName: 'Mega Starmie ex' }],
          damage: 40,
          hp: 330,
          retreat: [],
          energy: [{ id: 3, name: 'Basic Water Energy', fullName: 'Basic Water Energy' }],
          tools: [],
          specialConditions: [],
        },
        bench: [],
        playableCardIds: [1086],
      }],
      prompts: [],
      logs: [
        { id: 7, message: 'Player B ended their turn.' },
        { id: 8, message: 'Player A used an attack.' },
        { id: 9, message: 'Player B took damage.' },
      ],
      events: [],
    };
    const replay: ReplaySnapshot = {
      id: 'episode-1',
      name: 'sample replay',
      created: 1,
      players: [{ userId: 0, name: 'Player A' }],
      winner: -1,
      candidateSlug: 'codex-dragapult-v1',
      workbenchFocusDeck: 'codex-dragapult-v1',
      deckReference: {
        focusDeck: 'codex-dragapult-v1',
        deckSourcePath: '/Users/vanntoru/dev/kaggle/ptcg-abc/src/codex-dragapult-v1',
        deckCsvPath: '/Users/vanntoru/dev/kaggle/ptcg-abc/src/codex-dragapult-v1/deck.csv',
        replayCollectionId: 'collection-1',
        sourceZipName: 'dragapult-replays.zip',
      },
      stateCount: 4,
      actionCount: 3,
      turnCount: 2,
      cardNames: [],
      views: [view],
      steps: [
        { ...step, index: 0, label: 'プレイヤー2: 番終了', stateIndex: 0, actionIndex: null, turn: 1, activePlayerIndex: 1 },
        { ...step, index: 1, label: 'プレイヤー1: ドロー', stateIndex: 1, actionIndex: 0, payload: { action: 'draw' } },
        { ...step, index: 2, label: 'プレイヤー1: グッズ', stateIndex: 2, actionIndex: 1, payload: { action: 'play', card: 1086 } },
        step,
      ],
    };
    replay.views = [previousTurnView, view, view, view];

    const prompt = buildReplayQuestionPrompt({ replay, step, view, sourceId: 'sample.json' });

    expect(prompt).toContain('このCABTリプレイの現在ターンについて質問します。');
    expect(prompt).toContain('回答前に必ず保存済みリプレイJSONを開き');
    expect(prompt).toContain('replay_file: sample.json');
    expect(prompt).toContain('replay_json_path: tools/cabt_viewer/public/game-logs/sample.json');
    expect(prompt).toContain('candidate_slug: codex-dragapult-v1');
    expect(prompt).toContain('workbench_focus_deck: codex-dragapult-v1');
    expect(prompt).toContain('機械可読コンテキスト:');
    expect(prompt).toContain('"codex_replay_context_v2"');
    expect(prompt).toContain('"replay_json_path": "tools/cabt_viewer/public/game-logs/sample.json"');
    expect(prompt).toContain('"state_index": 3');
    expect(prompt).toContain('"step_index_range": [');
    expect(prompt).toContain('自ターン確認範囲:');
    expect(prompt).toContain('- player_index: 0');
    expect(prompt).toContain('- turn: 2');
    expect(prompt).toContain('- step_index_range: 1..3');
    expect(prompt).toContain('- log_index_range: 8..9');
    expect(prompt).toContain('デッキ参照:');
    expect(prompt).toContain('- 対象デッキ: codex-dragapult-v1');
    expect(prompt).toContain('- deck.csv: /Users/vanntoru/dev/kaggle/ptcg-abc/src/codex-dragapult-v1/deck.csv');
    expect(prompt).toContain('- リプレイコレクションID: collection-1');
    expect(prompt).toContain('- インポートZIP名: dragapult-replays.zip');
    expect(prompt).toContain('step_index: 3 / 3');
    expect(prompt).toContain('log_index: 9');
    expect(prompt).toContain('[Mega Starmie ex](http://127.0.0.1:8766/index.html#id=1031) (#1031)');
    expect(prompt).toContain('hand (1): [Buddy-Buddy Poffin](http://127.0.0.1:8766/index.html#id=1086) (#1086)');
    expect(prompt).not.toContain('- [7] Player B ended their turn.');
    expect(prompt).toContain('- [8] Player A used an attack.');
    expect(prompt).toContain('- [9] Player B took damage.');
    expect(prompt).toContain('このターンの選択/アクション payload:');
    expect(prompt).toContain('## step 1: プレイヤー1: ドロー');
    expect(prompt).toContain('"action": "draw"');
    expect(prompt).toContain('## step 2: プレイヤー1: グッズ');
    expect(prompt).toContain('"card": 1086');
    expect(prompt).toContain('"selected": [');
  });
});
