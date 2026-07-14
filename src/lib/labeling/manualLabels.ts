const STORAGE_KEY = 'cabt.manualLabels.v1';
const SCHEMA_VERSION = 1;

export type ManualLabelRecord = {
  schemaVersion: 1;
  labelSetId: string;
  labelId: string;
  label: string;
  replayId: string;
  replayName: string;
  stepIndex: number;
  stateIndex: number;
  turn: number;
  activePlayerIndex: number;
  candidateSlug: string;
  workbenchFocusDeck: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type ManualLabelDraft = Omit<ManualLabelRecord, 'schemaVersion' | 'createdAt' | 'updatedAt'>;

type ManualLabelKeyParts = {
  labelSetId: string;
  replayId: string;
  stepIndex: number;
};

export function manualLabelKey(parts: ManualLabelKeyParts): string {
  return `${parts.labelSetId}::${parts.replayId}::${parts.stepIndex}`;
}

export function loadManualLabelRecords(): ManualLabelRecord[] {
  const storage = browserStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isManualLabelRecord) : [];
  } catch {
    return [];
  }
}

export function findManualLabelRecord(labelSetId: string, replayId: string, stepIndex: number): ManualLabelRecord | null {
  const key = manualLabelKey({ labelSetId, replayId, stepIndex });
  return loadManualLabelRecords().find((record) => manualLabelKey(record) === key) ?? null;
}

export function saveManualLabelRecord(draft: ManualLabelDraft): ManualLabelRecord {
  const records = loadManualLabelRecords();
  const key = manualLabelKey(draft);
  const existingIndex = records.findIndex((record) => manualLabelKey(record) === key);
  const existing = existingIndex >= 0 ? records[existingIndex] : null;
  const now = new Date().toISOString();
  const next: ManualLabelRecord = {
    schemaVersion: SCHEMA_VERSION,
    ...draft,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (existingIndex >= 0) {
    records[existingIndex] = next;
  } else {
    records.push(next);
  }
  saveManualLabelRecords(records);
  return next;
}

export function removeManualLabelRecord(labelSetId: string, replayId: string, stepIndex: number): boolean {
  const records = loadManualLabelRecords();
  const key = manualLabelKey({ labelSetId, replayId, stepIndex });
  const nextRecords = records.filter((record) => manualLabelKey(record) !== key);
  if (nextRecords.length === records.length) {
    return false;
  }
  saveManualLabelRecords(nextRecords);
  return true;
}

export function removeManualLabelRecordsForSet(labelSetId: string): number {
  const records = loadManualLabelRecords();
  const nextRecords = records.filter((record) => record.labelSetId !== labelSetId);
  const removedCount = records.length - nextRecords.length;
  if (removedCount > 0) {
    saveManualLabelRecords(nextRecords);
  }
  return removedCount;
}

export function saveManualLabelNote(labelSetId: string, replayId: string, stepIndex: number, note: string): ManualLabelRecord | null {
  const existing = findManualLabelRecord(labelSetId, replayId, stepIndex);
  if (!existing) {
    return null;
  }
  return saveManualLabelRecord({ ...existing, note });
}

export function manualLabelRecordsToJsonl(records = loadManualLabelRecords()): string {
  if (!records.length) {
    return '';
  }
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

export function manualLabelDownloadName(labelSetId: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${labelSetId}-manual-labels-${timestamp}.jsonl`;
}

function saveManualLabelRecords(records: ManualLabelRecord[]): void {
  const storage = browserStorage();
  if (!storage) {
    return;
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function browserStorage(): Storage | null {
  if (typeof window !== 'undefined') {
    return window.localStorage;
  }
  return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
}

function isManualLabelRecord(value: unknown): value is ManualLabelRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as ManualLabelRecord;
  return (
    record.schemaVersion === SCHEMA_VERSION &&
    typeof record.labelSetId === 'string' &&
    typeof record.labelId === 'string' &&
    typeof record.label === 'string' &&
    typeof record.replayId === 'string' &&
    typeof record.replayName === 'string' &&
    Number.isInteger(record.stepIndex) &&
    Number.isInteger(record.stateIndex) &&
    Number.isInteger(record.turn) &&
    Number.isInteger(record.activePlayerIndex) &&
    typeof record.candidateSlug === 'string' &&
    typeof record.workbenchFocusDeck === 'string' &&
    typeof record.note === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  );
}
