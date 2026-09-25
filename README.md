# StoneWood Private Resort

Booking and resort-management web app for **StoneWood Private Resort** — Angono, Rizal, Philippines.

Guests browse rooms and packages, check live availability, and book online with a GCash-scannable QR down payment. Staff run the resort from an admin dashboard: reservations, walk-ins, live occupancy, rooms, packages, facilities, gallery, inventory, analytics, customer messages, and a maintenance switch that can close the public site.

---

## Stack at a glance

```
Framework    Next.js 16.2.6 (App Router, Route Handlers, Turbopack) · React 19.2.6 · TypeScript 5.9.3
Database     Supabase — PostgreSQL + Row Level Security           @supabase/supabase-js 2.116.0
UI kit       shadcn/ui on Radix — 17 components in components/ui/ radix-ui 1.6.7
Styling      Tailwind CSS 4.3.3 — utilities only, NO preflight    + app/globals.css + legacy inline styles
             cva 0.7.1 · clsx 2.1.1 · tailwind-merge 3.7.0 · tw-animate-css 1.4.0 · cn() in lib/cn.ts
Icons        lucide-react 1.47.0                                  behind components/common/Icon.tsx
Animation    motion 13.4.3 (Framer Motion, renamed)               behind components/common/Reveal.tsx
Dates        dayjs 1.11.23                                        behind lib/dayjs.ts
Validation   zod 4.6.5                                            lib/schemas.ts, on top of lib/validators.ts
Forms        react-hook-form 7.88.0 + @hookform/resolvers 5.9.1    partial — 2 of 5 forms migrated
Toasts       sonner 2.0.8                                         repointed to the app's ThemeContext
Charts       @mui/x-charts 9.14.0 (+ @mui/material, @emotion/*)    behind components/admin/charts.tsx
Email        nodemailer 8.0.5 over Gmail SMTP
Payments     PayMongo QRPh via direct REST — no SDK
Hosting      Vercel
```

**21 runtime dependencies, 9 dev.** shadcn components are *copied source* in
`components/ui/`, not a dependency — you own and edit them.

