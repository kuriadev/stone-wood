// ── Walk-ins, and bookings imported from a spreadsheet
//
// SERVER ONLY. One set of rules for a booking staff enter themselves: the
// front desk's walk-in window (POST /api/bookings) and the import of
// bookings taken while the internet was down (POST /api/bookings/import).
//
// Split in two so the import can check a whole sheet before saving any of
// it: checkWalkIn validates, prices and checks availability without
// writing; saveWalkIn writes the booking and the money taken.

import { getSupabaseAdmin, rowToBooking, bookingToRow, missingNewColumn, withoutNewColumns } from "@/lib/supabase";
import { isValidEmail, isValidPHNumber, sanitizeName, sanitizeNotes, NAME_MIN, NAME_MAX, OVERTIME_MAX, MAX_STAY_DAYS, isInBookingYear, currentBookingYear } from "@/lib/validators";
import { logActivity } from "@/lib/activity.server";
import { daysInRange, fmt, fmtDate, getPackageTier } from "@/lib/utils";
import { priceBooking, pricingProblem, packageAvailed, bookingLabel, packagePriceToday } from "@/lib/pricing";
import type { PackageDiscount } from "@/types/package";
import { checkFits } from "@/lib/rebooking.server";
import { manilaDate } from "@/lib/finance";
import type { BookingRow } from "@/types/database";
import type { Booking, BookingResource, BookingSlot, BookingSource, BookingTier } from "@/types/booking";

const RESOURCES: BookingResource[] = ["Pool", "Venue", "Pool+Venue"];
const TIERS: BookingTier[] = ["Shared", "Exclusive"];
const SOURCES: BookingSource[] = ["Online", "Walk-In"];
const SLOTS: BookingSlot[] = ["Day", "Night", "WholeDay"];
const PAY_METHODS = ["Cash", "GCash", "Bank Transfer"];

export interface WalkInPlan {
  /** The bookings row to insert. */
  row: Record<string, unknown>;
  /** The same booking as the app sees it, for checking the next rows of an
   *  import against it before anything is saved. */
  booking: Booking;
  pay: { method: string; amount: number; reference: string } | null;
  total: number;
}

export type WalkInCheck = { ok: true; plan: WalkInPlan } | { ok: false; status: number; error: string };

const bad = (error: string, status = 400): WalkInCheck => ({ ok: false, status, error });

/**
 * Is this walk-in valid, what does it cost, and does it fit?
 *
 * `alsoHeld`: bookings not saved yet that it must fit beside, the earlier
 * rows of the same import. `fromToday`: refuse a date already gone by. The
 * walk-in window allows one (a stay recorded after the fact); the import is
 * for upcoming bookings only, so "Completed = paid + inspected" stays true.
 */
