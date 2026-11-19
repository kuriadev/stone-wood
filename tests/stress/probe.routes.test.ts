/* Stress probe (not part of the normal suite): every API route, as every
 * kind of user, with empty and junk input. Looks for crashes (500 / thrown)
 * and for actions a role shouldn't be able to do. In-memory database only. */
import { NextRequest } from "next/server";
import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { FakeDb } from "../helpers/fakeDb";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

const mockDb = new FakeDb() as FakeDb & Record<string, unknown>;
// What the in-memory copy doesn't model: file storage and RPC calls.
const bucket = { upload: async () => ({ data: { path: "x" }, error: null }), createSignedUrl: async () => ({ data: { signedUrl: "https://x/s" }, error: null }), getPublicUrl: () => ({ data: { publicUrl: "https://x/p" } }), remove: async () => ({ data: [], error: null }), list: async () => ({ data: [], error: null }), download: async () => ({ data: null, error: { message: "none" } }) };
mockDb.storage = { from: () => bucket, createBucket: async () => ({ error: null }), getBucket: async () => ({ data: {}, error: null }) };
mockDb.rpc = async () => ({ data: null, error: null });
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/mailer", () => ({ ...jest.requireActual("@/lib/mailer"), trySendMail: jest.fn(async () => true), sendMail: jest.fn(async () => undefined), isMailConfigured: () => true }));
jest.mock("@/lib/staffNotify.server", () => ({ ...jest.requireActual("@/lib/staffNotify.server"), notifyStaff: jest.fn(async () => []), alertCaretakerIfSoon: jest.fn(async () => {}) }));
jest.mock("@/lib/guestReminder.server", () => ({ ...jest.requireActual("@/lib/guestReminder.server"), remindGuestIfTomorrow: jest.fn(async () => {}) }));

const ROOT = join(__dirname, "../../app/api");
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === "route.ts") files.push(p); } };
walk(ROOT);

const cookie = (role: "Owner" | "FrontDesk" | "Caretaker") => `${SESSION_COOKIE}=${createSessionToken({ id: null, name: role, username: role.toLowerCase(), role })}`;
const ROLES = ["anon", "Caretaker", "FrontDesk", "Owner"] as const;
const BIG = "x".repeat(200_000);
const JUNK: Record<string, unknown> = {
  id: "NT-1", bookingId: "NT-1", email: "😀@😀", name: BIG, message: "<script>alert(1)</script>".repeat(50), amount: -1e12, guests: "many",
  date: "2026-02-31", items: "nope", status: { $ne: 1 }, type: ["x"], proof: "data:text/html;base64,PGh0bWw+", files: [{}], password: null, nested: { a: { b: { c: [1, 2, { d: BIG }] } } },
};

function seed() {
  mockDb.tables = {};
  const b = { id: "NT-1", name: "Ana Cruz", contact: "09171234567", email: "ana@example.com", date: "2026-11-25", end_date: "2026-11-25", guests: 2, package: "Night Stay", rooms: [], overtime: 0, total: 400, downpayment: 200, status: "Confirmed", payment_proof: true, notes: "", cancel_reason: null, created_at: "2026-11-01T10:00:00+08:00", source: "Online", resource: "Pool", tier: "Shared", archived: false, archived_at: null, slot: "Night", checked_in_at: null, checked_out_at: null, settled_at: null, settlement_note: "", confirmed_at: null, cancelled_at: null, refund_status: null, refund_amount: 0, held_amount: 0 };
  mockDb.seed("bookings", [b]).seed("payments", [{ id: 1, booking_id: "NT-1", guest_name: "Ana", type: "Downpayment", method: "GCash", amount: 200, reference: "r1", notes: "", received_at: "2026-11-01T10:00:00+08:00", voided: false }])
    .seed("customer_messages", [{ id: 1, name: "Ana", email: "ana@example.com", type: "Emergency", message: "Cancellation request for NT-1 (x):\n\nsick", date: "2026-11-19", archived_at: null, created_at: "2026-11-19T10:00:00Z", booking_id: "NT-1", attachments: [], resolution: null }])
    .seed("payment_proofs", [{ id: 1, booking_id: "NT-1", path: "NT-1/r.jpg", status: "Submitted", pay_choice: "Downpayment", amount_due: 200, ocr: {}, reference: "1012345678901", submitted_at: "2026-11-19T10:00:00Z" }]);
  for (const t of ["rooms", "facilities", "packages", "closed_dates", "date_change_requests", "damage_records", "damage_rates", "facility_inspections", "inventory", "inventory_movements", "expenses", "daily_closings", "staff", "owner_requests", "activity_log", "site_content", "settings", "gallery", "maintenance", "tasks", "role_permissions"]) mockDb.seed(t, []);
}

