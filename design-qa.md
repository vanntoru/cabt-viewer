# Design QA: iPhone replay navigation controls

- Source visual truth: `/tmp/codex-remote-attachments/019fd737-29eb-7723-bc50-8d8f66248040/4530BA6F-FA99-4069-9A8E-C09F5A54ECB2/1-貼り付けた画像-1.jpg`
- Normalized source copy: `source-iphone-controls.jpg`
- Implementation screenshot: `implementation-iphone-controls.png`
- Side-by-side comparison: `design-qa-iphone-controls-comparison.png`
- Viewport: 393 × 852 CSS px
- Source pixels: 590 × 1280; normalized to 393 × 852 for comparison
- Implementation pixels: 393 × 852 at device scale factor 1
- State: local CABT replay, initial step, own-turn-only enabled

## Findings

No actionable P0, P1, or P2 issues remain in the requested bottom navigation change.

- Fonts and typography: the existing viewer font stack and button weight are preserved. The action labels are now readable Japanese text instead of small symbol-only controls.
- Spacing and layout rhythm: the two primary action controls measure 52 × 44 px. The dock measures 393 × 58 px, remains inside the viewport, and `body.scrollWidth` equals 393 px.
- Colors and visual tokens: existing button background, border, text, disabled, and active tokens are unchanged.
- Image quality and asset fidelity: no image assets were added or replaced; the board and card assets retain their existing rendering.
- Copy and content: `戻る` and `次へ` clearly describe the one-step actions. Existing accessible names remain `Previous action` and `Next action`.

## Focused region comparison

The bottom replay dock was inspected in the combined before/after image. The source used 28 × 30 px symbol-only previous/next buttons. The revised implementation uses 52 × 44 px labeled buttons and hides the lower-priority first/last jump controls at iPhone width so the primary controls do not overflow.

## Comparison history

1. Initial P1 finding: iPhone single-step controls were too small and depended on `<` / `>` symbols, making touch use and identification difficult.
2. Fix: changed the visible copy to `戻る` / `次へ`, increased both controls to 52 × 44 px, increased the mobile dock to 58 px, and removed first/last jump controls from the narrow layout.
3. Post-fix evidence: computed browser geometry confirmed 52 × 44 px controls, a 393 px-wide dock, and no horizontal overflow. Clicking `次へ` changed step 0 → 1; clicking `戻る` changed step 1 → 0. Browser console errors: none.

## Implementation checklist

- [x] Preserve existing replay behavior and keyboard navigation
- [x] Enlarge primary touch targets to at least 44 px high
- [x] Add clear visible labels
- [x] Prevent iPhone-width overflow
- [x] Verify both controls interactively
- [x] Run component tests and production build

## Follow-up polish

None required for this scoped change.

final result: passed
