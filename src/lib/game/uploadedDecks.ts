import { strFromU8, unzipSync } from 'fflate';
import { formatCabtDeckList, type DeckCardMetadata } from './deckImport';

const STORAGE_KEY = 'cabt.uploadedDecks.v1';
const MAX_TEXT_FILE_BYTES = 2_000_000;
const CARD_VIEWER_BASE_URL = 'http://127.0.0.1:8766/index.html#id=';

export type UploadedDeckCard = {
  cardId: number;
  cardName: string;
  count: number;
  cardViewerUrl: string;
};

export type UploadedDeck = {
  id: string;
  name: string;
  uploadedAt: string;
  sourceFile: string;
  deckFile: string;
  deckText: string;
  cards: UploadedDeckCard[];
};

type DeckCandidate = {
  deckFile: string;
  deckText: string;
  cards: UploadedDeckCard[];
  score: number;
};

type TextEntry = {
  name: string;
  text: string;
};

export async function extractUploadedDeckFromZipFile(file: File, cardRows: DeckCardMetadata[]): Promise<UploadedDeck> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return extractUploadedDeckFromZipBytes(bytes, file.name, cardRows);
}

export function extractUploadedDeckFromZipBytes(bytes: Uint8Array, sourceFile: string, cardRows: DeckCardMetadata[]): UploadedDeck {
  const entries = unzipSync(bytes);
  const textEntries = Object.entries(entries)
    .filter(([name, data]) => isLikelyTextDeckSource(name, data))
    .map(([name, data]) => ({ name, text: strFromU8(data) }))
    .filter((entry) => isMostlyText(entry.text));
  const candidates = textEntries.flatMap((entry) => extractDeckCandidates(entry, cardRows));
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best) {
    throw new Error('ZIP内から60枚に解決できるデッキを見つけられませんでした。deck.csv、カードID一覧、または一般的なデッキリストを含めてください。');
  }
  const uploadedAt = new Date().toISOString();
  return {
    id: makeUploadedDeckId(sourceFile, best.deckFile, best.cards, uploadedAt),
    name: displayDeckName(sourceFile),
    uploadedAt,
    sourceFile,
    deckFile: best.deckFile,
    deckText: best.deckText,
    cards: best.cards,
  };
}

export function loadUploadedDecks(): UploadedDeck[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isUploadedDeck) : [];
  } catch {
    return [];
  }
}

