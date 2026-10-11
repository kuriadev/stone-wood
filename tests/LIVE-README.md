# Live-system specs (real Supabase + PayMongo test key)

    E2E_BASE_URL=https://<your-deployment-or-http://localhost:3000> \
    E2E_ADMIN_USER=... E2E_ADMIN_PASS=... \
    E2E_ALLOW_WRITES=1 \
    npx playwright test tests/e2e/live --project=desktop-chrome

| Spec | Covers |
|---|---|
| 01-guest-booking-capacity | TC-03/04/05: 25/30 seats seeded; 6 refused, 5 accepted, Night independent, UI blocks then reaches QR |
| 02-admin-checkout-penalty | TC-10/14: UI check-out, 2×₱350, −₱100 adjust (reason required), DB state, forged rate ignored |
| 03-calendar-sync | TC-01: focus + 2-min poll sync, cancel reopens date, KNOWN DEFECT multi-day (test.fail) |

Optional: `E2E_PAY_VIA_TEST_URL=1` follows PayMongo's "simulate payment" link (sends a real email to `E2E_GUEST_EMAIL`).
Everything is tagged `E2E-<runId>` and removed in afterAll (payments voided, booking deleted, rate deleted, facility status restored).
Point `E2E_BASE_URL` at a preview deployment if you can: the specs write to whatever Supabase it uses.
