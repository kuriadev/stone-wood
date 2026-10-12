// ── GET    /api/requests       → requests to the owner        (staff)
// ── PATCH  /api/requests?id=   → approve or decline one       (owner only)
// ── DELETE /api/requests?id=   → withdraw one you sent        (who sent it, or the owner)
//
// A request is a call front desk wasn't allowed to make, recorded instead
// of refused (lib/ownerRequests.server.ts). The owner sees every pending
// one; everyone else sees the ones they sent, so they know what happened.
//
// ── Approving replays the original call ──
//
// The stored method, path and body are sent to the SAME route handler that
// refused them, this time carrying the owner's own session. That route then
// does everything it always does — checks the balance, emails the guest,
// writes the ledger and the activity log — as the owner. Nothing about a
// refund or a void is written twice, here and there.
//
// The request is claimed (Pending → Approved) BEFORE the replay, so two
// taps on Approve can't refund twice. If the action itself then fails (the
// payment was already voided, the day has unfinished bookings), the claim
// is released: the request goes back to Pending with the error on it.

import { NextResponse, NextRequest } from "next/server";
import { requirePermission, sessionOf, currentIdentity } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { can } from "@/lib/permissions";
import { rowToRequest, type OwnerRequestRow } from "@/lib/ownerRequests.server";
import { missingStaffTable, actingStaff } from "@/lib/staff.server";
import { logActivity } from "@/lib/activity.server";

export const dynamic = "force-dynamic";

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

/** The only calls a request may replay — the owner-only actions, nothing
 *  else, whatever a request row says. */
const ROUTES: { method: string; pattern: RegExp; load: () => Promise<Handler> }[] = [
  { method: "PATCH", pattern: /^\/api\/payments$/, load: async () => (await import("@/app/api/payments/route")).PATCH as unknown as Handler },
  { method: "POST", pattern: /^\/api\/payments$/, load: async () => (await import("@/app/api/payments/route")).POST as unknown as Handler },
  { method: "PATCH", pattern: /^\/api\/expenses$/, load: async () => (await import("@/app/api/expenses/route")).PATCH as unknown as Handler },
  { method: "POST", pattern: /^\/api\/closings$/, load: async () => (await import("@/app/api/closings/route")).POST as unknown as Handler },
  { method: "POST", pattern: /^\/api\/settle$/, load: async () => (await import("@/app/api/settle/route")).POST as unknown as Handler },
  { method: "PATCH", pattern: /^\/api\/bookings\/([^/]+)$/, load: async () => (await import("@/app/api/bookings/[id]/route")).PATCH as unknown as Handler },
  { method: "DELETE", pattern: /^\/api\/bookings\/([^/]+)$/, load: async () => (await import("@/app/api/bookings/[id]/route")).DELETE as unknown as Handler },
  { method: "POST", pattern: /^\/api\/bookings\/([^/]+)\/resort-cancel$/, load: async () => (await import("@/app/api/bookings/[id]/resort-cancel/route")).POST as unknown as Handler },
  { method: "POST", pattern: /^\/api\/bookings\/([^/]+)\/refund-request$/, load: async () => (await import("@/app/api/bookings/[id]/refund-request/route")).POST as unknown as Handler },
  { method: "DELETE", pattern: /^\/api\/inventory$/, load: async () => (await import("@/app/api/inventory/route")).DELETE as unknown as Handler },
  { method: "DELETE", pattern: /^\/api\/facilities$/, load: async () => (await import("@/app/api/facilities/route")).DELETE as unknown as Handler },
  { method: "PATCH", pattern: /^\/api\/facilities$/, load: async () => (await import("@/app/api/facilities/route")).PATCH as unknown as Handler },
  { method: "POST", pattern: /^\/api\/closed-dates$/, load: async () => (await import("@/app/api/closed-dates/route")).POST as unknown as Handler },
  { method: "DELETE", pattern: /^\/api\/closed-dates$/, load: async () => (await import("@/app/api/closed-dates/route")).DELETE as unknown as Handler },
];

