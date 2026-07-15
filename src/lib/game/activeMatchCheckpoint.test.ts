import { describe, expect, it } from 'vitest';
import {
  ACTIVE_MATCH_RECORD_KEY,
  ACTIVE_SESSION_STORAGE_KEY,
  ActiveMatchCheckpointRepository,
  clearActiveSessionPointer,
  parseActiveMatchCheckpoint,
  readActiveSessionPointer,
  writeActiveSessionPointer,
  type ActiveMatchCheckpointV1,
  type SingleRecordBackend,
} from './activeMatchCheckpoint';

class MemoryBackend implements SingleRecordBackend {
  records = new Map<string, unknown>();

  async read(key: string) {
    return this.records.get(key);
  }

  async write(key: string, value: unknown) {
    this.records.set(key, value);
  }

  async remove(key: string) {
    this.records.delete(key);
  }
}

class MemoryStorage implements Storage {
  private records = new Map<string, string>();

  get length() { return this.records.size; }
  clear() { this.records.clear(); }
  getItem(key: string) { return this.records.get(key) ?? null; }
  key(index: number) { return [...this.records.keys()][index] ?? null; }
  removeItem(key: string) { this.records.delete(key); }
  setItem(key: string, value: string) { this.records.set(key, value); }
}

function checkpoint(sessionId: string, turn: number): ActiveMatchCheckpointV1 {
  return {
    version: 1,
    sessionId,
    savedAt: '2026-07-15T00:00:00.000Z',
    finished: false,
    game: {
      ready: true,
      phase: 1,
      phaseLabel: 'play',
      turn,
      activePlayerIndex: 0,
      players: [],
      prompts: [],
      logs: [],
      events: [],
    },
    timeline: { replay: null, stepIndex: 0 },
    knownDecksByPlayer: {},
    appliedKnownDeckLogKeys: [],
    selection: { playerDeckId: 'player', opponentDeckId: 'opponent', agentId: 'agent' },
  };
}

describe('active match checkpoint persistence', () => {
  it('overwrites the one active-match record instead of accumulating sessions', async () => {
    const backend = new MemoryBackend();
    const repository = new ActiveMatchCheckpointRepository(backend);

    await repository.save(checkpoint('session-1', 1));
    await repository.save(checkpoint('session-1', 2));
    await repository.save(checkpoint('session-2', 1));

    expect(backend.records.size).toBe(1);
    expect(backend.records.has(ACTIVE_MATCH_RECORD_KEY)).toBe(true);
    expect((await repository.load())?.sessionId).toBe('session-2');
  });

  it('clears the fixed active-match record', async () => {
    const backend = new MemoryBackend();
    const repository = new ActiveMatchCheckpointRepository(backend);
    await repository.save(checkpoint('session-1', 1));

    await repository.clear();

    expect(await repository.load()).toBeNull();
    expect(backend.records.size).toBe(0);
  });

  it('rejects corrupt or unsupported checkpoint records', () => {
    expect(parseActiveMatchCheckpoint(null)).toBeNull();
    expect(parseActiveMatchCheckpoint({ version: 2, sessionId: 'old' })).toBeNull();
    expect(parseActiveMatchCheckpoint({ ...checkpoint('session-1', 1), timeline: { stepIndex: -1 } })).toBeNull();
  });

  it('writes, reads, and clears the one local session pointer', () => {
    const storage = new MemoryStorage();

    writeActiveSessionPointer('session-1', storage);
    writeActiveSessionPointer('session-2', storage);

    expect(storage.length).toBe(1);
    expect(storage.getItem(ACTIVE_SESSION_STORAGE_KEY)).not.toBeNull();
    expect(readActiveSessionPointer(storage)?.sessionId).toBe('session-2');

    clearActiveSessionPointer(storage);
    expect(readActiveSessionPointer(storage)).toBeNull();
  });
});