Migration in progress: the UI is moving from inline `style={{}}` to Tailwind +
shadcn. Both exist side by side for now. Read [Tailwind and shadcn](#tailwind-and-shadcn)
before touching styles — the preflight and layering decisions there are not
preferences, they are load-bearing.

## Read this first if you last worked on this repo a while ago

Several things changed that will break your mental model of the codebase. Skimming this section will save you an hour of confusion.

### The database is Supabase now, not MongoDB

`models/`, `lib/mongoose.ts` and every Mongoose schema are **gone**. All data lives in Supabase (PostgreSQL) and is reached through the API routes in `app/api/`. If you still have `MONGODB_URI` in your `.env.local`, it does nothing.

### Admin credentials are server-side now

They used to live in `ADMIN_CREDS` in `lib/constants.ts`, which meant **they shipped in the browser bundle**. Login now posts to `/api/auth/login`, which compares against `ADMIN_USERNAME` / `ADMIN_PASSWORD` on the server and sets an HMAC-signed, `httpOnly` session cookie (`lib/auth.ts`, 8-hour TTL). Treat any password that was in the old bundle as burned.

### Tailwind is uninstalled

No `tailwind.config`, no PostCSS plugins, no CSS modules. Styling is `app/globals.css` plus inline `style={{}}` objects, with colours from `T(isDark)` in `lib/theme.ts` and the gold accent from `lib/styles.ts`. Adding a `className="flex gap-4"` will silently do nothing.

### Hooks and components were renamed or deleted

Gone: `useAdmin`, `useBooking`, `useReveal`, `useScrollReveal`, `useTheme`, `useToast`, `PageTransition.tsx`, `Stars.tsx`, `AppShell.tsx`, `types/index.ts`, `InventoryTab.module.css`. Use `useTheme()` from `contexts/ThemeContext`, `useToast()` from `contexts/ToastContext`, and import types from their specific file (`types/booking.ts`, not `types/index.ts`).

### Icons come from one registry

All icons are `lucide-react`, used through `components/common/Icon.tsx` (`<Icon name="calendar" />`). It falls back to a default glyph for unknown names, because some icon names come from the database and `<undefined />` crashes React. Don't import from `lucide-react` directly.

### Two booking rules that are easy to get backwards

- **Exclusive is a whole-DATE buyout.** An Exclusive pool booking blocks both the Day and the Night slot. Shared bookings stay per-slot — a Shared Day group never blocks the Night, and Shared groups stack to `RESORT_SHARED_CAPACITY` (30) within a slot.
- **Rooms are day-use, not overnight.** A room is an add-on to a tour slot; the guest leaves when the slot ends, and the 5–7 PM gap is room turnover. `Booking` has a single `date` and no checkout date, so an overnight stay has nowhere to be recorded.

Both rules live in `checkPoolCapacity` / `lib/occupancy.ts`, and both files carry a comment explaining why — read those before changing either.

### The "Why Choose" cards on /about are static

They used to expand on tap. They no longer do — the details are always
visible and the cards respond only to hover, so nothing below them (the map)
can shift when a visitor interacts with them.

### Maintenance mode exists

Admin → **SITE → Maintenance** closes the public site behind a full-screen notice over a blurred homepage. `/login` and `/admin` are never gated, and a signed-in admin is never gated, so you cannot lock yourself out.

---

## Tech stack

Twenty-one runtime dependencies, nine dev. The list is short on purpose — check *Written by hand* and *Not used* below before reaching for another library.

### Runtime

| Package | Version | What it does here |
| --- | --- | --- |
| `next` | 16.2.6 | App Router, Route Handlers, Turbopack dev/build |
| `react` / `react-dom` | 19.2.6 | UI |
| `@supabase/supabase-js` | 2.116.0 | PostgreSQL access from the API routes |
| `nodemailer` | 8.0.5 | confirmation / rejection email over Gmail SMTP |
| `lucide-react` | 1.47.0 | every icon, via `components/common/Icon.tsx` |
| `motion` | 13.4.3 | all animation. **This is Framer Motion** — it was renamed; import from `motion/react`, not `framer-motion`. Scroll reveals go through `components/common/Reveal.tsx`; reduced motion is handled by `<MotionConfig reducedMotion="user">` in Providers, never by branching on `useReducedMotion()` in a component (that is an SSR/hydration bug) |
| `dayjs` | 1.11.23 | all wall-clock date parsing, formatting and arithmetic, via `lib/dayjs.ts` (strict `customParseFormat`). Instants — `archivedAt`, `lastCheckedAt` — stay on `toISOString()`, where UTC is correct |
| `react-hook-form` + `@hookform/resolvers` | 7.88.0 / 5.9.1 | form state and submission, with `zodResolver` running the schemas from `lib/schemas.ts`. **Migrating form by form** — `CustomerService` and the `CancelBooking` lookup are done; `AdminLogin` (left for NextAuth), `BookNow` and the Admin walk-in form are still on `useState` |
| `tailwindcss` + `@tailwindcss/postcss` (dev) | 4.3.3 | utilities only — preflight is deliberately excluded |
| `radix-ui` | 1.6.7 | the primitives under shadcn's interactive components |
| `class-variance-authority` · `clsx` · `tailwind-merge` · `tw-animate-css` | — | shadcn's styling runtime; `cn()` lives in `lib/cn.ts` |
| `sonner` | 2.0.8 | toasts, repointed from `next-themes` to this app's `ThemeContext` |
| `zod` | 4.6.5 | request validation, via `lib/schemas.ts`. Built **on top of** `lib/validators.ts` rather than restating its rules — the predicates there stay the single source of truth, Zod supplies shape, coercion and messages |
| `@mui/x-charts` | 9.14.0 | the bar charts and sparklines in Reports and Analytics, behind the existing `BarChart` / `Sparkline` wrappers in `components/admin/charts.tsx`. Themed by `components/admin/ChartTheme.tsx`, which bridges MUI to `lib/theme.ts` — a chart dropped in unthemed renders Material blue on light grey |
| `@mui/material` + `@emotion/react` + `@emotion/styled` | 9.4.0 / 11.14.x | peer dependencies of `@mui/x-charts`. **Charts only** — not the app's UI kit |

### Dev

| Package | Version |
| --- | --- |
| `typescript` | 5.9.3 (strict) |
| `eslint` + `eslint-config-next` | 9.39.4 / 15.3.1 |
| `@types/node`, `@types/react`, `@types/react-dom`, `@types/nodemailer` | — |

Built and tested on **Node 24 / npm 11**. There is no `engines` field, so anything Next 16 supports (Node 18.18+) should work.

### Services

| Service | Used for |
| --- | --- |
| **Supabase** | PostgreSQL, Row Level Security, SQL editor for migrations |
| **PayMongo** | QRPh payment intents for the 50% down payment |
| **Gmail SMTP** | outbound mail, via an app password |
| **Google Maps** | embedded map on `/about` (plain iframe, no API key) |
| **Vercel** | hosting, CI on push |

### Written by hand, not installed

These are things a newcomer would reasonably expect to be dependencies. They aren't:

| Concern | How it's done here |
| --- | --- |
| Styling | `app/globals.css` + inline `style={{}}`; colours from `T(isDark)` in `lib/theme.ts` |
| State management | React Context — `contexts/AppContext.tsx`, no Redux/Zustand/Jotai |
| Data fetching | `hooks/useDbCollection.ts` + `lib/collections.ts`, no React Query/SWR |
| Auth | `lib/auth.ts` — Node `crypto`, HMAC-signed `httpOnly` cookie, no NextAuth |
| Payments | direct REST to PayMongo in `lib/paymongo.ts`, no SDK |

### Not used — do not add without discussing

- ~~Tailwind CSS~~ — **re-adopted** for the shadcn/ui migration. See *Tailwind and shadcn* below before using it.
- **MongoDB / Mongoose** — replaced by Supabase. `models/` and `lib/mongoose.ts` are deleted.
- **CSS Modules** — none remain.
- **MUI as a UI kit.** `@mui/material` is installed only because `@mui/x-charts` requires it. Charts only — shadcn/ui is the UI kit.
- **`framer-motion`** (the old package name). Use `motion` and import from `motion/react`; installing both would ship two copies.

**Why QRPh and not GCash:** PayMongo's `gcash` method is a redirect flow and is inactive on this account's business type. `qrph` returns a unique QR per payment intent, which the booking screen displays — and the GCash app scans it, since QRPh is the Philippine national QR standard. See the comment at the top of `lib/paymongo.ts`.

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

You also need a `.env.local`. It is gitignored and there is **no `.env.example`** — ask the project owner for values, and never commit real keys. **This repository is public.**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # sb_publishable_… (newer projects)
SUPABASE_SERVICE_ROLE_KEY=          # server only — bypasses RLS entirely

# Admin login
ADMIN_USERNAME=
ADMIN_PASSWORD=
SESSION_SECRET=                     # must be at least 32 characters or login returns 503

# Email (Gmail app password, not your account password)
GMAIL_USER=
GMAIL_APP_PASSWORD=

# Payments
PAYMONGO_SECRET_KEY=
PAYMONGO_API_BASE=                  # optional, defaults to PayMongo production

# Misc
NEXT_PUBLIC_APP_URL=                # used in emails for absolute links
```

`lib/supabase.ts` reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` first and falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the older `eyJ…` JWT some projects still issue), so either works — you don't need both.

