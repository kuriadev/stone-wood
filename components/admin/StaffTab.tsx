"use client";

/* Staff Accounts — the owner's list of who can sign in, and as what.
 *
 * Each person gets their own sign-in, so every booking, payment and
 * inspection says WHO did it, and each role sees only its own work:
 * caretakers their tasks on their phones, front desk the counter. What
 * front desk can't do (refunds, voids, cancellations) reaches the owner as
 * a one-tap request instead of a phone call.
 *
 * The owner sets a temporary password; the person chooses their own at
 * first sign-in. Nobody is deleted — a person who leaves is deactivated,
 * which signs them out and keeps their records attributed to them.
 */

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useStaff } from "@/contexts/StaffContext";
import {
  AdminPageHeader, Modal, ConfirmDialog, Label, ChoiceButtons, ActionButton, ErrorNote,
  StatusBadge, TableShell, Row, Cell, td, useAdminStyle,
} from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import { ROLE_HINT, ROLE_LABEL, STAFF_ROLES, type StaffRole } from "@/lib/permissions";
import { manilaTime } from "@/lib/finance";

interface StaffMember {
  id: string;
  name: string;
  username: string;
  role: StaffRole;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** A copy of the password is saved, so the eye can show it. */
  canReveal: boolean;
}

const ROLE_COLOR: Record<StaffRole, string> = { Owner: "#c9a84c", FrontDesk: "#4a9fd4", Caretaker: "#2e9e4e" };

/** A readable temporary password: three short words and two digits. The
 *  owner reads it out once; the person replaces it at first sign-in. */
function tempPassword(): string {
  const words = ["pool", "palm", "sun", "wave", "shell", "breeze", "coral", "sand", "reef", "lagoon", "tide", "bay"];
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 90 + 10;
  return `${pick()}-${pick()}-${pick()}${n}`;
}

/** How long a looked-up password stays on screen before it hides itself. */
const REVEAL_SECONDS = 30;

/** One person's password behind an eye. It is fetched only when the eye is
 *  pressed (the list never carries it), shown in monospace, and hides again
 *  after REVEAL_SECONDS so it isn't left on a screen someone walks past. */
function PasswordCell({ person }: { person: StaffMember }) {
  const { C } = useAdminStyle();
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (shown === null) return;
    const t = setTimeout(() => setShown(null), REVEAL_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [shown]);

  const toggle = async () => {
    if (shown !== null) { setShown(null); return; }
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/staff/password?id=${encodeURIComponent(person.id)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.success) setShown(String(json.password));
      else setNote(json?.error ?? "Could not look that up.");
    } catch {
      setNote("No connection to the server.");
    } finally {
      setBusy(false);
    }
  };

  if (!person.canReveal) {
    return (
      <span title="Saved the next time they sign in, or reset it to set a new one." style={{ color: C.textS, fontSize: 12 }}>
        Not saved yet
      </span>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: "monospace", color: shown === null ? C.textS : C.textH, letterSpacing: shown === null ? 2 : 0, userSelect: shown === null ? "none" : "all" }}>
        {shown ?? "••••••••"}
      </span>
      <ActionButton size="sm" icon={shown === null ? "eye" : "eye-off"} disabled={busy} onClick={() => void toggle()}
        aria-label={shown === null ? `Show ${person.name}'s password` : `Hide ${person.name}'s password`} />
      {note && <span role="alert" style={{ color: "#d44", fontSize: 11.5 }}>{note}</span>}
    </div>
  );
}

