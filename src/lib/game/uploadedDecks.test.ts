import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { extractUploadedDeckFromZipBytes } from './uploadedDecks';
import type { DeckCardMetadata } from './deckImport';

const rows: DeckCardMetadata[] = [
  { id: 3, name: 'Basic {W} Energy', set: 'SVE', setNumber: '3', cardType: 5 },
  { id: 723, name: 'Mega Abomasnow ex', set: 'MEG', setNumber: '36', cardType: 0 },
  { id: 1145, name: 'Mega Signal', set: 'MEG', setNumber: '121', cardType: 1 },
];

function zipText(name: string, text: string): Uint8Array {
  return zipSync({ [name]: strToU8(text) });
}

describe('uploaded deck extraction', () => {
  it('extracts a CABT deck.csv with one card id per line', () => {
    const deckCsv = [
      ...Array.from({ length: 4 }, () => '723'),
      ...Array.from({ length: 2 }, () => '1145'),
      ...Array.from({ length: 54 }, () => '3'),
    ].join('\n');

    const deck = extractUploadedDeckFromZipBytes(zipText('deck.csv', deckCsv), 'sample_submission.zip', rows);

    expect(deck.sourceFile).toBe('sample_submission.zip');
    expect(deck.deckFile).toBe('deck.csv');
    expect(deck.cards).toEqual([
      expect.objectContaining({ cardId: 723, count: 4 }),
      expect.objectContaining({ cardId: 1145, count: 2 }),
      expect.objectContaining({ cardId: 3, count: 54 }),
    ]);
    expect(deck.deckText).toContain('4 Mega Abomasnow ex MEG 36');
  });

  it('extracts a flexible count/id CSV', () => {
    const deck = extractUploadedDeckFromZipBytes(
      zipText('exports/my_deck.csv', 'count,card_id\n4,723\n2,1145\n54,3\n'),
      'counted.zip',
      rows,
    );

    expect(deck.cards.map((card) => [card.cardId, card.count])).toEqual([[723, 4], [1145, 2], [3, 54]]);
  });

  it('extracts JSON decks with cardId and count fields', () => {
    const deck = extractUploadedDeckFromZipBytes(
      zipText('manifest.json', JSON.stringify({ deck: [{ cardId: 723, count: 4 }, { cardId: 1145, count: 2 }, { cardId: 3, count: 54 }] })),
      'json.zip',
      rows,
    );

    expect(deck.cards.reduce((sum, card) => sum + card.count, 0)).toBe(60);
    expect(deck.deckText).toContain('Energy: 54');
  });

  it('extracts loose Python-style card id arrays', () => {
    const ids = [
      ...Array.from({ length: 4 }, () => 723),
      ...Array.from({ length: 2 }, () => 1145),
      ...Array.from({ length: 54 }, () => 3),
    ];
    const deck = extractUploadedDeckFromZipBytes(zipText('main.py', `DECK = [${ids.join(', ')}]\n`), 'python.zip', rows);

    expect(deck.deckFile).toBe('main.py');
    expect(deck.cards.reduce((sum, card) => sum + card.count, 0)).toBe(60);
  });
});
