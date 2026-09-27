# StoneWood Private Resort

Booking and resort-management web app for **StoneWood Private Resort** — Angono, Rizal, Philippines.

Guests browse rooms and packages, check live availability, and book online with a GCash-scannable QR down payment. Staff run the resort from an admin dashboard: reservations, walk-ins, live occupancy, rooms, packages, facilities, gallery, inventory, analytics, customer messages, and a maintenance switch that can close the public site.

---

## Stack at a glance

```
Framework    Next.js 16.2.6 (App Router, Route Handlers, Turbopack) · React 19.2.6 · TypeScript 5.9.3
Database     Supabase — PostgreSQL + Row Level Security           @supabase/supabase-js 2.116.0
UI kit       shadcn/ui on Radix — 25 components in components/ui/ radix-ui 1.6.7
             embla-carousel-react 8.6.0 (Carousel only)
Styling      Tailwind CSS 4.3.3 — THE styling system, no preflight  @tailwindcss/postcss 4.3.3
             theme tokens in app/globals.css mirror T(isDark) in lib/theme.ts
             legacy: ~1,400 inline style={{}} still being converted, file by file
             cva 0.7.1 · clsx 2.1.1 · tailwind-merge 3.7.0 · tw-animate-css 1.4.0 · cn() in lib/cn.ts
Icons        lucide-react 1.47.0                                  behind components/common/Icon.tsx
Animation    motion 13.4.3 (Framer Motion, renamed)               behind components/common/Reveal.tsx
Dates        dayjs 1.11.23                                        behind lib/dayjs.ts
Validation   zod 4.6.5                                            lib/schemas.ts, on top of lib/validators.ts
Forms        react-hook-form 7.88.0 + @hookform/resolvers 5.9.1    Customer Service + Cancel Booking
             (Book Now + Admin walk-in still on useState)
Toasts       sonner 2.0.8                                         behind contexts/ToastContext.tsx
Charts       @mui/x-charts 9.14.0 (+ @mui/material, @emotion/*)    behind components/admin/charts.tsx
Email        nodemailer 8.0.5 over Gmail SMTP
Payments     PayMongo QRPh via direct REST — no SDK                 TEST keys (sk_test/pk_test)
Hosting      Vercel
```

**21 runtime dependencies, 9 dev.** shadcn components are *copied source* in
`components/ui/`, not a dependency — you own and edit them.

### Where each library actually stands

Read this before assuming something is or is not wired up.

| Library | Status | Detail |
|---|---|---|
| shadcn/ui | **done** | 24 components. No hand-rolled modal overlay remains; every form control is shadcn bar two hidden file inputs |
| Motion | **done** | behind `components/common/Reveal.tsx`; nothing else imports it directly |
| MUI X Charts | **done** | behind `components/admin/charts.tsx`; admin only |
| dayjs | **done** | every date path goes through `lib/dayjs.ts`; no raw `new Date(string)` parsing left |
| Sonner | **done** | renders all toasts; `useToast()` API unchanged |
| Supabase | **done** | live; `/api/rooms`, `/api/packages`, `/api/availability` return real rows |
| Tailwind | **partial** | the system going forward, but ~1,400 inline styles remain. See *Styling* below |
| Zod | **partial** | 3 of ~20 body-reading routes. The rest still use hand-rolled `validate()` helpers — validated, just not consolidated |
| react-hook-form | **partial** | Customer Service + Cancel Booking. Book Now and the admin walk-in form are still `useState` |

Nothing in the "partial" rows is broken or unsafe — they are consolidation
work, not gaps in behaviour.