export function saveUploadedDecks(decks: UploadedDeck[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
}

function extractDeckCandidates(entry: TextEntry, cardRows: DeckCardMetadata[]): DeckCandidate[] {
  return [
    ...extractNumericIdDeckCandidates(entry, cardRows),
    ...extractLooseIdArrayDeckCandidates(entry, cardRows),
    ...extractDelimitedDeckCandidates(entry, cardRows),
    ...extractJsonDeckCandidates(entry, cardRows),
    ...extractDeckListCandidates(entry, cardRows),
  ];
}

function extractNumericIdDeckCandidates(entry: TextEntry, cardRows: DeckCardMetadata[]): DeckCandidate[] {
  const ids = entry.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .map((line) => (/^\d+$/.test(line) ? Number(line) : NaN));
  if (ids.length !== 60 || ids.some((id) => !Number.isInteger(id))) {
    return [];
  }
  return compactCandidate(candidateFromIds(entry.name, ids, cardRows, scorePath(entry.name) + 120));
}

function extractLooseIdArrayDeckCandidates(entry: TextEntry, cardRows: DeckCardMetadata[]): DeckCandidate[] {
  const candidates: DeckCandidate[] = [];
  const matches = entry.text.match(/\[[\s\d,]+\]/g) ?? [];
  for (const match of matches) {
    const ids = match.match(/\d+/g)?.map(Number) ?? [];
    if (ids.length === 60) {
      candidates.push(...compactCandidate(candidateFromIds(entry.name, ids, cardRows, scorePath(entry.name) + 60)));
    }
  }
  return candidates;
}

function extractDelimitedDeckCandidates(entry: TextEntry, cardRows: DeckCardMetadata[]): DeckCandidate[] {
  const rows = entry.text
    .split(/\r?\n/)
    .map(parseDelimitedLine)
    .filter((row) => row.some(Boolean));
  if (!rows.length) {
    return [];
  }

  const candidates: DeckCandidate[] = [];
  const header = rows[0].map(normalizeHeader);
  const dataRows = rows.length > 1 && looksLikeHeader(header) ? rows.slice(1) : rows;
  const idIndex = findHeaderIndex(header, ['cardid', 'card_id', 'id', 'card']);
  const countIndex = findHeaderIndex(header, ['count', 'qty', 'quantity', 'copies', '枚数']);

  if (idIndex >= 0) {
    const ids = expandIdRows(dataRows, idIndex, countIndex);
    if (ids.length === 60) {
      candidates.push(...compactCandidate(candidateFromIds(entry.name, ids, cardRows, scorePath(entry.name) + 100)));
    }
  }

  const twoColumnIds = expandTwoColumnIdRows(rows);
  if (twoColumnIds.length === 60) {
    candidates.push(...compactCandidate(candidateFromIds(entry.name, twoColumnIds, cardRows, scorePath(entry.name) + 80)));
  }
  return candidates;
}

function extractJsonDeckCandidates(entry: TextEntry, cardRows: DeckCardMetadata[]): DeckCandidate[] {
  if (!entry.name.toLowerCase().endsWith('.json') && !entry.text.trim().startsWith('{') && !entry.text.trim().startsWith('[')) {
    return [];
  }
  try {
    const json = JSON.parse(entry.text);
    const idLists: number[][] = [];
    collectJsonIdLists(json, idLists);
    return idLists
      .filter((ids) => ids.length === 60)
      .flatMap((ids) => compactCandidate(candidateFromIds(entry.name, ids, cardRows, scorePath(entry.name) + 70)));
  } catch {
    return [];
  }
}

function extractDeckListCandidates(entry: TextEntry, cardRows: DeckCardMetadata[]): DeckCandidate[] {
  const rowsByNameSet = new Map(cardRows.map((row) => [`${normalizeName(row.name)} ${row.set}`, row]));
  const ids: number[] = [];
  for (const rawLine of entry.text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line || /^[^\d:][^:]+:\s*\d+\s*$/.test(line)) {
      continue;
    }
    const match = /^(\d+)\s+(.+)$/.exec(line);
    if (!match) {
      continue;
    }
    const count = Number(match[1]);
    const tokens = match[2].trim().split(/\s+/);
    const hasCollectorNumber = /^\d+[a-z]?$/i.test(tokens.at(-1) ?? '');
    const set = hasCollectorNumber ? tokens.at(-2) : tokens.at(-1);
    const name = hasCollectorNumber ? tokens.slice(0, -2).join(' ') : tokens.slice(0, -1).join(' ');
    const row = rowsByNameSet.get(`${normalizeName(name)} ${set}`);
    if (!row || !Number.isInteger(count) || count < 1) {
      continue;
    }
    for (let index = 0; index < count; index += 1) {
      ids.push(row.id);
    }
  }
  return ids.length === 60 ? compactCandidate(candidateFromIds(entry.name, ids, cardRows, scorePath(entry.name) + 50)) : [];
}

function candidateFromIds(deckFile: string, ids: number[], cardRows: DeckCardMetadata[], score: number): DeckCandidate | null {
  const rowsById = new Map(cardRows.map((row) => [row.id, row]));
  const unknown = ids.find((id) => !rowsById.has(id));
  if (unknown !== undefined) {
    return null;
  }
  const deckText = formatCabtDeckList(ids.map(String).join('\n'), cardRows);
  const counts = new Map<number, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const cards = [...counts.entries()].map(([cardId, count]) => {
    const row = rowsById.get(cardId);
    return {
      cardId,
      cardName: row?.name ?? String(cardId),
      count,
      cardViewerUrl: `${CARD_VIEWER_BASE_URL}${cardId}`,
    };
  });
  return { deckFile, deckText, cards, score };
}

function compactCandidate(candidate: DeckCandidate | null): DeckCandidate[] {
  return candidate ? [candidate] : [];
}

