// Test-only environment. No real Supabase, PayMongo or Gmail is ever contacted.
process.env.SESSION_SECRET = "test-session-secret-test-session-secret-0123456789";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "stonewood2026";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
