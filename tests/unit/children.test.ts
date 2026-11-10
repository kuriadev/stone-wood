import { peopleOnTour } from "@/lib/utils";
import type { Booking } from "@/types/booking";
import { childLimit, childrenProblem, headcountLabel, bookingHeadcount, CHILDREN_TOTAL_MAX } from "@/lib/children";

describe("children under 3", () => {
  it("share the 30-guest limit with the adults", () => {
    expect(CHILDREN_TOTAL_MAX).toBe(100);
    expect(childLimit(15, 30)).toBe(15);
    expect(childLimit(30, 30)).toBe(0);
    expect(childLimit(0, 30)).toBe(0);
    expect(childrenProblem(15, 15, 30)).toBeNull();
    expect(childrenProblem(15, 16, 30)).toMatch(/up to 30 guests/);
    expect(childrenProblem(0, 1, 30)).toMatch(/adult/);
    expect(childrenProblem(1, -1, 30)).not.toBeNull();
  });

  it("aren't counted in Exclusive, where they're free", () => {
    expect(childLimit(30, 30, 0, "Exclusive")).toBe(70);
    expect(childrenProblem(30, 20, 30, 0, "Exclusive")).toBeNull();
    expect(childrenProblem(30, 71, 30, 0, "Exclusive")).toMatch(/Only 70 more children/);
    expect(childrenProblem(30, 1, 30, 0, "Shared")).toMatch(/up to 30 guests/);
  });

  it("labels the head count", () => {
    expect(headcountLabel(1, 0)).toBe("1 guest");
    expect(headcountLabel(3, 1)).toBe("3 guests · 1 child under 3");
    expect(bookingHeadcount({ guests: 25, children: 30 })).toBe("25 guests · 30 children under 3");
    expect(bookingHeadcount({ guests: 5 })).toBe("5");
  });
});

describe("children and everyone else on the tour", () => {
  const bk = (o: Partial<Booking>): Booking => ({
    id: "SW-1", name: "A", contact: "", email: "", date: "2026-11-20", guests: 20, package: "Day Tour", rooms: [], overtime: 0,
    total: 0, downpayment: 0, status: "Confirmed", paymentProof: true, notes: "", slot: "Day", resource: "Pool", tier: "Shared", ...o,
  } as Booking);
  const day = [bk({ id: "A", guests: 20, children: 10 }), bk({ id: "B", guests: 10, slot: "Night" }), bk({ id: "C", guests: 15, status: "Cancelled" })];

  it("counts adults and children of every live group in that tour", () => {
    expect(peopleOnTour("2026-11-20", "2026-11-20", "Day", day)).toBe(30);
    expect(peopleOnTour("2026-11-20", "2026-11-20", "Night", day)).toBe(10);
    expect(peopleOnTour("2026-11-20", "2026-11-20", "WholeDay", day)).toBe(40);
    expect(peopleOnTour("2026-11-21", "2026-11-21", "Day", day)).toBe(0);
  });

  it("caps children by what's left of the 100", () => {
    expect(childLimit(10, 30, 85)).toBe(5);
    expect(childLimit(10, 30, 90)).toBe(0);
    expect(childrenProblem(10, 5, 30, 85)).toBeNull();
    expect(childrenProblem(10, 6, 30, 85)).toMatch(/Only 5 more children/);
  });
});