function isLikelyTextDeckSource(name: string, data: Uint8Array): boolean {
  if (name.endsWith('/') || data.length === 0 || data.length > MAX_TEXT_FILE_BYTES) {
    return false;
  }
  const lower = name.toLowerCase();
  if (/\.(csv|txt|json|md|tsv|deck|py)$/i.test(lower)) {
    return true;
  }
  return /(^|\/)deck[^/]*$/i.test(lower);
}

function isMostlyText(text: string): boolean {
  if (!text.trim()) {
    return false;
  }
  const sample = text.slice(0, 4000);
  const bad = [...sample].filter((char) => char === '\u0000' || (char < ' ' && !'\n\r\t'.includes(char))).length;
  return bad / sample.length < 0.02;
}

function scorePath(name: string): number {
  const lower = name.toLowerCase();
  let score = 0;
  if (/(^|\/)deck\.(csv|txt|json|deck)$/i.test(lower)) score += 100;
  if (lower.includes('deck')) score += 40;
  if (lower.endsWith('.csv')) score += 20;
  if (lower.endsWith('.json')) score += 10;
  return score;
}

function parseDelimitedLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : ',';
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_枚数]/g, '');
}

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

function looksLikeHeader(header: string[]): boolean {
  return header.some((cell) => ['cardid', 'card_id', 'id', 'count', 'qty', 'quantity', 'copies', '枚数'].includes(cell));
}

function findHeaderIndex(header: string[], names: string[]): number {
  return header.findIndex((cell) => names.includes(cell));
}

function expandIdRows(rows: string[][], idIndex: number, countIndex: number): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    const id = Number(row[idIndex]);
    const count = countIndex >= 0 ? Number(row[countIndex]) : 1;
    if (!Number.isInteger(id) || !Number.isInteger(count) || count < 1) {
      continue;
    }
    for (let index = 0; index < count; index += 1) {
      ids.push(id);
    }
  }
  return ids;
}

function expandTwoColumnIdRows(rows: string[][]): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    if (row.length === 1 && /^\d+$/.test(row[0])) {
      ids.push(Number(row[0]));
      continue;
    }
    if (row.length < 2) {
      continue;
    }
    const first = Number(row[0]);
    const second = Number(row[1]);
    if (Number.isInteger(first) && Number.isInteger(second)) {
      const [count, id] = first <= 60 && second > 60 ? [first, second] : [second, first];
      if (Number.isInteger(count) && count >= 1) {
        for (let index = 0; index < count; index += 1) {
          ids.push(id);
        }
      }
    }
  }
  return ids;
}

function collectJsonIdLists(value: unknown, out: number[][]): void {
  if (Array.isArray(value)) {
    if (value.length === 60 && value.every((item) => Number.isInteger(item))) {
      out.push(value as number[]);
    }
    const objectIds = expandJsonObjectDeck(value);
    if (objectIds.length === 60) {
      out.push(objectIds);
    }
    value.forEach((item) => collectJsonIdLists(item, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectJsonIdLists(item, out));
  }
}

function expandJsonObjectDeck(value: unknown[]): number[] {
  const ids: number[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = Number(record.cardId ?? record.card_id ?? record.id);
    const count = Number(record.count ?? record.qty ?? record.quantity ?? record.copies ?? 1);
    if (!Number.isInteger(id) || !Number.isInteger(count) || count < 1) {
      continue;
    }
    for (let index = 0; index < count; index += 1) {
      ids.push(id);
    }
  }
  return ids;
}

function displayDeckName(sourceFile: string): string {
  return sourceFile.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || sourceFile;
}

function makeUploadedDeckId(sourceFile: string, deckFile: string, cards: UploadedDeckCard[], uploadedAt: string): string {
  const seed = `${sourceFile}:${deckFile}:${uploadedAt}:${cards.map((card) => `${card.cardId}x${card.count}`).join(',')}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(31, hash) + seed.charCodeAt(index) | 0;
  }
  return `uploaded-${Math.abs(hash).toString(36)}-${Date.now().toString(36)}`;
}

function isUploadedDeck(value: unknown): value is UploadedDeck {
  const deck = value as UploadedDeck;
  return !!deck
    && typeof deck.id === 'string'
    && typeof deck.name === 'string'
    && typeof deck.deckText === 'string'
    && Array.isArray(deck.cards)
    && deck.cards.reduce((sum, card) => sum + (Number(card.count) || 0), 0) === 60;
}
