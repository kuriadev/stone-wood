# Staff roles, caretaker tasks and self-updating inventory — design

Date: 2026-10-12 · Status: approved in chat, awaiting review of this file

## 1. Why

The alpha tester's verdict: with one shared admin login, StoneWood only made
the notebook prettier — the owner still does or checks everything, and
Inventory is a list nobody but a person ever changes. This change makes the
system **do the work the notebook, calendar and calculator used to need a
person for**, while staying inside the three capstone objectives:

| Objective | What this adds |
|---|---|
| 1. Sales monitoring | Every payment, refund and void says *who*; purchases of supplies become expenses automatically; front desk counts the drawer, owner approves. |
| 2. Facility management | Caretakers prepare, inspect (with photos) and clean from their phones; tasks are generated from bookings and an upkeep schedule; stock moves when they tick a task. |
| 3. Reservation management | Front desk runs the counter; actions that cost the owner money go to the owner as one-tap requests. Multi-day bugs fixed; guests reminded the day before. |

### What the user said (2026-10-12)

- Keep it StoneWood; "works for any resort" is argued on paper, backed by an
  owner-editable Settings screen. No multi-tenant, no per-resort installs.
- Staff: **Owner + Front desk + Caretaker(s)**. Each caretaker has a smartphone.
- The owner works full time and can do everything; some actions by others
  need a **request to the owner**. Facility checking belongs to caretakers.
- Owner-only: refunds and voiding payments; cancelling or deleting bookings;
  prices, packages, settings and staff accounts; approving the day's cash count.
- Inventory updates itself at three moments: scheduled upkeep (e.g. weekly
  pool cleaning), cleaning after a check-out, breakage found at inspection.
- Build everything now, in phases.

### Assumptions (correct these if wrong)

- The current admin username/password becomes the first Owner account.
- Supabase is in the partner's control: Claude writes migration files, the
  partner applies them. The app must keep working before they are applied.
- Package content stays the owner's ([packages-owner-controlled]); PayMongo
  code stays the partner's.
- Multi-day bookings stay "Whole Day only, 1–3 days" unless the user decides
  Day Tours may also run several days (open question, §10).

## 2. Scope

**In:** staff accounts and roles; owner requests; caretaker "My tasks";
upkeep schedule; stock history with automatic deductions, purchases and
counts; Settings for rates/discounts/hours/limits/contacts; the multi-day
fixes found on 2026-10-12; arrival reminders; Excel and PDF export.

**Out:** customer accounts, FAQ chatbot, AI photo analysis (photos are
evidence only), PayMongo webhook/fees, multi-tenant, overnight per-night
stays, a generic resource model.

## 3. Roles and permissions

One table in code, `lib/permissions.ts`, is the single source of truth:
`can(role, action)`. Every admin API route that today calls `requireAdmin`
(32 routes) calls `requirePermission(req, action)` instead, so the server —
not the screen — enforces it. The UI reads the same table to hide or
replace buttons.

