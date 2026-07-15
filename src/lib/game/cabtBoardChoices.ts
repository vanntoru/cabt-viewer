import { slotForTarget } from './boardInteraction';
import { slotNameJa } from './jaText';
import type { CardTarget, CardView, GameView, PromptView } from './types';

export type CabtBoardChoiceSlot = {
  target: CardTarget;
  ownerLabel: '自分' | '相手';
  positionLabel: string;
  pokemonName: string;
  energies: CardView[];
};

export type CabtBoardChoice = {
  index: number;
  source?: CabtBoardChoiceSlot;
  destination?: CabtBoardChoiceSlot;
  selectedEnergy?: CardView;
};

type RawBoardChoice = {
  index: number;
  sourceTarget?: CardTarget;
  destinationTarget?: CardTarget;
  energyIndex?: number;
};

export function getCabtBoardChoices(game: GameView, prompt: PromptView): CabtBoardChoice[] {
  const rawChoices = Array.isArray(prompt.fields.boardChoices) ? prompt.fields.boardChoices : [];
  return rawChoices
    .map((raw) => normalizeBoardChoice(raw))
    .map((choice) => describeBoardChoice(game, prompt, choice))
    .filter((choice): choice is CabtBoardChoice => choice !== null);
}

export function boardChoiceEnergyLabel(card: CardView | undefined): string {
  return card?.fullName || card?.name || 'エネルギー';
}

function describeBoardChoice(
  game: GameView,
  prompt: PromptView,
  choice: RawBoardChoice | null,
): CabtBoardChoice | null {
  if (!choice) {
    return null;
  }
  const source = choice.sourceTarget ? describeSlot(game, prompt, choice.sourceTarget) : undefined;
  const destination = choice.destinationTarget ? describeSlot(game, prompt, choice.destinationTarget) : undefined;
  if (!source && !destination) {
    return null;
  }
  return {
    index: choice.index,
    source,
    destination,
    selectedEnergy: source && choice.energyIndex !== undefined
      ? source.energies[choice.energyIndex]
      : undefined,
  };
}

function describeSlot(game: GameView, prompt: PromptView, target: CardTarget): CabtBoardChoiceSlot | undefined {
  const slot = slotForTarget(game, prompt, target);
  if (!slot || slot.empty) {
    return undefined;
  }
  return {
    target,
    ownerLabel: slot.ownerIndex === prompt.playerIndex ? '自分' : '相手',
    positionLabel: slotNameJa(slot.slot, slot.index),
    pokemonName: slot.pokemon?.name || 'ポケモン',
    energies: slot.energy,
  };
}

function normalizeBoardChoice(raw: unknown): RawBoardChoice | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const index = Number(record.index);
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }
  const sourceTarget = normalizeTarget(record.sourceTarget);
  const destinationTarget = normalizeTarget(record.destinationTarget);
  if (!sourceTarget && !destinationTarget) {
    return null;
  }
  const energyIndex = Number(record.energyIndex);
  return {
    index,
    sourceTarget,
    destinationTarget,
    energyIndex: Number.isInteger(energyIndex) && energyIndex >= 0 ? energyIndex : undefined,
  };
}

function normalizeTarget(raw: unknown): CardTarget | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const player = Number(record.player);
  const slot = Number(record.slot);
  const index = Number(record.index);
  if (![player, slot, index].every(Number.isInteger)) {
    return undefined;
  }
  return { player, slot, index };
}
