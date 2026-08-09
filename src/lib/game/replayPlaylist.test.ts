import { describe, expect, it } from 'vitest';
import { parseReplayPlaylist, playlistItemIndex } from './replayPlaylist';

describe('replay playlist', () => {
  it('keeps playable entries in their published order', () => {
    const items = parseReplayPlaylist({
      items: [
        { id: 'one', file: 'm001-001.json', name: 'Match 1' },
        { id: 'two', file: 'm001-002.json', name: 'Match 2' },
        { id: 'missing-file' },
      ],
    });

    expect(items.map((item) => item.file)).toEqual(['m001-001.json', 'm001-002.json']);
    expect(playlistItemIndex(items, 'm001-002.json')).toBe(1);
  });
});
