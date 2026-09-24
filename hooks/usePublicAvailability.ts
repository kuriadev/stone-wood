"use client";

import { useCallback, useEffect, useState } from "react";
import type { Booking } from "@/types/booking";
import type { AvailabilitySlot } from "@/app/api/availability/route";

/**
 * The real bookings, reduced to what availability needs, for guest pages.
 *
 * Guests can't load the full booking list (it's admin-only — it holds
 * names, emails and phone numbers), so the public calendars and capacity
 * checks used to run on the INIT_BOOKINGS sample data and showed full dates
 * as free. This loads /api/availability instead and shapes each slot like a
 * Booking, so AvailabilityCalendar, BookingDatePicker and the capacity
 * helpers in lib/utils work on it unchanged. Personal fields are blank.
 *
 * Refreshes when the tab regains focus and every two minutes, so a guest
 * who leaves the page open doesn't book against a stale calendar. The
 * server checks again at payment time either way.
 */
export function usePublicAvailability(enabled: boolean) {
  const [bookings, setBookings] = useState<Booking[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/availability", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { slots?: AvailabilitySlot[] };
      if (!Array.isArray(json.slots)) return;
      setBookings(
        json.slots.map((s, i) => ({
          id: `slot-${i}`,
          name: "",
          contact: "",
          email: "",
          date: s.date,
          guests: s.guests,
          // Only whether it starts with "Night" matters (older rows have no
          // slot); nothing personal is in a package label.
          package: s.package ?? "",
          rooms: s.rooms ?? [],
          overtime: s.overtime ?? 0,
          total: 0,
          downpayment: 0,
          status: s.status,
          paymentProof: false,
          notes: "",
          resource: s.resource ?? undefined,
          tier: s.tier ?? undefined,
          slot: s.slot ?? undefined,
        }))
      );
    } catch {
      // Keep whatever was loaded last; the server re-checks at payment.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(() => void refresh(), 2 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [enabled, refresh]);

  return { bookings, refresh };
}
