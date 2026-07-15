type CardPreviewInput = {
  interactive: boolean;
  coarsePointer: boolean;
  landscape: boolean;
};

export function shouldSuppressCardPreview(input: CardPreviewInput): boolean {
  return input.coarsePointer && (input.interactive || input.landscape);
}
