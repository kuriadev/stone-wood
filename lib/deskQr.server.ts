// ── A GCash payment taken at the front desk, checked before it is recorded ──
//
// The guest scans the resort's own GCash QR (Admin → Website Photos) and
// sends the money. Staff see it arrive in the resort's GCash app, then type
// the reference number from the guest's receipt (components/admin/
// QrPayModal.tsx). Before any route records it, this checks the reference
// looks like one and that no other payment already used it, so one GCash
// transfer can't be counted twice.

import { getSupabaseAdmin } from "@/lib/supabase";

/** A GCash / InstaPay reference: letters and digits, at least 6. */
export const isDeskQrRef = (ref: string) => /^[A-Za-z0-9-]{6,40}$/.test(ref.replace(/\s/g, ""));

/** The reference as it is stored: no spaces, upper case. */
export const cleanDeskRef = (ref: string) => ref.replace(/\s/g, "").toUpperCase().slice(0, 40);

/** null when the GCash payment can be recorded; otherwise what went wrong
 *  and the status to answer with. */
export async function checkDeskQr(reference: string, _amount?: number): Promise<{ error: string; status: number } | null> {
  if (!isDeskQrRef(reference)) return { error: "Type the GCash reference number from the guest's receipt.", status: 400 };
  const used = await getSupabaseAdmin().from("payments").select("id").eq("reference", cleanDeskRef(reference)).limit(1);
  if (used.data && used.data.length > 0) return { error: "That GCash reference is already recorded for another payment.", status: 409 };
  return null;
}