export function StaffTab({ mob }: { mob: boolean }) {
  const { C, cBr, inp } = useAdminStyle();
  const { toast } = useToast();
  const { me, staffEnabled } = useStaff();
  const [list, setList] = useState<StaffMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(staffEnabled);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const [toggling, setToggling] = useState<StaffMember | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/staff", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.success) {
        setList(json.staff as StaffMember[]);
        setEnabled(!!json.staffEnabled);
      }
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patch = async (id: string, body: Record<string, unknown>): Promise<string | null> => {
    const res = await fetch(`/api/staff?id=${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!res || !json?.success) return json?.error ?? "Could not save that change.";
    await load();
    return null;
  };

  const active = list.filter((s) => s.active);
  const inactive = list.filter((s) => !s.active);

  return (
    <div>
      <AdminPageHeader
        title="Staff Accounts"
        subtitle="Everyone who signs in, and what each one can do. Every record says who made it."
        mob={mob}
        action={enabled ? <ActionButton kind="primary" icon="plus" onClick={() => setAdding(true)}>Add a person</ActionButton> : undefined}
      />

      {!enabled && loaded && (
        <div role="status" style={{ border: `1px solid ${cBr}`, borderLeft: "3px solid #e0a020", borderRadius: 10, padding: "16px 20px", marginBottom: 24, color: C.textB, fontSize: 13.5, lineHeight: 1.7 }}>
          <strong style={{ color: C.textH }}>Staff accounts aren&apos;t switched on yet.</strong> They need one database update —
          {" "}<code>supabase/migrations/20261012120000_staff_and_owner_requests.sql</code>, run in the Supabase SQL editor.
          Until then your current sign-in works exactly as before. After it, the first time you sign in your
          account becomes the Owner account, with the same username and password.
        </div>
      )}

      {/* What each role is for — the thing the owner decides when adding someone. */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
        {STAFF_ROLES.map((r) => (
          <div key={r} style={{ border: `1px solid ${cBr}`, borderRadius: 10, padding: "14px 16px" }}>
            <StatusBadge color={ROLE_COLOR[r]}>{ROLE_LABEL[r]}</StatusBadge>
            <p style={{ color: C.textS, fontSize: 12.5, lineHeight: 1.6, margin: "10px 0 0" }}>{ROLE_HINT[r]}</p>
          </div>
        ))}
      </div>

      {enabled && (
        <>
          <TableShell
            label="Staff"
            minWidth={mob ? 760 : 940}
            head={["Name", "Username", "Password", "Role", "Last signed in", ""]}
            empty={loaded && active.length === 0 ? "No one yet." : undefined}
          >
            {active.map((s) => (
              <Row key={s.id} style={{ borderBottom: `1px solid ${cBr}` }}>
                <Cell style={td}>
                  <strong style={{ color: C.textH }}>{s.name}</strong>
                  {s.id === me?.id && <span style={{ color: C.textS, fontSize: 12 }}> (you)</span>}
                  {s.mustChangePassword && <div style={{ color: C.textS, fontSize: 11.5, marginTop: 4 }}>Hasn&apos;t chosen a password yet</div>}
                </Cell>
                <Cell style={{ ...td, fontFamily: "monospace" }}>{s.username}</Cell>
                <Cell style={td}><PasswordCell person={s} /></Cell>
                <Cell style={td}><StatusBadge color={ROLE_COLOR[s.role]}>{ROLE_LABEL[s.role]}</StatusBadge></Cell>
                <Cell style={{ ...td, color: C.textS }}>{s.lastLoginAt ? manilaTime(s.lastLoginAt) : "Never"}</Cell>
                <Cell style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  <ActionButton size="sm" icon="edit" onClick={() => setEditing(s)}>Edit</ActionButton>{" "}
                  <ActionButton size="sm" icon="lock" onClick={() => setResetting(s)}>Reset password</ActionButton>{" "}
                  {s.id !== me?.id && <ActionButton size="sm" kind="red" onClick={() => setToggling(s)}>Deactivate</ActionButton>}
                </Cell>
              </Row>
            ))}
          </TableShell>

          {inactive.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <h2 style={{ color: C.textH, fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>Deactivated</h2>
              <TableShell label="Deactivated staff" minWidth={mob ? 480 : 600} head={["Name", "Username", "Role", ""]}>
                {inactive.map((s) => (
                  <Row key={s.id} style={{ borderBottom: `1px solid ${cBr}`, opacity: 0.75 }}>
                    <Cell style={td}>{s.name}</Cell>
                    <Cell style={{ ...td, fontFamily: "monospace" }}>{s.username}</Cell>
                    <Cell style={td}>{ROLE_LABEL[s.role]}</Cell>
                    <Cell style={{ ...td, textAlign: "right" }}>
                      <ActionButton size="sm" onClick={() => setToggling(s)}>Reactivate</ActionButton>
                    </Cell>
                  </Row>
                ))}
              </TableShell>
            </div>
          )}
        </>
      )}

      {adding && <AddPerson onClose={() => setAdding(false)} onAdded={async (name) => { setAdding(false); await load(); toast(`${name} can sign in now.`, "success"); }} inp={inp} />}

      {editing && (
        <EditPerson person={editing} inp={inp} onClose={() => setEditing(null)}
          onSave={async (body) => {
            const err = await patch(editing.id, body);
            if (!err) { toast(`Saved ${editing.name}.`, "success"); setEditing(null); }
            return err;
          }} />
      )}

      {resetting && (
        <ResetPassword person={resetting} inp={inp} onClose={() => setResetting(null)}
          onSave={async (password) => {
            const err = await patch(resetting.id, { password });
            if (!err) { toast(`${resetting.name}'s password was reset. They choose a new one when they sign in.`, "success"); setResetting(null); }
            return err;
          }} />
      )}

      {toggling && (
        <ConfirmDialog
          title={toggling.active ? `Deactivate ${toggling.name}?` : `Reactivate ${toggling.name}?`}
          description={toggling.active
            ? "They are signed out at their next click and can't sign in again. Everything they recorded stays, under their name."
            : "They can sign in again with their last password."}
          onCancel={() => setToggling(null)}
          confirm={
            <ActionButton kind={toggling.active ? "red" : "primary"} onClick={async () => {
              const err = await patch(toggling.id, { active: !toggling.active });
              if (err) toast(err, "error");
              else toast(toggling.active ? `${toggling.name} was deactivated.` : `${toggling.name} can sign in again.`, "success");
              setToggling(null);
            }}>{toggling.active ? "Deactivate" : "Reactivate"}</ActionButton>
          }
        />
      )}
    </div>
  );
}

