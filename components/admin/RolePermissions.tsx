"use client";

/* Roles & permissions (Staff Accounts, super admin only): for Front desk
 * and Caretaker, each action is Allowed, Ask super admin (sent to the
 * super admin to approve), or Not allowed. Saved to /api/staff/roles; the
 * server checks every action against it. The super admin's own powers and
 * a few locked ones (staff, settings, approvals) never change. */

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useStaff } from "@/contexts/StaffContext";
import { Modal, ActionButton, ErrorNote, ChoiceButtons, useAdminStyle } from "@/components/admin/ui";
import { Icon } from "@/components/common/Icon";
import { PERMISSION_INFO, ROLE_LABEL, EDITABLE_ROLES, type EditableRole, type Permission, type RolePermissionSet } from "@/lib/permissions";

type Level = "allow" | "ask" | "deny";
const LEVEL_COLOR: Record<Level, string> = { allow: "#2e9e4e", ask: "#f5a524", deny: "#8b8d98" };

export function RolePermissions({ onClose }: { onClose: () => void }) {
  const { C, cBr } = useAdminStyle();
  const { toast } = useToast();
  const { refresh } = useStaff();
  const [role, setRole] = useState<EditableRole>("FrontDesk");
  const [roles, setRoles] = useState<Record<EditableRole, RolePermissionSet> | null>(null);
  const [defaults, setDefaults] = useState<Record<EditableRole, RolePermissionSet> | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const j = await fetch("/api/staff/roles", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!j?.success) return setError(j?.error ?? "Could not load the permissions.");
      setRoles(j.roles); setDefaults(j.defaults); setSaved(JSON.stringify(j.roles));
    })();
  }, []);

  const levelOf = (set: RolePermissionSet, p: Permission): Level => set.grants.includes(p) ? "allow" : set.requests.includes(p) ? "ask" : "deny";
  const setLevel = (p: Permission, lv: Level) => setRoles((r) => {
    if (!r) return r;
    const s = r[role];
    const grants = s.grants.filter((x) => x !== p);
    const requests = s.requests.filter((x) => x !== p);
    if (lv === "allow") grants.push(p);
    if (lv === "ask") requests.push(p);
    return { ...r, [role]: { grants, requests } };
  });

  const groups = useMemo(() => {
    const m = new Map<string, typeof PERMISSION_INFO>();
    for (const i of PERMISSION_INFO) m.set(i.group, [...(m.get(i.group) ?? []), i]);
    return [...m.entries()];
  }, []);
  const dirty = !!roles && JSON.stringify(roles) !== saved;
  const allowedCount = (r: EditableRole) => roles ? roles[r].grants.length : 0;

  const save = async () => {
    if (!roles) return;
    setBusy(true); setError("");
    const j = await fetch("/api/staff/roles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(roles) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!j?.success) return setError(j?.error ?? "Could not save.");
    setSaved(JSON.stringify(roles));
    await refresh();
    toast("Permissions saved. Each person gets them on their next click.", "success");
  };

  return (
    <Modal title="Roles & permissions" subtitle="What Front desk and Caretaker accounts can do. Super admins can always do everything." onClose={onClose} width={760}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <ActionButton kind="ghost" icon="refresh" disabled={!roles || !defaults} onClick={() => defaults && setRoles((r) => r && { ...r, [role]: defaults[role] })}>
            Reset {ROLE_LABEL[role]} to default
          </ActionButton>
          <div style={{ display: "flex", gap: 10 }}>
            <ActionButton onClick={onClose}>Close</ActionButton>
            <ActionButton kind="primary" icon="check" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : dirty ? "Save permissions" : "Saved"}</ActionButton>
          </div>
        </div>
      }>
      {!roles ? <p style={{ color: C.textS, fontSize: 13 }}>{error || "Loading…"}</p> : (
        <>
          <ChoiceButtons<EditableRole> value={role} onChange={setRole} label="Role"
            options={EDITABLE_ROLES.map((r) => ({ value: r, label: `${ROLE_LABEL[r]} · ${allowedCount(r)} allowed` }))} />
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "14px 0 4px", fontSize: 12, color: C.textS }}>
            <span><b style={{ color: LEVEL_COLOR.allow }}>Allowed</b> — they do it themselves</span>
            <span><b style={{ color: LEVEL_COLOR.ask }}>Ask</b> — sent to a super admin to approve</span>
            <span><b style={{ color: LEVEL_COLOR.deny }}>Not allowed</b> — hidden from them</span>
          </div>
          {groups.map(([group, items]) => (
            <section key={group} style={{ marginTop: 16 }}>
              <h3 style={{ color: C.textH, fontSize: 13, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", margin: "0 0 6px" }}>{group}</h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, border: `1px solid ${cBr}`, borderRadius: 12 }}>
                {items.map((i, idx) => {
                  const lv = levelOf(roles[role], i.perm);
                  const opts: { value: Level; label: string }[] = [
                    { value: "allow", label: "Allowed" },
                    ...(i.requestable ? [{ value: "ask" as Level, label: "Ask" }] : []),
                    { value: "deny", label: "Not allowed" },
                  ];
                  return (
                    <li key={i.perm} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 12px", borderTop: idx ? `1px solid ${cBr}` : "none" }}>
                      <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: LEVEL_COLOR[lv], flexShrink: 0 }} />
                      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                        <div style={{ color: C.textH, fontSize: 13.5, fontWeight: 600 }}>{i.label}</div>
                        {i.hint && <div style={{ color: C.textS, fontSize: 12 }}>{i.hint}</div>}
                      </div>
                      <div role="radiogroup" aria-label={i.label} style={{ display: "inline-flex", border: `1px solid ${cBr}`, borderRadius: 999, padding: 2, flexShrink: 0 }}>
                        {opts.map((o) => {
                          const on = lv === o.value;
                          return (
                            <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => setLevel(i.perm, o.value)}
                              className="sw-choice"
                              style={{ padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12, fontWeight: on ? 700 : 500,
                                background: on ? `${LEVEL_COLOR[o.value]}26` : "transparent", color: on ? LEVEL_COLOR[o.value] : C.textS }}>
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p style={{ color: C.textS, fontSize: 12, margin: "16px 0 0", display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Icon name="lock" size={12} style={{ marginTop: 2, flexShrink: 0 }} />
            Staff accounts, Rates &amp; Settings, and approving requests and reschedules stay with super admins only, so nobody can be locked out.
          </p>
          <ErrorNote>{error}</ErrorNote>
        </>
      )}
    </Modal>
  );
}
