# Integration tests

The QA pack's `tests/integration/*.test.ts` go here. They run the real API
route handlers against an in-memory stand-in for Supabase, with PayMongo and
Gmail mocked.

This file only exists to keep the folder in git: `jest.config.js` lists it in
`roots`, and Jest refuses to start if a configured root is missing.

One case to flip when the pack lands: `admin.test.ts` ›
*"an uploaded (data-URI) photo survives the save intact"* is marked
`it.failing` because the photo-truncation bug (audit W-1) was live when it was
written. That bug is fixed — `/api/rooms` now validates and refuses instead of
cutting to 2000 characters — so change `it.failing` to `it` or the suite will
report it as an unexpected pass. The same rule is covered meanwhile by
`tests/unit/image.test.ts`.
