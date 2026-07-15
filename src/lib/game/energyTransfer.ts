import { slotForTarget } from './boardInteraction';
import { slotNameJa } from './jaText';
import { getDamageTransferTargets } from './targets';
import type { CardTarget, CardView, GameView, PromptView } from './types';

export type EnergyTransferTargetOption = {
  target: CardTarget;
  ownerLabel: '自分' | '相手';
  positionLabel: string;
  pokemonName: string;
  energies: CardView[];
};

export function getEnergyTransferSourceTargets(
  game: GameView,
  prompt: PromptView,
): EnergyTransferTargetOption[] {
  return describeTargets(game, prompt, 'blockedFrom')
    .filter((option) => option.energies.length > 0);
}

export function getEnergyTransferDestinationTargets(
  game: GameView,
  prompt: PromptView,
): EnergyTransferTargetOption[] {
  return describeTargets(game, prompt, 'blockedTo');
}

export function energyCardLabel(card: CardView): string {
  return card.fullName || card.name || 'エネルギー';
}

function describeTargets(
  game: GameView,
  prompt: PromptView,
  blockedOption: 'blockedFrom' | 'blockedTo',
): EnergyTransferTargetOption[] {
  return getDamageTransferTargets(game, prompt, blockedOption)
    .map(({ target }) => {
      const slot = slotForTarget(game, prompt, target);
      if (!slot || slot.empty) {
        return null;
      }
      return {
        target,
        ownerLabel: slot.ownerIndex === prompt.playerIndex ? '自分' : '相手',
        positionLabel: slotNameJa(slot.slot, slot.index),
        pokemonName: slot.pokemon?.name || 'ポケモン',
        energies: slot.energy,
      } satisfies EnergyTransferTargetOption;
    })
    .filter((option): option is EnergyTransferTargetOption => option !== null);
}
