import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rawCardRows from '../lib/cabt/cardData.generated.json';
import { formatCabtDeckList, SAMPLE_DECK } from '../lib/game/deckImport';
import { parseLocalGameDecks } from './deckImportModel';

describe('deck import model', () => {
  it('returns parsed cards for both local players', () => {
    const decks = parseLocalGameDecks(SAMPLE_DECK, SAMPLE_DECK);

    expect(decks.ok).toBe(true);
    if (decks.ok) {
      expect(decks.player1Cards).toHaveLength(60);
      expect(decks.player2Cards).toHaveLength(60);
    }
  });

  it('prefixes parse errors with the deck label', () => {
    const decks = parseLocalGameDecks('Bad Card', '');

    expect(decks.ok).toBe(false);
    if (!decks.ok) {
      expect(decks.error).toContain('Your deck: Line 1: card names must include a set code');
      expect(decks.error).toContain('AI opponent deck: Deck is empty.');
    }
  });

  it('round-trips bundled agent deck CSVs through the play-screen deck parser', () => {
    const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const agentDeck = fs.readFileSync(path.join(frontendRoot, 'public', 'agents', 'official-random-abomasnow', 'deck.csv'), 'utf8');
    const formattedAgentDeck = formatCabtDeckList(agentDeck, rawCardRows);
    const decks = parseLocalGameDecks(SAMPLE_DECK, formattedAgentDeck);

    expect(decks.ok).toBe(true);
    if (decks.ok) {
      expect(decks.player1Cards).toHaveLength(60);
      expect(decks.player2Cards).toHaveLength(60);
    }
  });
});
