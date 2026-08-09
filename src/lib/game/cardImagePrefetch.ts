const LOCAL_CARD_IMAGE_PATTERN = /^\/jp-card-images\/\d{4}\.jpg(?:\?.*)?$/;
const PREFETCH_CONCURRENCY = 4;

export function replayCardImageUrls(replay: unknown): string[] {
  const urls = new Set<string>();
  const pending: unknown[] = [replay];

  while (pending.length) {
    const value = pending.pop();
    if (typeof value === 'string') {
      if (LOCAL_CARD_IMAGE_PATTERN.test(value)) {
        urls.add(value);
      }
    } else if (Array.isArray(value)) {
      pending.push(...value);
    } else if (value && typeof value === 'object') {
      pending.push(...Object.values(value));
    }
  }

  return [...urls].sort();
}

export function prefetchReplayCardImages(replay: unknown): void {
  if (typeof Image === 'undefined') {
    return;
  }

  const urls = replayCardImageUrls(replay);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < urls.length) {
      const url = urls[nextIndex];
      nextIndex += 1;
      await loadImage(url);
    }
  }

  void Promise.all(
    Array.from({ length: Math.min(PREFETCH_CONCURRENCY, urls.length) }, () => worker()),
  );
}

function loadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.loading = 'eager';
    image.decoding = 'async';
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
  });
}