If the app starts but login fails and the calendar is empty, your `.env.local` is missing or incomplete — the server logs say exactly which variable is unset.

### Database migrations

SQL lives in `supabase/migrations/`, applied **by hand** in the Supabase SQL editor — there is no migration runner wired up. Run them in filename order:

```
20260922122504_init_schema.sql
20260923090000_menu_facilities_packages.sql
20260923130000_remove_food.sql
20260923140000_booking_integrity.sql
20260924090000_slots_and_packages.sql
20260925120000_site_settings.sql       # maintenance mode
```

They are written to be safely re-runnable (`create table if not exists`, `drop policy if exists` before each `create policy`). All six are applied to the shared project as of this writing.

---

## How data flows

Everything reads and writes through `app/api/*`, never from the browser to Supabase directly.

- **`contexts/AppContext.tsx`** is the single client-side store — rooms, packages, gallery, bookings, facilities, inventory, closed dates, customer messages, maintenance state.
- **`hooks/useDbCollection.ts`** backs most of those. It keeps the old `[state, setState]` shape, so the ~35 call sites that do `setX(p => [...p, y])` did not change. It diffs the previous array against the next one and issues the right POST/PATCH/DELETE via `lib/collections.ts`. `localStorage` is a first-paint cache only.
- **Guests never load the admin collections.** `bookings` and `facilities` are admin-only; signed-out visitors get a trimmed, read-only view from `/api/availability` (`hooks/usePublicAvailability.ts`), which deliberately omits staff notes and past guests' names.
- **Writes are blocked until a load has succeeded**, so a failed fetch can't leave the seed constants in state and then diff-delete every real row.

