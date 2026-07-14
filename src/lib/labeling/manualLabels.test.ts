import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findManualLabelRecord,
  loadManualLabelRecords,
  manualLabelKey,
  manualLabelRecordsToJsonl,
  removeManualLabelRecord,
  removeManualLabelRecordsForSet,
  saveManualLabelRecord,
} from './manualLabels';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, 'localStorage');
});

function installStorage(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
  });
}

function draft(overrides = {}) {
  return {
    labelSetId: 'dragapult_lucario_route',
    labelId: 'route_33',
    label: '3-3プラン',
    replayId: 'sample/replay.json',
    replayName: 'sample replay',
    stepIndex: 12,
    stateIndex: 34,
    turn: 5,
    activePlayerIndex: 1,
    candidateSlug: 'dragapult-test',
    workbenchFocusDeck: 'dragapult',
    note: '',
    ...overrides,
  };
}

describe('manual replay labels', () => {
  it('saves and finds a label for one replay step', () => {
    installStorage();

    const saved = saveManualLabelRecord(draft());

    expect(loadManualLabelRecords()).toEqual([saved]);
    expect(findManualLabelRecord('dragapult_lucario_route', 'sample/replay.json', 12)).toEqual(saved);
  });

  it('overwrites the same replay step while keeping createdAt', () => {
    installStorage();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T00:00:00.000Z'));
    const first = saveManualLabelRecord(draft());
    vi.setSystemTime(new Date('2026-07-08T00:01:00.000Z'));

    const second = saveManualLabelRecord(draft({ labelId: 'route_3111', label: '3-1-1-1プラン', note: '見直し' }));

    expect(loadManualLabelRecords()).toHaveLength(1);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.updatedAt);
    expect(second.labelId).toBe('route_3111');
    expect(second.note).toBe('見直し');
  });

  it('keeps different label sets separate', () => {
    installStorage();

    const route = saveManualLabelRecord(draft());
    const other = saveManualLabelRecord(draft({ labelSetId: 'other_task', labelId: 'yes', label: 'はい' }));

    expect(loadManualLabelRecords()).toHaveLength(2);
    expect(manualLabelKey(route)).not.toBe(manualLabelKey(other));
  });

  it('removes one label without touching another step', () => {
    installStorage();
    saveManualLabelRecord(draft());
    saveManualLabelRecord(draft({ stepIndex: 13, stateIndex: 35 }));

    const removed = removeManualLabelRecord('dragapult_lucario_route', 'sample/replay.json', 12);

    expect(removed).toBe(true);
    expect(loadManualLabelRecords().map((record) => record.stepIndex)).toEqual([13]);
    expect(findManualLabelRecord('dragapult_lucario_route', 'sample/replay.json', 12)).toBeNull();
  });

  it('removes all labels for one label set', () => {
    installStorage();
    saveManualLabelRecord(draft());
    saveManualLabelRecord(draft({ stepIndex: 13, stateIndex: 35 }));
    saveManualLabelRecord(draft({ labelSetId: 'other_task', labelId: 'yes', label: 'はい' }));

    const removed = removeManualLabelRecordsForSet('dragapult_lucario_route');

    expect(removed).toBe(2);
    expect(loadManualLabelRecords().map((record) => record.labelSetId)).toEqual(['other_task']);
  });

  it('exports records as jsonl', () => {
    installStorage();
    const saved = saveManualLabelRecord(draft());

    const jsonl = manualLabelRecordsToJsonl();

    expect(jsonl.endsWith('\n')).toBe(true);
    expect(JSON.parse(jsonl.trim())).toEqual(saved);
  });
});
