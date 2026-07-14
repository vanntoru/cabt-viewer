import { describe, expect, it } from 'vitest';
import { formatCabtDeckList, formatCanonicalDeckList, parseDeckList, SAMPLE_DECK } from './deckImport';

describe('deck import', () => {
  it('skips section count headers and expands the default deck to 60 cards', () => {
    const parsed = parseDeckList(SAMPLE_DECK);

    expect(parsed.errors).toEqual([]);
    expect(parsed.cards).toHaveLength(60);
    expect(parsed.cards).toContain('Mega Abomasnow ex MEG');
    expect(parsed.cards).toContain('Waitress ASC');
    expect(parsed.cards).not.toContain('Mega Abomasnow ex MEG 36');
    expect(parsed.cards).not.toContain('Waitress ASC 215');
    expect(parsed.cards).not.toContain('Pokemon: 10');
    expect(parsed.cards).not.toContain('Trainer: 15');
    expect(parsed.cards).not.toContain('Energy: 35');
  });

  it('normalizes accented names from deck exports', () => {
    const parsed = parseDeckList('1 Poké Pad POR 81');

    expect(parsed.errors).toEqual([]);
    expect(parsed.cards).toEqual(['Poke Pad POR']);
  });

  it('normalizes TCG Live basic energy shorthand', () => {
    const parsed = parseDeckList('7 Basic {W} Energy MEE 3');

    expect(parsed.errors).toEqual([]);
    expect(parsed.cards).toEqual([
      'Water Energy MEE',
      'Water Energy MEE',
      'Water Energy MEE',
      'Water Energy MEE',
      'Water Energy MEE',
      'Water Energy MEE',
      'Water Energy MEE',
    ]);
  });

  it('formats CABT deck IDs as grouped import text', () => {
    const deck = [
      ...Array.from({ length: 4 }, () => '723'),
      ...Array.from({ length: 2 }, () => '1145'),
      ...Array.from({ length: 54 }, () => '3'),
    ].join('\n');

    const formatted = formatCabtDeckList(deck, [
      { id: 3, name: 'Basic {W} Energy', set: 'SVE', setNumber: '3', cardType: 5 },
      { id: 723, name: 'Mega Abomasnow ex', set: 'MEG', setNumber: '36', cardType: 0 },
      { id: 1145, name: 'Mega Signal', set: 'MEG', setNumber: '121', cardType: 1 },
    ]);

    expect(formatted).toBe(`Pokemon: 4
4 Mega Abomasnow ex MEG 36

Trainer: 2
2 Mega Signal MEG 121

Energy: 54
54 Basic {W} Energy SVE 3`);
    expect(parseDeckList(formatted).cards).toHaveLength(60);
  });

  it('formats canonical round-robin deck cards as grouped import text', () => {
    const formatted = formatCanonicalDeckList(
      [
        { cardId: 723, count: 4 },
        { cardId: 1145, count: 2 },
        { cardId: 3, count: 54 },
      ],
      [
        { id: 3, name: 'Basic {W} Energy', set: 'SVE', setNumber: '3', cardType: 5 },
        { id: 723, name: 'Mega Abomasnow ex', set: 'MEG', setNumber: '36', cardType: 0 },
        { id: 1145, name: 'Mega Signal', set: 'MEG', setNumber: '121', cardType: 1 },
      ],
    );

    expect(formatted).toBe(`Pokemon: 4
4 Mega Abomasnow ex MEG 36

Trainer: 2
2 Mega Signal MEG 121

Energy: 54
54 Basic {W} Energy SVE 3`);
    expect(parseDeckList(formatted).cards).toHaveLength(60);
  });
});
