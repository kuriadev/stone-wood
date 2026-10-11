import dayjs from "dayjs";
import type { Booking } from "@/types/booking";

/** A bookable date N days from the pinned "today" (see pinToday). */
export const inDays = (n: number) => dayjs().add(n, "day").format("YYYY-MM-DD");

/** Pin the clock so the booking window (today → +3 months, clamped to 31 Dec)
 *  is deterministic. Only Date is faked; timers and promises keep working. */
export function pinToday(iso = "2026-03-02T09:00:00+08:00") {
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"],
  });
}

export function makeBooking(o: Partial<Booking> = {}): Booking {
  return {
    id: "SW-00001",
    name: "Juan Dela Cruz",
    contact: "09171234567",
    email: "juan@gmail.com",
    date: inDays(7),
    guests: 10,
    package: "Day Tour",
    rooms: [],
    overtime: 0,
    total: 2000,
    downpayment: 1000,
    status: "Confirmed",
    paymentProof: true,
    notes: "",
    source: "Online",
    resource: "Pool",
    tier: "Shared",
    slot: "Day",
    ...o,
  } as Booking;
}

/** A bookings-table row (snake_case), as the DB returns it. */
export function makeBookingRow(o: Record<string, any> = {}) {
  return {
    id: "SW-00001", name: "Juan Dela Cruz", contact: "09171234567", email: "juan@gmail.com",
    date: inDays(7), end_date: o.date ?? inDays(7), guests: 10, package: "Day Tour", rooms: [], overtime: 0,
    total: 2000, downpayment: 1000, status: "Confirmed", payment_proof: true, notes: "", cancel_reason: null,
    created_at: new Date().toISOString(), source: "Online", resource: "Pool", tier: "Shared", archived: false,
    archived_at: null, payment_intent_id: null, slot: "Day", arrival_time: null, checked_in_at: null,
    checked_out_at: null, settled_at: null, settlement_note: "", confirmed_at: null, cancelled_at: null,
    choice_deadline: null, held_amount: 0, refund_status: null, refund_amount: 0, refund_sent_at: null,
    refund_receipt: null,
    ...o,
  };
}
