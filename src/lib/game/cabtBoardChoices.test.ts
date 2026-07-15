import { describe, expect, it } from 'vitest';
import { getCabtBoardChoices } from './cabtBoardChoices';
import {
  SlotType,
  targetFor,
  type CardView,
  type GameView,
  type PlayerView,
  type PokemonSlotView,
  type PromptView,
} from './types';

const card = (name: string): CardView => ({ name, fullName: name });

describe('CABT board choices', () => {
  it('describes the energy owner, battle position, Pokemon, and destination', () => {
    const choices = getCabtBoardChoices(gameView(), promptView());

    expect(choices).toEqual([
      {
        index: 4,
        source: {
          target: targetFor(0, 0, SlotType.ACTIVE, 0),
          ownerLabel: '自分',
          positionLabel: 'バトル場',
          pokemonName: 'Source',
          energies: [card('Energy A'), card('Energy B')],
        },
        destination: {
          target: targetFor(0, 0, SlotType.BENCH, 1),
          ownerLabel: '自分',
          positionLabel: 'ベンチ2',
          pokemonName: 'Destination',
          energies: [],
        },
        selectedEnergy: card('Energy B'),
      },
    ]);
  });
});

function promptView(): PromptView {
  return {
    id: 22,
    className: 'CabtBoardChoicePrompt',
    type: 'cabt-board-choice',
    playerId: 0,
    playerIndex: 0,
    supported: true,
    resultSchema: 'optionIndexes',
    fields: {
      boardChoices: [{
        index: 4,
        sourceTarget: targetFor(0, 0, SlotType.ACTIVE, 0),
        destinationTarget: targetFor(0, 0, SlotType.BENCH, 1),
        energyIndex: 1,
      }],
      selectionKind: 'move-energy',
      options: { min: 1, max: 1 },
    },
  };
}

function gameView(): GameView {
  return {
    ready: true,
    phase: 2,
    phaseLabel: 'Player turn',
    turn: 1,
    activePlayerIndex: 0,
    players: [
      player(
        0,
        slot(0, 'active', 0, 'Source', [card('Energy A'), card('Energy B')]),
        [
          slot(0, 'bench', 0, 'First bench', []),
          slot(0, 'bench', 1, 'Destination', []),
        ],
      ),
      player(1, slot(1, 'active', 0, 'Opponent', []), []),
    ],
    prompts: [],
    logs: [],
    events: [],
  };
}

function player(index: number, active: PokemonSlotView, bench: PokemonSlotView[]): PlayerView {
  return {
    index,
    id: index,
    name: `Player ${index + 1}`,
    hand: [],
    deckCount: 0,
    discard: [],
    lostZone: [],
    stadium: [],
    playZone: [],
    prizesLeft: 6,
    active,
    bench,
    playableCardIds: [],
  };
}

function slot(
  ownerIndex: number,
  kind: 'active' | 'bench',
  index: number,
  name: string,
  energies: CardView[],
): PokemonSlotView {
  const pokemon = card(name);
  return {
    ownerIndex,
    slot: kind,
    index,
    target: targetFor(0, ownerIndex, kind === 'active' ? SlotType.ACTIVE : SlotType.BENCH, index),
    empty: false,
    pokemon,
    cards: [pokemon],
    damage: 0,
    hp: 100,
    retreat: [],
    energy: energies,
    tools: [],
    specialConditions: [],
  };
}
