# End-to-end tests

The QA pack's `tests/e2e/*.spec.ts` go here. They drive a REAL running stack,
so point them at staging — never production. They create bookings, payments
and inventory rows.

    E2E_BASE_URL=<staging url> npm run test:e2e

Browsers are not installed by `npm i`. Run `npx playwright install` once.

TC-05's last step (scanning the QR and PayMongo marking it paid) stays manual.
Use PayMongo test mode.
