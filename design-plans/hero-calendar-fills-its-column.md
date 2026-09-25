# The hero calendar fills the column it is given

Written against: 2492652

## Evidence chain

- Surface: `components/common/AvailabilityCalendar.tsx`, as rendered in the homepage hero reservations card — route `/`, `components/sections/Home.tsx:418`, inside the card's calendar column (`Home.tsx:417`, `flex: 1` with `justifyContent: "center"`).
- Problem: The calendar declares `width: "100%"` and then clamps itself to a 300–360px band, so it cannot use the column its only consumer allocates. Two consequences, both measured:
  - At viewport widths 1024, 1440 and 1827 the calendar column is 548px and the calendar renders 360px, leaving **94px of empty space on each side** — 188px, or 21% of the card's 900px width — constant at every desktop width.
  - At 390px the column is 297px and the calendar renders 300px, so it **overflows its own column by 3px**. The inline comment on that line reads `/* ← prevents calendar from shrinking */`, which is the behaviour being corrected.
- Design evidence:
  - `components/common/AvailabilityCalendar.tsx:111-113` — `width: "100%"`, then `maxWidth: 360`, `minWidth: 300`.
  - `components/booking/BookingDatePicker.tsx` — the calendar serving the same user task (choosing a booking date) on `/book` step 2. Its root carries **no** `maxWidth` and **no** `minWidth`; it fills its container.
  - Both calendars use an identical day grid: `gridTemplateColumns: "repeat(7,1fr)"` with `gap: 3` — `AvailabilityCalendar.tsx:159-160` and `:174`, `BookingDatePicker.tsx:145-146` and `:160`.
  - Rendered measurement at 1440px: hero day cell `43×35` (ratio 1.24) in a 322px grid; `/book` day cell `96×35` (ratio 2.73) in a 688px grid. The wide fluid treatment is already shipped for this task on `/book`, so it is the product's existing behaviour rather than a new direction.
- Owner: `components/common/AvailabilityCalendar.tsx` — the clamp lives on its root element.
- Scope and affected surfaces: `AvailabilityCalendar` has exactly one consumer — imported at `Home.tsx:14`, rendered at `Home.tsx:418`. The homepage hero is the only affected surface.
- Uncertainty: None for the measurements or the contradiction. Note the visible consequence stated under Validation: day cells widen toward the `/book` proportion. That is the intended result of matching the sibling, not a side effect to be corrected.

## Design decision

Delete the width clamp so the calendar fills the column its consumer gives it, exactly as `BookingDatePicker` already does for the same task.

This resolves the root problem rather than either symptom. The dead band on desktop and the 3px overflow on mobile are both caused by one thing — a component that declares itself fluid and is then pinned to a fixed band. Removing the clamp lets the `width: "100%"` and `repeat(7,1fr)` already present in the component govern at every width, which is what makes it responsive.

It is preferred over the alternative of narrowing the hero card to the calendar's fixed width, because that would invent a card width while leaving the component still unable to respond to its container, and would contradict the sibling calendar's contract.

## Reuse

- `width: "100%"` — already declared on the same element (`AvailabilityCalendar.tsx:110`)
- `gridTemplateColumns: "repeat(7,1fr)"`, `gap: 3` — already the component's day grid
- Exemplar: `components/booking/BookingDatePicker.tsx` — same task, same grid, no width clamp

No new primitive and no new value are required; this change only deletes two declarations.

## Changes

1. `components/common/AvailabilityCalendar.tsx:112-113`
   - Change: Remove `maxWidth: 360,` and `minWidth: 300,` from the root element's style object.
   - Preserve: Every other declaration on that element — `background: "rgba(10,10,10,0.98)"`, `border: "1px solid #2a2a2a"`, `borderRadius: 8`, `padding: "20px 18px"`, `width: "100%"`, `boxShadow: "0 16px 48px rgba(0,0,0,0.7)"`. Preserve all calendar content, labels, the legend, and the `onSelectDate` contract. No copy changes.
   - Verify: At 1440px the calendar's rendered width equals its column's width (548px) with zero slack on either side; at 390px the calendar's width is less than or equal to its column's width.

## Scope

- Inherit: The homepage hero reservations card — the only consumer.
- Verify: `/` at 390px, 768px, 900px, 1024px, 1440px and 1827px; both themes; the calendar's month navigation and date selection still work; no horizontal page overflow at any width.
- Exclude: `components/booking/BookingDatePicker.tsx` is the exemplar and already correct — do not change it. Do not adjust the hero card's `maxWidth: 900` or its left column's `flex: 0 0 250px` (`Home.tsx:311,328`); this plan deliberately leaves the card's own proportions alone.

## Validation

- Product: On `/`, a visitor can see the September calendar in the hero and click an open date to go straight into booking. That must still work unchanged.
- Interface: Route `/`. Widths 390, 768, 900, 1024, 1440, 1827. Both themes. Content extremes: a month whose grid needs six rows, and the narrowest supported width. Expect day cells to widen on desktop toward the `/book` calendar's proportion — that is the intended convergence with the sibling.
- System: Confirm no width clamp remains on the `AvailabilityCalendar` root, and that no compensating width was added to `Home.tsx` to offset the change.
- Repository: `grep -n "maxWidth: 360\|minWidth: 300" components/common/AvailabilityCalendar.tsx` → no matches. `npx tsc --noEmit` → no errors. `npx next build` → compiles successfully.

## Stop conditions

- Stop if `AvailabilityCalendar` gains a second consumer before this is applied — the clamp may then be serving a container this plan did not measure, and scope must be re-derived.
- Stop if `BookingDatePicker` acquires a width clamp, which would remove the exemplar this plan reuses.
- Stop if the hero card's column structure at `Home.tsx:417` changes from `flex: 1`, since the measured 548px column is the basis for the expected result.

## Design documentation

- After acceptance and validation: No design documentation exists in this repository to update. If one is created later, record the decision as "Calendars fill the container their consumer allocates; width is owned by the layout, not by the calendar component" in that document.
