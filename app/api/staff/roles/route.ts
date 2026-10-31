// ── GET /api/staff/roles → what Front desk and Caretaker may do, and the defaults   (super admin)
// ── PUT /api/staff/roles { FrontDesk?, Caretaker? } → save; { reset: true } → defaults (super admin)
//
// Staff Accounts → Roles & permissions. Each action is Allowed, Ask super
// admin (sent for approval), or Not allowed. The super admin's own powers
// and the locked ones (lib/permissions.ts LOCKED_PERMISSIONS) never change.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { actingStaff } from "@/lib/staff.server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logActivity } from "@/lib/activity.server";
import {
  EDITABLE_ROLES, ROLE_LABEL, PERMISSION_INFO, defaultRolePermissions, validateRoleOverrides, applyRoleOverrides,
  type EditableRole, type RoleOverrides,
} from "@/lib/permissions";
import { ensureRolePermissions, forgetRolePermissions, ROLE_PERMISSIONS_KEY } from "@/lib/rolePermissions.server";

export const dynamic = "force-dynamic";

const ownerOnly = () => NextResponse.json({ success: false, error: "Only a super admin can change what each role may do." }, { status: 403 });

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "staff.manage");
  if (denied) return denied;
  if (actingStaff() && actingStaff()!.role !== "Owner") return ownerOnly();
  const saved = await ensureRolePermissions();
  const roles = Object.fromEntries(EDITABLE_ROLES.map((r) => [r, saved[r] ?? defaultRolePermissions(r)]));
  const defaults = Object.fromEntries(EDITABLE_ROLES.map((r) => [r, defaultRolePermissions(r)]));
  return NextResponse.json({ success: true, roles, defaults });
}

export async function PUT(req: NextRequest) {
  const denied = await requirePermission(req, "staff.manage");
  if (denied) return denied;
  if (actingStaff() && actingStaff()!.role !== "Owner") return ownerOnly();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const before = await ensureRolePermissions();
  const next: RoleOverrides = body.reset === true ? {} : { ...before, ...validateRoleOverrides(body) };
  const { error } = await getSupabaseAdmin().from("site_content").upsert(
    { key: ROLE_PERMISSIONS_KEY, data: next, updated_at: new Date().toISOString(), updated_by_name: actingStaff()?.name ?? null },
    { onConflict: "key" },
  );
  if (error) {
    return NextResponse.json({ success: false, error: /site_content/.test(error.message)
      ? "Role permissions switch on once the database update (20261028130000_site_content.sql) is applied."
      : "Could not save the permissions." }, { status: /site_content/.test(error.message) ? 409 : 500 });
  }
  forgetRolePermissions();
  applyRoleOverrides(next);
  // Plain-words summary for the activity log.
  const word = (role: EditableRole, set: RoleOverrides) => {
    const s = set[role] ?? defaultRolePermissions(role);
    return (p: string) => (s.grants.includes(p as never) ? "allowed" : s.requests.includes(p as never) ? "ask" : "not allowed");
  };
  const changes: string[] = [];
  for (const role of EDITABLE_ROLES) {
    const a = word(role, before), b = word(role, next);
    for (const info of PERMISSION_INFO) if (a(info.perm) !== b(info.perm)) changes.push(`${ROLE_LABEL[role]}: ${info.label} → ${b(info.perm)}`);
  }
  await logActivity({
    actor: "Admin", action: "staff.permissions", entity: "staff", entityId: "roles",
    summary: body.reset === true ? "Put every role's permissions back to the defaults."
      : changes.length ? `Changed role permissions: ${changes.slice(0, 8).join("; ")}${changes.length > 8 ? `; and ${changes.length - 8} more` : ""}.` : "Saved role permissions (no change).",
    details: { changes },
  });
  return NextResponse.json({ success: true });
}