| Action | Owner | Front desk | Caretaker |
|---|---|---|---|
| View Daily Operations, Bookings, Sales | ✅ | ✅ | — |
| Create/edit bookings, walk-ins, check-in/out, move, add a charge | ✅ | ✅ | — |
| Record a payment, settle a balance | ✅ | ✅ | — |
| Refund (record "guest chose refund", send refund) | ✅ | request | — |
| Void a payment | ✅ | request | — |
| Cancel (resort can't host) / delete / archive a booking | ✅ | request (archive: ✅) | — |
| Close the day | ✅ | submits count → owner approves | — |
| Approve/decline reschedules (owner's decision since 2026-10-07) | ✅ | view | — |
| Prepare, inspect, mark cleaned, upkeep tasks | ✅ | view | ✅ |
| Inventory: record use / breakage / count | ✅ | — | ✅ |
| Inventory: record a purchase | ✅ | ✅ | — |
| Inventory items, damage rates, upkeep schedule | ✅ | — | — |
| Prices, packages, Settings, staff accounts, site maintenance mode | ✅ | — | — |
| Customer service messages | ✅ | ✅ | — |
| Activity log | ✅ | own entries | own entries |

(Caretakers do not record purchases; the person who pays does.)

A caretaker signing in lands on **My tasks**; front desk on **Daily
Operations**; the owner on Daily Operations with the **Requests** panel on top.

## 4. Accounts and sign-in

- New table `staff`: `id uuid`, `name`, `username unique`, `role`
  (`Owner|FrontDesk|Caretaker`), `password_hash`, `password_salt` (scrypt,
  as `admin_credentials` already does), `active`, `created_at`,
  `last_login_at`.
- The session cookie keeps its HMAC signing, 8-hour cap and 30-minute idle
  rule; the payload gains `sid` (staff id) and `r` (role). A token without
  `r` (issued before this change, only ever to the single admin) is read as
  Owner until it expires.
- **Bootstrap, no data loss:** while `staff` is empty or missing, sign-in
  works exactly as today (`admin_credentials` row, else env vars) and the
  user is Owner. The first successful owner sign-in after the migration
  creates the Owner row from those credentials.
- Owner's **Staff** screen (in the Account area): add a person (name,
  username, role, temporary password), reset a password, deactivate.
  Deactivating ends that person's sessions at their next request. The last
  active Owner cannot be deactivated or demoted.
- Every activity-log line gets `staff_id`, `staff_name`; the `actor` column
  keeps `Admin|Guest|System` for old rows and reports.

## 5. Requests to the owner

- Table `owner_requests`: `id`, `kind`
  (`refund_choice|send_refund|void_payment|resort_cancel|delete_booking|close_day`),
  `booking_id`, `payment_id`, `payload jsonb` (what the action needs, e.g.
  the counted cash), `reason`, `status` (`Pending|Approved|Declined|Withdrawn`),
  `requested_by`, `requested_at`, `decided_by`, `decided_at`, `decision_note`.
- Front desk sees **Request …** where the owner sees the action itself, with a
  required reason. A booking with a pending request shows a badge; a second
  identical request is refused.
- The owner sees requests in Daily Operations (top panel + sidebar badge).
  **Approve** calls the same server function the owner's own button calls
  (the route handlers are refactored so the action lives in a function both
  can call); **Decline** needs a short note. Both are logged with both names.
- If the action fails on approval (e.g. the payment was already voided), the
  request stays Pending with the error shown, so nothing is silently lost.
- Close the day: front desk submits the count → a `close_day` request; the
  day shows "Counted by Ana, waiting for owner". The owner approving runs the
  existing closing logic. An owner closing it directly works as today.

## 6. Caretaker "My tasks"

A phone-first page at `/admin` for the Caretaker role (owner can open it too).
Tasks are **derived**, not typed in, so no background job is required:

| Task | When it appears | Done means | Existing record it writes |
|---|---|---|---|
| Prepare *facility* for *booking* | the day before the visit (server already enforces this) | checklist ticked | `facility_inspections` stage `Preparation` |
| Inspect at check-out | when front desk checks the group out | checklist, damage, **photos** | `facility_inspections` stage `Checkout`, `damage_records` |
| Clean *facility* | after a Checkout inspection leaves it Needs Cleaning | ticked, supplies used confirmed | facility back to Available + stock movements |
| Upkeep, e.g. "Pool cleaning" | per the owner's schedule (every N days / weekday) | ticked, supplies used confirmed | `upkeep_runs` + stock movements |

- **Upkeep schedule** (owner): table `upkeep_tasks` (`title`, `facility_id?`,
  `every_days`, `start_date`, `active`) with `upkeep_task_supplies`
  (`item_id`, `qty`). A task is due on `start_date + k·every_days`; an overdue
  one stays on the list (red) until done. `upkeep_runs` (`upkeep_task_id`,
  `due_date`, `done_by`, `done_at`, `note`) — unique per task and due date.
- **Cleaning supplies** per facility: `facility_cleaning_supplies`
  (`facility_id`, `item_id`, `qty`), defaults the owner sets once.
- On every "done" with supplies, the screen pre-fills the standard amounts;
  the caretaker can change them before confirming.
- **Photos** at inspection: compressed client-side with the existing
  `lib/image.ts`, stored as data URLs like room and refund-receipt photos,
  max 4 per facility. Shown on the booking for front desk and owner.
- Front desk's view: "Room 2 inspected by Ben — ₱500 damage added" appears
  on the booking; no one relays it.

## 7. Inventory that moves by itself

- Table `inventory_movements` (append-only, like the payments ledger):
  `id`, `item_id`, `delta numeric`, `reason`
  (`Used|Broken|Bought|Counted|Adjusted`), `ref_type`/`ref_id` (upkeep run,
  facility clean, damage record, expense), `unit_cost?`, `staff_id`, `note`,
  `at`. A database trigger applies `delta` to `inventory.qty` in the same
  insert, so the two can never disagree.
- `inventory` gains `kind` (`Supply|Equipment`); `damage_rates` gains
  `inventory_item_id?` so "1 monobloc chair broken" at inspection also writes
  a `Broken` movement for the chairs item.
- **Bought:** "Record purchase" (item, qty, total cost, paid by cash/GCash/
  bank) writes a `Bought` movement **and** an expense in Sales (category
  supplies) — one action, two records, linked.
- **Counted:** a physical count writes `Counted` with the difference, so
  drift is visible ("chlorine: system 22, counted 20, −2").
- **Low stock** (qty ≤ min) becomes a reminder in Daily Operations: "Buy
  Chlorine Tablets — 9 left, about 3 weeks at the current rate" (rate from
  the last 60 days of movements).