function AddPerson({ onClose, onAdded, inp }: { onClose: () => void; onAdded: (name: string) => void | Promise<void>; inp: React.CSSProperties }) {
  const { C } = useAdminStyle();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<StaffRole>("Caretaker");
  const [password, setPassword] = useState(tempPassword);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = { ...inp, width: "100%" };

  const save = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), username: username.trim(), role, password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) { setError(json?.error ?? "Could not add that person."); return; }
      await onAdded(name.trim());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add a person" subtitle="They choose their own password the first time they sign in." onClose={onClose} width={560}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton kind="primary" icon="check" disabled={busy} onClick={() => void save()}>{busy ? "Adding…" : "Add"}</ActionButton>
        </div>
      }>
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <Label htmlFor="st-name">NAME</Label>
          <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} style={field} placeholder="e.g. Ana Santos" />
        </div>
        <div>
          <Label htmlFor="st-user">USERNAME</Label>
          <Input id="st-user" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} maxLength={32} style={field} placeholder="e.g. ana" autoComplete="off" />
        </div>
        <div>
          <Label>ROLE</Label>
          <ChoiceButtons value={role} onChange={setRole} label="Role"
            options={STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
          <p style={{ color: C.textS, fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.6 }}>{ROLE_HINT[role]}</p>
        </div>
        <div>
          <Label htmlFor="st-pw">TEMPORARY PASSWORD</Label>
          <div style={{ display: "flex", gap: 8 }}>
            <Input id="st-pw" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} style={{ ...field, fontFamily: "monospace" }} />
            <ActionButton icon="refresh" onClick={() => setPassword(tempPassword())} aria-label="Make a new temporary password" />
          </div>
          <p style={{ color: C.textS, fontSize: 12, margin: "8px 0 0" }}>
            <Icon name="info" size={12} /> Give this to them in person. It works once — they replace it when they sign in.
          </p>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function EditPerson({ person, onClose, onSave, inp }: {
  person: StaffMember; onClose: () => void; onSave: (b: Record<string, unknown>) => Promise<string | null>; inp: React.CSSProperties;
}) {
  const { C } = useAdminStyle();
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState<StaffRole>(person.role);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Edit ${person.name}`} subtitle={`Username "${person.username}"`} onClose={onClose} width={520}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton kind="primary" icon="check" disabled={busy} onClick={async () => {
            setBusy(true);
            const err = await onSave({ name: name.trim(), role });
            setBusy(false);
            if (err) setError(err);
          }}>Save</ActionButton>
        </div>
      }>
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <Label htmlFor="ed-name">NAME</Label>
          <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} style={{ ...inp, width: "100%" }} />
        </div>
        <div>
          <Label>ROLE</Label>
          <ChoiceButtons value={role} onChange={setRole} label="Role" options={STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
          <p style={{ color: C.textS, fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.6 }}>{ROLE_HINT[role]}</p>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function ResetPassword({ person, onClose, onSave, inp }: {
  person: StaffMember; onClose: () => void; onSave: (pw: string) => Promise<string | null>; inp: React.CSSProperties;
}) {
  const { C } = useAdminStyle();
  const [password, setPassword] = useState(tempPassword);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Reset ${person.name}'s password`} subtitle="For someone who forgot theirs." onClose={onClose} width={520}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton kind="primary" icon="lock" disabled={busy} onClick={async () => {
            setBusy(true);
            const err = await onSave(password);
            setBusy(false);
            if (err) setError(err);
          }}>Reset</ActionButton>
        </div>
      }>
      <Label htmlFor="rs-pw">NEW TEMPORARY PASSWORD</Label>
      <div style={{ display: "flex", gap: 8 }}>
        <Input id="rs-pw" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} style={{ ...inp, width: "100%", fontFamily: "monospace" }} />
        <ActionButton icon="refresh" onClick={() => setPassword(tempPassword())} aria-label="Make a new temporary password" />
      </div>
      <p style={{ color: C.textS, fontSize: 12.5, margin: "10px 0 0", lineHeight: 1.6 }}>
        Tell them this password. They&apos;ll be asked to choose their own as soon as they sign in.
      </p>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}
