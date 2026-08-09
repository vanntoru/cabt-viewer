import { describe, expect, it } from 'vitest';
import { replayCardImageUrls } from './cardImagePrefetch';

describe('replay card image prefetch', () => {
  it('collects unique local card images from the projected replay', () => {
    expect(replayCardImageUrls({
      views: [
        { imageUrl: '/jp-card-images/0120.jpg?v=ptcg-abc-jp-1' },
        { nested: [{ imageUrl: '/jp-card-images/0002.jpg?v=ptcg-abc-jp-1' }] },
      ],
      steps: [{ imageUrl: '/jp-card-images/0120.jpg?v=ptcg-abc-jp-1' }],
      external: 'https://example.test/card.jpg',
    })).toEqual([
      '/jp-card-images/0002.jpg?v=ptcg-abc-jp-1',
      '/jp-card-images/0120.jpg?v=ptcg-abc-jp-1',
    ]);
  });
});
