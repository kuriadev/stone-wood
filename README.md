# StoneWood Private Resort

Booking and resort-management web application for **StoneWood Private Resort** — Angono, Rizal, Philippines.

Guests browse rooms and packages, check live availability, and reserve online with a scannable QR down payment. Staff run the resort from an admin dashboard: reservations, walk-ins, a booking calendar, rooms, packages, facilities, gallery, inventory, a sales ledger, analytics, customer messages, and a maintenance switch that can close the public site.

---

## Contents

- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Frontend architecture](#frontend-architecture)
- [Backend architecture](#backend-architecture)
- [API reference](#api-reference)
- [Database](#database)
- [Domain rules](#domain-rules)
- [External integrations](#external-integrations)
- [Conventions that are load-bearing](#conventions-that-are-load-bearing)

---

## Tech stack

### Platform

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js | 16.2.6 | App Router, Route Handlers, Turbopack dev server |
| UI runtime | React | 19.2.6 | Server Components for page shells, Client Components for all interactive sections |
| Language | TypeScript | 5.x | `strict` mode; path alias `@/*` → project root |
| Runtime | Node.js | 20+ | required by Next 16 |
| Hosting | Vercel | — | serverless Route Handlers |

### Frontend

| Concern | Library | Version | How it is used |
|---|---|---|---|
| Styling | Tailwind CSS | 4.3.3 | The styling system. Configured through `@tailwindcss/postcss`, **not** Vite. Preflight is on, with a compatibility bridge — see [Conventions](#conventions-that-are-load-bearing) |
| Class merging | `clsx` + `tailwind-merge` | 2.1.1 / 3.7.0 | wrapped by `cn()` in `lib/cn.ts` |
| Variants | `class-variance-authority` | 0.7.1 | variant definitions inside `components/ui/` |
| Animation utilities | `tw-animate-css` | 1.4.0 | enter/exit keyframes for Radix components |
| Component kit | shadcn/ui on Radix (`radix-ui`) | 1.6.7 | **25 components**, vendored as source in `components/ui/` — owned and edited here, not a dependency |
| Carousel | `embla-carousel-react` | 8.6.0 | powers `components/ui/carousel.tsx` only |
| Icons | `lucide-react` | 1.47.0 | never imported directly outside `components/ui/`; accessed through the registry in `components/common/Icon.tsx`. Outline only — the one `filled` usage is the rating star, where fill carries the value |
| Motion | `motion` | 13.4.3 | Framer Motion, renamed. Loaded as `LazyMotion` + `domAnimation` in `components/layout/Providers.tsx` (`strict`), so `drag`, `pan` and `layout` never ship. Feature code uses the two primitives in `components/common/` — `Reveal.tsx` and `Coverflow.tsx` — never `motion/react` directly |
| Forms | `react-hook-form` + `@hookform/resolvers` | 7.88.0 / 5.9.1 | Customer Service and Manage Booking. Book Now and the admin walk-in form use `useState` |
| Toasts | `sonner` | 2.0.8 | behind `contexts/ToastContext.tsx`; call sites use `useToast()` |
| Charts | `@mui/x-charts` (+ `@mui/material`, `@emotion/react`, `@emotion/styled`) | 9.14.0 / 9.4.0 / 11.x | admin analytics only, behind `components/admin/charts.tsx` |
| Dates | `dayjs` | 1.11.23 | behind `lib/dayjs.ts`; no raw `new Date(string)` parsing |

#### Design system

Not libraries — the three token files every component reads. Each is the single
place its kind of value is written.

| Token set | Lives in | Covers |
|---|---|---|
| Colour | `app/globals.css` (`--sw-*`) → `lib/theme.ts` (`T(isDark)`) | Every surface, border and text colour, in both themes. shadcn's names (`--background`, `--card`, …) are aliases of the same palette, so a hand-written style and a shadcn component cannot disagree |
| Spacing | `lib/spacing.ts` (`SPACE`, `TAP_MIN`) | A 4px grid. `app/globals.css` pins Tailwind's `--spacing` to `4px`, so `className="p-4"` and `padding: SPACE.md` are the same 16px |
| Type | `app/globals.css` | Satoshi via Fontshare, with the `html { font-size: 17px }` base that spacing is deliberately decoupled from |


### Backend

| Concern | Technology | Version | How it is used |
|---|---|---|---|
| API layer | Next.js Route Handlers | — | **36 endpoints** under `app/api/**/route.ts` |
| Database | Supabase (PostgreSQL) | — | 15 tables, Row Level Security enabled |
| DB client | `@supabase/supabase-js` | 2.116.0 | two clients: anon (browser-safe) and service-role (server only) |
| Schema validation | `zod` | 4.6.5 | `lib/schemas.ts`, layered over the primitives in `lib/validators.ts` |
| Email | `nodemailer` | 8.0.5 | Gmail SMTP; templates in `lib/emailTemplate.ts` |
| Payments | PayMongo REST | — | called directly from `lib/paymongo.ts`; no SDK |
| Auth | signed HTTP-only cookie | — | hand-rolled in `lib/auth.ts`; single admin account from env |
| Rate limiting | in-memory | — | `lib/rateLimit.ts`, applied to public write endpoints |

### How the stack fits together

A parts list does not say how a booking actually gets made. This is the whole
path, once, with the technology that owns each step.

```
Browser                         Vercel (Node)                  Supabase
───────                         ─────────────                  ────────
app/page.tsx                                                   
  Server Component shell
  └─ "use client" section ──┐
     React 19 + Tailwind    │
     contexts/AppContext ───┼── GET /api/rooms ──────────────▶ anon client
       (fetch on mount)     │   app/api/rooms/route.ts         RLS: public read
                            │                                         │
  Book Now (BookNow.tsx)    │                                         ▼
   ├─ lib/pricing.ts ◀──────┘   SAME module, both sides          rooms table
   │    pure, no React/fetch         │
   │    quotes the total             │
   │                                 ▼
   └─ POST /api/bookings ────▶ app/api/bookings/route.ts
                                 ├─ zod (lib/schemas.ts)   reject bad shape
                                 ├─ lib/rateLimit.ts       per-IP throttle
                                 ├─ lib/pricing.ts         re-quote server side
                                 ├─ service-role client ──────▶ bookings table
                                 │    bypasses RLS                 (insert)
                                 ├─ lib/paymongo.ts ──────▶ PayMongo REST
                                 └─ nodemailer ───────────▶ Gmail SMTP
                                      lib/emailTemplate.ts
```

Three things in that diagram are load-bearing:

**`lib/pricing.ts` runs on both sides.** The browser quotes the total to show
it; the Route Handler re-quotes it to charge it. Because it is the same pure
module with no React, no `fetch` and no database, the two answers cannot
diverge — which is why the purity rule is a rule and not a preference.

**There are two database clients.** The anon client runs in the browser and is
constrained by Row Level Security. The service-role client bypasses RLS
entirely and exists only inside Route Handlers; it is never `NEXT_PUBLIC_`.

**Validation happens server side regardless of the form.** `react-hook-form`
and `zod` give the guest immediate feedback, but the Route Handler re-validates
with the same schema. The client copy is a courtesy; the server copy is the
check.

### Data and state

| Kind of state | Where it lives | Why |
|---|---|---|
| Server data (rooms, packages, bookings) | `contexts/AppContext.tsx` via `useDbCollection` | One fetch per collection, shared by every section, polled for live admin views |
| Theme | `contexts/ThemeContext.tsx` → `sw-dark` / `sw-light` on `<html>` | A class, not React state, so CSS variables do the recolouring |
| Toasts | `contexts/ToastContext.tsx` over `sonner` | Call sites use `useToast()` and never import sonner |
| Form state | `react-hook-form` (Customer Service, Manage Booking) or `useState` (Book Now, walk-in) | The long booking flow is a wizard with cross-step rules, which RHF does not model more cleanly than plain state |
| Viewport | `hooks/useWidth.ts` | One resize listener, shared; `mob = w < 768` is the breakpoint everywhere |

There is deliberately **no Redux, Zustand or React Query**. The data set is
small, mostly read-through, and already shared through one context.

### Tooling

`eslint` 9 with `eslint-config-next` 15.3.1 · `@types/node` 20 · `@types/react` 19 · `@types/react-dom` 19 · `@types/nodemailer` 8.

**22 runtime dependencies, 9 dev dependencies.** No state-management library, no ORM, no CSS-in-JS runtime, no UI framework beyond the vendored shadcn source.

---

## Quick start

```bash
npm install
# create .env.local and fill in the variables listed below
npm run dev   # http://localhost:3000
```

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `next dev` | development server (Turbopack) |
| `npm run build` | `next build` | production build |
| `npm run start` | `next start` | serve the production build |
| `npm run lint` | `eslint` | lint (requires an `eslint.config.*` at the root — not currently committed) |

Database migrations live in `supabase/migrations/` and are applied with
`supabase db push`, or by pasting a file into the Supabase SQL editor. Every
migration is written to be safe to run twice.

---

## Environment variables

Set these in `.env.local` for development and in the Vercel project settings for
deployment. **`.env*` is gitignored and must stay that way.**

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | anon key (new-style name) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | anon key (legacy fallback) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | bypasses Row Level Security — never expose, never prefix with `NEXT_PUBLIC_` |
| `ADMIN_USERNAME` | server only | admin login |
| `ADMIN_PASSWORD` | server only | admin login |
| `SESSION_SECRET` | server only | signs the admin session cookie |
| `PAYMONGO_SECRET_KEY` | server only | PayMongo REST auth |
| `PAYMONGO_API_BASE` | server only | optional override of the API base URL |
| `GMAIL_USER` | server only | SMTP account for outbound mail |
| `GMAIL_APP_PASSWORD` | server only | Gmail app password |
| `NEXT_PUBLIC_APP_URL` | public | absolute base URL used in email links |

---

## Project structure

```
stonewood/
├── app/                              Next.js App Router
│   ├── layout.tsx                    root layout: fonts, Providers, ClientShell
│   ├── page.tsx                      home
│   ├── globals.css                   Tailwind entry + theme tokens + keyframes
│   ├── loading.tsx                   route-level skeletons (one per page)
│   ├── about/ · book/ · cancelbooking/ · customer/ · gallery/
│   ├── login/ · packages/ · rooms/ · admin/
│   └── api/                          25 Route Handlers — see API reference
│       ├── auth/login · auth/logout
│       ├── availability · bookings · bookings/[id] · bookings/[id]/cancel
│       ├── checkout · closed-dates · closings · customer-reply
│       ├── customer-service · damage-rates · email · expenses
│       ├── facilities · gallery · inspections · inventory
│       ├── maintenance · ops · packages · payment · payments
│       ├── rooms · seed
│
├── components/
│   ├── sections/                     full-page features (client components)
│   │   ├── Home.tsx                  landing page: hero, packages, testimonials
│   │   ├── BookNow.tsx               six-step guest booking flow
│   │   ├── RoomsPage.tsx · PackagesPage.tsx · PackageShowcase.tsx
│   │   ├── Gallery.tsx · About.tsx · HeroReservation.tsx
│   │   ├── CancelBooking.tsx         "Manage Booking" — lookup, reschedule, cancel
│   │   ├── CustomerService.tsx       contact form
│   │   ├── AdminLogin.tsx
│   │   └── Admin.tsx                 admin shell: tab routing, rooms, calendar, gallery
│   │
│   ├── admin/                        admin tabs and modals
│   │   ├── BookingsTab.tsx · SalesTab.tsx · ReportsTab.tsx
│   │   ├── PackagesTab.tsx · InventoryTab.tsx · FacilitiesTab.tsx
│   │   ├── MaintenanceTab.tsx
│   │   ├── WalkInModal.tsx           front-desk reservation
│   │   ├── RecordPaymentModal.tsx · InspectionModals.tsx
│   │   ├── PhotoSet.tsx              shared up-to-5 photo picker
│   │   ├── charts.tsx · ChartTheme.tsx   MUI X Charts wrappers
│   │   └── ui.tsx                    admin primitives: PageHead, TableShell, Pill, Figure…
│   │
│   ├── common/
│   │   ├── Icon.tsx                  the only lucide-react import
│   │   ├── Reveal.tsx                the only motion import
│   │   ├── MediaGallery.tsx          shared photo viewer (rooms, packages)
│   │   ├── AvailabilityCalendar.tsx  public availability grid
│   │   └── Skeleton.tsx              accessible loading skeletons
│   │
│   ├── layout/
│   │   ├── Providers.tsx             Theme → Toast → App context tree
│   │   ├── ClientShell.tsx           navbar/footer frame + route loading bar
│   │   ├── Navbar.tsx · Footer.tsx · ThemeToggle.tsx
│   │   ├── TopLoader.tsx · CursorDot.tsx
│   │   └── MaintenanceGate.tsx       blocks the public site when maintenance is on
│   │
│   └── ui/                           25 vendored shadcn/Radix components
│       alert · alert-dialog · badge · button · card · carousel · checkbox
│       dialog · dropdown-menu · input · label · native-select · popover
│       radio-group · scroll-area · select · separator · sheet · skeleton
│       sonner · switch · table · tabs · textarea · tooltip
│
├── contexts/
│   ├── AppContext.tsx                bookings, rooms, packages, facilities, inventory…
│   ├── OpsContext.tsx                sales ledger + facility records (admin only)
│   ├── ThemeContext.tsx              dark/light, React state (not persisted)
│   └── ToastContext.tsx              useToast() over Sonner
│
├── hooks/
│   ├── useDbCollection.ts            collection state synced to an API route
│   ├── usePublicAvailability.ts      read-only availability for guests
│   ├── useMaintenance.ts             polls the maintenance switch
│   └── useWidth.ts                   viewport width (drives `mob` breakpoints)
│
├── lib/
│   ├── supabase.ts                   clients + every row↔UI mapper
│   ├── collections.ts                collection definitions (key, load, sync)
│   ├── auth.ts                       cookie signing, requireAdmin()
│   ├── rateLimit.ts                  in-memory limiter for public writes
│   ├── schemas.ts                    zod schemas
│   ├── validators.ts                 sanitisers, validators, rates and caps
│   ├── pricing.ts                    priceBooking(), the single pricing rule set
│   ├── bookingQuote.ts               server-side quote + availability gate
│   ├── resort.ts                     SLOTS, turnover window, quiet hours
│   ├── finance.ts                    bookingMoney(), ledger maths
│   ├── ledger.server.ts              server-only ledger reads
│   ├── inspection.server.ts          server-only inspection writes
│   ├── occupancy.ts · facilityUsage.ts · money.ts
│   ├── paymongo.ts                   QR payment REST calls
│   ├── mailer.ts · emailTemplate.ts  Gmail SMTP + HTML templates
│   ├── theme.ts                      T(isDark) → colour tokens
│   ├── styles.ts                     goldBtn / outBtn — the shared button look
│   ├── gallery.ts                    gallery mosaic spans + roomShots()
│   ├── utils.ts · dayjs.ts · cn.ts · img.ts · escapeHtml.ts · constants.ts
│
├── types/                            booking · room · package · facility
│                                     inventory · maintenance · finance
│                                     admin · database (DB row shapes)
│
├── supabase/migrations/              8 SQL migrations, timestamp-ordered
│
├── next.config.ts · tsconfig.json · postcss.config.mjs · components.json
└── package.json
```

---

## Frontend architecture

### Rendering model

Each route under `app/` is a thin Server Component that renders one client
section from `components/sections/`. The interactive surface is client-side:
the booking flow, the admin dashboard and every form are Client Components.
`app/layout.tsx` wraps everything in `Providers` (theme → toast → app state)
and `ClientShell` (navbar, footer, route-change loading bar).

Every page has a sibling `loading.tsx` rendering an accessible skeleton from
`components/common/Skeleton.tsx`.

### State and data flow

| Context | Holds | Loaded when |
|---|---|---|
| `AppContext` | bookings, rooms, packages, facilities, inventory, customer messages, closed dates | on mount; admin-only collections wait for `adminAuth` |
| `OpsContext` | payments, expenses, closings, damage rates, inspections, damage records | admin only; polls `/api/ops` every 20s while the tab is visible |
| `ThemeContext` | `isDark` | React state, **not** persisted |
| `ToastContext` | `useToast()` | wraps Sonner |

Collections go through `hooks/useDbCollection.ts`, which pairs a localStorage
cache key with a `load` and a `sync` function declared in `lib/collections.ts`.
Guests never load admin collections: `usePublicAvailability` fetches only what
the availability calendar needs.

### Styling

Three layers coexist, but they share one set of values.

1. **Tailwind utility classes** — the system going forward.
2. **Theme tokens** — `T(isDark)` in `lib/theme.ts` returns the colour set
   (`textH`, `textB`, `textS`, `border`, `bgCard2`, `goldInk`…) as `var(--sw-*)`
   references. The palette itself is authored once, in `app/globals.css`;
   shadcn's names (`--background`, `--card`, …) are aliases of it. Nothing is
   duplicated, so a colour is changed in exactly one place.
3. **Inline `style={{}}`** — still widespread in `sections/` and `admin/`,
   being converted file by file.

#### Spacing

Every gap, pad and margin is a multiple of **4px**. The named steps and what
each is for live in `lib/spacing.ts`; a literal already on the grid is fine as
written.

`app/globals.css` pins Tailwind's `--spacing` to `4px`. This matters: Tailwind
sizes spacing in rem, and because this app sets `html { font-size: 17px }` for
reading comfort, one step used to be 4.25px — so `p-4` came out at 17px next to
a hand-written `padding: 16` that was exactly 16. The two systems were on two
grids. They are now on one, and `className="p-4"` equals `padding: SPACE.md`.

Spacing is px on purpose while type stays in rem: text should grow with the
reader's font-size setting, a gap between two cards should not.

Anything tappable clears **44px** (`TAP_MIN` in `lib/spacing.ts`), bought with
padding rather than size wherever the control should still look small.

Two deliberate exceptions: `lib/emailTemplate.ts` and the print stylesheet in
`components/admin/ReportsTab.tsx` render in a mail client and the print dialog,
so their spacing is left as it was. Browser default margins on `<p>` and
`<h*>` are em-based and therefore off the grid — that is a consequence of
preflight being off (see the note at the top of `app/globals.css`).

Shared visual constants live in `lib/styles.ts`: `goldBtn` and `outBtn` are the
two button looks used across the app. Call sites add layout (`flex`, `width`)
or state (`opacity`, `cursor`) only — never new geometry or typography.

---

## Backend architecture

### Route handlers

All endpoints are Next.js Route Handlers in `app/api/**/route.ts`, each
`export const dynamic = "force-dynamic"`. A typical handler:

1. `requireAdmin(req)` for protected routes — returns a 401 response or `null`.
2. Parses and validates the body (zod schema, or a hand-rolled `validate()`
   helper; both reject before touching the database).
3. Calls Supabase through the service-role client.
4. Maps rows to UI shapes with the mappers in `lib/supabase.ts`.
5. Returns `{ success: true, … }` or `{ success: false, error }`.

### Authentication

Single admin account. `POST /api/auth/login` compares credentials against
`ADMIN_USERNAME` / `ADMIN_PASSWORD` and sets an HTTP-only, signed session
cookie (`SESSION_SECRET`, `Secure` outside development). `requireAdmin()` in
`lib/auth.ts` verifies the signature on every protected route. Guests are never
authenticated — booking lookups are gated on reference + matching email.

### Data access

`lib/supabase.ts` exports two clients and all row mappers:

- **anon client** — browser-safe, respects Row Level Security.
- **service-role client** (`getSupabaseAdmin()`) — **bypasses RLS entirely**,
  so it is only ever constructed inside Route Handlers.

Mappers translate snake_case DB rows to camelCase UI types in one place
(`rowToBooking` / `bookingToRow`, `rowToRoom` / `roomToRow`, …), so column names
never leak into components.

### What the publishable key can do

The Supabase publishable key ships inside the JavaScript bundle. Anyone can
read it out of DevTools, so the question is not whether it leaks — it is what
it is allowed to do when it does.

Row Level Security is on for every table, and this was checked against the
live database with the public key over PostgREST, not inferred from the
migrations:

| Tables | Public key can |
|---|---|
| `rooms`, `gallery`, `closed_dates`, `packages`, `site_settings` | read (marketing content and the maintenance banner) |
| `bookings`, `customer_messages`, `payments`, `expenses`, `daily_closings`, `inventory`, `activity_log`, `date_change_requests`, `admin_credentials`, `facility_inspections`, `damage_records` | nothing — every read returns no rows |

`bookings` and `customer_messages` used to also carry `for insert with check
(true)`, which let the public key write rows straight into them over
PostgREST — bypassing the server-side quote, the availability check, the rate
limit and the payment intent. A forged row could have claimed `Confirmed` on
any date for any amount. Both policies are dropped in
`20261005120000_close_public_writes.sql`; guests still book through
`POST /api/bookings`, which uses the service-role client and is unaffected by
RLS.

If you ever need the browser to write directly to a table, that is the moment
to stop and add a Route Handler instead.

### Server-only modules

Files suffixed `.server.ts` (`lib/ledger.server.ts`, `lib/inspection.server.ts`)
must never be imported from a client component.

### Pricing is computed twice, deliberately

`lib/pricing.ts` is pure — no React, no database, no network. The browser runs
it to show a breakdown, and the server runs the same function in
`/api/payment` and `/api/bookings` to decide what is actually charged. A total
edited in DevTools changes nothing.

---

## API reference

Access column: **public** = no auth, **admin** = signed session cookie required,
**guest** = authorised by booking reference + email.

| Endpoint | Methods | Access | Purpose |
|---|---|---|---|
| `/api/auth/login` | POST | public | verify credentials, set session cookie |
| `/api/auth/logout` | POST | admin | clear the session cookie |
| `/api/availability` | GET | public | dates, rooms and capacity already taken |
| `/api/bookings` | GET / POST | admin / mixed | list bookings; create a booking |
| `/api/bookings/[id]` | GET / PATCH / DELETE | guest / admin | one booking; update; delete |
| `/api/bookings/[id]/cancel` | POST | guest | guest cancels their own booking |
| `/api/rooms` | GET / POST / PATCH / DELETE | public / admin | room CRUD |
| `/api/packages` | GET / POST / PATCH / DELETE | public / admin | package CRUD |
| `/api/gallery` | GET / PUT | public / admin | ordered image URLs; replace the list |
| `/api/closed-dates` | GET / POST / DELETE | public / admin | close and reopen dates |
| `/api/maintenance` | GET / PATCH | public / admin | site-wide maintenance switch |
| `/api/customer-service` | GET / POST | admin / public | list messages; submit one |
| `/api/customer-reply` | POST | admin | email a reply to a customer |
| `/api/email` | POST | admin | booking confirmation or rejection email |
| `/api/payment` | POST / GET | public | mint a payment QR; poll its status |
| `/api/payments` | POST / PATCH | admin | record money received; void with a reason |
| `/api/expenses` | POST / PATCH | admin | record money spent; void with a reason |
| `/api/closings` | POST | admin | liquidate one day |
| `/api/ops` | GET | admin | the whole sales ledger and facility records |
| `/api/inventory` | GET / POST / PATCH / DELETE | admin | inventory items (soft delete) |
| `/api/facilities` | GET / PATCH | admin | facility status |
| `/api/inspections` | POST | admin | save a preparation check |
| `/api/damage-rates` | POST / PATCH | admin | damage price list |
| `/api/checkout` | POST | admin | inspect, charge and check a group out |
| `/api/seed` | POST | admin | copy starter content into Supabase |

---

## Database

Supabase PostgreSQL with Row Level Security on every table. Writes go through
the service-role client in Route Handlers, so policies protect direct access
rather than the app's own traffic.

### Tables

| Table | Holds |
|---|---|
| `bookings` | every reservation, online and walk-in |
| `rooms` | bookable rooms, including a `gallery` of up to 5 image sources |
| `packages` | fixed-price packages with their own `gallery` |
| `facilities` | pool, venue and room status for operations |
| `inventory` | stock items, soft-deleted |
| `gallery` | ordered public gallery images |
| `closed_dates` | dates the resort is closed |
| `customer_messages` | contact-form submissions |
| `site_settings` | maintenance switch and site-wide flags |
| `payments` | money received — the source of truth for all sales figures |
| `expenses` | money spent |
| `daily_closings` | end-of-day liquidation records |
| `damage_rates` | price list for damaged items |
| `facility_inspections` | preparation and checkout inspections |
| `damage_records` | damages charged to a booking |

### Migrations

Applied in timestamp order:

| File | Adds |
|---|---|
| `20260922122504_init_schema.sql` | rooms, bookings, inventory, customer_messages, closed_dates, gallery |
| `20260923090000_menu_facilities_packages.sql` | facilities, packages (and menu_items) |
| `20260923130000_remove_food.sql` | drops menu_items and the food package — the resort does not sell food |
| `20260923140000_booking_integrity.sql` | booking constraints |
| `20260924090000_slots_and_packages.sql` | slot model and package fields |
| `20260925120000_site_settings.sql` | site_settings |
| `20260926120000_sales_and_facility_ops.sql` | payments, expenses, daily_closings, damage_rates, facility_inspections, damage_records |
| `20260928120000_room_gallery.sql` | `rooms.gallery` |

---

## Domain rules

### Slots

Defined once in `lib/resort.ts`; every page reads from there.

| Slot | Hours | Spans |
|---|---|---|
| Day Tour | 7:00 AM – 5:00 PM | 1 slot |
| Night Tour | 7:00 PM – 12:00 AM | 1 slot |
| Whole Day | 7:00 AM – 12:00 AM | 2 slots |

5:00–7:00 PM is the turnover window. Quiet hours begin at 10:00 PM. A Day
booking with overtime also occupies the Night slot.

### Resources and tiers

- **Resource**: `Pool`, `Venue` (events hall alone), or `Pool+Venue`.
- **Tier**: `Shared` (other same-day Shared bookings allowed) or `Exclusive`
  (whole-resort buyout for that date). The venue is **always** exclusive.

### Rates

Set in `lib/validators.ts`, applied by `lib/pricing.ts`.

| Item | Rate |
|---|---|
| Pool, Shared | ₱200 per guest, per slot (not offered for Whole Day) |
| Pool, Exclusive | ₱6,000 per slot |
| Events Venue | ₱5,000 per slot, always exclusive |
| Room | its own rate, per slot |
| Day overtime | ₱500/hr, maximum 2 hours, admin only |

Discounts never stack on the same part of the price:

| Discount | When |
|---|---|
| 5% | Exclusive pool, one slot, nothing bundled |
| 10% | Whole Day, or exclusive pool + venue — replaces the 5% |
| 8% | A room booked as part of a package |

Worked examples: Whole Day ₱12,000 → **₱10,800**; pool + venue one slot
₱11,000 → **₱9,900**; pool + venue Whole Day ₱22,000 → **₱19,800**.

### Other caps

`RESORT_MAX_CAPACITY` 30 guests · `GALLERY_MAX` 5 photos per room or package ·
`OVERTIME_MAX` 2 hours.

### Payment states

`lib/finance.ts` derives each booking's standing from the payments ledger, not
from the booking total: **Paid in full**, **Partially paid**, **Unpaid**, or
**Forfeited** (cancelled after paying — the deposit is kept under the no-refund
policy and nothing further is owed).

---

## External integrations

### PayMongo

Called directly over REST from `lib/paymongo.ts` — no SDK. Booking down
payments use **QRPh**, which is scannable by GCash and other Philippine
banking apps.

> **Live-mode note:** GCash as a named payment method is not available on the
> account's business type, which is why the flow uses QRPh rather than a GCash
> source.

### Gmail SMTP

`lib/mailer.ts` sends through Gmail using an app password. Templates live in
`lib/emailTemplate.ts`: booking confirmation, rejection, cancellation and
customer replies.

---

## Conventions that are load-bearing

These are not style preferences. Breaking one causes a real bug.

**Preflight is on, behind a bridge.** It used to be off, because the app
predates Tailwind and was laid out against browser defaults — turning the
reset on moved 130 computed styles, collapsed heading margins and took 80px
off the home page. It is on now. What makes that safe is the **SW PREFLIGHT
BRIDGE** block in `app/globals.css`: it restates the handful of UA defaults
this app actually depends on (`line-height: normal`, heading weight and
em-margins, paragraph margins, list markers and indent, the UA control
font-size, button padding, baseline-aligned media).

The bridge sits in `@layer base` *after* the preflight import, so it wins
inside that layer and every utility still outranks it — a rule there only
reaches an element that declares nothing itself. Nothing in it was guessed:
each block exists because a computed style moved in a captured before/after
of **3,235 elements across 9 pages in both themes**. With the bridge in
place that diff is down to `border-style` on zero-width borders and a
0.00001px rounding difference, and every page height is identical.

If you add a rule there, measure first. If you remove one, measure after.

**Inline `style` beats every Tailwind class.** A component that sets
`padding` inline overrides `pr-9` from a utility class, which is exactly how
select chevrons ended up overlapping their values. When a shared style object
sets a shorthand, override it explicitly at the call site.

**There are two golds.** `gold` in `lib/styles.ts` is the bright brand colour,
correct on photos and dark overlays. `C.goldInk` from `T(isDark)` is the
theme-following one, correct for text on page backgrounds. Using `gold` for
body text fails contrast in light mode.

**Colours must be declared for both themes.** Any hard-coded light or dark
hex needs an `isDark` branch — a pale red that reads on a dark card drops to
roughly 3:1 on a white one.

**`lib/pricing.ts` stays pure.** No React, no fetch, no database. It runs in
both the browser and the server, and that is what keeps the displayed total
and the charged total identical.

**Icons and motion have one entry point each.** Import `Icon` from
`components/common/Icon.tsx` rather than `lucide-react`. For animation, use a
primitive from `components/common/` — `Reveal.tsx` to fade a block in,
`Coverflow.tsx` for the 3D deck — rather than `motion/react` directly. This is
enforced, not just asked for: `Providers.tsx` wraps the app in
`<LazyMotion strict>`, so a stray `motion.*` throws instead of quietly pulling
the full feature bundle back into the download. Inside those primitives, use
`m.*`.

**Icons are outline, at one weight per size.** The registry is Lucide's
outline set; `filled` exists for exactly one case, the rating star, where the
fill is carrying the value rather than decorating it. A filled glyph dropped
into an outline row is the fastest way to stop looking like one icon set.

**The testimonial marquee sizes itself.** The track holds a set of reviews
twice and slides exactly one set's width. `Home.tsx` repeats the three real
reviews until one set is wider than the viewport, because a set narrower than
the screen leaves a visible gap before the loop restarts.

**The service-role key bypasses RLS.** It belongs in Route Handlers only, and
must never carry a `NEXT_PUBLIC_` prefix.
