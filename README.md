This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

--- --- --- --- --- ---  --- --- --- --- --- ---  --- --- --- --- --- ---  --- --- --- --- --- --- 
# StoneWood Private Resort

A full-stack web application for **StoneWood Private Resort** — Angono, Rizal, Philippines.

---

## Tech Stack

**Frontend**
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- React 19

**Backend**
- Next.js API Routes
- MongoDB Atlas *(stub — not yet wired)*
- Mongoose ODM *(stub — not yet wired)*
- Nodemailer + Gmail SMTP *(active — confirmation and rejection emails working)*

**Deployment**
- Vercel

---

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

> **Note:** Nodemailer is used for email notifications. Make sure `nodemailer` is in your `package.json` dependencies. If not: `npm install nodemailer`

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

```
stonewood/
├── app/                                    # Next.js App Router — every folder = a URL route
│   ├── about/
│   │   ├── loading.tsx                     # Skeleton loader shown while page loads
│   │   └── page.tsx                        # /about
│   ├── admin/
│   │   ├── loading.tsx
│   │   └── page.tsx                        # /admin — redirects to /login if not authenticated
│   ├── api/                                # Server-side API Route Handlers (Node.js only)
│   │   ├── auth/
│   │   │   └── login/
│   │   │       └── route.ts                # POST /api/auth/login
│   │   ├── bookings/
│   │   │   ├── [id]/
│   │   │   │   └── route.ts                # GET / PATCH / DELETE /api/bookings/:id
│   │   │   └── route.ts                    # GET / POST /api/bookings
│   │   ├── email/
│   │   │   └── route.ts                    # POST /api/email — ACTIVE: sends confirmation/rejection emails via Nodemailer + Gmail SMTP
│   │   ├── inventory/
│   │   │   └── route.ts                    # GET / POST /api/inventory
│   │   └── reviews/
│   │       └── route.ts                    # GET / POST /api/reviews
│   ├── book/
│   │   ├── loading.tsx
│   │   └── page.tsx                        # /book — supports ?room= and ?date= query params
│   ├── cancelbooking/
│   │   ├── loading.tsx
│   │   └── page.tsx                        # /cancelbooking — find booking by ID + email, then cancel
│   ├── customer/
│   │   ├── loading.tsx
│   │   └── page.tsx                        # /customer — wired to AppContext so messages appear in Admin
│   ├── gallery/
│   │   ├── loading.tsx
│   │   └── page.tsx                        # /gallery
│   ├── login/
│   │   ├── loading.tsx
│   │   └── page.tsx                        # /login — admin login form
│   ├── rooms/
│   │   ├── loading.tsx
│   │   └── page.tsx                        # /rooms
│   ├── favicon.ico
│   ├── globals.css                         # Global styles: keyframes, scroll-reveal, marquee, card hovers, hero animations
│   ├── layout.tsx                          # Root layout — Google Fonts, wraps all pages in Providers
│   ├── loading.tsx                         # Root-level skeleton loader
│   └── page.tsx                            # / home route
│
├── components/
│   ├── admin/                              # Heavy sub-tabs rendered inside Admin.tsx
│   │   ├── AnalyticsTab.tsx                # Charts, booking stats, guest totals
│   │   ├── BookingsTab.tsx                 # Full bookings table with search, filter, and status actions
│   │   ├── InventoryTab.tsx                # Inventory management UI
│   │   └── InventoryTab.module.css         # Scoped CSS Module styles for InventoryTab
│   ├── booking/
│   │   └── BookingDatePicker.tsx           # Inline date picker used in BookNow Steps 3 and 10 (on-site)
│   ├── common/                             # Small reusable components shared across pages
│   │   ├── AvailabilityCalendar.tsx        # Shows booked / closed / available dates
│   │   └── Stars.tsx                       # Star rating renderer used in reviews and testimonials
│   ├── layout/                             # App-wide layout components present on every page
│   │   ├── ClientShell.tsx                 # Client-side shell wrapper for safe hydration
│   │   ├── Footer.tsx                      # Site footer with navigation links and contact info
│   │   ├── Navbar.tsx                      # Top navigation bar with active page highlighting
│   │   ├── PageTransition.tsx              # Animated transition wrapper between route changes
│   │   ├── Providers.tsx                   # Wraps app in ThemeProvider + ToastProvider + AppProvider
│   │   ├── ThemeToggle.tsx                 # Floating dark/light mode toggle button
│   │   └── TopLoader.tsx                   # Thin progress bar shown at the top during navigation
│   ├── sections/                           # Full-page content components, one per route
│   │   ├── About.tsx                       # Cinematic hero, floating orbs, expandable Why Choose cards, Google Maps embed
│   │   ├── Admin.tsx                       # Full admin dashboard — grouped sidebar, 10 tabs, all modals
│   │   ├── AdminLogin.tsx                  # Login form validated against ADMIN_CREDS in constants.ts
│   │   ├── BookNow.tsx                     # 7-step online booking + 2-step on-site reservation flow
│   │   ├── CancelBooking.tsx               # Find booking by ID + email, cancel reason picker, confirm modal
│   │   ├── CustomerService.tsx             # Contact form with Gmail validation, min-length checks, char counter
│   │   ├── Gallery.tsx                     # Photo grid with lightbox, prev/next arrows, image counter
│   │   ├── Home.tsx                        # Hero, rates, amenity bento grid + video modal, infinite marquee reviews
│   │   ├── RoomsPage.tsx                   # Room cards with hover zoom and click-to-open detail modal
│   │   └── AppShell.tsx                    # Legacy SPA routing shell (kept for reference)
│
├── contexts/                               # React Context — global shared state
│   ├── AppContext.tsx                      # Master state: bookings, rooms, gallery, closedDates, reviews, customerMessages, adminAuth
│   ├── ThemeContext.tsx                    # isDark toggle — persisted across sessions
│   └── ToastContext.tsx                    # Toast notification queue (success / error / warning / info)
│
├── hooks/                                  # Custom React hooks
│   ├── useAdmin.ts                         # Admin authentication helpers
│   ├── useBooking.ts                       # Booking form state and calculation helpers
│   ├── useReveal.ts                        # IntersectionObserver scroll-reveal — returns { ref, visible }
│   ├── useTheme.ts                         # Shorthand for useContext(ThemeContext)
│   ├── useToast.ts                         # Shorthand for useContext(ToastContext)
│   └── useWidth.ts                         # Window width — used for mobile/tablet/desktop breakpoints
│
├── lib/                                    # Pure utility modules — no React, no side effects
│   ├── constants.ts                        # INIT_ROOMS, INIT_BOOKINGS, PACKAGES, AMENITIES, ADMIN_CREDS, NAV links
│   ├── emailTemplate.ts                    # buildReceiptEmail(), buildRejectionEmail(), generateOTP() — HTML email builders used by /api/email
│   ├── mongoose.ts                         # MongoDB connection singleton (stub — ready to wire up)
│   ├── styles.ts                           # Shared style constants: gold (#c9a84c), goldBtn, outBtn
│   ├── theme.ts                            # T(isDark) — returns full color token object based on current theme
│   ├── utils.ts                            # fmt(), calcTotal(), genBookingId(), fmtTimer(), fmtDate()
│   └── validators.ts                       # isValidEmail(), isValidPHNumber(), validateBookingForm(), validateOnsiteForm()
│
├── models/                                 # Mongoose schema stubs — ready to connect to MongoDB Atlas
│   ├── Booking.ts
│   ├── Inventory.ts
│   ├── Review.ts
│   └── Room.ts
│
├── public/                                 # Static assets served at root URL (images, icons)
│
├── types/                                  # TypeScript type definitions — single source of truth
│   ├── admin.ts                            # AdminTab union type, CustomerMessage interface
│   ├── booking.ts                          # Booking interface (id, name, date, guests, status, paymentProof, etc.)
│   ├── index.ts                            # Re-exports all types from one import point
│   ├── inventory.ts                        # InventoryItem interface
│   ├── review.ts                           # Review interface (id, name, rating, message, date)
│   └── room.ts                             # Room interface (id, name, beds, capacity, price, img, desc)
│
├── .env.local                              # Secret environment variables (never committed)
├── .gitignore
├── .hintrc
├── AGENTS.md                               # AI agent context and instructions
├── CLAUDE.md                               # Claude-specific project notes
├── components.json                         # shadcn/ui configuration
├── eslint.config.mjs
├── next-env.d.ts
├── next.config.ts
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── README.md
├── tailwind.config.ts
└── tsconfig.json
```

