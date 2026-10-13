// ── Requests to the owner (server only)
//
// SERVER ONLY.
//
// Front desk can't refund, void, cancel, delete, write off a balance or
// close the day — those are the owner's (lib/permissions.ts). But stopping
// them at "Not authorised" would just send them to find the owner and
// explain it out loud, which is the workload this was meant to remove. So
// the refused call is RECORDED instead: the exact method, path and body,
// plus who asked and why. The owner sees it in Daily Operations and
// approves it with one tap, and approving replays that same call as the
// owner (app/api/requests). The refund, void and cancel logic therefore
// lives in one place only — the route that always did it.

import type { NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { logActivity } from "@/lib/activity.server";
import { trySendMail } from "@/lib/mailer";
import { adminNotifyTo, buildOwnerRequestAlert } from "@/lib/adminNotify";
import { fmt, fmtDate } from "@/lib/utils";
import { payMethodLabel, payTypeLabel } from "@/lib/labels";
import { REQUEST_LABEL, type Permission } from "@/lib/permissions";
import { missingStaffTable, type StaffIdentity } from "@/lib/staff.server";
import type { BookingRow, ExpenseRow, PaymentRow } from "@/types/database";
import type { OwnerRequest } from "@/types/admin";

export type { OwnerRequest };
export type RequestStatus = OwnerRequest["status"];

export interface OwnerRequestRow {
  id: number;
  kind: string;
  status: RequestStatus;
  method: string;
  path: string;
  body: unknown;
  summary: string;
  reason: string;
  booking_id: string | null;
  requested_by: string | null;
  requested_by_name: string;
  requested_at: string;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  last_error: string | null;
}

export const rowToRequest = (r: OwnerRequestRow): OwnerRequest => ({
  id: r.id,
  kind: r.kind as Permission,
  label: REQUEST_LABEL[r.kind as Permission] ?? r.kind,
  status: r.status,
  method: r.method,
  path: r.path,
  summary: r.summary,
  reason: r.reason,
  bookingId: r.booking_id,
  requestedBy: r.requested_by,
  requestedByName: r.requested_by_name,
  requestedAt: r.requested_at,
  decidedByName: r.decided_by_name,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
  lastError: r.last_error,
});

/** Kinds worth an email to the owner as well as the badge. Closing the day
 *  is routine and happens every evening; the owner sees it in the app. */
const EMAILED = new Set<Permission>([
  "bookings.cancel", "bookings.resortCancel", "bookings.delete",
  "payments.refund", "payments.void", "expenses.void", "payments.writeOff",
  "inventory.delete", "facilities.delete",
]);

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The reason the person typed into the form they were filling in. Every
 *  owner-only form already asks for one under some name. */
export function reasonIn(body: unknown): string {
  const b = (body ?? {}) as Record<string, unknown>;
  return (str(b.reason) || str(b.cancelReason) || str(b.note) || str(b.notes)).trim().slice(0, 300);
}

/** The booking a request is about, from its path or its body. */
export function bookingIdIn(path: string, body: unknown): string | null {
  const m = /^\/api\/bookings\/([^/?]+)/.exec(path);
  if (m) return decodeURIComponent(m[1]);
  const b = (body ?? {}) as Record<string, unknown>;
  return str(b.bookingId) || null;
}

/** The record a path points at with ?id=, as a number. */
const queryId = (path: string): number | null => {
  const q = path.split("?")[1] ?? "";
  const n = Number(new URLSearchParams(q).get("id"));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** One line the owner can decide on without opening anything:
 *  "Void ₱2,000 GCash payment on SW-10150 (Juan Dela Cruz)". Best effort —
 *  a lookup that fails still leaves a usable line. */
async function describe(perm: Permission, path: string, body: unknown, bookingId: string | null): Promise<string> {
  const db = getSupabaseAdmin();
  const b = (body ?? {}) as Record<string, unknown>;
  let guest = "";
  if (bookingId) {
    const { data } = await db.from("bookings").select("*").eq("id", bookingId).maybeSingle();
    if (data) {
      const bk = rowToBooking(data as BookingRow);
      guest = `${bk.id} (${bk.name}, ${fmtDate(bk.date)})`;
    } else guest = bookingId;
  }
  try {
    switch (perm) {
      case "payments.void": {
        const id = queryId(path);
        const { data } = id ? await db.from("payments").select("*").eq("id", id).maybeSingle() : { data: null };
        const p = data as PaymentRow | null;
        if (!p) return "Void a payment.";
        // "down payment", "full payment", "damage fee" — and "balance payment".
        const kind = payTypeLabel(p.type).toLowerCase();
        const what = /payment|fee|refund/.test(kind) ? kind : `${kind} payment`;
        return `Void the ${fmt(Number(p.amount))} ${payMethodLabel(p.method)} ${what}${p.booking_id ? ` on ${p.booking_id}` : ""} (${p.guest_name}).`;
      }
      case "expenses.void": {
        const id = queryId(path);
        const { data } = id ? await db.from("expenses").select("*").eq("id", id).maybeSingle() : { data: null };
        const e = data as ExpenseRow | null;
        return e ? `Void the ${fmt(Number(e.amount))} expense "${e.description}" (${e.category}, ${fmtDate(e.spent_on)}).` : "Void an expense.";
      }
      case "payments.refund":
        return /refund-request/.test(path)
          ? `Record that the guest chose a refund: ${guest}.`
          : `Send a ${fmt(Number(b.amount) || 0)} refund by ${str(b.method) || "—"} for ${guest}.`;
      case "bookings.cancel":
        return `Cancel ${guest}${str(b.cancelReason) ? ` — "${str(b.cancelReason)}"` : ""}.`;
      case "bookings.resortCancel":
        return `Cancel ${guest} because the resort can't host it.`;
      case "bookings.delete":
        return `Delete booking ${guest} permanently.`;
      case "payments.writeOff":
        return `Close ${guest} with the balance still unpaid.`;
      case "day.close":
        return `Close ${str(b.date) ? fmtDate(str(b.date)) : "the day"}: ${fmt(Number(b.countedCash) || 0)} counted in the drawer.`;
      case "inventory.delete": {
        const id = queryId(path);
        const { data } = id ? await db.from("inventory").select("name, qty, unit").eq("id", id).maybeSingle() : { data: null };
        const it = data as { name: string; qty: number; unit: string } | null;
        return it ? `Remove "${it.name}" from the stock list (${Number(it.qty)} ${it.unit} on record).` : "Remove a stock item.";
      }
      case "facilities.delete": {
        const id = queryId(path);
        const { data } = id ? await db.from("facilities").select("name").eq("id", id).maybeSingle() : { data: null };
        const name = (data as { name: string } | null)?.name ?? "a facility";
        return path.startsWith("/api/facilities?") && (b as Record<string, unknown>).active === false
          ? `Stop offering ${name} (it can be restored later).`
          : `Remove ${name} for good.`;
      }
      case "calendar.manage": {
        const date = str(b.date) || new URLSearchParams(path.split("?")[1] ?? "").get("date") || "";
        return `${(path.split("?")[0] === "/api/closed-dates" && str(b.date)) ? "Close the resort on" : "Reopen"} ${date ? fmtDate(date) : "a date"}${str(b.reason) ? ` — "${str(b.reason)}"` : ""}.`;
      }
      default:
        return `${REQUEST_LABEL[perm] ?? perm}${guest ? `: ${guest}` : ""}.`;
    }
  } catch {
    return `${REQUEST_LABEL[perm] ?? perm}${guest ? `: ${guest}` : ""}.`;
  }
}

/** The key that makes the same request twice the same request. */
function sameAs(row: Pick<OwnerRequestRow, "kind" | "method" | "path" | "booking_id" | "body">, perm: Permission, method: string, path: string, bookingId: string | null, body: unknown): boolean {
  if (row.kind !== perm || row.method !== method || row.path !== path || row.booking_id !== bookingId) return false;
  // Closing the day, or a calendar date: one per date.
  if (perm === "day.close" || perm === "calendar.manage") return str((row.body as Record<string, unknown> | null)?.date) === str((body as Record<string, unknown> | null)?.date);
  return true;
}

export type CreateResult =
  | { ok: true; id: number; duplicate: boolean; summary: string }
  | { ok: false; error: string; missingTable?: boolean };

/** Record the call `who` wasn't allowed to make, for the owner to approve. */
export async function createOwnerRequest(input: {
  perm: Permission;
  method: string;
  path: string;
  body: unknown;
  who: StaffIdentity;
}): Promise<CreateResult> {
  const { perm, method, path, body, who } = input;
  const db = getSupabaseAdmin();
  const bookingId = bookingIdIn(path, body);

  const pending = await db.from("owner_requests").select("id, kind, method, path, booking_id, body, summary")
    .eq("status", "Pending").eq("kind", perm);
  if (pending.error) {
    return missingStaffTable(pending.error)
      ? { ok: false, missingTable: true, error: "Only the super admin can do this. (Requests to the super admin switch on once the database update is applied.)" }
      : { ok: false, error: "Could not send this to the super admin. Try again." };
  }
  const dup = (pending.data as OwnerRequestRow[]).find((r) => sameAs(r, perm, method, path, bookingId, body));
  if (dup) return { ok: true, id: dup.id, duplicate: true, summary: dup.summary };

  const summary = await describe(perm, path, body, bookingId);
  const reason = reasonIn(body);
  const { data, error } = await db.from("owner_requests").insert({
    kind: perm,
    method,
    path,
    body: body ?? null,
    summary,
    reason,
    booking_id: bookingId,
    requested_by: who.id,
    requested_by_name: who.name,
  }).select("id").single();
  if (error) {
    console.error("[owner_requests] insert:", error.message);
    return { ok: false, error: "Could not send this to the super admin. Try again." };
  }
  let id = (data as { id: number }).id;

  // Two clicks a moment apart can both pass the duplicate check above
  // before either is saved. Look again now that this one is: if an older
  // identical request is pending, keep that one and drop this.
  const again = await db.from("owner_requests").select("id, kind, method, path, booking_id, body")
    .eq("status", "Pending").eq("kind", perm).order("id");
  const twins = ((again.data ?? []) as OwnerRequestRow[]).filter((r) => sameAs(r, perm, method, path, bookingId, body));
  if (twins.length > 1 && twins[0].id !== id) {
    await db.from("owner_requests").delete().eq("id", id);
    id = twins[0].id;
    return { ok: true, id, duplicate: true, summary };
  }

  await logActivity({
    actor: "Admin", action: "request.created", bookingId, entity: "owner_request", entityId: id,
    summary: `${who.name} asked the super admin: ${summary}${reason ? ` Reason: ${reason}` : ""}`,
    details: { kind: perm, method, path },
  });
  if (EMAILED.has(perm)) {
    const mail = buildOwnerRequestAlert({ label: REQUEST_LABEL[perm] ?? perm, summary, reason, by: who.name });
    void trySendMail({ to: adminNotifyTo(), subject: mail.subject, html: mail.html }, `owner-request ${id}`);
  }
  return { ok: true, id, duplicate: false, summary };
}

/** The body of a request as the guard sees it, without consuming the
 *  original — the route still reads it if the call goes ahead. */
export async function peekBody(req: NextRequest): Promise<unknown> {
  try {
    const text = await req.clone().text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** pathname + query, which is what a replay needs. */
export const pathOf = (req: NextRequest) => `${req.nextUrl.pathname}${req.nextUrl.search}`;
