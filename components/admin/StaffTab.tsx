"use client";

/* Staff Accounts — the owner's list of who can sign in, and as what.
 *
 * Each person gets their own sign-in, so every booking, payment and
 * inspection says WHO did it, and each role sees only its own work:
 * caretakers their tasks on their phones, front desk the counter. What
 * front desk can't do (refunds, voids, cancellations) reaches the owner as
 * a one-tap request instead of a phone call.
 *
 * Laid out as a card per person (photo or initials, name, username, role,
 * last sign-in, password behind an eye), with the actions in a ⋯ menu.
 * The owner sets a temporary password; the person chooses their own at
 * first sign-in. A person who leaves is usually deactivated (signs them out,
 * keeps everything attributed to them); the super admin alone can delete
 * an account outright, and their records still keep the name.
 */

import { RolePermissions } from "@/components/admin/RolePermissions";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useStaff } from "@/contexts/StaffContext";
import {
  AdminPageHeader, Modal, ConfirmDialog, Label, ChoiceButtons, ActionButton, ErrorNote,
  StatusBadge, useAdminStyle,
} from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Icon, type IconName } from "@/components/common/Icon";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_HINT, ROLE_LABEL, STAFF_ROLES, type StaffRole } from "@/lib/permissions";
import { manilaDate, manilaTime } from "@/lib/finance";
import { fmtDate } from "@/lib/utils";
import { compressImage } from "@/lib/image";
import { initialsOf } from "@/lib/staffPhotos";
import "./StaffTab.css";

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
  /** Their profile photo's link, or null for initials. */
  photo?: string | null;
}

const ROLE_COLOR: Record<StaffRole, string> = { Owner: "#c9a84c", FrontDesk: "#3e8ed0", Caretaker: "#2e9e4e" };
const ROLE_ICON: Record<StaffRole, IconName> = { Owner: "shield-alert", FrontDesk: "clipboard", Caretaker: "toolbox" };

/** Same rules as the server (lib/staff.server.ts). */
const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const PASSWORD_MIN = 8;
const nameProblem = (n: string) => (n.trim().length < 2 ? "Enter their name (at least 2 letters)." : null);
const usernameProblem = (u: string) => (USERNAME_RE.test(u) ? null : "3 to 32 letters, numbers, dots, dashes or underscores — no spaces.");
const passwordProblem = (p: string) => (p.length < PASSWORD_MIN ? `At least ${PASSWORD_MIN} characters.` : null);

/** A readable temporary password: three short words and two digits. */
function tempPassword(): string {
  const words = ["pool", "palm", "sun", "wave", "shell", "breeze", "coral", "sand", "reef", "lagoon", "tide", "bay"];
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 90 + 10;
  return `${pick()}-${pick()}-${pick()}${n}`;
}

/** "Ana Marie Santos" → "ana.santos", for the username suggestion. */
const suggestUsername = (name: string) => {
  const parts = name.toLowerCase().normalize("NFD").replace(/[^a-z\s]/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return (parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0]).slice(0, 32);
};

