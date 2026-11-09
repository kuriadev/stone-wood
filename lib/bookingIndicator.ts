// ── Where a booking stands, in a few words and one colour
//
// For the All bookings list: instead of only "Confirmed booking", the row
// says what is happening with it -- waiting for approval, arriving today,
// on site, a balance to collect -- in the colour that says how soon to act
// (components/admin/signals.ts). Pure; tested in
// tests/unit/bookingIndicator.test.ts.

import type { Booking } from "@/types/booking";
import { isNoShow, isRefunded } from "@/lib/labels";
import { bookingEndDate } from "@/lib/utils";

export type IndicatorSignal = "urgent" | "attention" | "progress" | "done" | "guest" | "closed";

export interface Indicator {
  label: string;
  signal: IndicatorSignal;
  /** An Icon name (components/common/Icon.tsx). */
  icon: "clock" | "calendar" | "alert" | "users" | "cash" | "check-circle" | "x" | "history" | "refresh" | "user-x";
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * @param today   Manila date, YYYY-MM-DD
 * @param due     what the guest still owes (bookingMoney().due)
 * @param asksMove a guest date-change request is waiting
 */
export function bookingIndicator(b: Booking, today: string, due: number, asksMove = false): Indicator {
  if (isNoShow(b)) return { label: "No-show", signal: "closed", icon: "user-x" };
  if (isRefunded(b)) return { label: "Refunded", signal: "done", icon: "cash" };
  if (b.status === "Cancelled" && b.refundStatus === "Owed") return { label: "Refund owed", signal: "urgent", icon: "cash" };
  if (b.status === "Cancelled") return { label: "Cancelled", signal: "closed", icon: "x" };
  if (b.status === "ResortCancelled") return { label: "Waiting for the guest to choose", signal: "guest", icon: "history" };
  if (b.status === "Completed") {
    return due > 0
      ? { label: "Completed · balance unpaid", signal: "urgent", icon: "cash" }
      : { label: "Done", signal: "done", icon: "check-circle" };
  }
  if (b.status === "Pending") {
    return b.date < today
      ? { label: "Never approved · date passed", signal: "urgent", icon: "alert" }
      : { label: "Waiting for your approval", signal: "attention", icon: "clock" };
  }
  // Confirmed from here on.
  if (b.checkedOutAt) return { label: "Checked out · balance to collect", signal: "urgent", icon: "cash" };
  if (b.checkedInAt) return { label: "On site now", signal: "progress", icon: "users" };
  if (asksMove) return { label: "Asks to change date", signal: "attention", icon: "refresh" };
  const last = bookingEndDate(b);
  if (last < today) return { label: "Late · never checked in", signal: "urgent", icon: "alert" };
  if (b.date <= today) return { label: "Arriving today", signal: "attention", icon: "calendar" };
  const days = daysBetween(today, b.date);
  return { label: days === 1 ? "Coming tomorrow" : `Coming up · in ${days} days`, signal: "progress", icon: "calendar" };
}
