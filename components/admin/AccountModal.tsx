"use client";

/* Your own sign-in: username and password. Every staff member has one;
 * someone the owner just set up (or whose password the owner reset) is
 * shown this straight after signing in (`forced`) to choose their own,
 * so the temporary one the owner knows stops working.
 *
 * Changing these used to mean editing ADMIN_USERNAME / ADMIN_PASSWORD in the
 * hosting dashboard and redeploying, which in practice meant never changing
 * them. The server stores a scrypt hash, so nothing here is kept in plain
 * text, and the current password is required even though the session is
 * already signed in — otherwise a machine left open at the front desk is
 * enough to take the account.
 */

import { StaffAvatar } from "@/components/admin/StaffTab";
import { compressImage } from "@/lib/image";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { Modal, Label, ActionButton, ErrorNote, useAdminStyle } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import { useStaff } from "@/contexts/StaffContext";
import { ROLE_LABEL } from "@/lib/permissions";

/** The single pre-staff admin sign-in asked for 10; staff accounts 8
 *  (STAFF_PASSWORD_MIN in lib/staff.server.ts), which the server enforces. */
const MIN_PASSWORD_ADMIN = 10;
const MIN_PASSWORD_STAFF = 8;

export function AccountModal({ onClose, onSignedOut, forced = false, mode = "profile" }: {
  onClose: () => void;
  onSignedOut: () => void;
  /** A temporary password from the owner: a new one must be chosen. */
  forced?: boolean;
  /** "profile": photo, name and username (My profile). "password": only
   *  the password change (Change my password). A forced change is always
   *  the password one. */
  mode?: "profile" | "password";
}) {
  const pwOnly = forced || mode === "password";
  const { C, inp, cBr } = useAdminStyle();
  const { toast } = useToast();
  const { me } = useStaff();
  const MIN_PASSWORD = me?.id ? MIN_PASSWORD_STAFF : MIN_PASSWORD_ADMIN;

  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/admin/account", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (alive && json?.success) setUsername(json.username ?? "");
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const changingPassword = newPassword.length > 0;
  const problems: string[] = [];
  if (username.trim().length < 3) problems.push("The username must be at least 3 characters.");
  if (/\s/.test(username.trim())) problems.push("The username cannot contain spaces.");
  if (!currentPassword) problems.push("Enter your current password to confirm this change.");
  if (pwOnly && !changingPassword) problems.push(forced ? "Choose a new password of your own." : "Enter your new password.");
  if (changingPassword && newPassword.length < MIN_PASSWORD) problems.push(`The new password must be at least ${MIN_PASSWORD} characters.`);
  if (changingPassword && confirm !== newPassword) problems.push("The two new passwords do not match.");

  const save = async () => {
    setError("");
    if (problems.length) { setError(problems[0]); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), currentPassword, newPassword: pwOnly ? newPassword : "" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "Could not save the account.");
        return;
      }
      toast(pwOnly ? "Password changed. Please sign in with your new password." : "Sign-in updated. Please sign in again.", "success");
      // The server cleared the cookie: the credentials behind this session
      // just changed, so it has to be re-established.
      onSignedOut();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const field = { ...inp, width: "100%" } as const;

  return (
    <Modal
      title={forced ? "Choose your own password" : pwOnly ? "Change my password" : "My profile"}
      subtitle={me ? `${me.name} · ${ROLE_LABEL[me.role]}` : "Your sign-in for this panel"}
      onClose={forced ? onSignedOut : onClose}
      // Forced: closing means signing out, so it takes the Sign out button.
      // A stray click outside (or Esc, or the ✕) used to sign the person out
      // and throw away the passwords they had typed.
      dismissible={!forced}
      width={560}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <ActionButton onClick={forced ? onSignedOut : onClose}>{forced ? "Sign out" : "Cancel"}</ActionButton>
          <ActionButton kind="primary" icon="check" disabled={busy || !loaded} onClick={() => void save()}>
            {busy ? "Saving…" : pwOnly ? "Change password" : "Save changes"}
          </ActionButton>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        {/* Your name and photo: saved on their own, no password needed. */}
        {!pwOnly && me?.id && <ProfileSection />}
        {forced && (
          <p style={{ color: C.textB, fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>
            The owner gave you a temporary password. Pick one only you know before you start — the temporary one stops working when you save.
          </p>
        )}
        {/* My profile: the username (sign-in name). The password has its
            own window, "Change my password". */}
        {!pwOnly && (
        <div style={me?.id ? { borderTop: `1px solid ${cBr}`, paddingTop: 16 } : undefined}>
          {me?.id && <p style={{ color: C.textH, fontSize: 13.5, fontWeight: 600, margin: "0 0 10px" }}>Sign-in <span style={{ color: C.textS, fontWeight: 400, fontSize: 12 }}>· asks for your current password, then signs you out</span></p>}
          <Label htmlFor="acc-username">USERNAME</Label>
          <Input id="acc-username" value={username} onChange={(e) => setUsername(e.target.value)}
            autoComplete="username" maxLength={64} style={field} />
        </div>
        )}

        {pwOnly && (<>
        <div>
          <Label htmlFor="acc-new">NEW PASSWORD</Label>
          <p style={{ color: C.textS, fontSize: 12, margin: "0 0 8px" }}>At least {MIN_PASSWORD} characters.</p>
          <PasswordField id="acc-new" value={newPassword} onChange={setNewPassword} autoComplete="new-password" style={field} />
        </div>

        <div>
          <Label htmlFor="acc-confirm">CONFIRM NEW PASSWORD</Label>
          <PasswordField id="acc-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" style={field} />
        </div>

        </>)}

        {/* Last, and visually separated: this is the gate, not another field
            to fill in on the way past. */}
        <div style={{ borderTop: `1px solid ${cBr}`, paddingTop: 16 }}>
          <Label htmlFor="acc-current">{forced ? "TEMPORARY PASSWORD (THE ONE YOU SIGNED IN WITH)" : "CURRENT PASSWORD"}</Label>
          <p style={{ color: C.textS, fontSize: 12, margin: "0 0 8px", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0, marginTop: 4 }}>
              <Icon name="lock" size={13} strokeWidth={1.75} />
            </span>
            Required for any change here, even though you are already signed in.
          </p>
          <PasswordField id="acc-current" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" style={field} />
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <p style={{ color: C.textS, fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          Saving signs you out, so you can check the new sign-in works straight away.
        </p>
      </div>
    </Modal>
  );
}

/** A password box with an eye to show or hide what was typed. */
function PasswordField({ id, value, onChange, autoComplete, style }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: string; style: React.CSSProperties;
}) {
  const { C } = useAdminStyle();
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <Input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete} maxLength={128} style={{ ...style, paddingRight: 44 }} />
      <button type="button" onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} title={show ? "Hide password" : "Show password"}
        style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, display: "grid", placeItems: "center", background: "none", border: "none", borderRadius: 8, cursor: "pointer", color: show ? C.goldInk : C.textS }}>
        <Icon name={show ? "eye-off" : "eye"} size={17} strokeWidth={1.9} />
      </button>
    </div>
  );
}