/** A person's photo, or their initials on their role's colour. */
export function StaffAvatar({ name, role, photo, size = 56 }: { name: string; role: StaffRole; photo?: string | null; size?: number }) {
  const c = ROLE_COLOR[role];
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element -- a small staff photo from our own route
    <img src={photo} alt="" className="sw-staff__avatar" style={{ width: size, height: size, borderColor: `${c}88` }} />
  ) : (
    <span className="sw-staff__avatar sw-staff__avatar--initials" aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, ${c}55, ${c}22)`, color: c, borderColor: `${c}66` }}>
      {initialsOf(name)}
    </span>
  );
}

const REVEAL_SECONDS = 30;

/** One person's password behind an eye: fetched only when pressed, hidden
 *  again after REVEAL_SECONDS. */
function PasswordReveal({ person }: { person: StaffMember }) {
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
    setBusy(true); setNote("");
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
    return <span title="Saved the next time they sign in, or reset it to set a new one." style={{ color: C.textS, fontSize: 12 }}>Password not saved yet</span>;
  }
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
      <span style={{ flex: 1, minWidth: 0, fontFamily: "monospace", fontSize: 13.5, color: shown === null ? C.textS : C.textH, letterSpacing: shown === null ? 2 : 0.3, userSelect: shown === null ? "none" : "all", overflowWrap: "anywhere" }}>
        {shown ?? "••••••••"}
      </span>
      <button type="button" className="sw-staff__iconbtn" disabled={busy} onClick={() => void toggle()}
        aria-label={shown === null ? `Show ${person.name}'s password` : `Hide ${person.name}'s password`}>
        <Icon name={shown === null ? "eye" : "eye-off"} size={14} />
      </button>
      {note && <span role="alert" style={{ color: "#e5484d", fontSize: 11.5 }}>{note}</span>}
    </span>
  );
}

export function StaffTab({ mob }: { mob: boolean }) {
  const { C, cBr, cBg, inp } = useAdminStyle();
  const { toast } = useToast();
  const { me, staffEnabled } = useStaff();
  const isSuper = me?.role === "Owner";
  const [list, setList] = useState<StaffMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(staffEnabled);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const [toggling, setToggling] = useState<StaffMember | null>(null);
  const [deleting, setDeleting] = useState<StaffMember | null>(null);
  const [q, setQ] = useState("");
  const [permsOpen, setPermsOpen] = useState(false);

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
    return null;
  };

  const needle = q.trim().toLowerCase();
  const match = (s: StaffMember) => !needle || s.name.toLowerCase().includes(needle) || s.username.toLowerCase().includes(needle) || ROLE_LABEL[s.role].toLowerCase().includes(needle);
  const active = list.filter((s) => s.active && match(s));
  const inactive = list.filter((s) => !s.active && match(s));

  const lastSeen = (s: StaffMember) => !s.lastLoginAt ? "Never signed in"
    : manilaDate(s.lastLoginAt) === manilaDate() ? `Signed in today, ${manilaTime(s.lastLoginAt)}`
      : `Signed in ${fmtDate(manilaDate(s.lastLoginAt))}`;

  const card = (s: StaffMember) => {
    const self = s.id === me?.id;
    const c = ROLE_COLOR[s.role];
    return (
      <li key={s.id} className={`sw-staff__card${s.active ? "" : " is-off"}`} style={{ background: cBg, borderColor: cBr }}>
        <span className="sw-staff__stripe" style={{ background: c }} aria-hidden="true" />
        <div className="sw-staff__top">
          <StaffAvatar name={s.name} role={s.role} photo={s.photo} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="sw-staff__name" style={{ color: C.textH }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
              {self && <span className="sw-staff__you">You</span>}
            </div>
            <div className="sw-staff__user" style={{ color: C.textS }}>@{s.username}</div>
            <div style={{ marginTop: 6 }}><StatusBadge color={c}>{ROLE_LABEL[s.role]}</StatusBadge></div>
          </div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" className="sw-staff__iconbtn sw-staff__more" aria-label={`Manage ${s.name}`}>
                <Icon name="more" size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ minWidth: 210 }}>
              {s.active ? <>
                <DropdownMenuItem onSelect={() => setEditing(s)}><Icon name="edit" />Edit profile</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setResetting(s)}><Icon name="lock" />Reset password</DropdownMenuItem>
                {!self && <DropdownMenuItem onSelect={() => setToggling(s)}><Icon name="eye-off" />Deactivate</DropdownMenuItem>}
              </> : (
                <DropdownMenuItem onSelect={() => setToggling(s)}><Icon name="refresh" />Reactivate</DropdownMenuItem>
              )}
              {/* Deleting is the super admin's alone, never their own account. */}
              {isSuper && !self && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(s)}><Icon name="trash" />Delete account</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* The password in the card itself, full width, so a revealed one
            reads in full (it used to be squeezed into the footer). */}
        {s.active && (
          <div className="sw-staff__pw" style={{ borderColor: cBr }}>
            <span className="sw-staff__pwlabel" style={{ color: C.textS }}>Password</span>
            <PasswordReveal person={s} />
          </div>
        )}
        {s.mustChangePassword && s.active && (
          <div className="sw-staff__note"><Icon name="info" size={12} /> Hasn&apos;t chosen their own password yet</div>
        )}
        <div className="sw-staff__foot" style={{ borderTopColor: cBr }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.textS, fontSize: 12, minWidth: 0 }}>
            <Icon name="clock" size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.active ? lastSeen(s) : "Deactivated"}</span>
          </span>
          {!s.active && (
            <button type="button" className="sw-staff__chip" onClick={() => setToggling(s)}>Reactivate</button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div>
      <AdminPageHeader
        title="Staff Accounts"
        subtitle="Everyone who signs in, and what each one can do. Every record says who made it."
        mob={mob}
        action={enabled ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* What each role may do: the super admin's to change. */}
            {isSuper && <ActionButton icon="shield-alert" onClick={() => setPermsOpen(true)}>Roles &amp; permissions</ActionButton>}
            <ActionButton kind="primary" icon="plus" onClick={() => setAdding(true)}>Add a person</ActionButton>
          </div>
        ) : undefined}
      />

      {!enabled && loaded && (
        <div role="status" style={{ border: `1px solid ${cBr}`, borderLeft: "3px solid #f5a524", borderRadius: 10, padding: "16px 20px", marginBottom: 24, color: C.textB, fontSize: 13.5, lineHeight: 1.7 }}>
          <strong style={{ color: C.textH }}>Staff accounts aren&apos;t switched on yet.</strong> They need one database update —
          {" "}<code>supabase/migrations/20261012120000_staff_and_owner_requests.sql</code>, run in the Supabase SQL editor.
          Until then your current sign-in works exactly as before. After it, the first time you sign in your
          account becomes the Owner account, with the same username and password.
        </div>
      )}

      {/* What each role is for, with how many people have it. */}
      <div className="sw-staff__roles" style={{ gridTemplateColumns: mob ? "1fr" : "repeat(3, minmax(0,1fr))" }}>
        {STAFF_ROLES.map((r) => (
          <div key={r} className="sw-staff__role" style={{ borderColor: cBr, background: cBg }}>
            <span className="sw-staff__roleicon" style={{ color: ROLE_COLOR[r], background: `${ROLE_COLOR[r]}1f` }}><Icon name={ROLE_ICON[r]} size={16} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StatusBadge color={ROLE_COLOR[r]}>{ROLE_LABEL[r]}</StatusBadge>
                <span style={{ color: C.textS, fontSize: 12 }}>{list.filter((s) => s.active && s.role === r).length} active</span>
              </div>
              <p style={{ color: C.textS, fontSize: 12.5, lineHeight: 1.6, margin: "8px 0 0" }}>{ROLE_HINT[r]}</p>
            </div>
          </div>
        ))}
      </div>

      {enabled && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0 14px", flexWrap: "wrap" }}>
            <h2 style={{ color: C.textH, fontSize: 15, fontWeight: 600, margin: 0, flex: 1 }}>Team <span style={{ color: C.textS, fontWeight: 400 }}>({list.filter((s) => s.active).length})</span></h2>
            <div style={{ position: "relative", width: mob ? "100%" : 280 }}>
              <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", opacity: 0.45, color: C.textH }} />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name, username or role" aria-label="Find a staff member"
                style={{ ...inp, paddingLeft: 32, width: "100%" }} />
            </div>
          </div>

          {loaded && active.length === 0 ? (
            <p style={{ color: C.textS, fontSize: 13.5, padding: "28px 0", textAlign: "center", border: `1px dashed ${cBr}`, borderRadius: 12 }}>
              {needle ? "Nobody matches that." : "No one yet."}
            </p>
          ) : (
            <ul className="sw-staff__grid">{active.map(card)}</ul>
          )}

          {inactive.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <h2 style={{ color: C.textH, fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>Deactivated <span style={{ color: C.textS, fontWeight: 400 }}>({inactive.length})</span></h2>
              <ul className="sw-staff__grid">{inactive.map(card)}</ul>
            </div>
          )}
        </>
      )}

      {permsOpen && <RolePermissions onClose={() => setPermsOpen(false)} />}
      {adding && (
        <PersonForm mode="add" inp={inp} onClose={() => setAdding(false)}
          onDone={async (name) => { setAdding(false); await load(); toast(`${name} can sign in now.`, "success"); }} />
      )}
      {editing && (
        <PersonForm mode="edit" person={editing} inp={inp} onClose={() => setEditing(null)} patch={patch}
          onDone={async (name) => { setEditing(null); await load(); toast(`Saved ${name}.`, "success"); }} />
      )}
      {resetting && (
        <ResetPassword person={resetting} inp={inp} onClose={() => setResetting(null)}
          onSave={async (password) => {
            const err = await patch(resetting.id, { password });
            if (!err) { await load(); toast(`${resetting.name}'s password was reset. They choose a new one when they sign in.`, "success"); setResetting(null); }
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
              else { await load(); toast(toggling.active ? `${toggling.name} was deactivated.` : `${toggling.name} can sign in again.`, "success"); }
              setToggling(null);
            }}>{toggling.active ? "Deactivate" : "Reactivate"}</ActionButton>
          }
        />
      )}
      {deleting && (
        <DeletePerson person={deleting} inp={inp} onClose={() => setDeleting(null)}
          onDeleted={async () => { const n = deleting.name; setDeleting(null); await load(); toast(`${n}'s account was deleted. Their records keep their name.`, "success"); }} />
      )}
    </div>
  );
}

