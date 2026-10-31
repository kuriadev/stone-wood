// SERVER ONLY -- the data-retention clean-up (rules in lib/retention.ts).

import { getSupabaseAdmin } from "@/lib/supabase";
import { manilaDate } from "@/lib/finance";
import { logActivity } from "@/lib/activity.server";
import {
  RETENTION_KEY, DEFAULT_RETENTION, validateRetention, retentionCutoff, isPurgeable, monthsLabel,
  type RetentionState,
} from "@/lib/retention";

const missingTable = (msg: string | undefined) => /site_content/.test(msg ?? "");

/** The saved settings and when it last ran; `ready` is false before the
 *  site_content table exists. */
export async function loadRetention(): Promise<{ state: RetentionState; ready: boolean }> {
  const { data, error } = await getSupabaseAdmin().from("site_content").select("data").eq("key", RETENTION_KEY).maybeSingle();
  if (error) {
    if (missingTable(error.message)) return { state: { ...DEFAULT_RETENTION }, ready: false };
    throw new Error(error.message);
  }
  const raw = ((data as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
  const v = validateRetention(raw);
  const settings = v.ok ? v.settings : DEFAULT_RETENTION;
  return {
    state: { ...settings, lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null, lastDeleted: typeof raw.lastDeleted === "number" ? raw.lastDeleted : null },
    ready: true,
  };
}

export async function saveRetention(state: RetentionState, by: string | null): Promise<string | null> {
  const { error } = await getSupabaseAdmin().from("site_content").upsert(
    { key: RETENTION_KEY, data: state, updated_at: new Date().toISOString(), updated_by_name: by },
    { onConflict: "key" },
  );
  if (error) return missingTable(error.message) ? "Data retention switches on once the database update (20261028130000_site_content.sql) is applied." : error.message;
  return null;
}

type Row = { id: string; date: string; end_date: string | null; status: string; refund_status: string | null };

/** The bookings that would be deleted with these months, oldest first. */
export async function findPurgeable(months: number): Promise<{ cutoff: string; ids: string[] }> {
  const cutoff = retentionCutoff(manilaDate(), months);
  // Every finished booking that started before the cutoff; the end date
  // and refund are checked here (isPurgeable), the same rule as the tests.
  const { data, error } = await getSupabaseAdmin().from("bookings")
    .select("id,date,end_date,status,refund_status")
    .in("status", ["Completed", "Cancelled"]).lt("date", cutoff).order("date");
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as Row[])
    .filter((r) => isPurgeable({ status: r.status, date: r.date, endDate: r.end_date, refundStatus: r.refund_status }, cutoff))
    .map((r) => r.id);
  return { cutoff, ids };
}

/** Delete them. Payments stay, anonymised. Returns how many went. */
export async function purgeBookings(months: number, how: "auto" | "manual"): Promise<{ deleted: number; cutoff: string }> {
  const db = getSupabaseAdmin();
  const { cutoff, ids } = await findPurgeable(months);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    // The money stays for the books, without the guest's name.
    const pay = await db.from("payments").update({ guest_name: "Deleted guest (data retention)" }).in("booking_id", chunk);
    if (pay.error) throw new Error(pay.error.message);
    const del = await db.from("bookings").delete().in("id", chunk);
    if (del.error) throw new Error(del.error.message);
    deleted += chunk.length;
  }
  if (deleted > 0 || how === "manual") {
    await logActivity({
      actor: how === "auto" ? "System" : "Admin", action: "data.retention", entity: "bookings", entityId: cutoff,
      summary: deleted > 0
        ? `${how === "auto" ? "Data retention deleted" : "Deleted"} ${deleted} finished booking${deleted === 1 ? "" : "s"} whose stay ended before ${cutoff} (kept for ${monthsLabel(months)}). Their payments were kept, without the guest's name.`
        : `Ran data retention by hand: no finished bookings older than ${monthsLabel(months)} to delete.`,
      details: { cutoff, months, deleted, ids: ids.slice(0, 500) },
    });
  }
  return { deleted, cutoff };
}