Migration in progress: the UI is moving from inline `style={{}}` to Tailwind +
shadcn. Both exist side by side for now. Read [Tailwind and shadcn](#tailwind-and-shadcn)
before touching styles — the preflight and layering decisions there are not
preferences, they are load-bearing.

**Every form control in the app is shadcn.** The only native ones left are the
two hidden `type="file"` inputs behind the "Choose image" buttons in
`Admin.tsx` — shadcn has no file input and those are `display:none` triggers,
so they stay native on purpose. Buttons are still mixed: **105** native
`<button>` elements remain, mostly nav items, calendar day cells and table row
actions.

Detail-heavy forms and modals are **landscape**, not portrait — see
[Landscape dialogs](#landscape-dialogs).

**No hand-rolled modal overlays remain.** Every dialog, confirm and drawer goes
through `Dialog`, `AlertDialog` or `Sheet`, which is where the focus trap,
Escape handling and scroll lock come from. Also converted: all nine admin
`<table>`s to `Table`, 26 status pills to `Badge`, three view switchers to
`Tabs`, and the toast stack to Sonner.

Three things are deliberately **not** shadcn, and should stay that way:

| Kept | Why |
|---|---|
| `components/common/Skeleton.tsx` | It has `role="status"`, one sr-only announcement for the whole grid, `aria-hidden` shapes and the gold shimmer. shadcn's Skeleton is a bare `animate-pulse` div — swapping would lose all of that. |
| `NativeSelect` over Radix `Select` | A native `<select>` gets the real picker on mobile and keeps the plain `onChange` contract the forms already use. |
| ~105 native `<button>`s | Measured before converting: a global `:focus-visible` rule already gives every one of them a gold ring, and an audit of every visible button across the public pages and all four booking steps found **zero** that look disabled but are still clickable. Converting them would be churn with regression risk and no measurable gain. |

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

Three rules from preflight are reapplied. Each was added only after a bug that
traced back to its absence:

| Rule | What broke without it |
|---|---|
| `color: var(--foreground)` on buttons | ghost/outline variants came out UA black on near-black panels |
| `border-width: 0; border-style: solid` | form controls kept the UA's `2px outset`, so the dialog close button rendered as a pale box |
| `font: inherit` | `<textarea>` kept the UA's **monospace** default, so message boxes used a different typeface from every other field |

The selector list must match **both** a control nested inside a `data-slot`
element *and* a control that carries `data-slot` itself (`input[data-slot]`).
It originally only had the descendant form, which silently missed every shadcn
field on the page.

If you add a rule here, verify its blast radius rather than eyeballing it. The
method used for both fixes above: walk all nine public pages with CDP, record
`borderTop`/`background`/`color`/`font` for every `button, input, select,
textarea`, apply the change, and diff. The border fix moved exactly 1 of 201
controls; the font fix moved exactly 4. Anything wider than you expected means
the selector is too broad.

### Dialogs sit at z-2000, not shadcn's z-50

This app's own fixed chrome outranks shadcn's default. The site header is
`z-index: 200`, the skip link 300, the theme toggle 1000. A dialog left at
shadcn's stock `z-50` therefore painted **underneath** all of them, so the
header stayed bright on top of a dimmed page and the lightbox's close button
hid behind the nav.

`dialog.tsx`, `alert-dialog.tsx` and `sheet.tsx` all use `z-[2000]`, which
clears that chrome while staying below the two things that must remain above a
modal: the maintenance gate (5000) and the top progress bar (9999).

**If you re-add a shadcn overlay component with the CLI, it will arrive at
`z-50` and quietly render under the header.** Change it.

A caution on testing this: `document.elementFromPoint` ignores elements with
`pointer-events: none`, and Radix sets exactly that on everything outside an
open modal. It will happily report the dialog as topmost while the header is
painting over it. Compare z-index values, or toggle `pointer-events` back on
before hit-testing.

### Styling: Tailwind first, tokens always

Tailwind is the styling system. New and edited code uses utilities; the inline
`style={{}}` blocks are legacy being converted file by file.

The thing that makes this possible is the **token bridge** in
`app/globals.css`. Every colour `lib/theme.ts` exposes has a matching custom
property that flips with the theme, and `@theme inline` turns each into a
utility:

| Utility | Token | `T(isDark)` equivalent |
|---|---|---|
| `bg-background` / `text-foreground` | `--background` / `--foreground` | `bg` / `textH` |
| `bg-card` | `--card` | `bgCard` |
| `text-body` | `--body` | `textB` |
| `text-muted-foreground` | `--muted-foreground` | `textS` |
| `text-faint` | `--faint` | `textXS` |
| `border-border` / `border-border-soft` | `--border` / `--border-soft` | `border` / `borderLight` |
| `text-accent-ink` | `--accent-ink` | `goldInk` |
| `font-serif` / `font-sans` | `--font-serif` / `--font-sans` | Cormorant / Jost |

**Use a token, never a hex.** A hardcoded colour is how a component ends up
working in one theme and broken in the other — which is exactly what happened
to the Rooms and Packages modals: they pinned `#fff` text on
`rgba(18,16,10,0.95)`, so in light mode the close button (which correctly
follows `--foreground`) sat at **1.06:1** against the panel and was invisible.

### The text tiers were re-tuned for contrast

Four values in `lib/theme.ts` were measured against their own backgrounds and
moved. All four were failing WCAG AA (4.5:1 for body text):

| Token | Was | Now | Before → after |
|---|---|---|---|
| `textS` dark | `#7a6e5e` | `#9b8e79` | 3.95:1 → 6.13:1 |
| `textXS` dark | `#4a4035` | `#847866` | 1.94:1 → 4.55:1 |
| `textXS` light | `#a8998a` | `#7d7062` | 2.59:1 → 4.50:1 |
| gold as text, light | `#c9a84c` | `#8a6d20` (`goldInk`) | 2.14:1 → 4.58:1 |

The two tiers keep a visible gap from each other, so the hierarchy still
reads — they are both legible now rather than one being decorative.

> **These are shared tokens, so the admin panel's text shifted slightly too.**
> Nothing was restyled there; the same greys simply got legible. If the admin
> is meant to keep the old values, `lib/theme.ts` is the one place to change.

Measured across every customer dialog in both themes, the failures went from
**27 to 0 in light** and **10 to 0 in dark**. The handful the audit still
reports are compositing artifacts — a gold icon on a 10% gold layer over a
near-black backdrop resolves to 8.02:1 once composited, and dark ink on a gold
*gradient* button is 8.22:1, but a naive walk up the DOM sees neither.

### Two golds, and when to use which

`gold` (`#c9a84c`, from `lib/styles.ts`) is the **surface** gold — the Book Now
button's background, borders, gradients. Unchanged.

`C.goldInk` / `text-accent-ink` is the **ink** gold, for gold TEXT and ICONS.
It is `#c9a84c` in dark and `#8a6d20` in light, because the brand gold measures
**8.61:1 on the dark background but only 2.14:1 on the cream one** — it failed
for every label, meta line and inline icon in light mode. The darker value is
the same hue at 4.58:1.

The rule follows the *surface*, not the component:

- on a theme-following panel → `C.goldInk` / `text-accent-ink`
- on an always-dark surface (a photo, the lightbox backdrop, the package
  modal's gallery column) → plain `gold`, because the darker ink would only
  lose contrast there

Getting this backwards is silent: it looks right in whichever theme you had
open. There is a contrast audit script pattern in the commit history that
walks every dialog in light mode and reports anything under 4.5:1.

### Choose Your Stay: tier tabs, one package per slide

`components/sections/PackageShowcase.tsx` owns the whole section — the tier
switcher, the carousel, the package card and the gallery lightbox. It was
lifted out of `Home.tsx`, which had no business holding 250 lines of it.

Tabs are **SHARED / EXCLUSIVE / EVENTS**, derived by `tierOf()`: venue
packages are their own group, pool packages split on whether the pool is
shared or bought out. One package fills each slide, image left and the whole
offer right, so a guest can compare inclusions and slots without opening a
modal first.

Three things to keep if this is edited:

- **`tier` state must be declared above the code that derives `active`.**
  Same class of bug as before: a `const` read during render but declared
  further down throws `Cannot access 'X' before initialization` at prerender,
  not in the browser.
- **`active` falls back to the first non-empty group.** Packages load async
  and the admin can deactivate the last one in a tier.
- **Arrow placement changes with the space available** — beside the card from
  `md`, under it on a phone, because a phone has no gutter and overlaying
  them covers the card.

### The hero reservation card

`components/sections/HeroReservation.tsx`. The calendar used to be the whole
interaction — picking a date jumped straight to /book with nothing else
decided. The card now also collects **visit type** and **guest count**, so the
price shown is the guest's own rather than a generic "from", and /book opens
with all three already set.

The handoff widened accordingly:

```
onBookWithDate(date, { slot, guests })
  -> /book?date=YYYY-MM-DD&slot=Day|Night|WholeDay&guests=N
  -> BookNow initialSlot / initialGuests
```

A package still wins over both: its `slotMode` and `capacity` are fixed by the
package itself, so a package deep-link is unaffected.

Verified end to end: choosing a date, Night Tour and 4 guests produces
`/book?date=2026-09-27&slot=Night&guests=4`, and /book opens on step 2 with a
guest count of **4** against a default of **10**.

The price line switches on the arithmetic rather than a label — shared is per
head, exclusive is a flat rate less its discount, and the card shows whichever
the guest count actually lands on.

### The two calendars are sized to the HIG

`AvailabilityCalendar` (hero) and `BookingDatePicker` (/book) both had month
arrows hard-coded to **28x28** — Apple's absolute floor, not its target — and
day cells that stretched from the row height with no minimum, so on a phone
they collapsed to 35px tall.

| | Before | After |
|---|---|---|
| Month arrows | 28x28 | **44x44** |
| Day cells, desktop | 70x54 / 98x44 | 73x51 / 98x44 |
| Day cells, mobile | **37x35** | **40x44** |

Cell *height* now has a floor (`gridAutoRows: minmax(44px,1fr)`). Cell *width*
on a phone lands at 40px, not 44, and that is deliberate. The arithmetic:

```
390 viewport - 40 page gutter - 36 hero card - 20 calendar = 294px of grid
(294 - 12 of gaps) / 7 columns = 40px
```

Reaching 44 means stripping nearly every margin in that chain, which trades
one guideline for another — `layout.md` asks for system margins to be
respected. 40x44 is well clear of the 28x28 minimum and comfortably tappable,
so the margins stay. Do not "fix" this by removing the padding.

### The hero calendar is part of the card, not a panel on it

`AvailabilityCalendar` still carried its own panel chrome from when it floated
on its own: a near-black background, a 1px border, a 48px drop shadow and
20px of padding. Dropped inside the hero card that painted a second panel on
top of the first, which is what made it read as a widget pasted in from
somewhere else.

| | Before | After |
|---|---|---|
| Panel | `rgba(10,10,10,0.98)`, 1px border, `0 16px 48px` shadow | transparent, no border, no shadow |
| Month arrows | 8px radius, `1px solid #2a2a2a` | circular, borderless, translucent fill |
| Month title | 14.5px | 19px, the card's own serif |
| Weekday row | `Su Mo Tu` | `Sun Mon Tue` |
| Day cells | 8px radius | 10px radius |
| Selection | gold on black | green (`#2b6b30`, white text, `#5cb85c` rim) |

The selection moved into the *same* green as the available state rather than
gold, so "open" and "the one you picked" read as one idea stated twice, once
quietly and once loudly. Gold stays the card's accent colour for the CTA.

**The legend clipped, and the cause was not the legend.** It sat 9px below the
card's `overflow: hidden` edge. The calendar root had `height: 100%`, but it is
not the first child of its column - the "Choose an available date" header sits
above it - so the percentage resolved against the *whole* column and overshot
by exactly the header's offset. Chasing it from the legend's side (removing
`flex: 1`, then pinning with `marginTop: auto`) only moved the 9px around. The
fix is structural: the column is a flex column and the calendar takes `flex: 1`.

```
column (flex column, 24px padding)
  header            auto
  calendar          flex: 1, minHeight: 0
    day grid        flex: 1   -> spare height goes into the week rows
    legend          marginTop: 16
```

**Unavailable states are told apart by lightness, not hue.** Booked used to be
*lighter* than past, so the two tiles looked like the same state. Composited
against the card and measured:

| State | Tile as seen | Relative luminance | Date contrast |
|---|---|---|---|
| Past / out of range | `#0f0f0d` | 0.48% | 1.81:1 |
| Booked | `#050503` | 0.15% | 4.46:1 |
| Closed | `#190e0b` | 0.54% | 4.46:1 |
| Available | `#101c0e` | 0.95% | 7.94:1 |

Booked is now a dark, neutral-grey wash that sits *below* the past tint, and
its date number clears 4.5:1 so the guest can still read which dates are taken.
Past dates stay the quietest thing in the grid deliberately: they are not a
state anyone needs to act on.

A disabled month arrow is still drawn at `rgba(255,255,255,0.04)` on
`rgba(238,232,220,0.38)` rather than near-zero alpha - a control that is
unavailable should still be *perceivable*, or the header looks broken.

Measuring any of this needs care: several ancestors compute to `oklab()` from
Tailwind opacity utilities, so parsing `backgroundColor` by hand yields `NaN`
channels. Resolve colours through a 1x1 canvas instead, and remember
`getImageData` is **not** premultiplied - dividing by alpha inflates every
channel and reports luminance above 100%.

### The booking page is one six-step flow

`/book` is six screens sharing one frame: a fixed head (RESERVATIONS / *Create
Your Stay* / the chosen slot's hours), a progress track, and one card.

**The progress bar is one track, not six nodes.** The old indicator was six
circles joined by rules, hidden until step 2. It now runs from the first step
and animates between them:

```
STEP 3 OF 6                                    ROOM
========================-----------------------
VISIT   DATE   ROOM   CONTACT   PAYMENT   DONE
```

The fill is `(currentIdx + 1) / 6` of the track, transitioned with
`transition-[width] duration-700 ease-out motion-reduce:transition-none`.
Verified by sampling the fill across the transition: **38 distinct widths**
between 133px and 267px, not two. The bar is a real `role="progressbar"` with
`aria-valuetext="Step 2 of 6: DATE"`, so it is announced, not just drawn.

Internal step numbers are historical and there is no step 2 -- `stepIdx` maps
`{1,3,4,5,6,7}` onto 0-5. Do not renumber the states to match the labels; the
deep-link entry points depend on them.

| Label | State | Screen |
|---|---|---|
| VISIT | 1 | Day / Night / Whole Day, plus the events-venue choice |
| DATE | 3 | Calendar, guest count, pool access |
| ROOM | 4 | Optional room add-on |
| CONTACT | 5 | Guest details and the reservation summary |
| PAYMENT | 6 | GCash QRPh and the order summary |
| DONE | 7 | Reference ID and what happens next |

**Three shared helpers** keep the six steps from drifting: `stepHead()` (gold
eyebrow, serif question, optional note), `tileStyle()` (one selected
treatment for every choice on the page) and `navRow()` (BACK, then the
forward action in the wider half). They are plain functions, not nested
components -- a nested component is a new type on every render, so React
would remount the subtree and drop input focus on each keystroke.

**Choosing a visit no longer jumps.** Picking Day Tour used to advance the
step immediately, so the venue add-on below it was something guests scrolled
past after the decision was already made. A tile now selects, and CONTINUE
advances.

**"No room needed" is a row.** It used to be the absence of a choice, which
left guests unsure whether they had skipped the step or simply missed it.

**The payment step lost its GCash gradient bar.** A full-bleed green header
made one screen of the flow look like a different site. It carries the same
head as the other five now, with the countdown as a pill.

**The two calendars are one control.** `BookingDatePicker` kept its own
palette -- gold selection, `Su Mo Tu`, 3px corners -- while the home page's
`AvailabilityCalendar` had been restyled. A guest moving from the hero card to
/book met a second colour language. The picker now shares the palette, with
light-theme equivalents added, and its "Selected" legend entry is gone: a
solid green tile needs no key.

#### What the audit caught in this page

Contrast was measured per step, in both themes, compositing each element
against its real ancestors.

| Element | Was | Now | Cause |
|---|---|---|---|
| Step labels (mobile) | 9.5px | **11px** | Below the HIG floor; six labels still fit at 390 with no clipping |
| BACK / BACK TO HOME (light) | 2.29:1 | **4.58:1** | `outBtn` paints its label in raw `gold`, a *surface* colour |
| FULL NAME etc. (light) | 2.29:1 | **4.58:1** | `text-primary` is that same raw gold |
| Visit price lines (light) | 4.32:1 | **4.5+:1** | `goldInk` clears 4.5 on the page, not on the lighter tile |
| Step-head notes, room note, refund note | 4.33:1 | **6.13:1** | `textXS` is tuned against the page background, not the card |

Two golds, again: `gold` is for surfaces and borders, `goldInk` is for text.
Every failure above was raw `gold` or a token used against a background it
was not tuned for. `goldSmall` is a third, darker step for 12px gold on a
tinted tile in the light theme only.

Still failing, deliberately: **past and out-of-range day cells** (1.88:1 dark,
2.36:1 light). They are disabled, WCAG exempts disabled controls, and they are
the one thing in the grid nobody needs to act on.

**Not fixed, and not part of this page:** the footer fails light-mode contrast
site-wide -- body text at 2.89:1, section headings at 3.65:1 and the copyright
line at 1.8:1. It appears to keep dark-theme colours on the light background.

#### Measuring this page

Three traps cost real time here; all three are in the probes under the
scratchpad:

- **Headless Chrome reports `prefers-reduced-motion: reduce` by default.** The
  progress bar measured `transition-property: none` and looked broken. Probes
  that test motion must send
  `Emulation.setEmulatedMedia` with `prefers-reduced-motion: no-preference`.
- **The theme is React state, not persisted.** Setting `localStorage.theme`
  does nothing; a light-mode audit has to click the toggle.
- **`getImageData` is not premultiplied.** Dividing by alpha inflates every
  channel and reports luminance above 100%.

### Apple HIG: the numbers this section is built to

The site now follows the Apple HIG foundations. It is a website, so Apple's
*platform conventions* (tab bars, menu bar, sheets) do not apply — the
foundations do, and they are measurable:

| Rule | Source | State |
|---|---|---|
| Text ≥ 11pt | `typography.md › Ensuring legibility` | **0 below** (was 13: a 9px wordmark line, 10.5px labels and footer headings) |
| Controls ≥ 28×28, 44×44 preferred | `accessibility.md › Minimum sizes` | **0 below minimum**; every control in this section is 44–51px |
| Contrast 4.5:1 body, 3:1 large/bold | `accessibility.md` | 0 real failures in both themes |
| Avoid light font weights | `typography.md` | 4 remain at weight 300 on 15–16px intro copy |

Two knowingly open items, both pre-existing and both *Improvements* rather
than failures: **12 controls sit between 28 and 44px** (calendar day cells at
37×35, month arrows at 28×28, the hamburger at 40×40) — above Apple's minimum
but under its 44×44 default; and the **weight-300 intro paragraphs**, which
Apple advises against at small sizes.

There is a ready-made audit for this. `higaudit.mjs` in the session scratchpad
walks every element, reports text under 11px, controls under 28 and 44, and
light weights at small sizes. Re-run it after layout work.

### One gallery, one dialog shape

`components/common/MediaGallery.tsx` is the photo column for every detail
dialog — package on the home page, package on the Packages page, room on the
Rooms page. It was lifted out of the home modal so the three stop growing
separate variants.

It **degrades on the data it is given**: with one shot there are no arrows, no
counter and no thumbnail strip, just the frame and its caption. Packages carry
a `gallery` array and get the full slider; rooms carry a single `img` and get
the plain frame. Add a gallery to the `Room` type and the slider appears with
no change to RoomsPage.

The Packages page was previously rendering only `cover` despite every package
already carrying `gallery` — that data was simply unused.

Everything inside the gallery is white or bright `gold` in both themes,
because it sits on a photo under a dark gradient. That is the "always-dark
surface" case from the two-golds note above.

### The detail column has a fixed shape

Every detail dialog uses the same skeleton, so the eye lands in the same place
each time:

```tsx
<div className="flex flex-col">
  <div className="flex flex-col gap-5 p-6 sm:p-7">…sections…</div>
  <div className="mt-auto border-t border-border-soft p-6 pt-5 sm:px-7">
    <Button className="h-auto w-full …">…</Button>
  </div>
</div>
```

Three rules hold across all of them:

- **Left-aligned.** The home package modal used to centre the badge, price and
  blurb while the lists below ran left, so the reading edge broke halfway down
  the panel. Everything is left now, which is also what the F-pattern wants.
- **One vertical rhythm.** `gap-5` between sections rather than per-block
  margins, so spacing cannot drift as blocks are added.
- **The action is pinned to the foot behind a rule**, full width. Measured
  across the three dialogs: same 1px rule, same 27px gap below the button,
  button fills the column minus padding.

Scrolling belongs to `DialogContent`, not the columns. A grid item with its
own `overflow-y-auto` contributes roughly nothing to row sizing, so the row
takes its height from the other column and the two end up disagreeing by a few
pixels — enough to raise a full-height scrollbar over content that fits.

### Landscape or portrait: let the content decide

A dialog is landscape **only when it has enough content to fill two columns.**
Measured by the text it actually carries:

| Dialog | Content | Layout |
|---|---|---|
| Package detail | ~360 chars — blurb, inclusions, slot table, price pair | landscape |
| Room detail | ~120 chars — name, bed line, one sentence, button | **portrait** |
| Add/edit room (admin) | image + 5 fields | landscape |
| Confirms (archive, logout, reject) | a question and two buttons | portrait |

The room modal was landscape first and it read as a mistake: a 441px column
holding four short lines beside a full-height photo, with the rest empty.
Splitting thin content across two columns does not make it easier to scan — it
makes the panel look broken.

### Icons sit with the text they label

An icon belongs on the same baseline as its label, not floating above it:

```tsx
<p className="flex items-center gap-2 text-sm text-accent-ink">
  <Icon name="bed" size={14} />
  {room.beds}
</p>
```

`flex items-center gap-2` does the alignment. For a heading, the icon goes
*above* the title as its own block, never wedged beside a serif display face
where the optical baselines will not agree.

### Landscape dialogs

Detail-heavy forms open as landscape dialogs rather than tall portrait cards,
so the whole form is visible at once. The pattern:

```tsx
<Dialog open={...} onOpenChange={(open) => { if (!open) close(); }}>
  <DialogContent className="sm:max-w-[min(48rem,calc(100%-2rem))]">
    <div className="grid gap-4 sm:grid-cols-2">
      ...fields, with the long one on `sm:col-span-2`
```

Two things to copy:

- **`min(<cap>, calc(100% - 2rem))`, not a bare `sm:max-w-3xl`.** The `sm:`
  variant overrides shadcn's base `max-w-[calc(100%-2rem)]` gutter, so between
  roughly 640px and the cap the dialog goes edge to edge with its rounded
  corners clipped off against the viewport.
- **Let Radix own the plumbing.** Every one of these replaced a hand-rolled
  portal that also did its own focus trap, Escape handler, body-scroll lock and
  open/close animation. Radix does all four. Leaving the hand-rolled versions
  in place causes real bugs — a duplicate Escape handler fired the close path
  twice per keypress, and a `setTimeout` unmount delay only postponed Radix's
  own exit animation.

`Dialog` vs `AlertDialog`: use **AlertDialog** when the action is destructive
or otherwise needs an explicit decision (cancel a booking, archive an item,
reject a reservation). It has no close button and the backdrop does not
dismiss it. One caveat: `AlertDialogAction` closes the panel on click, so if
the handler is async and can fail, use a plain `Button` instead — otherwise
the panel unmounts before the error has anywhere to render.

### Accessibility notes that came out of the migration

- Radix warns when a dialog has no title or description. Rather than adding
  `sr-only` duplicates, promote the element that already says it with
  `asChild` — e.g. the package title over the photo on the home page is the
  `DialogTitle`, so the dialog's accessible name is the package name.
- A `<label>` with no control is an orphan, and shadcn's `Label` is the same
  element, so converting it changes nothing. Three of these in `BookNow.tsx`
  headed a *group* of controls (a date picker, a guest stepper); they are now
  `<p>` with `role="group"` + `aria-labelledby` on the container.

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

### Tabs, Table, Badge and toasts

- **Tabs** replaced three view switchers (Bookings active/archived, Facilities
  checklist/history, Customer Service inbox/archive). Arrow keys now move
  between them and each panel is announced as a tabpanel. Customer Service is
  the odd one: its two lists share a single layout, so the panel markup lives
  in one `messagesPanel` variable rendered into both `TabsContent` rather than
  duplicated.
- **Table** wraps its `<table>` in an overflow container of its own. The admin
  tables already had one, so there are two nested — harmless, but do not add a
  third.
- **Badge** carries the pill shape; the per-status colours stay inline because
  they are derived at runtime from booking or stock state.
- **Toasts** render through Sonner, but the context API is unchanged:
  `const { toast } = useToast(); toast(msg, type)`. Only the renderer moved.
  Sonner wraps toasts in an `aria-live` region, which the old hand-rolled stack
  did not have, so toasts are now announced to screen readers.

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

## Sales and facility operations (added September 2026)

**Setup:** run the new migration `supabase/migrations/20260926120000_sales_and_facility_ops.sql`
(`supabase db push`, or paste it into the Supabase SQL editor). It is safe to run twice.

What it changes:

- Booking status **"Paid" is renamed "Pending"** (waiting for admin approval). "Paid" now only
  ever refers to money actually received.
- New tables: `payments` (the sales ledger), `expenses`, `daily_closings`, `damage_rates`,
  `facility_inspections`, `damage_records`.
- Existing bookings' received downpayments are copied into `payments`. Completed bookings are
  assumed to have paid their balance in cash at checkout; each such row says so in its notes
  and can be voided in **Sales → Transactions** if that was not the case.
- `damage_rates` is seeded with **sample prices**. Replace them with the resort's real prices in
  **Facilities → Damage rates** before using penalties for real.

Where things are in the admin panel:

| Objective | Screen |
|---|---|
| Sales monitoring | **Sales**: transactions, receivables, clients, expenses, daily closing |
| Facility management | **Facilities**: guests today / coming up / checked out; prepare, check out (inspection, damage, penalty, payment), damage rates |
| Reservation management | **Bookings**: online and walk-in together, search, status/source/slot/date filters, payments per booking |
| Reports generation | **Reports**: any month, year or date range; CSV export and print |

The new screens are built on the shadcn components in `components/ui` through the thin
wrappers in `components/admin/ui.tsx` (Modal → landscape `Dialog`, ConfirmDialog →
`AlertDialog`, TableShell → `Table`, ViewTabs → `Tabs`, Pill → `Badge`, FullSelect →
full-width `NativeSelect`).

The admin panel refreshes bookings every 15 seconds and the sales/facility records every
20 seconds while it is open, so new online bookings appear without reloading.