export async function checkWalkIn(body: Record<string, unknown>, opts: { alsoHeld?: Booking[]; fromToday?: boolean } = {}): Promise<WalkInCheck> {
  const b = body as Partial<Booking>;
  const name = sanitizeName(String(b.name ?? "")).trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const contact = String(b.contact ?? "").trim();

  if (name.length < NAME_MIN || name.length > NAME_MAX) return bad("A valid name is required.");
  // Walk-in guests often have no email, and that's fine. One that IS given
  // must be real, or confirmation emails would bounce.
  if (email && !isValidEmail(email)) return bad("That email address isn't valid.");
  if (!isValidPHNumber(contact)) return bad("A valid PH contact number is required.");
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))) return bad("A valid date is required.");
  // A walk-in can be booked over several days too. Unset or equal to the
  // start means one day, which is what every older record is.
  const startDate = String(b.date);
  if (opts.fromToday && startDate < manilaDate()) return bad("That date has already passed. Only bookings from today on can be imported.");
  const endDate = typeof b.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.endDate) ? b.endDate : startDate;
  if (endDate < startDate) return bad("The last day of the stay must be on or after the first.");
  // Bookings are taken for the current year only, staff-entered ones too.
  if (!isInBookingYear(startDate) || !isInBookingYear(endDate)) {
    return bad(`Bookings can only be made for dates in ${currentBookingYear().year}.`);
  }
  const stayDays = daysInRange(startDate, endDate);
  if (stayDays < 1 || stayDays > MAX_STAY_DAYS) return bad(`A booking can run for at most ${MAX_STAY_DAYS} days.`);
  const db = getSupabaseAdmin();
  // Every day of a stay has to be open, not just the first. A one-day walk-in
  // is the front desk's call (the guest is standing there); an imported
  // booking is checked like any other.
  if (stayDays > 1 || opts.fromToday) {
    const shut = await db.from("closed_dates").select("date").gte("date", startDate).lte("date", endDate).order("date").limit(1);
    if (shut.error) throw new Error(shut.error.message);
    if (shut.data && shut.data.length > 0) return bad(`The resort is closed on ${fmtDate((shut.data as { date: string }[])[0].date)}.`, 409);
  }
  const guests = Number(b.guests);
  if (!Number.isFinite(guests) || guests < 1) return bad("Guest count must be at least 1.");

  // Priced here from the database's own package and room prices, with the
  // same priceBooking the walk-in window and Book Now use, rather than
  // taken from the screen. The total decides the balance every later
  // payment is checked against, so it has to be the real one.
  const slotIn: BookingSlot = SLOTS.includes(b.slot as BookingSlot) ? (b.slot as BookingSlot) : "Day";
  const resourceIn: BookingResource = RESOURCES.includes(b.resource as BookingResource) ? (b.resource as BookingResource) : "Pool";
  const tierIn: BookingTier = TIERS.includes(b.tier as BookingTier) ? (b.tier as BookingTier) : getPackageTier(Math.round(guests), slotIn, resourceIn);
  const overtimeIn = slotIn === "Day" ? Math.min(OVERTIME_MAX, Math.max(0, Math.round(Number(b.overtime) || 0))) : 0;
  const roomIds = Array.isArray(b.rooms) ? b.rooms.map(Number).filter(Number.isFinite) : [];
  // Includes the single-date rule: only a Whole Day can span dates.
  const isWalkInPackage = typeof b.walkInPackageCode === "string" && !!b.walkInPackageCode;
  const notOffered = pricingProblem(resourceIn, tierIn, slotIn, stayDays, isWalkInPackage);
  if (notOffered) return bad(notOffered);
  let pkg: { price: number; requiresRoom: boolean } | null = null;
  if (isWalkInPackage) {
    // select("*") so a promo is read when the column exists and simply
    // absent before its migration.
    const p = await db.from("packages").select("*").eq("code", b.walkInPackageCode).maybeSingle();
    if (p.error) throw new Error(p.error.message);
    if (!p.data || !(p.data as { active: boolean }).active) return bad("That package is no longer offered.", 409);
    const row = p.data as { price: number; requires_room: boolean; discount?: PackageDiscount | null };
    // The promo price while a promo runs, the same as online.
    pkg = { price: packagePriceToday({ price: Number(row.price), discount: row.discount }, manilaDate()).pay, requiresRoom: !!row.requires_room };
  }
  const roomRows = roomIds.length ? await db.from("rooms").select("id, price").in("id", roomIds) : { data: [], error: null };
  if (roomRows.error) throw new Error(roomRows.error.message);
  if ((roomRows.data as unknown[]).length !== roomIds.length) return bad("One of the rooms doesn't exist.", 409);
  const roomPrices = (roomRows.data as { id: number; price: number }[]).map((r) => Number(r.price));
  const total = priceBooking({ pkg, resource: resourceIn, tier: tierIn, slot: slotIn, guests: Math.round(guests), overtime: overtimeIn, roomPrices, days: stayDays }).total;
  const downpayment = Math.ceil(total / 2);

  // The same check the walk-in window shows, enforced here too: the pool
  // or the events venue Under Maintenance, a full pool, a taken slot or
  // room. The window can be stale (another tab, a guest booking online
  // meanwhile), and the server is what decides.
  const candidate: Booking = {
    ...(b as Booking), id: "", name, email, contact, date: startDate, endDate, guests: Math.round(guests),
    resource: resourceIn, tier: tierIn, slot: slotIn, overtime: overtimeIn, rooms: roomIds,
    total, downpayment, status: "Confirmed", paymentProof: true, notes: "", package: "",
  };
  const fits = await checkFits(candidate, opts.alsoHeld ?? []);
  if (!fits.ok) return bad(fits.error, 409);

  // The money taken decides the status: any payment makes it a real
  // reservation (Confirmed); none leaves it Pending until the guest pays.
  // The booking itself stores the REQUIRED down payment (50%); what was
  // actually received goes into the payments ledger.
  const payIn = b.initialPayment;
  const payAmount = payIn ? Math.round(Number(payIn.amount) * 100) / 100 : 0;
  if (payIn && (!Number.isFinite(payAmount) || payAmount <= 0 || payAmount > total || !PAY_METHODS.includes(payIn.method))) {
    return bad(payAmount > total ? `The amount paid is more than the total of ${fmt(total)}.` : "The payment taken is not valid.");
  }
  const reference = String(payIn?.reference ?? "").replace(/[<>]/g, "").trim().slice(0, 80);
  if (payIn && payIn.method !== "Cash" && !reference) return bad(`Enter the ${payIn.method} reference number.`);
  const pay = payIn ? { method: payIn.method, amount: payAmount, reference } : null;
  const status = pay ? "Confirmed" : "Pending";

  const booking: Booking = {
    ...(b as Booking),
    id: "",
    name,
    email,
    contact,
    date: startDate,
    endDate,
    guests: Math.round(guests),
    total,
    downpayment,
    status,
    paymentProof: !!pay,
    arrivalTime: typeof b.arrivalTime === "string" && /^\d{2}:\d{2}$/.test(b.arrivalTime) ? b.arrivalTime : undefined,
    rooms: roomIds,
    // Overtime is Day-only and capped (see OVERTIME_MAX).
    overtime: overtimeIn,
    notes: sanitizeNotes(String(b.notes ?? "")),
    // The walk-in window sends the label it shows; an imported row gets
    // the one the booking page would give it.
    package: typeof b.package === "string" && b.package ? b.package : bookingLabel({ resource: resourceIn, slot: slotIn, hasRoom: roomIds.length > 0 }),
    source: SOURCES.includes(b.source as BookingSource) ? b.source : "Walk-In",
    resource: RESOURCES.includes(b.resource as BookingResource) ? b.resource : undefined,
    tier: TIERS.includes(b.tier as BookingTier) ? b.tier : undefined,
    slot: SLOTS.includes(b.slot as BookingSlot) ? b.slot : "Day",
    archived: false,
    archivedAt: undefined,
    paymentIntentId: undefined,
    cancelReason: null,
  };
  return { ok: true, plan: { row: bookingToRow(booking) as unknown as Record<string, unknown>, booking: { ...booking, resource: resourceIn, tier: tierIn }, pay, total } };
}

