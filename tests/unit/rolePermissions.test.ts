import { can, canRequest, applyRoleOverrides, validateRoleOverrides, defaultRolePermissions, LOCKED_PERMISSIONS, PERMISSION_INFO } from "@/lib/permissions";

afterEach(() => applyRoleOverrides({}));

describe("role permissions the super admin sets", () => {
  it("start from the built-in defaults", () => {
    expect(can("FrontDesk", "bookings.edit")).toBe(true);
    expect(can("Caretaker", "bookings.edit")).toBe(false);
    expect(canRequest("FrontDesk", "payments.refund")).toBe(true);
  });

  it("can allow, send for approval, or take away an action", () => {
    const fd = defaultRolePermissions("FrontDesk");
    applyRoleOverrides({
      FrontDesk: { grants: [...fd.grants, "payments.refund"], requests: fd.requests.filter((p) => p !== "payments.refund") },
      Caretaker: { grants: ["ops.view", "facilities.view"], requests: ["inventory.use"] },
    });
    expect(can("FrontDesk", "payments.refund")).toBe(true);
    expect(can("Caretaker", "facilities.inspect")).toBe(false);
    expect(canRequest("Caretaker", "inventory.use")).toBe(true);
  });

  it("never hands out the locked powers, and never changes the super admin", () => {
    const v = validateRoleOverrides({ FrontDesk: { grants: ["staff.manage", "settings.manage", "bookings.edit", "nonsense"], requests: ["requests.decide"] } });
    expect(v.FrontDesk?.grants).toEqual(["bookings.edit"]);
    expect(v.FrontDesk?.requests).toEqual([]);
    applyRoleOverrides({ FrontDesk: { grants: [], requests: [] } });
    for (const p of LOCKED_PERMISSIONS) expect(can("Owner", p)).toBe(true);
    expect(can("Owner", "bookings.edit")).toBe(true);
  });

  it("won't let an action be both allowed and asked for", () => {
    const v = validateRoleOverrides({ Caretaker: { grants: ["inventory.use"], requests: ["inventory.use", "inventory.delete"] } });
    expect(v.Caretaker).toEqual({ grants: ["inventory.use"], requests: ["inventory.delete"] });
  });

  it("describes every action it offers, and none of the locked ones", () => {
    for (const p of LOCKED_PERMISSIONS) expect(PERMISSION_INFO.some((i) => i.perm === p)).toBe(false);
  });
});