const notReady = () => NextResponse.json({ success: false, error: "Requests switch on once the database update is applied." }, { status: 409 });

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "ops.view");
  if (denied) return denied;
  const me = actingStaff();
  try {
    const db = getSupabaseAdmin();
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    let q = db.from("owner_requests").select("*")
      .or(`status.eq.Pending,requested_at.gte.${since}`)
      .order("requested_at", { ascending: false })
      .limit(100);
    // The owner sees everyone's; anyone else sees their own.
    if (!can(me?.role, "requests.decide")) {
      if (!me?.id) return NextResponse.json({ success: true, requests: [], enabled: true });
      q = q.eq("requested_by", me.id);
    }
    const { data, error } = await q;
    if (error) {
      if (missingStaffTable(error)) return NextResponse.json({ success: true, requests: [], enabled: false });
      throw new Error(error.message);
    }
    return NextResponse.json({ success: true, requests: (data as OwnerRequestRow[]).map(rowToRequest), enabled: true });
  } catch (err) {
    console.error("[/api/requests GET]", err);
    return NextResponse.json({ success: false, error: "Could not load requests." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requirePermission(req, "requests.decide");
  if (denied) return denied;
  const owner = actingStaff();
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ success: false, error: "Which request?" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const decision = b.decision === "approve" ? "approve" : b.decision === "decline" ? "decline" : null;
  if (!decision) return NextResponse.json({ success: false, error: "Approve or decline?" }, { status: 400 });
  const note = String(b.note ?? "").replace(/[<>]/g, "").trim().slice(0, 300);

  const db = getSupabaseAdmin();
  const cur = await db.from("owner_requests").select("*").eq("id", id).maybeSingle();
  if (cur.error) return missingStaffTable(cur.error) ? notReady() : NextResponse.json({ success: false, error: "Could not load that request." }, { status: 500 });
  if (!cur.data) return NextResponse.json({ success: false, error: "That request no longer exists." }, { status: 404 });
  const r = cur.data as OwnerRequestRow;
  if (r.status !== "Pending") return NextResponse.json({ success: false, error: `This request was already ${r.status.toLowerCase()}.` }, { status: 409 });

  const decided = { decided_by: owner?.id ?? null, decided_by_name: owner?.name ?? "Owner", decided_at: new Date().toISOString(), decision_note: note || null };

  if (decision === "decline") {
    const { data, error } = await db.from("owner_requests").update({ status: "Declined", ...decided })
      .eq("id", id).eq("status", "Pending").select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Someone already answered this request." }, { status: 409 });
    await logActivity({
      actor: "Admin", action: "request.declined", bookingId: r.booking_id, entity: "owner_request", entityId: id,
      summary: `Declined ${r.requested_by_name}'s request: ${r.summary}${note ? ` Note: ${note}` : ""}`,
    });
    return NextResponse.json({ success: true, request: rowToRequest(data as OwnerRequestRow) });
  }

  // ── Approve ──
  const route = ROUTES.find((x) => x.method === r.method && x.pattern.test(r.path.split("?")[0]));
  if (!route) return NextResponse.json({ success: false, error: "This request can't be approved from here." }, { status: 400 });

  // Claim it first, so a second tap can't run the action twice.
  const claim = await db.from("owner_requests").update({ status: "Approved", ...decided, last_error: null })
    .eq("id", id).eq("status", "Pending").select().maybeSingle();
  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data) return NextResponse.json({ success: false, error: "Someone already answered this request." }, { status: 409 });

  let ok = false;
  let message = "The action failed.";
  let result: Record<string, unknown> = {};
  try {
    const handler = await route.load();
    const pathname = r.path.split("?")[0];
    const idParam = decodeURIComponent(route.pattern.exec(pathname)?.[1] ?? "");
    const replay = new NextRequest(new URL(r.path, req.nextUrl.origin), {
      method: r.method,
      headers: {
        // The owner's own session: the route checks it exactly as if the
        // owner had pressed the button.
        cookie: req.headers.get("cookie") ?? "",
        "content-type": "application/json",
        "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "",
      },
      body: r.method === "DELETE" || r.body == null ? undefined : JSON.stringify(r.body),
    });
    const res = await handler(replay, { params: Promise.resolve({ id: idParam }) });
    result = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    ok = res.ok && result.success !== false && result.requested !== true;
    if (!ok) message = typeof result.error === "string" ? result.error : message;
  } catch (err) {
    console.error(`[/api/requests] replay of request ${id} failed:`, err);
    message = "The action failed. Try again.";
  }

  if (!ok) {
    await db.from("owner_requests").update({ status: "Pending", decided_by: null, decided_by_name: null, decided_at: null, decision_note: null, last_error: message.slice(0, 300) })
      .eq("id", id);
    return NextResponse.json({ success: false, error: message }, { status: 409 });
  }

  await logActivity({
    actor: "Admin", action: "request.approved", bookingId: r.booking_id, entity: "owner_request", entityId: id,
    summary: `Approved ${r.requested_by_name}'s request: ${r.summary}${note ? ` Note: ${note}` : ""}`,
  });
  return NextResponse.json({ success: true, request: rowToRequest(claim.data as OwnerRequestRow), result });
}

export async function DELETE(req: NextRequest) {
  const denied = await requirePermission(req, "ops.view");
  if (denied) return denied;
  const s = sessionOf(req);
  const me = s ? await currentIdentity(s) : null;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ success: false, error: "Which request?" }, { status: 400 });
  const db = getSupabaseAdmin();
  const cur = await db.from("owner_requests").select("*").eq("id", id).maybeSingle();
  if (cur.error) return missingStaffTable(cur.error) ? notReady() : NextResponse.json({ success: false, error: "Could not load that request." }, { status: 500 });
  const r = cur.data as OwnerRequestRow | null;
  if (!r) return NextResponse.json({ success: false, error: "That request no longer exists." }, { status: 404 });
  if (r.requested_by !== me?.id && !can(me?.role, "requests.decide")) {
    return NextResponse.json({ success: false, error: "Only the person who sent it can withdraw it." }, { status: 403 });
  }
  const { data, error } = await db.from("owner_requests").update({ status: "Withdrawn", decided_at: new Date().toISOString(), decided_by_name: me?.name ?? null })
    .eq("id", id).eq("status", "Pending").select().maybeSingle();
  if (error) return NextResponse.json({ success: false, error: "Could not withdraw it." }, { status: 500 });
  if (!data) return NextResponse.json({ success: false, error: "The owner already answered this request." }, { status: 409 });
  await logActivity({
    actor: "Admin", action: "request.withdrawn", bookingId: r.booking_id, entity: "owner_request", entityId: id,
    summary: `Withdrew the request: ${r.summary}`,
  });
  return NextResponse.json({ success: true, request: rowToRequest(data as OwnerRequestRow) });
}
