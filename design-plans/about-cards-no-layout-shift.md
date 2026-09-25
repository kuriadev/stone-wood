# Opening a "Why Choose" card no longer moves the map

Written against: 2492652

## Evidence chain

- Surface: `components/sections/About.tsx` — route `/about`, the "Why Choose StoneWood" card grid (`About.tsx:258-266`) and the Google map embed that follows it.
- Problem: The three cards sit in a `repeat(3,1fr)` grid whose row is sized by its tallest child, and each card's detail panel expands inline (`maxHeight: isActive ? 200 : 0`). Opening a card therefore grows the row and pushes everything below it down. Measured at 1500×950: grid 198px → 286px, map top **444px → 533px (an 89px jump)**, page height 2349 → 2438. The same 89px jump happens in reverse on close, so the map moves every time a visitor interacts with any card.
- A second, related waste: because the grid row is sized by the tallest card, opening one card stretches the other two to match, leaving empty space inside both. Measured collapsed `[198, 198, 198]`; with the middle card open `[286, 297, 286]`.
- Design evidence:
  - `About.tsx:258-266` — the grid: `display: "grid"`, `gridTemplateColumns: mob ? "1fr" : "repeat(3,1fr)"`, `gap: 26`, `maxWidth: 1100`. No row sizing and no `alignItems`, so rows size to content and items stretch.
  - `About.tsx` detail panel — `maxHeight: isActive ? 200 : 0` with `overflow: "hidden"`. The 200px cap is the component's own declared ceiling on how far a card can grow.
  - Measured tallest EXPANDED card, sweeping `/about` from 360px to 1827px. The cards wrap differently at each width, so the reservation must vary with it:

    | width | tallest collapsed | tallest expanded |
    | --- | --- | --- |
    | < 768 (single column) | 190px | 289px |
    | 768–899 (three columns, most cramped) | 243px | **395px** |
    | 900–999 | 198px | 323px |
    | ≥ 1000 | 198px | 297px |

  - Rendered verification of the applied correction across every band (360/390/700/768/820/900/999/1000/1240/1500/1827), opening and closing each of the three cards: the map's viewport position is identical in all 33 transitions.
- Owner: `components/sections/About.tsx` — the grid container owns row sizing and item alignment.
- Scope and affected surfaces: this grid only. The detail panels, their copy and the toggle behaviour are untouched.
- Uncertainty: The reserved height is a fixed value (see Changes). The detail panel's existing `maxHeight: 200` bounds how far a card can grow, so the reservation cannot be overrun by normal copy edits; a material increase in the collapsed card copy would need it revisited, which the Stop conditions cover.

## Design decision

Reserve the tallest state on the grid container, and stop the cards stretching to match each other.

Two declarations, one decision. `alignItems: "start"` makes each card take its own height, so opening one no longer inflates its siblings. A reserved minimum row height keeps the grid's own height constant whether a card is open or closed, so nothing below it — including the map — can move.

The alternative of reserving the space inside every card was rejected by the user: it removes the gap under the cards but leaves all three visibly half-empty while collapsed. Reserving on the container keeps the cards compact and places the reserved space where it reads as section spacing.

## Reuse

- `gap: 26`, `maxWidth: 1100`, `gridTemplateColumns` — unchanged on the same element
- The detail panel's existing `maxHeight: 200` cap, which bounds the growth this reservation must cover

No new primitive, colour, or type value is required.

## Changes

1. `components/sections/About.tsx:258-266` (the card grid container)
   - Change: Add `alignItems: "start"` so cards size to their own content instead of stretching to the row. Add `gridAutoRows` reserving the tallest expanded card for the current width band, using the `w` and `mob` values the component already reads from `useWidth()`:
     `gridAutoRows: \`minmax(${mob ? 289 : w < 1000 ? 395 : 297}px, auto)\``.
     Use `minmax(…, auto)` rather than a fixed height so that if content ever exceeds a band the row grows instead of clipping.
   - Note for the executor: a single fixed 318px reservation was tried first and **failed** — it holds on desktop but still let the map jump 62px at 768px, because 768–899 is the worst-wrapping band, not the desktop one. Do not replace the width-dependent expression with one number without re-sweeping the widths.
   - Preserve: `display: "grid"`, `gridTemplateColumns: mob ? "1fr" : "repeat(3,1fr)"`, `gap: 26`, `maxWidth: 1100`, `margin: "0 auto"`. Preserve every card's contents, the detail panels, their copy, and the tap-to-expand behaviour. No content changes.
   - Verify: The map's viewport position is identical with all cards closed, with a card open, and after re-closing.

## Scope

- Inherit: the "Why Choose StoneWood" grid on `/about`.
- Verify: `/about` at 390px, 768px and 1500px, both themes; open and close each of the three cards in turn; confirm the map does not move in any transition and that the mobile single-column branch is unaffected.
- Exclude: the detail panel's `maxHeight: 200`, the card styling, the map embed, and every other section of `/about`. Do not convert the inline expansion into an overlay or a modal.

## Validation

- Product: On `/about`, tapping a card still reveals its details and tapping again still closes them.
- Interface: Route `/about`. Widths 390, 768, 1500. Both themes. States: all closed, each card open in turn, and re-closed. Content extreme: the mobile branch, where `gridTemplateColumns` is `1fr` and the reservation applies per row.
- System: Confirm the row reservation lives on the grid container and that no fixed height was added to the cards themselves.
- Repository: `grep -n 'alignItems: "start"' components/sections/About.tsx` → one match on the card grid. `npx tsc --noEmit` → no errors. `npx next build` → compiles successfully.

## Stop conditions

- Stop if the card copy changes, or the `mob` breakpoint moves: both change how the text wraps, which changes the tallest expanded card in each band. Re-sweep the widths and update the three reserved values before assuming the reservation still holds.
- Stop if the detail panel's `maxHeight: 200` cap is removed, which would let a card grow past the reservation without bound.

## Design documentation

- After acceptance and validation: No design documentation exists in this repository to update. If one is created later, record the decision as "A section whose items expand in place reserves its tallest state, so content below it never moves" in that document.
