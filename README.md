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

**Backend** *(stubs ready, not yet wired)*
- Next.js API Routes
- MongoDB Atlas
- Mongoose ODM

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

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

```
## Project Structure

stonewood/
├── app/                            # Next.js App Router
│   ├── about/
│   │   └── page.tsx
│   ├── admin/
│   │   └── page.tsx
│   ├── api/
│   │   ├── auth/login/route.ts
│   │   ├── bookings/
│   │   │   ├── [id]/route.ts
│   │   │   └── route.ts
│   │   ├── inventory/route.ts
│   │   └── reviews/route.ts
│   ├── book/page.tsx
│   ├── cancelbooking/page.tsx      # ✅ Added (missing in README)
│   ├── customer/page.tsx
│   ├── gallery/page.tsx
│   ├── login/page.tsx
│   ├── rooms/page.tsx
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   ├── admin/
│   │   ├── AnalyticsTab.tsx
│   │   ├── BookingsTab.tsx
│   │   ├── InventoryTab.tsx
│   │   └── InventoryTab.module.css
│   ├── booking/
│   │   └── BookingDatePicker.tsx
│   ├── common/
│   │   ├── AvailabilityCalendar.tsx
│   │   └── Stars.tsx
│   ├── layout/
│   │   ├── Footer.tsx
│   │   ├── Navbar.tsx
│   │   ├── Providers.tsx
│   │   └── ThemeToggle.tsx
│   ├── sections/
│   │   ├── About.tsx
│   │   ├── Admin.tsx
│   │   ├── AdminLogin.tsx
│   │   ├── BookNow.tsx
│   │   ├── CancelBooking.tsx      # ✅ Added
│   │   ├── CustomerService.tsx
│   │   ├── Gallery.tsx
│   │   ├── Home.tsx
│   │   └── RoomsPage.tsx
│   ├── ui/
│   │   └── AppShell.tsx
│
├── contexts/
│   ├── AppContext.tsx
│   ├── ThemeContext.tsx
│   └── ToastContext.tsx
│
├── hooks/
│   ├── useAdmin.ts
│   ├── useBooking.ts
│   ├── useTheme.ts
│   ├── useToast.ts
│   └── useWidth.ts
│
├── lib/
│   ├── constants.ts
│   ├── mongoose.ts
│   ├── styles.ts
│   ├── theme.ts
│   ├── utils.ts
│   └── validators.ts
│
├── models/
│   ├── Booking.ts
│   ├── Inventory.ts
│   ├── Review.ts
│   └── Room.ts
│
├── public/
│
├── types/
│   ├── admin.ts
│   ├── booking.ts
│   ├── index.ts
│   ├── inventory.ts
│   ├── review.ts
│   └── room.ts
│
├── .env.local
├── .gitignore
├── components.json
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
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

Create a `.env.local` file in the root with:

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/stonewood
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=stonewood2026
```

---

## Pages

| Route       | Description                          |
|-------------|--------------------------------------|
| `/`         | Home — hero, rates, amenities, reviews |
| `/rooms`    | Room listings with booking CTA       |
| `/gallery`  | Photo gallery with lightbox          |
| `/about`    | About Us + contact info              |
| `/book`     | Multi-step booking flow              |
| `/customer` | Customer service / contact form      |
| `/login`    | Admin login                          |
| `/admin`    | Admin dashboard (auth-guarded)       |

---

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Admin login — validates credentials |
| `GET` | `/api/bookings` | Fetch all bookings |
| `POST` | `/api/bookings` | Create a new booking |
| `GET` | `/api/bookings/:id` | Fetch a single booking by ID |
| `PATCH` | `/api/bookings/:id` | Update booking status |
| `DELETE` | `/api/bookings/:id` | Delete a booking |
| `GET` | `/api/inventory` | Fetch all inventory items |
| `POST` | `/api/inventory` | Add a new inventory item |
| `GET` | `/api/reviews` | Fetch all reviews |
| `POST` | `/api/reviews` | Submit a new review |

> All routes are currently stubbed. Wire them up by connecting `lib/mongoose.ts` and implementing the handlers.

---


## Resort Info

| Detail   | Value                          |
|----------|--------------------------------|
| Location | Angono, Rizal, Philippines     |
| Day Tour | ₱6,000 base (up to 30 guests)  |
| Overtime | +₱500/hr after 5PM             |
| Rooms    | ₱2,000–₱2,500 / night          |
| Hours    | 8:00 AM – 5:00 PM              |

