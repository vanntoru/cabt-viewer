export type ReplayPlaylistItem = {
  id: string;
  file: string;
  name: string;
};

export function parseReplayPlaylist(value: unknown): ReplayPlaylistItem[] {
  const items = (value as { items?: unknown })?.items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.flatMap((item) => {
    const row = item as { id?: unknown; file?: unknown; name?: unknown };
    const file = typeof row.file === 'string' ? row.file : '';
    const id = typeof row.id === 'string' ? row.id : file;
    if (!file) {
      return [];
    }
    return [{
      id,
      file,
      name: typeof row.name === 'string' ? row.name : file,
    }];
  });
}

export function playlistItemIndex(items: ReplayPlaylistItem[], replayFile: string): number {
  return items.findIndex((item) => item.file === replayFile || item.id === replayFile);
}
