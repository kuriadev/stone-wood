// What a package can be set up as, checked the same way by the admin form
// and the packages API, and the badge that says what it really is.
import { packageTier, sharedNotAllowed, packageSetupProblem, packageSetupLabel, VENUE_CAPACITY } from "@/lib/pricing";
import { INIT_PACKAGES } from "@/lib/constants";
import { RESORT_MAX_CAPACITY } from "@/lib/validators";

describe("pool access", () => {
  it("a venue-only package is always Exclusive", () => {
    expect(packageTier("Venue", "Shared")).toBe("Exclusive");
    expect(packageTier("Pool", "Shared")).toBe("Shared");
  });

  it("says why Shared can't be picked", () => {
    expect(sharedNotAllowed("Pool", "Single")).toBeNull();
    expect(sharedNotAllowed("Venue", "Single")).toMatch(/always private/);
    expect(sharedNotAllowed("Pool+Venue", "Single")).toMatch(/Exclusive only/);
    expect(sharedNotAllowed("Pool", "WholeDay")).toMatch(/Exclusive only/);
  });
});

describe("packageSetupProblem", () => {
  const base = { resource: "Pool" as const, status: "Shared" as const, slotMode: "Single" as const, capacity: 15 };

  it("accepts a shared day-or-night pool package", () => {
    expect(packageSetupProblem(base)).toBeNull();
  });

  it("refuses setups the resort cannot run", () => {
    expect(packageSetupProblem({ ...base, slotMode: "WholeDay" })).not.toBeNull();
    expect(packageSetupProblem({ ...base, resource: "Pool+Venue" })).not.toBeNull();
  });

  it("does not refuse a venue package marked Shared: it is stored as Exclusive", () => {
    expect(packageSetupProblem({ ...base, resource: "Venue" })).toBeNull();
  });

  it("keeps capacity inside the resort's limit", () => {
    expect(packageSetupProblem({ ...base, capacity: 0 })).toMatch(/at least 1/);
    expect(packageSetupProblem({ ...base, capacity: RESORT_MAX_CAPACITY + 1 })).toMatch(/at most/);
    expect(packageSetupProblem({ ...base, capacity: RESORT_MAX_CAPACITY })).toBeNull();
  });

  it("lets a venue-only package hold what the hall holds", () => {
    expect(packageSetupProblem({ ...base, resource: "Venue", status: "Exclusive", capacity: VENUE_CAPACITY })).toBeNull();
    expect(packageSetupProblem({ ...base, resource: "Venue", status: "Exclusive", capacity: VENUE_CAPACITY + 1 })).toMatch(/events venue holds/);
  });

  it("passes every built-in package", () => {
    for (const p of INIT_PACKAGES) {
      expect([p.code, packageSetupProblem({ resource: p.resource, status: p.status, slotMode: p.slotMode ?? "Single", capacity: p.capacity })]).toEqual([p.code, null]);
    }
  });
});

describe("packageSetupLabel", () => {
  it("names what the package really is", () => {
    expect(packageSetupLabel({ resource: "Pool", status: "Shared" })).toBe("Shared pool");
    expect(packageSetupLabel({ resource: "Pool", status: "Exclusive", requiresRoom: true })).toBe("Exclusive pool · Room");
    expect(packageSetupLabel({ resource: "Venue", status: "Shared" })).toBe("Events venue");
    expect(packageSetupLabel({ resource: "Pool+Venue", status: "Exclusive" })).toBe("Exclusive · Pool + venue");
  });
});
