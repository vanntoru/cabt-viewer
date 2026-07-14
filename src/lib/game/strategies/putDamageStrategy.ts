import {
  includesTarget,
  type BoardInteractionStrategy,
} from '../boardInteraction';
import { promptOptions } from '../prompts';
import { promptLimit } from '../setupPrompt';
import type { CardTarget, GameView, PromptView } from '../types';
import { getBoardPromptTargets } from '../targets';
import {
  maxDamageForTarget,
  totalPlacedDamage,
  type DamagePlacement,
} from '../../../state/promptSelectionModel';

type PutDamageStore = {
  damagePlacements: DamagePlacement[];
  placeDamage: (target: CardTarget, amount: number, requiredDamage: number, maxAllowedDamage: DamagePlacement[]) => void;
  adjustDamage: (target: CardTarget, amount: number, requiredDamage: number, maxAllowedDamage: DamagePlacement[]) => void;
  resetDamagePlacements: () => void;
  damageForTarget: (target: CardTarget) => number;
  damageResult: () => unknown;
};

export function createPutDamageStrategy(args: {
  game: GameView;
  prompt: PromptView;
  store: PutDamageStore;
  resolve: (value: unknown) => void;
}): BoardInteractionStrategy {
  const { game, prompt, store, resolve } = args;
  const options = promptOptions(prompt);
  const targets = getBoardPromptTargets(game, prompt);
  const step = promptLimit(options.damageMultiple, 10);
  const requiredDamage = promptLimit(prompt.fields.damage, 0);
  const maxAllowedDamage = normalizeDamagePlacements(prompt.fields.maxAllowedDamage);
  const allowPartialDamage = !!options.allowPlacePartialDamage;

  function placedTotal() {
    return totalPlacedDamage(store.damagePlacements);
  }

  function canPlaceAmount(target: CardTarget, amount: number) {
    if (amount <= 0 || !includesTarget(targets, target) || placedTotal() + amount > requiredDamage) {
      return false;
    }
    return store.damageForTarget(target) + amount <= maxDamageForTarget(maxAllowedDamage, target);
  }

  function canAdjustDamage(target: CardTarget, amount: number) {
    if (amount > 0) {
      return canPlaceAmount(target, amount);
    }
    if (amount < 0) {
      return includesTarget(targets, target) && store.damageForTarget(target) > 0;
    }
    return false;
  }

  function canConfirm() {
    const total = placedTotal();
    return total > 0 && (allowPartialDamage ? total <= requiredDamage : total === requiredDamage);
  }

  return {
    key: `put-damage:${prompt.id}`,
    isEligible: (target) => canPlaceAmount(target, step),
    isSelected: (target) => store.damageForTarget(target) > 0,
    deltaFor: (target) => store.damageForTarget(target),
    activate(target) {
      if (canPlaceAmount(target, step)) {
        store.placeDamage(target, step, requiredDamage, maxAllowedDamage);
      }
    },
    adjustDamage(target, amount) {
      if (canAdjustDamage(target, amount)) {
        store.adjustDamage(target, amount, requiredDamage, maxAllowedDamage);
      }
    },
    canAdjustDamage,
    quickAmounts: [10, 20, 30],
    reset: () => store.resetDamagePlacements(),
    confirm() {
      if (canConfirm()) {
        resolve(store.damageResult());
      }
    },
    cancel: () => resolve(null),
    title: prompt.className === 'PutDamagePrompt' ? 'Place damage' : 'Damage',
    hint: 'Tap a Pokemon on the board to place damage.',
    iconName: 'damage',
    get meta() {
      const remaining = Math.max(0, requiredDamage - placedTotal());
      return {
        current: placedTotal(),
        max: requiredDamage,
        secondary: remaining > 0 ? `${remaining} left` : undefined,
      };
    },
    get canReset() {
      return placedTotal() > 0;
    },
    get canConfirm() {
      return canConfirm();
    },
    allowCancel: !!options.allowCancel,
  };
}

function normalizeDamagePlacements(value: unknown): DamagePlacement[] {
  return Array.isArray(value)
    ? value.filter((item): item is DamagePlacement =>
        item
          && typeof item === 'object'
          && 'target' in item
          && 'damage' in item
          && typeof item.damage === 'number',
      )
    : [];
}
