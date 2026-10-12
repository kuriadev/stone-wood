/* Staff roles and requests to the owner.
 *
 * The alpha tester's point was that one shared admin login only digitised
 * the work: the owner still did or checked all of it. These pin the rules
 * that hand it out — who may do what, which refusals become a request to
 * the owner instead of a dead end, and that each activity line can say who
 * did it.
 */

import {
  can, canRequest, canOpenTab, landingTab, permissionsOf, requestableOf,
  STAFF_ROLES, type Permission,
} from "@/lib/permissions";
import { enterStaff, actingStaff, missingStaffTable } from "@/lib/staff.server";
import { reasonIn, bookingIdIn } from "@/lib/ownerRequests.server";
import { createSessionToken, verifySessionToken, identityFromSession, legacyOwner } from "@/lib/auth";

describe("who may do what", () => {
  it("lets the owner do everything", () => {
    for (const p of permissionsOf("FrontDesk").concat(permissionsOf("Caretaker"), requestableOf("FrontDesk"))) {
      expect(can("Owner", p)).toBe(true);
    }
    expect(can("Owner", "staff.manage")).toBe(true);
    expect(can("Owner", "requests.decide")).toBe(true);
  });

  it("gives front desk the counter, not the owner's decisions", () => {
    // Including counting the drawer and closing the day.
    for (const p of ["bookings.edit", "payments.record", "expenses.record", "messages.handle", "day.close"] as Permission[]) {
      expect(can("FrontDesk", p)).toBe(true);
    }
    for (const p of ["payments.void", "payments.refund", "bookings.cancel", "bookings.delete", "staff.manage", "catalog.manage", "requests.decide", "reschedules.decide"] as Permission[]) {
      expect(can("FrontDesk", p)).toBe(false);
    }
  });

  it("gives caretakers the facilities and nothing to do with money", () => {
    for (const p of ["facilities.inspect", "facilities.clean", "inventory.use"] as Permission[]) {
      expect(can("Caretaker", p)).toBe(true);
    }
    for (const p of ["payments.record", "bookings.edit", "expenses.record", "payments.void"] as Permission[]) {
      expect(can("Caretaker", p)).toBe(false);
    }
  });

  it("moves facility checking off the counter", () => {
    // The user's decision: caretakers do the inspections.
    expect(can("FrontDesk", "facilities.inspect")).toBe(false);
    expect(can("Caretaker", "facilities.inspect")).toBe(true);
  });

  it("treats no role as no permission at all", () => {
    expect(can(null, "ops.view")).toBe(false);
    expect(can(undefined, "bookings.view")).toBe(false);
  });
});

describe("requests to the owner", () => {
  it("lets front desk ask for exactly the owner-only money and cancellation actions", () => {
    expect(requestableOf("FrontDesk").sort()).toEqual([
      "bookings.cancel", "bookings.delete", "bookings.resortCancel", "calendar.manage",
      "expenses.void", "facilities.delete", "inventory.delete", "payments.refund", "payments.void", "payments.writeOff",
    ]);
  });

  it("makes deleting critical records the owner's, for front desk and caretakers alike", () => {
    // They can still start it; it waits for the owner's approval.
    for (const role of ["FrontDesk", "Caretaker"] as const) {
      expect(can(role, "inventory.delete")).toBe(false);
      expect(canRequest(role, "inventory.delete")).toBe(true);
      expect(can(role, "facilities.delete")).toBe(false);
      expect(canRequest(role, "facilities.delete")).toBe(true);
    }
    expect(can("Owner", "inventory.delete")).toBe(true);
  });

  it("never offers a request for something the role can already do, or to the owner", () => {
    for (const role of STAFF_ROLES) {
      for (const p of requestableOf(role)) expect(can(role, p)).toBe(false);
    }
    expect(requestableOf("Owner")).toEqual([]);
    expect(canRequest("Owner", "payments.void")).toBe(false);
  });

  it("does not let a caretaker ask for refunds or staff changes", () => {
    expect(canRequest("Caretaker", "payments.refund")).toBe(false);
    expect(canRequest("FrontDesk", "staff.manage")).toBe(false);
  });

  it("finds the reason under whatever name the form used", () => {
    expect(reasonIn({ reason: "Entered twice" })).toBe("Entered twice");
    expect(reasonIn({ cancelReason: "No-show" })).toBe("No-show");
    expect(reasonIn({ note: "Guest left early" })).toBe("Guest left early");
    expect(reasonIn(null)).toBe("");
  });

  it("finds the booking from the path or the body", () => {
    expect(bookingIdIn("/api/bookings/SW-10150/resort-cancel", null)).toBe("SW-10150");
    expect(bookingIdIn("/api/bookings/SW-10150", { status: "Cancelled" })).toBe("SW-10150");
    expect(bookingIdIn("/api/payments", { bookingId: "SW-10151", type: "Refund" })).toBe("SW-10151");
    expect(bookingIdIn("/api/payments?id=82", { reason: "x" })).toBeNull();
  });
});