### Security notes

- `SUPABASE_SERVICE_ROLE_KEY` **bypasses RLS completely**. Server-side only — never import it into a client component, never prefix it with `NEXT_PUBLIC_`.
- Admin-only routes call `requireAdmin(req)` from `lib/auth.ts`. `/api/seed` is guarded too.
- `lib/rateLimit.ts` is a fixed-window in-memory limiter. It is **per serverless instance**, so it slows abuse but is not a hard global cap.
- Guest-supplied strings are escaped before going into emails (`lib/escapeHtml.ts`, including CR/LF stripping for mail-header injection).

---

## Project structure

```
app/
  api/                       18 route handlers (see below)
  about  admin  book  cancelbooking  customer  gallery  login  packages  rooms
  globals.css                all global CSS — keyframes, hovers, skeletons
  layout.tsx  page.tsx  loading.tsx

components/
  admin/       AnalyticsTab  BookingsTab  ChartTheme  FacilitiesTab
               InventoryTab  MaintenanceTab  PackagesTab  charts
  booking/     BookingDatePicker          slot-aware date picker for /book
  common/      AvailabilityCalendar  Icon  Reveal  Skeleton
  layout/      ClientShell  CursorDot  Footer  MaintenanceGate  Navbar
               Providers  ThemeToggle  TopLoader
  sections/    About  Admin  AdminLogin  BookNow  CancelBooking
               CustomerService  Gallery  Home  PackagesPage  RoomsPage

contexts/      AppContext  ThemeContext  ToastContext
hooks/         useDbCollection  useMaintenance  usePublicAvailability  useWidth

lib/
  auth.ts            HMAC session cookie, timing-safe credential check
  bookingQuote.ts    server-side price + availability quote (source of truth)
  collections.ts     how each collection loads and syncs
  dayjs.ts           the one configured dayjs — import from here, not "dayjs"
  occupancy.ts       who is physically on site right now
  paymongo.ts        QRPh payment intents
  pricing.ts         priceBooking(), bookingLabel()
  resort.ts          SLOTS, hours, capacity — change hours HERE only
  supabase.ts        row <-> app-type mapping, admin client
  utils.ts           availability checks, formatting, booking helpers
  validators.ts      input validation + capacity constants
  constants.ts  emailTemplate.ts  escapeHtml.ts  img.ts  mailer.ts
  rateLimit.ts  styles.ts  theme.ts

types/         admin  booking  database  facility  inventory  maintenance  package  room
supabase/migrations/   SQL, applied by hand
design-plans/          UI change plans (see below)
```

### API routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/api/auth/login`, `/api/auth/logout` | public / session | admin session cookie |
| `/api/availability` | public | trimmed bookings + facilities for guest calendars |
| `/api/bookings`, `/api/bookings/[id]`, `/api/bookings/[id]/cancel` | admin / mixed | reservations |
| `/api/rooms`, `/api/packages`, `/api/gallery`, `/api/closed-dates` | public read, admin write | marketing content |
| `/api/facilities`, `/api/inventory` | admin | operations |
| `/api/customer-service`, `/api/customer-reply` | public create, admin read | guest messages |
| `/api/payment` | public | PayMongo QRPh intent |
| `/api/email` | internal | confirmation / rejection mail |
| `/api/maintenance` | public read, admin write | maintenance switch |
| `/api/seed` | admin | seed data |

---

## Tailwind and shadcn

Both were added for the UI migration. Two things about the setup are
non-obvious and easy to undo by accident.

### Preflight is deliberately OFF

`app/globals.css` imports Tailwind's layers individually and **skips
`preflight.css`**, Tailwind's global reset. This is not a preference. Measured
against a captured baseline of 9 pages in both themes, enabling preflight
changed **130 computed styles**: `h3` dropped from 700 to 400 weight, heading
margins collapsed, buttons jumped from 13px to 17px, and the home page lost
80px of height. The 900 lines of CSS and ~1,600 inline styles here were
written against browser defaults.

Utilities still work everywhere — only the reset is absent.

### shadcn gets its reset back, scoped

