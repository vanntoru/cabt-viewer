import type { CardView } from '../lib/game/types';

class CardPreviewStore {
  card = $state<CardView | null>(null);
  imageUrl = $state('');

  get open() {
    return !!this.card;
  }

  show(card: CardView, imageUrl = '') {
    this.card = card;
    this.imageUrl = imageUrl || card.imageUrl || card.cardImage || '';
  }

  close() {
    this.card = null;
    this.imageUrl = '';
  }
}

export const cardPreviewStore = new CardPreviewStore();
