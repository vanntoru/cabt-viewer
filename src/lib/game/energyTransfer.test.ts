import { describe, expect, it } from 'vitest';
import {
  getEnergyTransferDestinationTargets,
  getEnergyTransferSourceTargets,
} from './energyTransfer';
import { PlayerType, SlotType, targetFor, type CardView, type GameView, type PlayerView, type PokemonSlotView, type PromptView } from './types';

const pokemon = (name: string): CardView => ({ name, fullName: name });
const energy = (name: string): CardView => ({ name, fullName: name, energyType: 1 });

describe('energy transfer targets', () => {
  it('describes the owner, board position, Pokemon, and attached energies', () => {
    const sources = getEnergyTransferSourceTargets(gameView(), promptView());

    expect(sources).toEqual([
      {
        target: targetFor(0, 0, SlotType.ACTIVE),
        ownerLabel: '自分',
        positionLabel: 'バトル場',
        pokemonName: 'Active one',
        energies: [energy('Energy A'), energy('Energy B')],
      },
      {
        target: targetFor(0, 1, SlotType.BENCH, 0),
        ownerLabel: '相手',
        positionLabel: 'ベンチ1',
        pokemonName: 'Opponent bench',
        energies: [energy('Energy C')],
      },
    ]);
  });

  it('keeps Pokemon without energy as possible destinations', () => {
    const destinations = getEnergyTransferDestinationTargets(gameView(), promptView());

    expect(destinations.map(({ ownerLabel, positionLabel, pokemonName, energies }) => ({
      ownerLabel,
      positionLabel,
      pokemonName,
      energyCount: energies.length,
    }))).toContainEqual({
      ownerLabel: '自分',
      positionLabel: 'ベンチ1',
      pokemonName: 'Bench one',
      energyCount: 0,
    });
  });
});

function promptView(): PromptView {
  return {
    id: 1,
    className: 'MoveEnergyPrompt',
    type: 'move-energy',
    playerId: 1,
    playerIndex: 0,
    supported: true,
    resultSchema: 'energyTransfer',
    fields: {
      playerType: PlayerType.ANY,
      slots: [SlotType.ACTIVE, SlotType.BENCH],
      options: {},
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
      player(0, 'Player 1',
        slot(0, 'active', 0, 'Active one', [energy('Energy A'), energy('Energy B')]),
        [slot(0, 'bench', 0, 'Bench one', [])]),
      player(1, 'Player 2',
        slot(1, 'active', 0, 'Opponent active', []),
        [slot(1, 'bench', 0, 'Opponent bench', [energy('Energy C')])]),
    ],
    prompts: [],
    logs: [],
    events: [],
  };
}

function player(index: number, name: string, active: PokemonSlotView, bench: PokemonSlotView[]): PlayerView {
  return {
    index,
    id: index + 1,
    name,
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
  attachedEnergy: CardView[],
): PokemonSlotView {
  const card = pokemon(name);
  return {
    ownerIndex,
    slot: kind,
    index,
    target: targetFor(0, ownerIndex, kind === 'active' ? SlotType.ACTIVE : SlotType.BENCH, index),
    empty: false,
    pokemon: card,
    cards: [card],
    damage: 0,
    hp: 60,
    retreat: [],
    energy: attachedEnergy,
    tools: [],
    specialConditions: [],
  };
}
