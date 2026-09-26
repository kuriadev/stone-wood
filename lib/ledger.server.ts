// Server-only helpers shared by the payment and checkout routes: load one
// booking's money picture straight from the database, so an amount is
// checked against the real balance, never against what a browser believes.

import { getSupabaseAdmin, rowToBooking, rowToPayment, rowToDamage } from "@/lib/supabase";
import { bookingMoney } from "@/lib/finance";
import type { BookingRow, PaymentRow, DamageRecordRow } from "@/types/database";

export async function loadBookingLedger(bookingId: string) {
  const db = getSupabaseAdmin();
  const [b, p, d] = await Promise.all([
    db.from("bookings").select("*").eq("id", bookingId).maybeSingle(),
    db.from("payments").select("*").eq("booking_id", bookingId),
    db.from("damage_records").select("*").eq("booking_id", bookingId),
  ]);
  if (b.error) throw new Error(b.error.message);
  if (p.error) throw new Error(p.error.message);
  if (d.error) throw new Error(d.error.message);
  if (!b.data) return null;
  const booking = rowToBooking(b.data as BookingRow);
  const payments = (p.data as PaymentRow[]).map(rowToPayment);
  const damages = (d.data as DamageRecordRow[]).map(rowToDamage);
  return { booking, payments, damages, money: bookingMoney(booking, payments, damages) };
}