- Direct qty edits in the Inventory tab are replaced by these actions;
  editing an item's name/unit/minimum stays owner-only.
- Stock may go negative only with a visible warning (the caretaker used what
  was physically there; the count will correct it) — refusing would make
  them skip recording.

## 8. Settings (the "adaptable" part)

- One row in a new `business_settings` table (`data jsonb`, `updated_at`,
  `updated_by`), validated by a zod schema in `lib/schemas.ts`. Missing keys
  fall back to today's constants, so an empty row changes nothing.
- Editable: shared per-head rate, exclusive flat rate, venue rate, overtime
  rate and max hours, discounts (exclusive, bundle, room, multi-day), resort
  and shared capacity, max stay days, booking window months, slot hours,
  contact details.
- `priceBooking` and the capacity helpers take the rates as input instead of
  importing constants; the server loads settings once per request (cached
  60 s), the browser gets the public subset from `/api/settings`. Slot hours
  are the last item in the phase because `SLOTS` is read in many places.
- Package prices are untouched: they remain the owner's per-package numbers.

## 9. Also in this change

- **Multi-day fixes:** commit the guest-calendar `end_date` fix already in the
  working tree; single-slot packages get a one-date calendar and their
  Day/Night buttons clear a range; returning to one date restores the
  Day/Night slot; "Add a charge" prices a room/extra guests for every day of
  the stay; a pending reschedule of a multi-day stay protects all its days;
  the payment step offers "Choose another room/date" (refreshing
  availability) instead of only RETRY; "Complete" only from the stay's last
  day; day-closed email and reports count multi-day stays correctly.
- **Reminders:** "Tomorrow's arrivals" panel with one-tap text per guest
  (existing `smsHref`/`TextGuest`); an idempotent `reminders` run sends the
  day-before email, recorded in `bookings.reminded_at`, triggered when any
  staff opens Daily Operations (and by a cron if the site is deployed on a
  host that has one).
- **Exports:** Reports gets "Excel (.xlsx)" (Summary, Bookings, Payments,
  Expenses, Stock movements sheets, via `exceljs`) and "PDF" (the existing
  printable report, downloaded); CSV stays.

## 10. Open questions

1. May a Day Tour (or Night Tour) be booked for several consecutive days,
   with the guest going home in between? Default: no (Whole Day only).
2. Who receives the owner's request notifications besides the app badge —
   the existing admin email, or app only? Default: app badge + the existing
   admin notify email for refunds/voids/cancels only.
3. Should front desk also be allowed to approve guest reschedules? Default:
   no — the owner decides, as agreed on 2026-10-07.

## 11. Rollout, data safety, testing

- **Phases**, each usable alone, each ending with typecheck + unit tests +
  the user signing in to try it:
  1. Accounts, roles, permissions on every route, activity names, requests.
  2. Caretaker tasks, upkeep schedule, inventory movements, purchases, counts.
  3. Settings.
  4. Multi-day fixes, reminders, exports.
