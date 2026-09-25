# StoneWood Private Resort

Booking and resort-management web app for **StoneWood Private Resort** — Angono, Rizal, Philippines.

Guests browse rooms and packages, check live availability, and book online with a GCash-scannable QR down payment. Staff run the resort from an admin dashboard: reservations, walk-ins, live occupancy, rooms, packages, facilities, gallery, inventory, analytics, customer messages, and a maintenance switch that can close the public site.

---

## Read this first if you last worked on this repo a while ago

Several things changed that will break your mental model of the codebase. Skimming this section will save you an hour of confusion.

### The database is Supabase now, not MongoDB

`models/`, `lib/mongoose.ts` and every Mongoose schema are **gone**. All data lives in Supabase (PostgreSQL) and is reached through the API routes in `app/api/`. If you still have `MONGODB_URI` in your `.env.local`, it does nothing.

### Admin credentials are server-side now

They used to live in `ADMIN_CREDS` in `lib/constants.ts`, which meant **they shipped in the browser bundle**. Login now posts to `/api/auth/login`, which compares against `ADMIN_USERNAME` / `ADMIN_PASSWORD` on the server and sets an HMAC-signed, `httpOnly` session cookie (`lib/auth.ts`, 8-hour TTL). Treat any password that was in the old bundle as burned.

### Tailwind is uninstalled

No `tailwind.config`, no PostCSS plugins, no CSS modules. Styling is `app/globals.css` plus inline `style={{}}` objects, with colours from `T(isDark)` in `lib/theme.ts` and the gold accent from `lib/styles.ts`. Adding a `className="flex gap-4"` will silently do nothing.

### Hooks and components were renamed or deleted

Gone: `useAdmin`, `useBooking`, `useReveal`, `useTheme`, `useToast`, `PageTransition.tsx`, `Stars.tsx`, `AppShell.tsx`, `types/index.ts`, `InventoryTab.module.css`. Use `useTheme()` from `contexts/ThemeContext`, `useToast()` from `contexts/ToastContext`, and import types from their specific file (`types/booking.ts`, not `types/index.ts`).

### Icons come from one registry

All icons are `lucide-react`, used through `components/common/Icon.tsx` (`<Icon name="calendar" />`). It falls back to a default glyph for unknown names, because some icon names come from the database and `<undefined />` crashes React. Don't import from `lucide-react` directly.

### Two booking rules that are easy to get backwards

- **Exclusive is a whole-DATE buyout.** An Exclusive pool booking blocks both the Day and the Night slot. Shared bookings stay per-slot — a Shared Day group never blocks the Night, and Shared groups stack to `RESORT_SHARED_CAPACITY` (30) within a slot.
- **Rooms are day-use, not overnight.** A room is an add-on to a tour slot; the guest leaves when the slot ends, and the 5–7 PM gap is room turnover. `Booking` has a single `date` and no checkout date, so an overnight stay has nowhere to be recorded.

Both rules live in `checkPoolCapacity` / `lib/occupancy.ts`, and both files carry a comment explaining why — read those before changing either.

### Maintenance mode exists

Admin → **SITE → Maintenance** closes the public site behind a full-screen notice over a blurred homepage. `/login` and `/admin` are never gated, and a signed-in admin is never gated, so you cannot lock yourself out.

---

## Tech stack

Six runtime dependencies, seven dev dependencies. Nothing else is installed, and that is deliberate — see *Not used* below before reaching for a library.

### Runtime

| Package | Version | What it does here |
| --- | --- | --- |
| `next` | 16.2.6 | App Router, Route Handlers, Turbopack dev/build |
| `react` / `react-dom` | 19.2.6 | UI |
| `@supabase/supabase-js` | 2.116.0 | PostgreSQL access from the API routes |
| `nodemailer` | 8.0.5 | confirmation / rejection email over Gmail SMTP |
| `lucide-react` | 1.47.0 | every icon, via `components/common/Icon.tsx` |

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
| Forms / validation | `lib/validators.ts`, no react-hook-form/Zod |
| Payments | direct REST to PayMongo in `lib/paymongo.ts`, no SDK |
| Charts | `components/admin/charts.tsx`, hand-drawn, no chart library |
| Animation | CSS keyframes in `globals.css`, no Framer Motion |
| Dates | native `Date` + `lib/validators.ts` helpers, no date-fns/dayjs |

### Not used — do not add without discussing

- **Tailwind CSS** — was installed, now removed. `className="flex gap-4"` does nothing.
- **MongoDB / Mongoose** — replaced by Supabase. `models/` and `lib/mongoose.ts` are deleted.
- **CSS Modules** — none remain.
- **A UI kit** (MUI, shadcn, Chakra) — the visual language is bespoke.

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
  globals.css                all global CSS — keyframes, hovers, skeletons, reveal
  layout.tsx  page.tsx  loading.tsx

components/
  admin/       AnalyticsTab  BookingsTab  FacilitiesTab  InventoryTab
               MaintenanceTab  PackagesTab  charts
  booking/     BookingDatePicker          slot-aware date picker for /book
  common/      AvailabilityCalendar  Icon  Skeleton
  layout/      ClientShell  CursorDot  Footer  MaintenanceGate  Navbar
               Providers  ThemeToggle  TopLoader
  sections/    About  Admin  AdminLogin  BookNow  CancelBooking
               CustomerService  Gallery  Home  PackagesPage  RoomsPage

contexts/      AppContext  ThemeContext  ToastContext
hooks/         useDbCollection  useMaintenance  usePublicAvailability
               useScrollReveal  useWidth

lib/
  auth.ts            HMAC session cookie, timing-safe credential check
  bookingQuote.ts    server-side price + availability quote (source of truth)
  collections.ts     how each collection loads and syncs
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
