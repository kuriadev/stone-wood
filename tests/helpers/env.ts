/* Environment for the Jest run. `setupFiles` executes this before any test
 * file is imported, which matters: lib/auth.ts and lib/supabase.ts read
 * these at module load, so setting them inside a test would be too late.
 *
 * Every value here is FAKE and local to the test process. Nothing in this
 * file should ever hold a real key — the repo is public, and the test suite
 * must not be able to reach the live Supabase project or PayMongo.
 *
 * PLACEHOLDER: the QA pack ships its own tests/helpers/env.ts. Dropping that
 * folder in replaces this file, which exists so `npm test` is runnable (and
 * fails for the right reason) before then.
 */

// Signing key for the admin session cookie. Any non-empty value works; a
// fixed one keeps tokens reproducible across a run.
process.env.SESSION_SECRET ??= "test-session-secret-not-a-real-key";

// Admin fallback credentials (lib/auth.ts uses these when the
// admin_credentials table is empty).
process.env.ADMIN_USERNAME ??= "admin";
process.env.ADMIN_PASSWORD ??= "test-password";

// Supabase. Pointed at a URL that resolves nowhere, so an un-mocked call
// fails loudly instead of quietly reaching a real project.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://supabase.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

// PayMongo. Same idea: a base URL that cannot be reached by accident.
process.env.PAYMONGO_SECRET_KEY ??= "sk_test_not_a_real_key";
process.env.PAYMONGO_API_BASE ??= "http://paymongo.invalid";

// Mail. lib/mailer.ts is mocked in the suite; these stop it throwing on import.
process.env.GMAIL_USER ??= "test@example.com";
process.env.GMAIL_APP_PASSWORD ??= "test-app-password";

// Links printed into emails and metadata.
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.NEXT_PUBLIC_SITE_URL ??= "http://localhost:3000";

export {};
