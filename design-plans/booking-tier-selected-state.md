# Selection reads as one colour in the booking tier control

Written against: 2492652

## Evidence chain

- Surface: `components/sections/BookNow.tsx` — route `/book`, step 2 ("Pick Your Date & Details"), the "SHARED OR EXCLUSIVE?" segmented control inside the NUMBER OF GUESTS card.
- Problem: The control's two options express the *same* state — "this option is selected" — with two different accents. Selecting EXCLUSIVE turns the button gold; selecting SHARED turns it green. A person cannot learn a single visual rule for "chosen", because the answer depends on which option they chose.
- Design evidence:
  - `components/sections/BookNow.tsx:660-665` — the Day/Night segmented control, structurally identical to the tier control (`flex: 1`, `gap: 8`, `borderRadius: 8`, same `active ? … : cBr` shape), uses `gold` / `rgba(201,168,76,0.15)` / `C.textS` for **both** options.
  - `components/booking/BookingDatePicker.tsx:200` — `if (isSel) { bg = gold; col = "#000"; bdr = \`1px solid ${gold}\`; }`. The selected calendar date on the same screen is gold.
  - `components/sections/BookNow.tsx:820-822` — the tier control forks: `opt === "Exclusive" ? gold : "#4caf50"`. The Exclusive branch is byte-identical to the exemplar above; only the Shared branch departs.
  - `#4caf50` carries a different meaning everywhere else in this file — validation success and availability, at lines 615, 1001, 1024, 1031, 1035, 1072 ("✓ Valid", "✓ Valid email", a discount line). Lines 820/822 are the only place it expresses selection, so one green currently says both "your input is valid" and "this option is chosen".
  - Rendered: user-supplied screenshots of step 2 in both tiers show SHARED active with a green border and green label, EXCLUSIVE active with a gold border and gold label.
  - No counter-pairing exists: searching `Shared` beside any colour value in `BookNow.tsx` returns nothing, so green is not an established identity for the Shared tier.
- Owner: `lib/styles.ts` → `gold` (`#c9a84c`); `lib/theme.ts` → `T(isDark).textS`. The local `cBr` (`BookNow.tsx:453`) supplies the inactive border in both controls.
- Scope and affected surfaces: `components/sections/BookNow.tsx`, step 2 only. The control renders on `/book` whenever `resource !== "Venue"` and `slot !== "WholeDay"` (`BookNow.tsx:793`).
- Uncertainty: None. The exemplar, the owner and the departure are all in one file and one rendered step.

## Design decision

Make the tier control use the surface's existing selected-state treatment for both options, by deleting the per-option fork.

This resolves the root problem rather than a symptom: the defect is not that green is the wrong hue, it is that "selected" has two encodings in one control. Reusing the Day/Night control's treatment gives the whole step one rule — gold means chosen, for a date and for a tier alike — and simultaneously returns `#4caf50` to the single meaning it holds everywhere else in the file.

Which option is selected stays legible without colour: the two buttons already carry distinct icons (`lock` for Exclusive, `handshake` for Shared), distinct labels, the "(SUGGESTED)" suffix, and the explanatory paragraph beneath that changes with the tier (`BookNow.tsx:830-833`).

## Reuse

- `gold` from `lib/styles.ts`
- `rgba(201,168,76,0.15)` — the active background already used by the exemplar
- `C.textS` from `T(isDark)` — the inactive label colour
- `cBr` (`BookNow.tsx:453`) — the inactive border, already used by this control
- Exemplar: `components/sections/BookNow.tsx:660-665`

No new primitive is required; every value this change needs is already used by the sibling control in the same file.

## Changes

1. `components/sections/BookNow.tsx:820-822`
   - Change: Replace the three forked declarations with the exemplar's unforked form —
     `border: \`1px solid ${active ? gold : cBr}\``,
     `background: active ? "rgba(201,168,76,0.15)" : "transparent"`,
     `color: active ? gold : C.textS`.
   - Preserve: Every other property of the button (`flex: 1`, `padding: "8px 6px"`, `borderRadius: 8`, `cursor`, `fontSize: 11.5`, `fontWeight: 700`, `letterSpacing: 0.8`), the `lock`/`handshake` icons, the labels, the "(SUGGESTED)" suffix and its `isDefault` condition, the `onClick` handler, and the explanatory paragraph below. No copy changes.
   - Verify: With SHARED active, its border and label render `#c9a84c` and its background `rgba(201,168,76,0.15)`, matching EXCLUSIVE when that is active and matching the DAY/NIGHT control on step 1.

## Scope

- Inherit: The "SHARED OR EXCLUSIVE?" control on `/book` step 2 — the only consumer of these three lines.
- Verify: `/book` step 2 in both themes (`T(isDark)` supplies `C.textS` and `cBr` per theme), at mobile and desktop widths, with each tier active in turn, and with the tier control absent (`resource === "Venue"` or `slot === "WholeDay"`, which renders the EXCLUSIVE badge at `BookNow.tsx:794-796` instead).
- Exclude: `components/sections/Admin.tsx:524` carries the same fork in the admin walk-in form. It is a different surface and was not audited, so this plan deliberately leaves it unchanged; that surface keeps its current appearance. Do not treat the remaining fork there as an oversight of this plan.

## Validation

- Product: On `/book`, choose a tour type, reach step 2, and switch between SHARED and EXCLUSIVE. Selecting either option must be readable as "selected" by the same visual rule, and the booking must proceed unchanged.
- Interface: Route `/book`, step 2. States: SHARED active, EXCLUSIVE active, and the default-on-load state where `tierChoice === null`. Content extremes: the "(SUGGESTED)" suffix wraps SHARED onto a second line at narrow widths — confirm the change neither introduces nor removes that wrap. Viewports: 390px and 1200px. Themes: dark and light.
- System: Confirm the tier control now matches `BookNow.tsx:660-665` and `BookingDatePicker.tsx:200`, and that no new selected-state encoding was introduced. Confirm `#4caf50` no longer appears in any selected-state position in this file.
- Repository: `grep -n 'opt === "Exclusive" ? gold' components/sections/BookNow.tsx` → no matches. `npx tsc --noEmit` → no errors. `npx next build` → compiles successfully.

## Stop conditions

- Stop if the Day/Night control at `BookNow.tsx:660-665` no longer uses the unforked gold treatment — the exemplar this plan reuses would no longer exist, and the correct target would need re-deriving.
- Stop if a design source is introduced that assigns green to the Shared tier as a deliberate identity; the contradiction would then be resolved in the opposite direction.
- Stop if the change is asked to extend to `Admin.tsx:524` — that is a separate surface requiring its own audit.

## Design documentation

- After acceptance and validation: No design documentation exists in this repository to update. If one is created later, record the decision as "Selected state in segmented controls uses `gold` with `rgba(201,168,76,0.15)`; `#4caf50` is reserved for validation success and availability" in that document.