---

## Admin Access

| Field    | Value            |
|----------|------------------|
| URL      | `/login`         |
| Username | `admin`          |
| Password | `stonewood2026`  |

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/stonewood
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=stonewood2026
GMAIL_USER=your.email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

> `GMAIL_USER` and `GMAIL_APP_PASSWORD` are required for email notifications. Generate an App Password from your Google Account → Security → 2-Step Verification → App Passwords.

---

## Pages

| Route            | Description                                             |
|------------------|---------------------------------------------------------|
| `/`              | Home — hero, rates, amenity bento grid, reviews marquee |
| `/rooms`         | Room listings with hover zoom and booking CTA           |
| `/gallery`       | Photo gallery with lightbox and prev/next navigation    |
| `/about`         | About Us — story, Why Choose cards, Google Maps         |
| `/book`          | Multi-step booking flow (online GCash + on-site)        |
| `/cancelbooking` | Cancel a reservation by reference ID + email            |
| `/customer`      | Customer service contact form                           |
| `/login`         | Admin login page                                        |
| `/admin`         | Admin dashboard — auth-guarded, 10 tabs                 |

---

## API Routes

| Method   | Endpoint              | Description                                         |
|----------|-----------------------|-----------------------------------------------------|
| `POST`   | `/api/auth/login`     | Validate admin credentials                          |
| `GET`    | `/api/bookings`       | Fetch all bookings                                  |
| `POST`   | `/api/bookings`       | Create a new booking                                |
| `GET`    | `/api/bookings/:id`   | Fetch a single booking by ID                        |
| `PATCH`  | `/api/bookings/:id`   | Update booking status                               |
| `DELETE` | `/api/bookings/:id`   | Delete a booking                                    |
| `POST`   | `/api/email`          | Send confirmation or rejection email via Gmail SMTP |
| `GET`    | `/api/inventory`      | Fetch all inventory items                           |
| `POST`   | `/api/inventory`      | Add a new inventory item                            |
| `GET`    | `/api/reviews`        | Fetch all reviews                                   |
| `POST`   | `/api/reviews`        | Submit a new review                                 |

