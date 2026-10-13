/**
 * Fixes from the alpha dry run (2026-10-13).
 */
import { rowToBooking } from "@/lib/supabase";
import { SLOTS } from "@/lib/resort";
import type { BookingRow } from "@/types/database";

const row = (pkg: string) => ({ id: "SW-1", name: "A", contact: "", email: "", date: "2026-10-13", guests: 2, package: pkg, status: "Confirmed", total: 0 }) as unknown as BookingRow;

describe("old Whole Day booking names", () => {
  it("shows the old made-up names as Staycation", () => {
    expect(rowToBooking(row("Whole Day")).package).toBe("Staycation");
    expect(rowToBooking(row("Whole Day + Room")).package).toBe("Staycation + Room");
    expect(rowToBooking(row("Whole Day + Event Venue")).package).toBe("Staycation + Event Venue");
  });

  it("leaves the owner's package titles alone", () => {
    expect(rowToBooking(row("Whole Day Buyout")).package).toBe("Whole Day Buyout");
    expect(rowToBooking(row("Whole Day Staycation (Whole Day)")).package).toBe("Whole Day Staycation (Whole Day)");
    expect(rowToBooking(row("Day Tour")).package).toBe("Day Tour");
  });
});

describe("overnight hours", () => {
  it("read cleanly inside brackets", () => {
    expect(`${SLOTS.WholeDay.label} (${SLOTS.WholeDay.hours})`).toBe("Staycation (7:00 AM – 5:00 AM, next day)");
  });
});
