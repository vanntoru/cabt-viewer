import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UploadedDeck } from './uploadedDecks';
import {
  LEGACY_MIGRATION_KEY,
  cardSignature,
  migrateLegacyUploadedDecks,
  requestedUserDeckId,
  resolveUserDeckApiBase,
  urlWithoutUserDeck,
  userDeckChoiceKey,
  userDeckUsesKnownCards,
  type UserDeck,
} from './userDecks';

function deck(overrides: Partial<UserDeck> = {}): UserDeck {
  return {
    id: 'deck-1',
    name: '共有デッキ',
    cards: [{ card_id: 1, count: 60 }],
    deck_hash: 'hash',
    revision: 1,
    source: 'card-viewer',
    created_at: '2026-07-14T00:00:00Z',
    updated_at: '2026-07-14T00:00:00Z',
    validation: { valid: true, errors: [], total_cards: 60, unknown_card_ids: [] },
    ...overrides,
  };
}

function uploadedDeck(): UploadedDeck {
  return {
    id: 'legacy-1',
    name: '共有デッキ',
    uploadedAt: '2026-07-14T00:00:00Z',
    sourceFile: 'deck.zip',
    deckFile: 'deck.csv',
    deckText: '',
    cards: [{ cardId: 1, cardName: 'Energy', count: 60, cardViewerUrl: '' }],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('user deck helpers', () => {
  it('uses the viewer host for the shared Workbench API', () => {
    expect(resolveUserDeckApiBase('http://100.113.65.5:5173/?view=play#board'))
      .toBe('http://100.113.65.5:8787/api/user-decks');
    expect(resolveUserDeckApiBase('http://vanntorumac.local:5173/'))
      .toBe('http://vanntorumac.local:8787/api/user-decks');
    expect(resolveUserDeckApiBase('file:///tmp/index.html'))
      .toBe('http://127.0.0.1:8787/api/user-decks');
  });

  it('parses and removes the deep-link parameter without changing other query parameters', () => {
    expect(requestedUserDeckId('?view=play&userDeck=abc-123')).toBe('abc-123');
    expect(userDeckChoiceKey('abc-123')).toBe('user:abc-123');
    expect(urlWithoutUserDeck(new URL('http://127.0.0.1:5173/?view=play&userDeck=abc-123#board')))
      .toBe('/?view=play#board');
  });

  it('compares canonical card counts and checks CABT metadata support', () => {
    expect(cardSignature([{ card_id: 2, count: 4 }, { card_id: 1, count: 56 }]))
      .toBe('1:56|2:4');
    expect(userDeckUsesKnownCards(deck(), [{ id: 1, name: 'Energy', set: 'SVE' }])).toBe(true);
    expect(userDeckUsesKnownCards(deck({ cards: [{ card_id: 999, count: 60 }] }), [{ id: 1, name: 'Energy', set: 'SVE' }]))
      .toBe(false);
  });

  it('migrates legacy browser decks once and skips an already migrated exact deck', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const create = vi.fn(async () => deck({ id: 'created' }));

    const migrated = await migrateLegacyUploadedDecks([uploadedDeck()], [], create);
    expect(migrated.map((item) => item.id)).toEqual(['created']);
    expect(create).toHaveBeenCalledOnce();
    expect(values.has(LEGACY_MIGRATION_KEY)).toBe(true);

    await migrateLegacyUploadedDecks([uploadedDeck()], migrated, create);
    expect(create).toHaveBeenCalledOnce();
  });

  it('is idempotent when the shared store already has the same name and counts', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const create = vi.fn(async () => deck({ id: 'unexpected' }));
    const existing = deck();
    const result = await migrateLegacyUploadedDecks([uploadedDeck()], [existing], create);
    expect(result).toEqual([existing]);
    expect(create).not.toHaveBeenCalled();
    expect(values.has(LEGACY_MIGRATION_KEY)).toBe(true);
  });
});