/** The photo picker at the top of the form: a round preview with a camera
 *  button, and Remove. Returns the new data URL, or null to remove. */
function PhotoPicker({ name, role, photo, onPick }: { name: string; role: StaffRole; photo: string | null; onPick: (p: string | null) => void }) {
  const { C } = useAdminStyle();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pick = async (file?: File) => {
    if (!file) return;
    setErr("");
    if (!file.type.startsWith("image/")) return setErr("Choose a photo (JPG, PNG or WebP).");
    setBusy(true);
    try { onPick(await compressImage(file, 512)); } catch { setErr("Could not read that photo."); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ position: "relative" }}>
        <StaffAvatar name={name || "?"} role={role} photo={photo} size={76} />
        <button type="button" className="sw-staff__camera" onClick={() => ref.current?.click()} aria-label="Choose a photo" disabled={busy}>
          <Icon name="image" size={14} />
        </button>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.textH, fontSize: 13.5, fontWeight: 600 }}>Profile photo</div>
        <div style={{ color: C.textS, fontSize: 12, margin: "2px 0 8px" }}>{busy ? "Preparing…" : "Optional. Without one, their initials show."}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <ActionButton size="sm" icon="upload" disabled={busy} onClick={() => ref.current?.click()}>{photo ? "Change" : "Upload"}</ActionButton>
          {photo && <ActionButton size="sm" kind="ghost" onClick={() => onPick(null)}>Remove</ActionButton>}
        </div>
        {err && <div role="alert" style={{ color: "#e5484d", fontSize: 12, marginTop: 6 }}>{err}</div>}
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