- **Migrations** are additive only (new tables/columns, a trigger), safe to
  run twice, one file per phase. The partner applies them in the Supabase
  SQL editor. Until then the code detects the missing table/column (the
  existing `missingNewColumn` pattern) and behaves as today: single owner
  login, no tasks/requests panels, manual inventory.
- **Tests (unit, jest):** permission table (every action × role); request
  approve/decline state machine; due-date generation for upkeep; derived task
  lists from bookings/inspections; stock arithmetic incl. counts and
  negative stock; purchase → movement + expense; pricing with settings
  overrides equals today's prices when settings are empty; each multi-day fix
  gets a failing test first.
- Claude does not sign in to the live admin or click actions there; the user
  tests each phase signed in ([admin-login-boundary]).
- Next.js in this repo has breaking changes: read the relevant guide in
  `node_modules/next/dist/docs/` before writing route or page code (AGENTS.md).

## 12. As built (2026-10-13)

All four phases are in the working tree (not committed). Typecheck clean,
189 unit tests passing, production build clean.

**Database updates — the partner applies these in the Supabase SQL editor,
in this order.** Until each is applied the app behaves as it did before it.

| File | Switches on |
|---|---|
| `20261012120000_staff_and_owner_requests.sql` | Staff accounts and roles, requests to the owner, names on the activity log |
| `20261012130000_tasks_and_stock_movements.sql` | Upkeep schedule, stock history, decimals, Supply/Equipment, breakage → stock, inspection photos, cleaning records |
| `20261012140000_business_settings.sql` | Saving Rates & Settings (the defaults work without it) |
| `20261012150000_guest_reminders.sql` | The automatic day-before email (the text reminders work without it) |

**Where it differs from the design above**

- Front desk cannot run the check-out inspection; it is the caretakers'
  (and the owner's). Front desk picks the stay up at "Balance to collect".
- Caretakers don't see the Dashboard or the bookings list (mostly money);
  they land on My Tasks and can open Facilities, Supplies, the calendar and
  their own activity.
- Activity: the owner sees everything (and can filter by person); others see
  their own lines, plus the full history of any booking they open.
- PDF: the existing printable report, saved with the browser's "Save as PDF"
  (button "Print / Save as PDF"); no PDF library was added. Excel uses
  `exceljs` (loaded only when exporting).
- A no-show is a cancellation, so front desk's no-show is a request too.
- Also fixed while there: both calendars treated only a stay's FIRST day as
  taken; every covered day now counts.
- 2026-10-13, after the user saw it: Supplies & Equipment is back to the
  original + / − screen. Each + / − is recorded in the stock history as an
  "Adjusted" line with the person's name, and front desk may use it too.
  The stock history, the upkeep schedule and the cleaning supplies moved to
  Facilities & Inspections (components/admin/StockSetup.tsx). "Buy" became
  "Add", with the cost optional.
- 2026-10-13, round 2: the owner's My Tasks shows only owner decisions
  (requests, reschedules, refunds owed, unclosed days, held online bookings,
  low stock) — caretaker work stays on the caretakers' list. Removing a stock
  item, removing or retiring a facility, and closing/reopening calendar
  dates are owner actions that front desk and caretakers send as requests.
  Inspections record who did them (facility_inspections.inspected_by_name,
  added to the stock migration) and their photos show on the stay record;
  front desk gets a damage badge and a live notice; the guest's page lists
  damage charges; archiving a guest message is logged; the owner can filter
  Activity History by person.
- 2026-10-13, round 3: front desk has its own My Tasks (collect, close the
  day, check in, walk-ins, inbox) and closes the day directly; the owner is
  told when a count is short or over. That task opens a cash count review
  (components/admin/CashCountReview.tsx, lib/cashReview.ts): the day's cash
  entries, who closed it, records whose amount is exactly the difference,
  and four ways to settle it — record a missed cash payment or expense on
  that day, correct the float or the count and save the closing again, or
  accept the difference with a note (activity action day.count_reviewed,
  owner only). No database change.
