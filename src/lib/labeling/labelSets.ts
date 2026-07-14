export type ManualLabel = {
  id: string;
  label: string;
  shortcut: string;
  color?: string;
};

export type ManualLabelSet = {
  id: string;
  title: string;
  labels: ManualLabel[];
};

export const DRAGAPULT_LUCARIO_ROUTE_LABEL_SET: ManualLabelSet = {
  id: 'dragapult_lucario_route',
  title: 'ドラパルト / メガルカリオ ルート判定',
  labels: [
    { id: 'route_33', label: '3-3プラン', shortcut: '1', color: 'green' },
    { id: 'route_3111', label: '3-1-1-1プラン', shortcut: '2', color: 'blue' },
    { id: 'riolu_denial', label: 'リオル封殺', shortcut: '3', color: 'orange' },
    { id: 'other', label: 'どれでもない', shortcut: '4', color: 'gray' },
    { id: 'unsure', label: '判断保留', shortcut: '5', color: 'purple' },
  ],
};

export const MANUAL_LABEL_SETS = [DRAGAPULT_LUCARIO_ROUTE_LABEL_SET] as const;

export const DEFAULT_MANUAL_LABEL_SET_ID = DRAGAPULT_LUCARIO_ROUTE_LABEL_SET.id;

export function getManualLabelSet(id = DEFAULT_MANUAL_LABEL_SET_ID): ManualLabelSet {
  return MANUAL_LABEL_SETS.find((labelSet) => labelSet.id === id) ?? DRAGAPULT_LUCARIO_ROUTE_LABEL_SET;
}