type Hit = { route: string; method: string; role: string; body: string; status: number | "THROW"; note?: string };
const hits: Hit[] = [];

it("calls every route as every role", async () => {
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, "/").replace(/\/route\.ts$/, "");
    const url = `http://localhost/api/${rel.replace(/\[id\]/g, "NT-1")}`;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
      const fn = mod[method] as ((r: NextRequest, c: unknown) => Promise<Response>) | undefined;
      if (typeof fn !== "function") continue;
      for (const role of ROLES) {
        for (const [bname, body] of [["empty", {}], ["junk", JUNK], ["array", [1, "two", null]], ["text", "not json"]] as const) {
          if (method === "GET" && bname !== "empty") continue;
          seed();
          const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": `10.${hits.length % 250}.1.${(hits.length >> 8) % 250}` };
          if (role !== "anon") headers.cookie = cookie(role);
          const q = method === "GET" || method === "DELETE" || method === "PATCH" ? "?id=1&booking=NT-1&email=ana@example.com" : "";
          const req = new NextRequest(url + q, { method, headers, ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
          try {
            const res = await fn(req, { params: Promise.resolve({ id: rel.includes("payment-proofs") || rel.includes("customer") ? "1" : "NT-1" }) });
            hits.push({ route: rel, method, role, body: bname, status: res.status });
          } catch (e) {
            hits.push({ route: rel, method, role, body: bname, status: "THROW", note: e instanceof Error ? e.message.slice(0, 120) : String(e) });
          }
        }
      }
    }
  }
  const crashes = hits.filter((h) => h.status === "THROW" || h.status === 500);
  const anonOk = hits.filter((h) => h.role === "anon" && typeof h.status === "number" && h.status < 300);
  const careOk = hits.filter((h) => h.role === "Caretaker" && typeof h.status === "number" && h.status < 300 && h.method !== "GET");
  const deskOk = hits.filter((h) => h.role === "FrontDesk" && typeof h.status === "number" && h.status < 300 && h.method !== "GET");
  const show = (xs: Hit[]) => [...new Set(xs.map((h) => `${h.role} ${h.method} ${h.route} [${h.body}] → ${h.status}${h.note ? ` ${h.note}` : ""}`))];
  console.log(["DETAIL:", ...show([...careOk, ...deskOk, ...crashes, ...anonOk.filter((h) => h.method !== "GET" || /maintenance|settings/.test(h.route))])].join(" || "));
  const uniq = (xs: Hit[]) => [...new Set(xs.map((h) => `${h.method} ${h.route}${h.note ? ` — ${h.note}` : ""}`))];
  console.log(`ROUTES ${files.length} | CALLS ${hits.length}`);
  console.log("CRASHES (500/throw):\n  " + (uniq(crashes).join("\n  ") || "none"));
  console.log("ANON 2xx:\n  " + (uniq(anonOk).join("\n  ") || "none"));
  console.log("CARETAKER writes 2xx:\n  " + (uniq(careOk).join("\n  ") || "none"));
  console.log("FRONTDESK writes 2xx:\n  " + (uniq(deskOk).join("\n  ") || "none"));
}, 600_000);
