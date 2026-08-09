export type ReplayForkPointInput = {
  replayId: string;
  replayName: string;
  stepIndex: number;
  stateIndex: number;
  actionIndex: number | null;
  actionType: string;
  turn: number;
};

export function buildReplayForkPoint(input: ReplayForkPointInput, pageUrl: string): Record<string, unknown> {
  const url = new URL(pageUrl);
  const replayFile = url.searchParams.get('replay');
  const replayUrl = url.searchParams.get('replayUrl');
  const playlist = url.searchParams.get('playlist');

  url.searchParams.set('view', 'replay');
  url.searchParams.set('step', String(input.stepIndex));
  url.searchParams.set('state', String(input.stateIndex));

  return {
    ...input,
    ...(replayFile ? { replayFile } : {}),
    ...(replayUrl ? { replayUrl } : {}),
    ...(playlist ? { playlist } : {}),
    url: url.toString(),
  };
}
