import { describe, expect, it } from 'vitest';
import { shouldSuppressCardPreview } from './cardPreviewPolicy';

describe('shouldSuppressCardPreview', () => {
  it('keeps an interactive hand-card tap focused on its primary action in portrait', () => {
    expect(shouldSuppressCardPreview({
      interactive: true,
      coarsePointer: true,
      landscape: false,
    })).toBe(true);
  });

  it('still allows a read-only card to open the preview on a portrait touch screen', () => {
    expect(shouldSuppressCardPreview({
      interactive: false,
      coarsePointer: true,
      landscape: false,
    })).toBe(false);
  });

  it('preserves the compact landscape touch behavior', () => {
    expect(shouldSuppressCardPreview({
      interactive: false,
      coarsePointer: true,
      landscape: true,
    })).toBe(true);
  });

  it('allows mouse users to preview interactive cards', () => {
    expect(shouldSuppressCardPreview({
      interactive: true,
      coarsePointer: false,
      landscape: false,
    })).toBe(false);
  });
});
