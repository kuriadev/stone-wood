// The latest cancellation request on a booking (an "Emergency" message in
// Guest Messages), read by the guest routes. See lib/emergency.ts.

import { getSupabaseAdmin } from "@/lib/supabase";
import { EMERGENCY_TYPE, type CancelRequestState } from "@/lib/emergency";

export async function cancelRequestFor(bookingId: string): Promise<CancelRequestState> {
  try {
    const { data, error } = await getSupabaseAdmin().from("customer_messages")
      .select("resolution,resolution_note,created_at")
      .eq("booking_id", bookingId).eq("type", EMERGENCY_TYPE)
      .order("created_at", { ascending: false }).limit(1);
    if (error || !data?.length) return null;
    const r = data[0] as { resolution: string | null; resolution_note: string | null; created_at: string };
    return {
      status: r.resolution === "Approved" ? "Approved" : r.resolution === "Declined" ? "Declined" : "Pending",
      note: r.resolution_note ?? null,
      sentAt: r.created_at,
    };
  } catch {
    // Before the emergency migration: no requests.
    return null;
  }
}