/** A labelled field with its problem (in red) or hint under it. */
function Field({ id, label, error, hint, children }: { id?: string; label: string; error?: string | null; hint?: React.ReactNode; children: React.ReactNode }) {
  const { C } = useAdminStyle();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p role="alert" style={{ color: "#e5484d", fontSize: 12, fontWeight: 600, margin: "6px 0 0" }}>{error}</p>
        : hint ? <p style={{ color: C.textS, fontSize: 12, margin: "6px 0 0", lineHeight: 1.5 }}>{hint}</p> : null}
    </div>
  );
}

/** Copy a temporary password, with a "Copied" tick for a moment. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <ActionButton icon={done ? "check" : "clipboard"} aria-label="Copy the password" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* no clipboard: they can select it */ }
    }}>{done ? "Copied" : "Copy"}</ActionButton>
  );
}

/** Add a person, or edit one: photo, name, username, role (and on add, the
 *  temporary password). Problems show under each field as you type. */
function PersonForm({ mode, person, onClose, onDone, patch, inp }: {
  mode: "add" | "edit";
  person?: StaffMember;
  onClose: () => void;
  onDone: (name: string) => void | Promise<void>;
  patch?: (id: string, body: Record<string, unknown>) => Promise<string | null>;
  inp: React.CSSProperties;
}) {
  const { C } = useAdminStyle();
  const [name, setName] = useState(person?.name ?? "");
  const [username, setUsername] = useState(person?.username ?? "");
  const [userTouched, setUserTouched] = useState(mode === "edit");
  const [role, setRole] = useState<StaffRole>(person?.role ?? "Caretaker");
  const [password, setPassword] = useState(tempPassword);
  const [photo, setPhoto] = useState<string | null>(person?.photo ?? null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = { ...inp, width: "100%" };

  const errs = {
    name: nameProblem(name),
    username: usernameProblem(username),
    password: mode === "add" ? passwordProblem(password) : null,
  };
  const show = (k: keyof typeof errs, v: string) => (tried || v.length > 0 ? errs[k] : null);
  const invalid = Object.values(errs).some(Boolean);

  const savePhoto = async (id: string): Promise<string | null> => {
    if (!photoChanged) return null;
    const res = photo
      ? await fetch("/api/staff/photo", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, photo }) })
      : await fetch(`/api/staff/photo?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    return res.ok && json?.success ? null : json?.error ?? "The photo wasn't saved.";
  };

  const save = async () => {
    setTried(true);
    setError("");
    if (invalid) return;
    setBusy(true);
    try {
      let id = person?.id ?? "";
      if (mode === "add") {
        const res = await fetch("/api/staff", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), username: username.trim(), role, password }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) { setError(json?.error ?? "Could not add that person."); return; }
        id = json.staff?.id ?? "";
      } else if (patch && person) {
        const body: Record<string, unknown> = {};
        if (name.trim() !== person.name) body.name = name.trim();
        if (username.trim() !== person.username) body.username = username.trim();
        if (role !== person.role) body.role = role;
        if (Object.keys(body).length) {
          const err = await patch(person.id, body);
          if (err) { setError(err); return; }
        }
      }
      const photoErr = id ? await savePhoto(id) : null;
      if (photoErr) { setError(`${mode === "add" ? "Added" : "Saved"}, but ${photoErr.charAt(0).toLowerCase()}${photoErr.slice(1)}`); return; }
      await onDone(name.trim());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={mode === "add" ? "Add a person" : `Edit ${person?.name}`}
      subtitle={mode === "add" ? "They choose their own password the first time they sign in." : "Their photo, name, username and role."}
      onClose={onClose} width={600}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton kind="primary" icon="check" disabled={busy || (tried && invalid)} onClick={() => void save()}>
            {busy ? (mode === "add" ? "Adding…" : "Saving…") : mode === "add" ? "Add person" : "Save changes"}
          </ActionButton>
        </div>
      }>
      <div style={{ display: "grid", gap: 18 }}>
        <PhotoPicker name={name} role={role} photo={photo} onPick={(p) => { setPhoto(p); setPhotoChanged(true); }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <Field id="st-name" label="Full name" error={show("name", name)}>
            <Input id="st-name" value={name} maxLength={60} style={field} placeholder="e.g. Ana Santos" autoComplete="off"
              onChange={(e) => { setName(e.target.value); if (!userTouched) setUsername(suggestUsername(e.target.value)); }} />
          </Field>
          <Field id="st-user" label="Username" error={show("username", username)} hint="What they type to sign in.">
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.textS, fontSize: 13.5 }}>@</span>
              <Input id="st-user" value={username} maxLength={32} style={{ ...field, paddingLeft: 30, fontFamily: "monospace" }} placeholder="e.g. ana.santos" autoComplete="off"
                onChange={(e) => { setUserTouched(true); setUsername(e.target.value.replace(/\s/g, "")); }} />
            </div>
          </Field>
        </div>
        <Field label="Role" hint={ROLE_HINT[role]}>
          <ChoiceButtons value={role} onChange={setRole} label="Role" options={STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
        </Field>
        {mode === "add" && (
          <Field id="st-pw" label="Temporary password" error={show("password", password)}
            hint={<><Icon name="info" size={12} /> Give this to them in person. It works once — they replace it when they sign in.</>}>
            <div style={{ display: "flex", gap: 8 }}>
              <Input id="st-pw" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} style={{ ...field, fontFamily: "monospace" }} />
              <ActionButton icon="refresh" onClick={() => setPassword(tempPassword())} aria-label="Make a new temporary password" />
              <CopyButton text={password} />
            </div>
          </Field>
        )}
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
  const bad = passwordProblem(password);
  return (
    <Modal title={`Reset ${person.name}'s password`} subtitle="For someone who forgot theirs." onClose={onClose} width={540}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton kind="primary" icon="lock" disabled={busy || !!bad} onClick={async () => {
            setBusy(true);
            const err = await onSave(password);
            setBusy(false);
            if (err) setError(err);
          }}>Reset password</ActionButton>
        </div>
      }>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <StaffAvatar name={person.name} role={person.role} photo={person.photo} size={44} />
        <div><div style={{ color: C.textH, fontWeight: 600 }}>{person.name}</div><div style={{ color: C.textS, fontSize: 12.5, fontFamily: "monospace" }}>@{person.username}</div></div>
      </div>
      <Field id="rs-pw" label="New temporary password" error={bad}
        hint="Tell them this password. They'll be asked to choose their own as soon as they sign in.">
        <div style={{ display: "flex", gap: 8 }}>
          <Input id="rs-pw" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} style={{ ...inp, width: "100%", fontFamily: "monospace" }} />
          <ActionButton icon="refresh" onClick={() => setPassword(tempPassword())} aria-label="Make a new temporary password" />
          <CopyButton text={password} />
        </div>
      </Field>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}