describe("screens", () => {
  it("starts each role on its own screen", () => {
    expect(landingTab("Caretaker")).toBe("Tasks");
    expect(landingTab("FrontDesk")).toBe("Operations");
    expect(landingTab("Owner")).toBe("Operations");
  });

  it("keeps the money screens and setup away from caretakers", () => {
    for (const t of ["Operations", "Bookings", "Sales", "Reports", "Staff", "Settings", "Packages"] as const) {
      expect(canOpenTab("Caretaker", t)).toBe(false);
    }
    expect(canOpenTab("Caretaker", "Tasks")).toBe(true);
    expect(canOpenTab("Caretaker", "Facilities")).toBe(true);
  });

  it("keeps staff accounts and prices with the owner", () => {
    expect(canOpenTab("FrontDesk", "Staff")).toBe(false);
    expect(canOpenTab("FrontDesk", "Settings")).toBe(false);
    expect(canOpenTab("FrontDesk", "Packages")).toBe(false);
    expect(canOpenTab("Owner", "Staff")).toBe(true);
  });
});

describe("sessions carry the person", () => {
  it("signs a staff member's id, role and name into the session", () => {
    const token = createSessionToken({ id: "9b2d1c4e-0000-4000-8000-000000000001", name: "Ana Santos", username: "ana", role: "FrontDesk" });
    const s = verifySessionToken(token)!;
    expect(identityFromSession(s)).toEqual({ id: "9b2d1c4e-0000-4000-8000-000000000001", name: "Ana Santos", username: "ana", role: "FrontDesk" });
  });

  it("reads a session from before staff accounts as the owner", () => {
    const s = verifySessionToken(createSessionToken("admin"))!;
    expect(identityFromSession(s).role).toBe("Owner");
    expect(identityFromSession(s).id).toBeNull();
    expect(legacyOwner("admin").role).toBe("Owner");
  });
});

describe("the activity log knows who acted", () => {
  // requirePermission marks the person in the route handler's own sync code;
  // logActivity reads it after any number of awaits. This is the mechanism.
  it("keeps the person through every await in the handler", async () => {
    const handler = async () => {
      enterStaff({ id: "x", name: "Ben", username: "ben", role: "Caretaker" });
      await new Promise((r) => setTimeout(r, 5));
      await Promise.resolve();
      return actingStaff()?.name;
    };
    expect(await handler()).toBe("Ben");
  });

  it("does not leak one request's person into another", async () => {
    const a = (async () => { enterStaff({ id: "a", name: "Ana", username: "ana", role: "FrontDesk" }); await new Promise((r) => setTimeout(r, 10)); return actingStaff()?.name; })();
    const b = (async () => { enterStaff({ id: "b", name: "Ben", username: "ben", role: "Caretaker" }); await new Promise((r) => setTimeout(r, 1)); return actingStaff()?.name; })();
    expect(await Promise.all([a, b])).toEqual(["Ana", "Ben"]);
  });
});

describe("before the database update", () => {
  it("recognises a missing staff table, so sign-in falls back to the old one", () => {
    expect(missingStaffTable({ code: "PGRST205", message: "Could not find the table 'public.staff' in the schema cache" })).toBe(true);
    expect(missingStaffTable({ code: "42P01", message: 'relation "public.owner_requests" does not exist' })).toBe(true);
    expect(missingStaffTable({ message: "duplicate key value violates unique constraint" })).toBe(false);
    expect(missingStaffTable(null)).toBe(false);
  });
});