> `/api/email` is **fully wired and active** — it sends real emails via Nodemailer + Gmail SMTP. All other routes are currently stubbed. Wire them by connecting `lib/mongoose.ts` and adding the handlers.

---

## Features

| Status | Feature |
|--------|---------|
| ✅ | Dark / Light theme toggle |
| ✅ | Toast notification system (success, error, warning, info) |
| ✅ | Top loading bar during navigation |
| ✅ | Skeleton loading screens on all pages |
| ✅ | Page transition animations between routes |
| ✅ | Scroll-reveal animations on homepage sections |
| ✅ | Infinite marquee testimonials |
| ✅ | Amenity bento grid with clickable video modal |
| ✅ | Multi-step online booking with GCash QR mock |
| ✅ | GCash payment policy modal with checkbox acknowledgement |
| ✅ | On-site reservation flow with reference ID |
| ✅ | Availability calendar (booked / closed / available) |
| ✅ | Cancel booking by reference ID + email |
| ✅ | Room listings with hover zoom and detail modal |
| ✅ | Photo gallery with lightbox and prev/next navigation |
| ✅ | Customer service form with Gmail + length validation |
| ✅ | Admin login with auth guard |
| ✅ | Admin grouped sidebar with section labels |
| ✅ | Admin dashboard — 10 tabs (Dashboard, Bookings, On-Site, Occupancy, Rooms, Gallery, Inventory, Analytics, Reports, Customer Service) |
| ✅ | Email notifications on booking confirm / reject — **Nodemailer + Gmail SMTP (live)** |
| ✅ | One-time access code (OTP) generated and emailed on confirmation |
| ✅ | Auto-reject overdue On Hold bookings (configurable window) |
| ✅ | Monthly CSV report export |
| ✅ | Fully responsive — mobile, tablet, desktop |
| 🔜 | MongoDB integration |
| 🔜 | Real GCash payment API |

---

## Resort Info

| Detail   | Value                         |
|----------|-------------------------------|
| Location | Angono, Rizal, Philippines    |
| Day Tour | ₱6,000 base (up to 30 guests) |
| Overtime | +₱500/hr after 5PM            |
| Rooms    | ₱2,000–₱2,500 / night         |
| Hours    | 8:00 AM – 5:00 PM             |