/** Delete for good: the super admin types the username to confirm. */
function DeletePerson({ person, onClose, onDeleted, inp }: { person: StaffMember; onClose: () => void; onDeleted: () => void | Promise<void>; inp: React.CSSProperties }) {
  const { C } = useAdminStyle();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ok = typed.trim() === person.username;
  return (
    <Modal title={`Delete ${person.name}'s account?`} subtitle="This can't be undone." onClose={onClose} width={520}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton kind="red" icon="trash" disabled={!ok || busy} onClick={async () => {
            setBusy(true); setError("");
            const res = await fetch(`/api/staff?id=${encodeURIComponent(person.id)}`, { method: "DELETE" }).catch(() => null);
            const json = await res?.json().catch(() => null);
            setBusy(false);
            if (!res || !json?.success) return setError(json?.error ?? "Could not delete that account.");
            await onDeleted();
          }}>{busy ? "Deleting…" : "Delete account"}</ActionButton>
        </div>
      }>
      <p style={{ color: C.textB, fontSize: 13.5, lineHeight: 1.65, margin: "0 0 14px" }}>
        They can never sign in again and their photo is removed. Bookings, payments and inspections they recorded
        stay, still under their name. To only stop them signing in, <strong>deactivate</strong> instead — that can be undone.
      </p>
      <Field id="del-confirm" label={`Type ${person.username} to confirm`}>
        <Input id="del-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" style={{ ...inp, width: "100%", fontFamily: "monospace" }} placeholder={person.username} />
      </Field>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}