/** My profile: your own photo and name, saved without the password the
 *  sign-in change below needs (/api/staff/me, /api/staff/photo). */
function ProfileSection() {
  const { C, inp } = useAdminStyle();
  const { toast } = useToast();
  const { me, refresh } = useStaff();
  const [name, setName] = useState(me?.name ?? "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!me?.id) return;
    let alive = true;
    fetch(`/api/staff/photo?id=${encodeURIComponent(me.id)}&meta=1`, { cache: "no-store" })
      .then((r) => r.json()).then((j: { photo?: string | null }) => { if (alive && j.photo) setPhoto(j.photo); })
      .catch(() => {});
    return () => { alive = false; };
  }, [me?.id]);

  if (!me?.id) return null;
  const myId = me.id;
  const nameBad = name.trim().length < 2 ? "Enter your name (at least 2 letters)." : null;
  const dirty = name.trim() !== me.name || photoChanged;

  const save = async () => {
    setError("");
    if (nameBad) return setError(nameBad);
    setBusy(true);
    try {
      if (name.trim() !== me.name) {
        const r = await fetch("/api/staff/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.success) return setError(j?.error ?? "Could not save your name.");
      }
      if (photoChanged) {
        const r = photo
          ? await fetch("/api/staff/photo", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: myId, photo }) })
          : await fetch(`/api/staff/photo?id=${encodeURIComponent(myId)}`, { method: "DELETE" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.success) return setError(j?.error ?? "Could not save your photo.");
        setPhotoChanged(false);
      }
      await refresh();
      toast("Your profile is saved.", "success");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p style={{ color: C.textH, fontSize: 13.5, fontWeight: 600, margin: 0 }}>Your profile</p>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <StaffAvatar name={name || me.name} role={me.role} photo={photo} size={64} />
          <button type="button" className="sw-staff__camera" onClick={() => fileRef.current?.click()} aria-label="Choose a photo"><Icon name="image" size={13} /></button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f || !f.type.startsWith("image/")) return;
            try { setPhoto(await compressImage(f, 512)); setPhotoChanged(true); } catch { setError("Could not read that photo."); }
          }} />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <Label htmlFor="acc-name">YOUR NAME</Label>
          <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} style={{ ...inp, width: "100%" }} />
          {nameBad && name.length > 0 && <p role="alert" style={{ color: "#e5484d", fontSize: 12, margin: "6px 0 0" }}>{nameBad}</p>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {photo && <ActionButton size="sm" kind="ghost" onClick={() => { setPhoto(null); setPhotoChanged(true); }}>Remove photo</ActionButton>}
        <ActionButton size="sm" kind="primary" icon="check" disabled={busy || !dirty || !!nameBad} onClick={() => void save()}>{busy ? "Saving…" : "Save profile"}</ActionButton>
      </div>
      {error && <p role="alert" style={{ color: "#e5484d", fontSize: 12.5, margin: 0 }}>{error}</p>}
    </div>
  );
}