/** Save a checked walk-in: the booking, then the money taken. `imported`
 *  marks one entered from a spreadsheet in the ledger and the log. */
export async function saveWalkIn(plan: WalkInPlan, opts: { imported?: boolean } = {}): Promise<Booking> {
  const db = getSupabaseAdmin();
  const { pay, total } = plan;
  const status = plan.booking.status;
  const full = { ...plan.row, confirmed_at: status === "Confirmed" ? new Date().toISOString() : null };
  let { data, error } = await db.from("bookings").insert(full).select().single();
  if (error && missingNewColumn(error)) ({ data, error } = await db.from("bookings").insert(withoutNewColumns(full)).select().single());
  if (error) throw new Error(error.message);
  const saved = rowToBooking(data as BookingRow);

  if (pay) {
    const ledgerRow = await db.from("payments").insert({
      booking_id: saved.id,
      guest_name: saved.name,
      type: pay.amount >= total ? "Full" : "Downpayment",
      method: pay.method,
      amount: pay.amount,
      reference: pay.reference,
      notes: opts.imported ? "Taken while offline; imported from a spreadsheet." : "Collected at the front desk (walk-in).",
    });
    if (ledgerRow.error) {
      // Undo the booking rather than keep a Confirmed walk-in whose money
      // is missing from the ledger.
      await db.from("bookings").delete().eq("id", saved.id);
      throw new Error(ledgerRow.error.message);
    }
  }
  await logActivity({
    actor: "Admin", action: "booking.created", bookingId: saved.id, entity: "booking", entityId: saved.id,
    summary: `${opts.imported ? "Imported a booking taken offline" : "Encoded a walk-in"}: ${saved.name}, ${packageAvailed(saved)}, ${fmtDate(saved.date)}. ${pay ? `${fmt(pay.amount)} received by ${pay.method}; confirmed.` : "Nothing paid yet; pending."}`,
    details: { total, paid: pay?.amount ?? 0, method: pay?.method ?? null, imported: !!opts.imported },
  });
  return saved;
}
