// SERVER ONLY -- auto-archive and the scheduled archive clean-up (rules in
// lib/retention.ts). A clean-up emails a CSV backup of what it is about to
// delete first, and deletes nothing if that email doesn't go out.

import { getSupabaseAdmin } from "@/lib/supabase";
import { manilaDate, toCsv } from "@/lib/finance";
import { sendMail } from "@/lib/mailer";
import { adminNotifyTo } from "@/lib/adminNotify";
import { logActivity } from "@/lib/activity.server";
import {
  RETENTION_KEY, DEFAULT_RETENTION, DELETE_AFTER_MONTHS, validateRetention, retentionCutoff, isArchivable, isDeletableFromArchive, monthsLabel,
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
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null);
  const num = (k: string) => (typeof raw[k] === "number" ? (raw[k] as number) : null);
  return {
    state: {
      ...settings,
      lastRunAt: str("lastRunAt"), lastDeleted: num("lastDeleted"), lastArchived: num("lastArchived"),
      lastPurgeOn: str("lastPurgeOn"), enabledOn: str("enabledOn"),
    },
    ready: true,
  };
}

export async function saveRetention(state: RetentionState, by: string | null): Promise<string | null> {
  const { error } = await getSupabaseAdmin().from("site_content").upsert(
    { key: RETENTION_KEY, data: state, updated_at: new Date().toISOString(), updated_by_name: by },
    { onConflict: "key" },
  );
  if (error) return missingTable(error.message) ? "This switches on once the database update (20261028130000_site_content.sql) is applied." : error.message;
  return null;
}

type Row = { id: string; date: string; end_date: string | null; status: string; refund_status: string | null; archived: boolean | null };
const COLS = "id,date,end_date,status,refund_status,archived";
const asCandidate = (r: Row) => ({ status: r.status, date: r.date, endDate: r.end_date, refundStatus: r.refund_status, archived: r.archived });

/** Finished bookings old enough to archive. */
export async function findArchivable(months: number): Promise<{ cutoff: string; ids: string[] }> {
  const cutoff = retentionCutoff(manilaDate(), months);
  const { data, error } = await getSupabaseAdmin().from("bookings").select(COLS)
    .in("status", ["Completed", "Cancelled"]).eq("archived", false).lt("date", cutoff).order("date");
  if (error) throw new Error(error.message);
  return { cutoff, ids: ((data ?? []) as Row[]).filter((r) => isArchivable(asCandidate(r), cutoff)).map((r) => r.id) };
}

/** Archived bookings that a deletion would remove: only those whose stay
 *  ended more than a year ago. */
export async function findDeletable(): Promise<{ cutoff: string; ids: string[] }> {
  const cutoff = retentionCutoff(manilaDate(), DELETE_AFTER_MONTHS);
  const { data, error } = await getSupabaseAdmin().from("bookings").select(COLS)
    .eq("archived", true).in("status", ["Completed", "Cancelled"]).lt("date", cutoff).order("date");
  if (error) throw new Error(error.message);
  return { cutoff, ids: ((data ?? []) as Row[]).filter((r) => isDeletableFromArchive(asCandidate(r), cutoff)).map((r) => r.id) };
}

/** The backup email failed, so nothing was deleted. Its message is shown
 *  to the owner as it is. */
export class BackupError extends Error {}

const cell = (v: unknown): string | number =>
  v === null || v === undefined ? "" : typeof v === "number" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);

/** Every column of every booking about to be deleted, as CSV, emailed to
 *  the resort. Throws BackupError if it can't be sent. */
async function emailBackup(ids: string[], cutoff: string, dueOn: string | undefined): Promise<string> {
  const db = getSupabaseAdmin();
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("bookings").select("*").in("id", ids.slice(i, i + 200)).order("date");
    if (error) throw new BackupError(`Could not read the bookings for the backup, so nothing was deleted. (${error.message})`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
  }
  const cols = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set<string>()));
  const csv = toCsv([cols, ...rows.map((r) => cols.map((c) => cell(r[c])))]);
  const today = manilaDate();
  const to = adminNotifyTo();
  try {
    await sendMail({
      to,
      subject: `Backup before deleting ${rows.length} archived booking${rows.length === 1 ? "" : "s"} (${today})`,
      html: `<p>Attached is a CSV backup of the ${rows.length} archived booking${rows.length === 1 ? "" : "s"} whose stay ended before ${cutoff}.</p>`
        + `<p>${dueOn ? `The scheduled clean-up for ${dueOn}` : "A clean-up started by hand"} deletes them from the system right after this email is sent. Keep this file: it is the only copy of the guest details.</p>`
        + `<p>Payments stay in Sales, without the guest's name.</p>`,
      attachments: [{ filename: `Stonewood_Archive_Backup_${today}.csv`, content: csv, contentType: "text/csv; charset=utf-8" }],
    });
  } catch (err) {
    throw new BackupError(`The backup email could not be sent, so nothing was deleted. (${err instanceof Error ? err.message : String(err)})`);
  }
  return to;
}

/** Move old finished bookings to the archive. Nothing is deleted. */
export async function archiveOld(months: number, how: "auto" | "manual"): Promise<{ archived: number; cutoff: string }> {
  const db = getSupabaseAdmin();
  const { cutoff, ids } = await findArchivable(months);
  const at = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db.from("bookings").update({ archived: true, archived_at: at }).in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  if (ids.length > 0 || how === "manual") {
    await logActivity({
      actor: how === "auto" ? "System" : "Admin", action: "bookings.auto_archive", entity: "bookings", entityId: cutoff,
      summary: ids.length > 0
        ? `${how === "auto" ? "Auto-archived" : "Archived"} ${ids.length} finished booking${ids.length === 1 ? "" : "s"} whose stay ended before ${cutoff} (${monthsLabel(months)} after the stay).`
        : `Archived by hand: no finished bookings older than ${monthsLabel(months)}.`,
      details: { cutoff, months, archived: ids.length, ids: ids.slice(0, 500) },
    });
  }
  return { archived: ids.length, cutoff };
}

/** Delete archived bookings older than a year, after emailing a CSV
 *  backup of them. Payments stay, anonymised. */
export async function purgeArchive(how: "auto" | "manual", dueOn?: string): Promise<{ deleted: number; backupTo: string | null }> {
  const db = getSupabaseAdmin();
  const { cutoff, ids } = await findDeletable();
  const backupTo = ids.length > 0 ? await emailBackup(ids, cutoff, dueOn) : null;
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
      actor: how === "auto" ? "System" : "Admin", action: "data.retention", entity: "bookings", entityId: dueOn ?? manilaDate(),
      summary: deleted > 0
        ? `${how === "auto" ? `Scheduled clean-up (${dueOn}) deleted` : "Deleted"} ${deleted} archived booking${deleted === 1 ? "" : "s"} whose stay ended before ${cutoff}, after emailing a CSV backup to ${backupTo}. Their payments were kept, without the guest's name.`
        : `Archive clean-up by hand: nothing archived ended before ${cutoff}.`,
      details: { deleted, cutoff, backupTo, dueOn: dueOn ?? null, ids: ids.slice(0, 500) },
    });
  }
  return { deleted, backupTo };
}
