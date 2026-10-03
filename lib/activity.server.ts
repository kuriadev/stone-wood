// ── The activity log (server only)
//
// Every route that changes something records it here: who did it (the
// Admin, a Guest, or the System — PayMongo, a deadline passing), what
// happened in one plain sentence, which record, and what changed. The
// admin's Activity page and each booking's History read these rows.
//
// The table is append-only (a trigger refuses UPDATE and DELETE), so this
// is a record the owner can rely on, not a list anyone can tidy up.
//
// Logging never fails the action it describes: a write that went through
// must not be reported as failed because its log line didn't. A failure is
// written to the server log instead.

import { getSupabaseAdmin } from "@/lib/supabase";

export type Actor = "Admin" | "Guest" | "System";

export interface ActivityInput {
  actor: Actor;
  /** Dotted, e.g. "booking.cancelled_by_resort". The part before the dot is
   *  the category the Activity page filters on. */
  action: string;
  summary: string;
  bookingId?: string | null;
  entity?: string;
  entityId?: string | number | null;
  details?: Record<string, unknown>;
}

export async function logActivity(input: ActivityInput | ActivityInput[]): Promise<void> {
  const list = Array.isArray(input) ? input : [input];
  if (list.length === 0) return;
  try {
    const { error } = await getSupabaseAdmin().from("activity_log").insert(list.map((a) => ({
      actor: a.actor,
      action: a.action,
      summary: a.summary.slice(0, 500),
      booking_id: a.bookingId ?? null,
      entity: a.entity ?? a.action.split(".")[0],
      entity_id: a.entityId == null ? "" : String(a.entityId),
      details: a.details ?? {},
    })));
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[activity] could not record:", list.map((a) => a.action).join(", "), err);
  }
}

/** Fields whose value is too big or too private to copy into the log
 *  (photos are data URLs; the receipt too). They are noted as changed. */
const BULKY = new Set(["img", "gallery", "images", "photos", "refund_receipt", "refundReceipt", "checklist_before", "checklist_after", "checklistBefore", "checklistAfter"]);

/** What changed between two versions of a record, as { field: { from, to } }. */
export function changes(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  ignore: string[] = [],
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  if (!before || !after) return out;
  for (const key of Object.keys(after)) {
    if (ignore.includes(key)) continue;
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out[key] = BULKY.has(key) ? { from: "(changed)", to: "(changed)" } : { from: a ?? null, to: b ?? null };
  }
  return out;
}

/** "price, name and status" — for a one-line summary of a change. */
export function listFields(c: Record<string, unknown>): string {
  const keys = Object.keys(c).map((k) => k.replace(/_/g, " "));
  if (keys.length <= 1) return keys.join("");
  return `${keys.slice(0, -1).join(", ")} and ${keys[keys.length - 1]}`;
}

/** A row as it was before an update, for changes(). null if it can't be read. */
export async function loadRow(table: string, id: number | string): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await getSupabaseAdmin().from(table).select("*").eq("id", id).maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
  } catch {
    return null;
  }
}
