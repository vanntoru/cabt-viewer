import type { ReplaySnapshot } from './replay';
import type { CardView, GameView } from './types';

export const ACTIVE_SESSION_STORAGE_KEY = 'cabt.activeSession.v1';
export const ACTIVE_MATCH_RECORD_KEY = 'active-match';

const DATABASE_NAME = 'cabt-viewer';
const DATABASE_VERSION = 1;
const OBJECT_STORE_NAME = 'active-match';

export type LiveTimelineCheckpoint = {
  replay: ReplaySnapshot | null;
  stepIndex: number;
};

export type KnownDeckCheckpoint = Record<number, {
  cards: CardView[];
  complete: boolean;
}>;

export type ActiveMatchSelectionCheckpoint = {
  playerDeckId: string;
  opponentDeckId: string;
  agentId: string;
};

export type ActiveMatchCheckpointV1 = {
  version: 1;
  sessionId: string;
  savedAt: string;
  finished: boolean;
  game: GameView;
  timeline: LiveTimelineCheckpoint;
  knownDecksByPlayer: KnownDeckCheckpoint;
  appliedKnownDeckLogKeys: string[];
  selection: ActiveMatchSelectionCheckpoint;
};

export type ActiveSessionPointerV1 = {
  version: 1;
  sessionId: string;
  savedAt: string;
};

export interface SingleRecordBackend {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export class ActiveMatchCheckpointRepository {
  constructor(private readonly backend: SingleRecordBackend) {}

  async load(): Promise<ActiveMatchCheckpointV1 | null> {
    return parseActiveMatchCheckpoint(await this.backend.read(ACTIVE_MATCH_RECORD_KEY));
  }

  async save(checkpoint: ActiveMatchCheckpointV1): Promise<void> {
    await this.backend.write(ACTIVE_MATCH_RECORD_KEY, toSerializableCheckpoint(checkpoint));
  }

  async clear(): Promise<void> {
    await this.backend.remove(ACTIVE_MATCH_RECORD_KEY);
  }
}

function toSerializableCheckpoint(checkpoint: ActiveMatchCheckpointV1): ActiveMatchCheckpointV1 {
  return JSON.parse(JSON.stringify(checkpoint)) as ActiveMatchCheckpointV1;
}

export function readActiveSessionPointer(storage = browserStorage()): ActiveSessionPointerV1 | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return parseActiveSessionPointer(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeActiveSessionPointer(sessionId: string, storage = browserStorage()): void {
  if (!storage || !sessionId) {
    return;
  }
  try {
    storage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify({
      version: 1,
      sessionId,
      savedAt: new Date().toISOString(),
    } satisfies ActiveSessionPointerV1));
  } catch {
    // The full IndexedDB checkpoint remains the fallback when localStorage is unavailable.
  }
}

export function clearActiveSessionPointer(storage = browserStorage()): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    // Clearing the IndexedDB record still prevents automatic restoration.
  }
}

export function parseActiveMatchCheckpoint(value: unknown): ActiveMatchCheckpointV1 | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.sessionId !== 'string' || !value.sessionId) {
    return null;
  }
  if (typeof value.savedAt !== 'string' || typeof value.finished !== 'boolean' || !isRecord(value.game)) {
    return null;
  }
  if (!isTimelineCheckpoint(value.timeline) || !isRecord(value.knownDecksByPlayer)) {
    return null;
  }
  if (!Array.isArray(value.appliedKnownDeckLogKeys) || !value.appliedKnownDeckLogKeys.every((item) => typeof item === 'string')) {
    return null;
  }
  if (!isSelectionCheckpoint(value.selection)) {
    return null;
  }
  return value as ActiveMatchCheckpointV1;
}

function parseActiveSessionPointer(value: unknown): ActiveSessionPointerV1 | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.sessionId !== 'string' || !value.sessionId) {
    return null;
  }
  if (typeof value.savedAt !== 'string') {
    return null;
  }
  return value as ActiveSessionPointerV1;
}

function isTimelineCheckpoint(value: unknown): value is LiveTimelineCheckpoint {
  return isRecord(value)
    && (value.replay === null || isRecord(value.replay))
    && Number.isInteger(value.stepIndex)
    && Number(value.stepIndex) >= 0;
}

function isSelectionCheckpoint(value: unknown): value is ActiveMatchSelectionCheckpoint {
  return isRecord(value)
    && typeof value.playerDeckId === 'string'
    && typeof value.opponentDeckId === 'string'
    && typeof value.agentId === 'string';
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

class IndexedDbSingleRecordBackend implements SingleRecordBackend {
  private databasePromise: Promise<IDBDatabase> | null = null;

  async read(key: string): Promise<unknown> {
    const database = await this.database();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE_NAME, 'readonly');
      const request = transaction.objectStore(OBJECT_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to read the active match checkpoint.'));
    });
  }

  async write(key: string, value: unknown): Promise<void> {
    const database = await this.database();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE_NAME, 'readwrite');
      transaction.objectStore(OBJECT_STORE_NAME).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to save the active match checkpoint.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving the active match checkpoint was aborted.'));
    });
  }

  async remove(key: string): Promise<void> {
    const database = await this.database();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE_NAME, 'readwrite');
      transaction.objectStore(OBJECT_STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to clear the active match checkpoint.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Clearing the active match checkpoint was aborted.'));
    });
  }

  private database(): Promise<IDBDatabase> {
    if (this.databasePromise) {
      return this.databasePromise;
    }
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is unavailable.'));
    }
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(OBJECT_STORE_NAME)) {
          request.result.createObjectStore(OBJECT_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open active match storage.'));
      request.onblocked = () => reject(new Error('Active match storage upgrade was blocked.'));
    });
    return this.databasePromise;
  }
}

export const activeMatchCheckpointRepository = new ActiveMatchCheckpointRepository(new IndexedDbSingleRecordBackend());