shadcn components are written assuming preflight. Without it they render
dark-on-dark text and grey "ghost" buttons. So the few rules they depend on
are reapplied in `@layer base`, scoped to the `data-slot` attribute every
shadcn v4 component carries.

It must stay **in `@layer base`**. Unlayered CSS outranks every layered rule,
so an unlayered version of that block overrode Tailwind's own utilities and
made every button transparent and black.

### The theme bridge

shadcn reads `--background`, `--primary` and friends; this app's colours come
from `T(isDark)` in `lib/theme.ts`, and the theme is signalled by
`sw-dark`/`sw-light` on `<html>`. `globals.css` maps one onto the other and
redefines the dark variant as `&:is(.sw-dark *)`. **If a colour changes in
`lib/theme.ts`, change it there too** — that duplication is the cost of two
styling systems.

`cn()` lives in `lib/cn.ts`, not the usual `lib/utils`, because `lib/utils.ts`
already holds ~300 lines of booking logic. The shadcn CLI writes
`from "cn"` into generated files; fix it to `@/lib/cn` after each `add`.

## Conventions worth knowing

### Icons inherit their colour

`lucide-react` draws with `currentColor`, so an `<Icon>` takes the colour of
whatever encloses it. The tinted notice panels (walk-in payment policy, the
accept/cancel confirmations, the low-stock alert) set no colour of their own,
so their icons fell back to the page's near-black text and were invisible in
dark mode. Each now carries its panel's accent explicitly:

```tsx
<Icon name="home" size={17} style={{ color: "#4a9fd4", flexShrink: 0 }} />
```

If you add an icon to a coloured panel, tint it to that panel's accent — the
same colour as its border and heading.

### Chart and status colours mean something

Across Analytics and Reports the palette is consistent, so the same colour
never stands for two different quantities on one screen:

| colour | meaning |
| --- | --- |
| green `#4caf50` | guests, and revenue (Total Revenue, Monthly Revenue, Gross Revenue) |
| gold `#c9a84c` | bookings, and down payments (Down Collected, Downpayments In) |
| blue `#4a9fd4` | active / in-progress, and informational notices |
| red `#e55` | cancelled, errors, blocking problems |
| amber `#f5c518` | incomplete or awaiting action (a partial phone number, Paid-not-yet-confirmed) |

Charts take their colour as a prop, so keep the pairing when adding one.

### Comments in and around JSX

Two different syntaxes, and picking the wrong one fails in two different ways:

```tsx
return (
  <div>
    {/* correct inside JSX children */}
    <Icon … />
  </div>
);

// correct inside a JS expression, e.g. just above a `return(`
return (<Panel …>);
```

A `//` line placed among JSX children is **not a comment** — it renders as
visible text, and both TypeScript and `next build` accept it silently. A
`{/* */}` inside a plain JS expression is a syntax error, which at least
fails loudly. Both have happened here.

## Things that will bite you

- **Vercel bakes env vars at build time.** Changing a variable in the dashboard does nothing until you redeploy.
- **Migrations are manual.** Pulling a branch that adds one and not running it gives confusing 500s. `/api/maintenance` is the friendly exception — it names the missing migration in its error.
- **`app/globals.css` cascade.** Inline styles beat stylesheet rules, so several hover rules use `!important` on purpose. The `prefers-reduced-motion` block intentionally suppresses only decorative motion.
- **`prefers-reduced-motion`** is on for at least one machine on this team, and headless Chrome defaults to `reduce`. If an animation "doesn't work" for you but does for someone else, check that first.
- **Seed constants are not real data.** `INIT_ROOMS` and friends are first-paint placeholders. Pages show a skeleton until the real fetch settles rather than presenting them as fact.
- **The repo is public.** No keys, no guest data, no screenshots containing either.

---

## `design-plans/`

UI changes are written up before they are applied, one file per change: the evidence, the single correction, what to preserve, and the exact commands to verify it. They record why a change was made and which alternatives were rejected, which is more useful than the diff alone. Existing plans cover the booking tier control's selected state and two hero-card layout fixes.

> One plan, `about-cards-no-layout-shift.md`, is **superseded** — the "Why Choose" cards are no longer expandable, so the layout shift it fixed can no longer happen. Delete it or mark it if you touch that section.

---

## Scripts

```bash
npm run dev      # dev server (Turbopack)
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
```
