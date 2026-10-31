import { withCurrentHours } from "@/lib/packages";
import { SLOTS } from "@/lib/resort";
import type { ResortPackage } from "@/types/package";

// Rows saved while the Night Tour still ended at midnight.
const pkg = (over: Partial<ResortPackage>): ResortPackage => ({
  id: 1, code: "X", title: "X", resource: "Pool", status: "Exclusive", price: 1, capacity: 30,
  slotMode: "Single", cover: "", gallery: [], blurb: "", includes: [], active: true, ...over,
} as ResortPackage);

describe("withCurrentHours", () => {
  it("rewrites the Day/Night hours line to the current slots", () => {
    const p = withCurrentHours(pkg({ includes: ["Parking", "Day (7:00 AM — 5:00 PM) or Night (7:00 PM — 12:00 AM)"] }));
    expect(p.includes[0]).toBe("Parking");
    expect(p.includes[1]).toBe(`Day (${SLOTS.Day.hours}) or Night (${SLOTS.Night.hours})`);
    expect(p.includes[1]).toContain("5:00 AM");
  });

  it("rewrites a Whole Day package's bare range and its 'from X to Y' blurb", () => {
    const p = withCurrentHours(pkg({
      slotMode: "WholeDay",
      blurb: "The resort is yours from 7:00 AM to 12:00 AM — both the Day and Night slots.",
      includes: ["7:00 AM – 12:00 AM", "All resort amenities"],
    }));
    expect(p.blurb).toBe(`The resort is yours from ${SLOTS.WholeDay.start} to ${SLOTS.WholeDay.end} — both the Day and Night slots.`);
    expect(p.includes).toEqual([SLOTS.WholeDay.hours, "All resort amenities"]);
  });

  it("leaves the owner's own wording and single-slot ranges alone", () => {
    const blurb = "Open from 9:00 AM to 3:00 PM for school trips.";
    const p = withCurrentHours(pkg({ blurb, includes: ["8:00 AM – 4:00 PM"] }));
    expect(p.blurb).toBe(blurb);
    expect(p.includes).toEqual(["8:00 AM – 4:00 PM"]);
  });
});
