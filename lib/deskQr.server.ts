// ── A QR Ph payment taken at the front desk, checked before it is recorded ──
//
// Staff never type a QR Ph reference: they press "Generate QR code", the
// guest scans it (components/admin/QrPayModal.tsx, /api/payment/desk), and
// the PayMongo payment id comes back as the reference. Before any route
// records it, this asks PayMongo that it really went through, for exactly
// the amount being recorded, and that no other payment already used it.

import { getPaymentStatus } from "@/lib/paymongo";
import { getSupabaseAdmin } from "@/lib/supabase";

export const isDeskQrRef = (ref: string) => /^pi_[A-Za-z0-9]+$/.test(ref);

/** null when the QR payment checks out; otherwise what went wrong and the status to answer with. */
export async function checkDeskQr(reference: string, amount: number): Promise<{ error: string; status: number } | null> {
  if (!isDeskQrRef(reference)) return { error: "Collect QR Ph with the Generate QR code button, so the guest scans the code.", status: 400 };
  try {
    const st = await getPaymentStatus(reference);
    if (st.status !== "succeeded") return { error: "That QR payment hasn't gone through yet.", status: 409 };
    if (Math.round(st.amountCentavos) !== Math.round(amount * 100)) return { error: "The QR payment was for a different amount. Make a new code.", status: 409 };
  } catch {
    return { error: "Couldn't confirm the QR payment with PayMongo. Try again in a moment.", status: 502 };
  }
  const used = await getSupabaseAdmin().from("payments").select("id").eq("reference", reference).limit(1);
  if (used.data && used.data.length > 0) return { error: "That QR payment is already recorded.", status: 409 };
  return null;
}
