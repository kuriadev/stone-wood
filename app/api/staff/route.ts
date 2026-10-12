// ── GET   /api/staff      → everyone who can sign in        (owner only)
// ── POST  /api/staff      → add a person                     (owner only)
// ── PATCH /api/staff?id=  → rename, change role, reset the password,
//                            deactivate or reactivate          (owner only)
//
// The owner sets each person up once with a temporary password; they pick
// their own at first sign-in (must_change_password). Nobody is ever
// deleted: a person who leaves is deactivated, which signs them out at
// their next click and keeps every record they made attributed to them.
//
// Hashes never leave the server; the list carries names, roles and dates.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission, hashPassword, newSalt } from "@/lib/auth";
import {
  listStaff, createStaff, updateStaff, StaffError, staffTableReady,
  passwordProblem, usernameProblem,
} from "@/lib/staff.server";
import { isStaffRole, ROLE_LABEL } from "@/lib/permissions";
import { logActivity } from "@/lib/activity.server";
import { sanitizeName } from "@/lib/validators";

export const dynamic = "force-dynamic";

const notReady = () => NextResponse.json({
  success: false,
  error: "Staff accounts switch on once the database update (20261012120000_staff_and_owner_requests.sql) is applied.",
}, { status: 409 });

const cleanName = (v: unknown) => sanitizeName(String(v ?? "")).trim().slice(0, 60);

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "staff.manage");
  if (denied) return denied;
  try {
    if (!(await staffTableReady())) return NextResponse.json({ success: true, staff: [], staffEnabled: false });
    return NextResponse.json({ success: true, staff: await listStaff(), staffEnabled: true });
  } catch (err) {
    console.error("[/api/staff GET]", err);
    return NextResponse.json({ success: false, error: "Could not load the staff list." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requirePermission(req, "staff.manage");
  if (denied) return denied;
  if (!(await staffTableReady())) return notReady();

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = cleanName(b.name);
  const username = String(b.username ?? "").trim();
  const password = String(b.password ?? "");
  if (name.length < 2) return NextResponse.json({ success: false, error: "Enter the person's name." }, { status: 400 });
  const uBad = usernameProblem(username);
  if (uBad) return NextResponse.json({ success: false, error: uBad }, { status: 400 });
  if (!isStaffRole(b.role)) return NextResponse.json({ success: false, error: "Choose a role." }, { status: 400 });
  const pBad = passwordProblem(password);
  if (pBad) return NextResponse.json({ success: false, error: pBad }, { status: 400 });

  try {
    const person = await createStaff({ name, username, role: b.role, password }, hashPassword, newSalt());
    await logActivity({
      actor: "Admin", action: "staff.created", entity: "staff", entityId: person.id,
      summary: `Added ${person.name} as ${ROLE_LABEL[person.role]} (username "${person.username}").`,
    });
    return NextResponse.json({ success: true, staff: person }, { status: 201 });
  } catch (err) {
    if (err instanceof StaffError) return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    console.error("[/api/staff POST]", err);
    return NextResponse.json({ success: false, error: "Could not add that person." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requirePermission(req, "staff.manage");
  if (denied) return denied;
  if (!(await staffTableReady())) return notReady();

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ success: false, error: "Which person?" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Parameters<typeof updateStaff>[1] = {};
  if (b.name !== undefined) {
    const name = cleanName(b.name);
    if (name.length < 2) return NextResponse.json({ success: false, error: "Enter the person's name." }, { status: 400 });
    patch.name = name;
  }
  if (b.role !== undefined) {
    if (!isStaffRole(b.role)) return NextResponse.json({ success: false, error: "Unknown role." }, { status: 400 });
    patch.role = b.role;
  }
  if (b.active !== undefined) patch.active = !!b.active;
  if (b.password !== undefined) {
    const pBad = passwordProblem(String(b.password));
    if (pBad) return NextResponse.json({ success: false, error: pBad }, { status: 400 });
    patch.password = String(b.password);
  }

  try {
    const before = (await listStaff()).find((s) => s.id === id);
    const person = await updateStaff(id, patch, hashPassword, newSalt());
    const said: string[] = [];
    if (patch.name && before && before.name !== person.name) said.push(`renamed from ${before.name}`);
    if (patch.role && before && before.role !== person.role) said.push(`now ${ROLE_LABEL[person.role]} (was ${ROLE_LABEL[before.role]})`);
    if (patch.active !== undefined && before && before.active !== person.active) said.push(person.active ? "reactivated" : "deactivated");
    if (patch.password) said.push("password reset — they choose a new one at their next sign-in");
    if (said.length) {
      await logActivity({
        actor: "Admin", action: "staff.updated", entity: "staff", entityId: person.id,
        summary: `${person.name}: ${said.join("; ")}.`,
      });
    }
    return NextResponse.json({ success: true, staff: person });
  } catch (err) {
    if (err instanceof StaffError) return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    console.error("[/api/staff PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not save that change." }, { status: 500 });
  }
}
