# The hero calendar fills the height of the card row

Written against: 2492652

## Evidence chain

- Surface: the homepage hero reservations card — route `/`, `components/sections/Home.tsx:326` (the card's two-column row), `Home.tsx:417` (calendar column), `components/common/AvailabilityCalendar.tsx` (the panel inside it).
- Problem: The card's row is aligned `flex-start` on desktop, so the calendar column takes only its content height while the left column is taller. Measured at 1440px: row 420px, left column 420px, calendar 327px — **93px of empty card beneath the calendar**, at every desktop width. The user reported this directly as wasted space in the hero.
- Design evidence:
  - `components/sections/Home.tsx:326` — `alignItems: mob ? "stretch" : "flex-start"`.
  - `components/common/AvailabilityCalendar.tsx:174` — the day grid is `display: "grid"` with `gridTemplateColumns: "repeat(7,1fr)"` and no row sizing, so its rows are content-height and the panel cannot grow.
  - Exemplar: the two side-by-side panels in `/book` step 2 (`components/sections/BookNow.tsx`, the NUMBER OF GUESTS and YOUR TIME cards) share the row height — measured 718×269 and 352×269, equal heights, with no dead band between them. Panels sitting side by side inside a card share the row height in this product.
  - Rendered comparison of the two candidate corrections at 1440px: aligning `stretch` alone closes the row-level gap (`voidUnderCalendar: 93 → 0`) but leaves the calendar's content top-aligned inside a now-taller dark panel, relocating the emptiness rather than removing it. Letting the day grid absorb the height removes it: the rows grow, the legend sits at the bottom edge, and no empty region remains at any level.
- Owner: `components/sections/Home.tsx` owns the row alignment; `components/common/AvailabilityCalendar.tsx` owns the panel's internal height distribution.
- Scope and affected surfaces: `AvailabilityCalendar` has exactly one consumer — `Home.tsx:14`, rendered at `Home.tsx:418`. The homepage hero is the only affected surface.
- Uncertainty: None for the measurements. The day cells grow taller on desktop; that is the intended use of the reclaimed space, and it reduces density rather than increasing it.

## Design decision

Let the calendar occupy the full height of the card row, and let its day grid absorb the additional height.

This is one decision expressed in two places, because the row owns the height and the panel owns how that height is distributed. Changing only the row would move the empty space inside the panel; changing only the grid would give it nothing to grow into. Together they remove the void by using it — rows get taller, which serves the requirement that the result be roomier rather than denser.

The alternative of shrinking the card or the left column to the calendar's height was rejected: it would discard space the card already has rather than use it, and would require inventing a height.

## Reuse

- `alignItems: "stretch"` — already the row's own value on the mobile branch (`Home.tsx:326`)
- `gridTemplateColumns: "repeat(7,1fr)"`, `gap: 3` — already the calendar's day grid
- Exemplar: the equal-height two-panel row in `/book` step 2 (`components/sections/BookNow.tsx`)

No new primitive and no new colour, spacing or type value is required.

## Changes

1. `components/sections/Home.tsx:326`
   - Change: Set the row's `alignItems` to `"stretch"` for both branches, removing the `mob ? … : "flex-start"` fork.
   - Preserve: `flexDirection: mob ? "column" : "row"` and `gap: mob ? 20 : 32` exactly as they are.
   - Verify: At 1440px the calendar column's height equals the left column's height.

2. `components/common/AvailabilityCalendar.tsx` — root element (currently `:105-121`) and day grid (currently `:174`)
   - Change: Make the root a column flex container that fills its height — add `height: "100%"`, `display: "flex"`, `flexDirection: "column"` alongside the existing declarations. Give the day grid `flex: 1` and `gridAutoRows: "1fr"` so the week rows share the remaining height evenly.
   - Preserve: `background`, `border`, `borderRadius`, `padding`, `width: "100%"`, `boxShadow`, the month header, the weekday header row, the legend, every cell's own styling, and the `onSelectDate` contract. No copy changes, no change to which dates are enabled.
   - Verify: The calendar panel's height equals the row height, the legend sits at the panel's bottom, and no empty region remains inside the panel.

## Scope

- Inherit: The homepage hero reservations card — the only consumer.
- Verify: `/` at 390px, 768px, 900px, 1024px, 1440px and 1827px, in both themes; a five-row month and a six-row month; date selection and month navigation still work; no horizontal page overflow.
- Exclude: `components/booking/BookingDatePicker.tsx` renders in a single-column card with no taller sibling, so it has no equivalent void — do not change it. Do not alter the card's `maxWidth: 900` or the left column's `flex: 0 0 250px`.

## Validation

- Product: On `/`, clicking an open date still navigates to `/book?date=…`, and the month arrows still change month.
- Interface: Route `/`, widths 390/768/900/1024/1440/1827, both themes. Content extremes: a month needing six week rows (rows share the height, cells are shorter but still tappable) and the mobile branch (column direction, where the calendar has no taller sibling and must not stretch oddly).
- System: Confirm the row no longer forks `alignItems` by breakpoint, and that no fixed height was introduced anywhere to force the match.
- Repository: `grep -n 'alignItems: mob ? "stretch" : "flex-start"' components/sections/Home.tsx` → no matches. `npx tsc --noEmit` → no errors. `npx next build` → compiles successfully.

## Stop conditions

- Stop if the left column stops being the taller of the two, since the reclaimed height this plan depends on would no longer exist.
- Stop if `AvailabilityCalendar` gains a second consumer whose container has no definite height — `height: "100%"` would then resolve against an auto-height parent and collapse.

## Design documentation

- After acceptance and validation: No design documentation exists in this repository to update. If one is created later, record the decision as "Panels sitting side by side inside a card share the row height; a panel given extra height distributes it through its own content rather than padding the bottom" in that document.
