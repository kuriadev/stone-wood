# Stonewood Garden Private Resort

Booking and resort-management web app for **Stonewood Garden Private Resort**, Angono, Rizal, Philippines.

Guests browse packages and rooms, check live availability and book online with a QR Ph down payment. Staff run the resort from one admin panel: today's arrivals and departures, walk-ins, check-in and check-out inspections, payments and expenses, reports, supplies, guest messages, the website's content, and staff accounts with role-based permissions.

---

## Contents

- [What the system does](#what-the-system-does)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [How it works](#how-it-works)
- [Security](#security)
- [Performance](#performance)
- [API reference](#api-reference)
- [Database](#database)
- [Business rules](#business-rules)
- [External services](#external-services)
- [Testing](#testing)
- [Conventions that matter](#conventions-that-matter)

---

## What the system does

### For guests (public website)

| Page | What a guest can do |
|---|---|
| **Home** (`/`) | A hero photo or video set by staff; a quick availability card; the tour hours; packages on a wheel (Shared / Exclusive / Events) that turns as the page scrolls; rooms, amenities, reviews and the resort's location |
| **Rooms** (`/rooms`) | See each room's photos, beds, capacity and rate, and add rooms to the booking with one button. Added rooms follow the guest to Book Now |
| **Packages** (`/packages`) | Compare packages by kind, with promo prices and "until" dates where the owner set them, and start a booking from any package |
| **Gallery** (`/gallery`) | Browse the resort's photos with captions |
| **About** (`/about`) | The resort's story, address, hours and contacts, and a questions-and-answers list |
| **Book Now** (`/book`) | A step-by-step booking: visit type and facility, Shared or Exclusive, guests, date on a live calendar, rooms, contact details, review, then payment by a QR Ph code (50% down or full). A summary card stays on screen until payment. The booking is saved automatically once paid, and a confirmation email is sent |
| **My booking** (`/my-booking`) | Look up a booking by reference and email, or open it from the link in any email. Ask to move it to a new date, see payments, and, after a resort cancellation or a no-show, pick a new date |
| **Customer Service** (`/customer`) | Send a question, feedback or concern; an automatic reply is sent |

On phones the site shows a bottom tab bar (Home, Rooms, Book, My booking, Help). Light and Dark themes are available everywhere, and every page has its own loading skeleton.

### For staff (admin panel, `/admin`)

Three roles. Each sees only the screens it may open, and the super admin can change what Front desk and Caretaker may do (**Staff Accounts → Roles & permissions**).

| Role | Typical work |
|---|---|
| **Super admin** (owner) | Everything, including approvals, prices, staff accounts and settings |
| **Front desk** | Bookings, walk-ins, payments, check-in, no-shows, guest messages and closing the day. Cancellations, refunds, voids and deletions go to the super admin as requests |
| **Caretaker** | Preparing facilities, check-out inspections, cleaning, pool upkeep and supplies, from a phone (My Tasks) |

| Screen | What it is for |
|---|---|
| **Dashboard** | Today at a glance: guests due, on site and leaving, money collected and owed, late arrivals with timers, tomorrow's arrivals with reminder emails and texts, a "do these first" list and quick tasks |
| **My Tasks** | The caretaker's list: prepare, inspect, clean, upkeep |
| **All Bookings** | Search and filter every booking; an edit hub (guest details, move the date, add charges, record payments); cancel, mark a no-show or cancel by the resort; invoices; export to Excel, CSV or PDF; import from a spreadsheet; auto-archive and scheduled archive deletion |
| **Booking Calendar** | Month view with Day, Night and Staycation marks on each date, closed dates, and each month's bookings by status |
| **Guest Messages** | Live inbox with an inline reply, archive, and delete archived messages one at a time or all at once |
| **Payments & Expenses** | Figures, money flow, every transaction, expenses, refunds, and undoing a payment with a reason |
| **Reports** | Any date range, compared with the previous period; online and walk-in filters; trends; a performance summary and a metrics table; export and share |
| **Facilities & Inspections** | Facility status, checklists, damage rates, cleaning and supplies used |
| **Supplies & Equipment** | Stock with low-stock alerts, use, breakage, purchases and stock counts |
| **Rooms, Packages & Prices, Website Photos** | The website's content: rooms, packages (with promos), gallery, home page cards and hero media |
| **Website Maintenance** | Close the public site with a reason |
| **Staff Accounts, Rates & Settings, Activity History** | People and permissions; rates, limits, hours and contacts; a log of every change and who made it |

The panel signs a person out after 30 minutes without activity. The sidebar folds to icons on a desktop, and on a phone it opens from a menu button.

---

## Tech stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router, Route Handlers, Turbopack) | 16.4.3 |
| UI | React | 19.2.6 |
| Language | TypeScript (`strict`, path alias `@/*`) | 5.9 |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`), theme tokens in `app/globals.css` | 4.3.3 |
| Components | shadcn/ui on Radix (`radix-ui`), vendored in `components/ui/` (18 components) | 1.6.7 |
| Animation | `motion` (Framer Motion), loaded as `LazyMotion` + `domAnimation` | 13.4.3 |
| Icons | `lucide-react`, through `components/common/Icon.tsx` only | 1.47.0 |
| Forms | `react-hook-form` + `@hookform/resolvers` (Customer Service, My booking) | 7.88 / 5.9 |
| Toasts | `sonner`, behind `useToast()` | 2.0.8 |
| Charts | `@mui/x-charts` (admin only, loaded on demand) | 9.14.0 |
| Spreadsheets | `exceljs` (admin export, loaded on demand) | 4.4.0 |
| Dates | `dayjs` | 1.11 |
| Validation | `zod` | 4.6.7 |
| Database | Supabase (PostgreSQL) with `@supabase/supabase-js` | 2.116.0 |
| Email | `nodemailer` over Gmail SMTP | 10.3.1 |
| Payments | PayMongo REST (QR Ph), no SDK | — |
| Tests | Jest + ts-jest (unit and integration), Playwright (end-to-end) | 29.7 / 1.64 |
| Font | Satoshi, self-hosted through `next/font/local` (`font-display: swap`) | — |
| Hosting | Vercel | — |

23 runtime dependencies and 13 dev dependencies. There's no state-management library, no ORM and no CSS-in-JS runtime outside MUI's charts.

---

## Quick start

Requires Node.js 20 or later.

```bash
npm install
# create .env.local with the variables below
npm run dev          # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | development server |
| `npm run build` | production build (runs `check:chars` first) |
| `npm run start` | serve the production build |
| `npm run lint` | ESLint (`eslint.config.mjs`) |
| `npm test` | Jest unit and integration tests |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run check:chars` | fails if a source file contains a stray control character (guards against copy-paste and script mishaps) |

**Database:** migrations live in `supabase/migrations/` and are applied in filename order, with `supabase db push` or by pasting each file into the Supabase SQL editor. Every migration is safe to run more than once. Features that need a newer migration fall back gracefully until it's applied, and the screen that needs it says so.

---

## Environment variables

Set these in `.env.local` for development and in the Vercel project settings for deployment. `.env*` files are ignored by Git and must stay that way.

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase publishable key (`NEXT_PUBLIC_SUPABASE_ANON_KEY` is read as a fallback) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses Row Level Security. Never expose it, never prefix it with `NEXT_PUBLIC_` |
| `SESSION_SECRET` | server only | Signs the staff session cookie |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | server only | First super admin sign-in, used until accounts exist in the database |
| `PAYMONGO_SECRET_KEY` | server only | PayMongo API key |
| `PAYMONGO_API_BASE` | server only | Optional override of the PayMongo API URL |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | server only | The Gmail account and app password that send email |
| `ADMIN_NOTIFY_EMAIL` | server only | Where the daily staff briefing goes (defaults to the resort's contact email) |
| `NOTIFY_SECRET` | server only | Lets an external scheduler call `/api/reminders` and `/api/notify` with `Authorization: Bearer <secret>` |
| `NEXT_PUBLIC_APP_URL` | public | Base URL used in email links |
| `NEXT_PUBLIC_SITE_URL` | public | Base URL for canonical links, social cards and the sitemap |

Both URLs fall back to the Vercel production domain (`VERCEL_PROJECT_PRODUCTION_URL`), and to localhost outside Vercel.

---

## Project structure

```
stonewood/
├── app/                         Next.js App Router
│   ├── layout.tsx               root layout: font, intro, providers, site shell
│   ├── page.tsx                 home (server component: reads the hero and preloads it)
│   ├── globals.css              Tailwind entry, --sw-* theme tokens, keyframes
│   ├── intro.css                first-visit intro and page-curtain animations
│   ├── loading.tsx              route skeletons (every route has its own loading.tsx)
│   ├── about/ admin/ book/ customer/ gallery/ login/ my-booking/ packages/ rooms/
│   ├── robots.ts · sitemap.ts
│   └── api/                     59 Route Handlers (see API reference)
│
├── components/
│   ├── sections/                full-page features: Home, BookNow, RoomsPage, PackagesPage,
│   │                            PackageTierScroll, PackageShowcase, Gallery, About,
│   │                            CancelBooking (My booking), CustomerService, AdminLogin, Admin
│   ├── admin/                   admin screens, modals and shared admin UI (ui.tsx,
│   │                            ExportMenu, charts + MuiCharts, AdminSidebar.css …)
│   ├── booking/                 BookingDatePicker, EventPackages
│   ├── common/                  Icon, Reveal, Coverflow, OptionWheel, GlideSelect, MediaGallery,
│   │                            AvailabilityCalendar, PageSkeletons, RoomCartDock, LazyBackground …
│   ├── layout/                  Providers, ClientShell, Navbar, GuestTabBar, Footer, IntroSplash,
│   │                            PageCurtain, TopLoader, MaintenanceGate, ThemeToggle, Logo
│   ├── seo/                     JsonLd
│   └── ui/                      vendored shadcn/Radix components
│
├── contexts/                    AppContext (site data), OpsContext (admin ledger, live sync),
│                                StaffContext (who's signed in), ThemeContext, ToastContext
├── hooks/                       useDbCollection, usePublicAvailability, useMaintenance,
│                                useHeroMedia, useRoomCart, useIdleLogout, useWidth …
├── lib/                         business rules and server helpers (see "How it works")
├── types/                       booking, room, package, facility, inventory, finance, admin,
│                                staff tasks, maintenance, database row shapes
├── supabase/migrations/         27 SQL migrations, applied in filename order
├── tests/                       unit/ (39 files), integration/, e2e/, helpers/
├── scripts/                     check-control-chars.mjs
└── next.config.ts               security headers, Content Security Policy
```

---

## How it works

### Rendering and data

- **Pages.** Each route under `app/` renders a client component from `components/sections/`. The home page is a server component so it can read the staff-chosen hero and preload it. `ClientShell` adds the top loading bar, the page curtain and the phone tab bar.
- **Site data.** `AppContext` loads rooms, packages, closed dates and settings once per visit and shares them. Collections go through `hooks/useDbCollection.ts`, which pairs a localStorage cache with the `load` and `sync` functions in `lib/collections.ts`. Edits in the admin are saved by sending only the fields that changed, so two staff members working at once don't overwrite each other.
- **Admin live data.** `OpsContext` re-reads bookings, payments, inspections and facilities every 15 seconds while the tab is visible, and pauses in a background tab.
- **Guests never load admin data.** The public calendar uses `/api/availability`, which returns dates, tours and capacity only, with no names, emails or amounts.

### Where the rules live (`lib/`)

| Module | What it decides |
|---|---|
| `resort.ts` | Tour hours (`SLOTS`), late-booking cutoff, quiet hours, contacts |
| `validators.ts` | Rates, capacities, the booking window, notice periods (editable in Rates & Settings) |
| `pricing.ts` | `priceBooking()`, the single pricing function, plus package promos |
| `bookingQuote.ts` | The server-side quote and availability check before payment |
| `utils.ts` · `occupancy.ts` | Availability and capacity per date and tour |
| `rebooking.ts` · `rebooking.server.ts` | Moving bookings: guest date changes, resort cancellations, no-show rebooking, 48-hour holds |
| `noShow.server.ts` | The day-after email that offers a no-show guest a new date |
| `finance.ts` · `ledger.server.ts` | Money: what each booking has paid and owes, from the payments ledger |
| `operations.ts` | The Dashboard's columns, timers and "do these first" list |
| `permissions.ts` · `auth.ts` | Roles, permissions, sessions, owner requests |
| `retention.ts` | Auto-archive and scheduled archive deletion |
| `labels.ts` | What staff read for each stored value (statuses, money states, screen names) |
| `notices.ts` · `emailTemplate.ts` · `mailer.ts` | Every guest email and text message |
| `paymongo.ts` | QR Ph payments |

**Pricing runs on both sides.** `lib/pricing.ts` has no React, no database and no network. The browser runs it to show the breakdown, and the server runs the same function to decide what's charged, so the two can't disagree and a total edited in the browser changes nothing.

**Background work needs no cron.** Deadlines (holds, choice windows, unpaid walk-ins) are stored and compared with the clock whenever a booking or request is read. Daily emails (tomorrow's reminders, no-show offers, the staff briefing) are sent the first time the Dashboard is opened each day, and an external scheduler can trigger them too with `NOTIFY_SECRET`.

---

## Security

| Area | How it's handled |
|---|---|
| Database | Row Level Security on all 28 tables. The publishable key can read only public content (rooms, packages, gallery, closed dates, site settings); every write goes through a Route Handler using the service-role key |
| Staff sign-in | Passwords hashed with scrypt and a random salt. Session in a signed, `httpOnly`, `SameSite=Lax` cookie (secure in production), with a 30-minute idle timeout |
| Permissions | Checked on the server for every data-changing route (`requirePermission`, `ownerGate`). Front desk requests for owner-only actions are stored and replayed through the same route once approved |
| Guests | A guest proves a booking with its reference plus email, or with the signed link in their emails |
| Input | Zod schemas and sanitisers on every write; parameterised queries through the Supabase client; file uploads checked for type and size |
| Abuse | Per-IP rate limits on public endpoints |
| Browser | Content Security Policy, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, permissions policy and HSTS (`next.config.ts`) |
| Payments | Confirmed by the server asking PayMongo directly; the browser's word is never trusted |
| Secrets | Server-only environment variables; no source maps published; logs never print emails, passwords or tokens |

---

## Performance

- Admin screens load their code the first time they're opened, and the charts load after the dashboard's numbers show.
- The spreadsheet library loads only when someone exports.
- The home hero is chosen and preloaded on the server, sized for phones or desktops, and only the home page downloads it.
- Photos come from Unsplash at the width the layout needs, capped at 72% quality, with WebP or AVIF where the browser supports it. Backgrounds lower on the page load as they approach the screen.
- No layout shift on any page while it loads.
- Public polling (availability, maintenance) pauses in background tabs.
- Measured on a simulated mid-range phone (4× slower processor, mobile 4G), every page shows its main content in about 1.2 to 2 seconds.

---

## API reference

Access: **public** = no sign-in · **guest** = booking reference + email, or the signed link · **staff** = signed-in staff with the named permission · **scheduler** = `NOTIFY_SECRET`.

### Public website

| Endpoint | Methods | Access | Purpose |
|---|---|---|---|
| `/api/rooms` · `/api/packages` · `/api/gallery` · `/api/amenities` | GET | public | Website content (writes are staff only) |
| `/api/availability` | GET | public | Which dates, tours and capacity are taken, with no guest details |
| `/api/closed-dates` | GET | public | Dates the resort is closed (POST and DELETE are staff only) |
| `/api/settings` | GET | public | Rates, limits, hours, contacts (PATCH is staff only) |
| `/api/maintenance` | GET | public | Whether the site is closed, and why (PATCH is staff only) |
| `/api/site-content/hero` · `home-cards` · `facility-photo` | GET | public | Staff-set hero media, home page cards, facility photos |
| `/api/bookings/check` | POST | public | Can this booking go ahead? |
| `/api/payment` | POST · GET · DELETE | public | Price the booking and create its QR; poll its status; cancel an unpaid QR |
| `/api/bookings` | POST | public | Save a paid online booking (GET is staff only) |
| `/api/customer-service` | POST | public | Send a message (GET, PATCH, DELETE are staff only) |

### Guests

| Endpoint | Methods | Purpose |
|---|---|---|
| `/api/bookings/[id]` | GET | The guest's booking, payments and date-change requests |
| `/api/bookings/[id]/cancel` | POST | The guest cancels their booking |
| `/api/bookings/[id]/date-change` | POST | Ask to move a confirmed booking (held 48 hours for approval) |
| `/api/bookings/[id]/rebook` | POST | Pick a new date after a resort cancellation or a no-show |

### Staff

| Endpoint | Methods | Purpose |
|---|---|---|
| `/api/auth/login` · `logout` · `me` · `touch` | POST · GET | Sign in and out, who's signed in, keep the session alive |
| `/api/bookings` · `/api/bookings/[id]` | GET · PATCH · DELETE | List, update (status, details, archive, no-show), delete |
| `/api/bookings/[id]/move` · `charge` · `resort-cancel` · `refund-request` | POST | Move a booking, add a charge, cancel by the resort, record a refund choice |
| `/api/bookings/import` | POST | Import bookings taken while offline |
| `/api/date-changes` | PATCH | Approve or decline a date change or new-date pick |
| `/api/checkin` · `/api/checkout` · `/api/settle` | POST | Check a group in; inspect and check them out; collect the balance and close the booking |
| `/api/payments` · `/api/payment/desk` · `/api/expenses` | POST · PATCH · GET · DELETE | Record or void payments and expenses; a QR for a walk-in |
| `/api/closings` | POST | Close the day with a cash count |
| `/api/ops` | GET | The ledger and facility records behind the Dashboard |
| `/api/facilities` · `cleaned` · `supplies` · `/api/inspections` · `/api/damage-rates` | various | Facilities, cleaning, inspections, damage rates |
| `/api/inventory` · `movements` · `/api/upkeep` · `run` | various | Supplies, stock history, the upkeep schedule |
| `/api/customer-reply` · `/api/email` · `/api/guest-link` | POST · GET | Reply to a guest, send booking emails, get a guest's booking link |
| `/api/requests` | GET · PATCH · DELETE | Front desk requests to the owner |
| `/api/staff` · `me` · `password` · `photo` · `roles` | various | Staff accounts, display names, photos, role permissions |
| `/api/admin/account` | GET · PATCH | The super admin's own sign-in |
| `/api/activity` | GET · POST | The activity log |
| `/api/retention` | GET · PUT · POST | Archive and data-retention settings and runs |
| `/api/seed` | GET · POST | Copy the starter content into an empty database |
| `/api/reminders` · `/api/notify` | POST | Tomorrow's reminders and no-show offers; the daily staff briefing (staff or scheduler) |

---

## Database

Supabase PostgreSQL, with Row Level Security on every table.

| Area | Tables |
|---|---|
| Bookings | `bookings`, `date_change_requests`, `closed_dates` |
| Money | `payments`, `expenses`, `daily_closings`, `damage_rates`, `damage_records` |
| Facilities | `facilities`, `facility_inspections`, `facility_cleanings`, `facility_cleaning_supplies` |
| Supplies | `inventory`, `inventory_movements`, `upkeep_tasks`, `upkeep_task_supplies`, `upkeep_runs` |
| Website | `rooms`, `packages`, `gallery`, `site_content`, `site_settings`, `business_settings` |
| Guests | `customer_messages` |
| Staff | `staff`, `admin_credentials`, `owner_requests`, `activity_log` |

`supabase/migrations/` holds 27 migrations, from `20260922122504_init_schema.sql` to `20261106120000_booking_no_show.sql`. **Before beta, check that the latest ones are applied**, in particular `20261101120000_booking_ref_by_slot.sql` and `20261106120000_booking_no_show.sql`. Without the second, Mark no-show still cancels the booking but shows it as Cancelled and sends no rebooking email.

---

## Business rules

### Tours

Set in `lib/resort.ts` and editable in Rates & Settings.

| Tour | Hours | Notes |
|---|---|---|
| Day Tour | 7:00 AM – 5:00 PM | Shared or Exclusive; one date |
| Night Tour | 7:00 PM – 5:00 AM next day | Shared or Exclusive; one date |
| Staycation | 7:00 AM – 5:00 AM next day | Exclusive only; can run up to 3 days in a row |

5:00–7:00 PM and 5:00–7:00 AM are turnover and cleaning. Quiet hours start at 10:00 PM. Exclusive buys out its own Day or Night tour; a Staycation blocks the whole date.

**Booking today:** guests can book today's tour after it has started, until 2 hours before it ends. It still ends at the usual time, at the full price, and staying longer is overtime. Staff can book any time; the walk-in form shows how long the group can stay.

### Rates

Plain rates, editable in Rates & Settings. There are **no automatic discounts**: deals live in package prices and package promos.

| Item | Rate |
|---|---|
| Pool, Shared | ₱200 per guest (Day or Night); ₱400 per guest (Staycation) |
| Pool, Exclusive | ₱6,000 (Day or Night); ₱12,000 (Staycation) |
| Events venue | ₱5,000 per tour, always private |
| Room | its own rate, per tour |
| Overtime | ₱500 per hour, up to 2 hours, staff only |

A multi-day stay is charged for each day. A package's promo (a percentage or a peso amount, optionally until a date) is what's charged while it runs.

### Payments and cancellations

- Online bookings pay **50% down or in full** by QR Ph. The rest is paid at the resort.
- **No refunds when a guest cancels or doesn't show**; what was paid is kept. Refunds happen **only when the resort cancels**.
- **Resort cancellation:** the guest has 7 days to pick a new date (what they paid carries over) or arrange a refund with the owner.
- **No-show:** marked by staff with **Mark no-show**, separate from an ordinary cancellation. The next day the guest is emailed a link and has **20 days** to pick a new date; what they paid carries over and any balance is still due. Staff approve the date.
- **Date changes:** a guest may move a confirmed booking once, at least 2 days before the visit. A requested date is held for **48 hours** while staff decide.
- **Unpaid walk-ins** release their date after 24 hours.

### Limits and housekeeping

- **Capacity:** 30 guests at the resort; 50 at the events venue for venue-only packages. Staff can approve more.
- **Booking window:** about 3 months ahead.
- **Gallery:** up to 5 photos per room or package.
- **Archiving:** completed and cancelled bookings archive automatically after 2 months. The archive can be deleted on a monthly or yearly schedule set by the super admin.

---

## External services

**PayMongo.** QR Ph, which GCash, Maya and Philippine bank apps can scan. Called over REST from `lib/paymongo.ts`; the booking page polls the payment status and saves the booking once it's paid. GCash as a named method isn't available on the account's business type, which is why QR Ph is used.

**Gmail SMTP.** Sends:

- booking confirmations and updates;
- tomorrow's reminders;
- resort-cancellation, date-change and no-show notices;
- refund notices;
- replies to guest messages;
- the daily staff briefing.

Each guest notice also has a short text message that staff can send from their own phone.

---

## Testing

| Suite | Where | Run |
|---|---|---|
| Unit | `tests/unit/` (39 files: pricing, availability, slots, rebooking, no-shows, permissions, retention, labels and more) | `npm test` |
| Integration | `tests/integration/` (booking check, import, a full stay) against an in-memory database helper | `npm test` |
| End-to-end | `tests/e2e/` with Playwright | `npm run test:e2e` |

At the time of writing, all 42 Jest suites (386 tests) pass, and the production build and typecheck are clean.

---

## Conventions that matter

These aren't style preferences. Breaking one causes a real bug.

- **`lib/pricing.ts` stays pure.** No React, fetch or database calls. It runs in the browser and on the server, which is what keeps the shown total and the charged total identical.
- **The service-role key bypasses RLS.** Use it in Route Handlers only. If the browser ever needs to write to a table, add a Route Handler instead.
- **Files ending `.server.ts` are server-only.** Never import them into a client component.
- **Colours live in `--sw-*` CSS variables** (`app/globals.css`, read through `T(isDark)` in `lib/theme.ts`), for both the Light and Dark themes. There are only two themes.
- **There are two golds.** `gold` (`lib/styles.ts`) is the bright brand colour for photos and dark overlays. `C.goldInk` follows the theme and is the one for text on page backgrounds.
- **Icons and motion have one entry point each.** Import icons from `components/common/Icon.tsx`. Animate with `Reveal.tsx` and `Coverflow.tsx`, or `m.*` inside them. `Providers.tsx` uses `<LazyMotion strict>`, so a stray `motion.*` throws.
- **Spacing is a 4px grid** (`lib/spacing.ts`); `--spacing` is pinned to 4px so Tailwind classes and inline values agree. Anything tappable clears 44px (`TAP_MIN`).
- **Tailwind preflight is on behind a bridge.** The `SW PREFLIGHT BRIDGE` block in `app/globals.css` restates the few browser defaults the layout relies on. Measure before adding to it or removing from it.
- **Inline `style` beats Tailwind classes.** When a shared style object sets a shorthand such as `padding`, override it explicitly where it's used.
- **Stored values stay short words; people read labels.** Statuses and states are stored as stable words (`Cancelled`, `Forfeited`) and displayed through `lib/labels.ts`, so wording can change without touching queries.
- **Animations are always on.** The owner wants them regardless of the reduced-motion setting.
- **Shared admin pieces are shared on purpose.** Use `ExportMenu` for exports, `ChoiceButtons` for option groups and `FilterSelect` for filters, so every screen looks and behaves the same.
