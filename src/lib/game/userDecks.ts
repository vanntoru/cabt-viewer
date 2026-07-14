import type { DeckCardMetadata } from './deckImport';
import type { UploadedDeck } from './uploadedDecks';

const LOCAL_USER_DECK_API_BASE = 'http://127.0.0.1:8787/api/user-decks';

export function resolveUserDeckApiBase(pageHref?: string): string {
  const href = pageHref ?? (typeof window !== 'undefined' ? window.location.href : '');
  if (!href) {
    return LOCAL_USER_DECK_API_BASE;
  }
  const pageUrl = new URL(href);
  if (pageUrl.protocol !== 'http:' && pageUrl.protocol !== 'https:') {
    return LOCAL_USER_DECK_API_BASE;
  }
  pageUrl.port = '8787';
  pageUrl.pathname = '/api/user-decks';
  pageUrl.search = '';
  pageUrl.hash = '';
  return pageUrl.toString();
}

export const USER_DECK_API_BASE = resolveUserDeckApiBase();
export const LEGACY_MIGRATION_KEY = 'cabt.uploadedDecks.v1.migrated-to-shared-v1';

export type UserDeckCard = {
  card_id: number;
  count: number;
};

export type UserDeckValidationError = {
  code: string;
  message: string;
  card_ids?: number[];
};

export type UserDeckValidation = {
  valid: boolean;
  errors: UserDeckValidationError[];
  total_cards: number;
  unknown_card_ids: number[];
};

export type UserDeck = {
  id: string;
  name: string;
  cards: UserDeckCard[];
  deck_hash: string;
  revision: number;
  source: string;
  created_at: string;
  updated_at: string;
  validation: UserDeckValidation;
};

type UserDeckListResponse = {
  schema_version: string;
  decks: UserDeck[];
};

type CreateUserDeck = (payload: { name: string; cards: UserDeckCard[]; source: string }) => Promise<UserDeck>;

export class UserDeckApiError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'UserDeckApiError';
    this.status = status;
    this.payload = payload;
  }
}

export async function fetchUserDecks(): Promise<UserDeck[]> {
  const response = await request<UserDeckListResponse>('');
  return Array.isArray(response.decks) ? response.decks : [];
}

export async function fetchUserDeck(id: string): Promise<UserDeck> {
  return request<UserDeck>(`/${encodeURIComponent(id)}`);
}

export async function createUserDeck(payload: { name: string; cards: UserDeckCard[]; source: string }): Promise<UserDeck> {
  return request<UserDeck>('', { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteUserDeck(deck: Pick<UserDeck, 'id' | 'revision'>): Promise<UserDeck> {
  return request<UserDeck>(`/${encodeURIComponent(deck.id)}?revision=${encodeURIComponent(deck.revision)}`, { method: 'DELETE' });
}

export async function duplicateUserDeck(id: string): Promise<UserDeck> {
  return request<UserDeck>(`/${encodeURIComponent(id)}/duplicate`, { method: 'POST' });
}

export function userDeckCardsForCabt(deck: UserDeck): Array<{ cardId: number; count: number }> {
  return deck.cards.map((card) => ({ cardId: card.card_id, count: card.count }));
}

export function userDeckCardCount(deck: UserDeck): number {
  return deck.cards.reduce((sum, card) => sum + card.count, 0);
}

export function userDeckChoiceKey(id: string): string {
  return `user:${id}`;
}

export function requestedUserDeckId(search: string): string {
  return new URLSearchParams(search).get('userDeck')?.trim() ?? '';
}

export function urlWithoutUserDeck(url: URL): string {
  const clean = new URL(url.toString());
  clean.searchParams.delete('userDeck');
  return `${clean.pathname}${clean.search}${clean.hash}`;
}

export function uploadedDeckCards(deck: UploadedDeck): UserDeckCard[] {
  return deck.cards
    .map((card) => ({ card_id: card.cardId, count: card.count }))
    .sort((left, right) => left.card_id - right.card_id);
}

export function userDeckUsesKnownCards(deck: UserDeck, cardRows: DeckCardMetadata[]): boolean {
  const supported = new Set(cardRows.map((row) => Number(row.id)));
  return deck.validation.valid && deck.cards.every((card) => supported.has(card.card_id));
}

export async function migrateLegacyUploadedDecks(
  legacyDecks: UploadedDeck[],
  existingDecks: UserDeck[],
  create: CreateUserDeck = createUserDeck,
): Promise<UserDeck[]> {
  if (typeof window === 'undefined' || !legacyDecks.length || window.localStorage.getItem(LEGACY_MIGRATION_KEY)) {
    return existingDecks;
  }

  const next = [...existingDecks];
  for (const legacy of legacyDecks) {
    const cards = uploadedDeckCards(legacy);
    const alreadyMigrated = next.some(
      (deck) => deck.name.trim().toLocaleLowerCase() === legacy.name.trim().toLocaleLowerCase()
        && cardSignature(deck.cards) === cardSignature(cards),
    );
    if (alreadyMigrated) {
      continue;
    }
    next.push(await create({ name: legacy.name, cards, source: 'cabt-legacy-migration' }));
  }
  window.localStorage.setItem(LEGACY_MIGRATION_KEY, new Date().toISOString());
  return next;
}

export function cardSignature(cards: UserDeckCard[]): string {
  return cards
    .filter((card) => Number.isInteger(card.card_id) && Number.isInteger(card.count) && card.count > 0)
    .map((card) => `${card.card_id}:${card.count}`)
    .sort()
    .join('|');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${USER_DECK_API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
  } catch (cause) {
    throw new UserDeckApiError(
      `マイデッキAPIに接続できません（${new URL(USER_DECK_API_BASE).origin}）。Workbench APIを起動してください。`,
      0,
      cause,
    );
  }
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = typeof payload === 'object' && payload && 'detail' in payload ? payload.detail : payload;
    const message = typeof detail === 'string'
      ? detail
      : typeof detail === 'object' && detail && 'message' in detail
        ? String(detail.message)
        : `マイデッキAPIエラー: HTTP ${response.status}`;
    throw new UserDeckApiError(message, response.status, payload);
  }
  return payload as T;
}
