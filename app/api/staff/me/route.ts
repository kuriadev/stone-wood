// ── PATCH /api/staff/me { name } → change your own display name   (any staff)
//
// My profile: anyone signed in with a staff account may fix their own
// name. Username and password stay on the Account screen
// (/api/admin/account), which asks for the current password.

import { NextResponse, type NextRequest } from "next/server";
import { sessionOf, currentIdentity } from "@/lib/auth";
import { updateOwnName, staffTableReady } from "@/lib/staff.server";
import { sanitizeName } from "@/lib/validators";
import { logActivity } from "@/lib/activity.server";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const session = sessionOf(req);
  if (!session) return NextResponse.json({ success: false, error: "Not authorised." }, { status: 401 });
  const me = await currentIdentity(session);
  if (!me || !me.id) return NextResponse.json({ success: false, error: "Only a staff account has a profile to edit." }, { status: 400 });
  if (!(await staffTableReady())) return NextResponse.json({ success: false, error: "Staff accounts aren't switched on yet." }, { status: 409 });
  const body = (await readJson(req).catch(() => ({}))) as { name?: unknown };
  const name = sanitizeName(String(body.name ?? "")).trim().slice(0, 60);
  if (name.length < 2) return NextResponse.json({ success: false, error: "Enter your name (at least 2 letters)." }, { status: 400 });
  try {
    await updateOwnName(me.id, name);
    if (name !== me.name) {
      await logActivity({ actor: "Admin", action: "staff.updated", entity: "staff", entityId: me.id, summary: `${me.name} changed their name to ${name}.` });
    }
    return NextResponse.json({ success: true, name });
  } catch (err) {
    console.error("[/api/staff/me PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not save your name." }, { status: 500 });
  }
}
