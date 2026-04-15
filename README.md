<<<<<<< HEAD
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

StoneWood Private Resort
Full-stack web application for StoneWood Private Resort — Angono, Rizal.
Tech Stack (NTM)
Frontend
Next.js 15 (App Router)
TypeScript
Tailwind CSS
React (built into Next.js)
Backend (stubs ready, not yet implemented)
Next.js API Routes
MongoDB Atlas
Mongoose ODM
dotenv
Deployment
Vercel
---
Getting Started
```bash
# Install dependencies
npm install

# Run development server
npm run dev
```
Open http://localhost:3000 in your browser.
---
Project Structure
```
stonewood-resort/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Entry point → AppShell
│   ├── globals.css             # Global styles + keyframe animations
│   └── api/                   # API route stubs (backend ready)
│       ├── auth/login/route.ts
│       ├── bookings/route.ts
│       ├── bookings/[id]/route.ts
│       ├── inventory/route.ts
│       └── reviews/route.ts
│
├── components/
│   ├── AppShell.tsx            # Main SPA shell + routing state
│   ├── layout/                 # Navbar, Footer, ThemeToggle, Providers
│   ├── sections/               # Full page sections
│   │   ├── Home.tsx
│   │   ├── RoomsPage.tsx
│   │   ├── Gallery.tsx
│   │   ├── About.tsx
│   │   ├── BookNow.tsx         # Full multi-step booking flow
│   │   ├── CustomerService.tsx
│   │   ├── AdminLogin.tsx
│   │   └── Admin.tsx           # Full admin dashboard
│   ├── admin/                  # Admin sub-components
│   │   ├── BookingsTab.tsx
│   │   ├── InventoryTab.tsx
│   │   └── AnalyticsTab.tsx
│   ├── booking/
│   │   └── BookingDatePicker.tsx
│   └── common/
│       ├── Stars.tsx
│       └── AvailabilityCalendar.tsx
│
├── contexts/
│   ├── ThemeContext.tsx         # Dark/Light theme
│   └── ToastContext.tsx         # Toast notifications
│
├── hooks/
│   ├── useTheme.ts
│   ├── useToast.ts
│   ├── useWidth.ts
│   ├── useBooking.ts
│   └── useAdmin.ts
│
├── lib/
│   ├── constants.ts            # All mock data (INIT_ROOMS, INIT_BOOKINGS, etc.)
│   ├── theme.ts                # T() color theme generator
│   ├── utils.ts                # fmt(), calcTotal(), fmtDate(), etc.
│   ├── styles.ts               # goldBtn, outBtn, gold constant
│   ├── validators.ts           # Form validation functions
│   └── mongoose.ts             # DB connection stub (backend)
│
├── models/                     # Mongoose model stubs (backend)
│   ├── Booking.ts
│   ├── Room.ts
│   ├── Review.ts
│   └── Inventory.ts
│
└── types/
    ├── room.ts
    ├── booking.ts
    ├── inventory.ts
    ├── review.ts
    ├── admin.ts
    └── index.ts
```
---
Admin Access
URL: Click "ADMIN" in the navbar
Username: `admin`
Password: `stonewood2026`
---
Environment Variables
Copy `.env.local` and fill in your values:
```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/stonewood
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=stonewood2026
```
---
Backend (Next Steps)
The API route stubs in `app/api/` and Mongoose model stubs in `models/` are ready.  
To activate the backend:
Set `MONGODB_URI` in `.env.local`
Uncomment the code in `lib/mongoose.ts`
Uncomment the schemas in each `models/*.ts` file
Implement the route handlers in each `app/api/*/route.ts` file
Replace `useState` mock data in `AppShell.tsx` with `useEffect` API calls
---
Features
✅ Dark / Light theme toggle
✅ Toast notifications
✅ Multi-step online booking flow (GCash QR mock)
✅ On-site reservation flow
✅ Availability calendar
✅ Rooms page with room selection
✅ Gallery with lightbox
✅ About Us page
✅ Customer Service form
✅ Admin login (protected)
✅ Admin dashboard — bookings, rooms, gallery, inventory, analytics, reports, customer service
✅ Auto-reject overdue bookings
✅ Responsive (mobile + desktop)
🔜 MongoDB integration
🔜 Real GCash payment API
🔜 Email notifications
=======
# stone-wood
The purpose of this project is to design and develop a web-based system that functions as both a marketing platform and an operational tool for a private resort business. 
>>>>>>> b680ab416f6f1a10a0cceffb4fee10a08898b731
