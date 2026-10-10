"use client";

/* The admin's own sign-in: username and password.
 *
 * Changing these used to mean editing ADMIN_USERNAME / ADMIN_PASSWORD in the
 * hosting dashboard and redeploying, which in practice meant never changing
 * them. The server stores a scrypt hash, so nothing here is kept in plain
 * text, and the current password is required even though the session is
 * already signed in — otherwise a machine left open at the front desk is
 * enough to take the account.
 */

import { useEffect, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { Modal, Label, ActionButton, ErrorNote, useAdminStyle } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";

const MIN_PASSWORD = 10;

export function AccountModal({ onClose, onSignedOut }: { onClose: () => void; onSignedOut: () => void }) {
  const { C, inp, cBr } = useAdminStyle();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
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
        body: JSON.stringify({ username: username.trim(), currentPassword, newPassword }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "Could not save the account.");
        return;
      }
      toast("Sign-in updated. Please sign in again.", "success");
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
      title="Admin account"
      subtitle="Your sign-in for this panel"
      onClose={onClose}
      width={560}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton kind="primary" icon="check" disabled={busy || !loaded} onClick={() => void save()}>
            {busy ? "Saving…" : "Save changes"}
          </ActionButton>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <Label htmlFor="acc-username">USERNAME</Label>
          <Input id="acc-username" value={username} onChange={(e) => setUsername(e.target.value)}
            autoComplete="username" maxLength={64} style={field} />
        </div>

        <div style={{ borderTop: `1px solid ${cBr}`, paddingTop: 16 }}>
          <Label htmlFor="acc-new">NEW PASSWORD</Label>
          <p style={{ color: C.textS, fontSize: 12, margin: "0 0 8px" }}>
            At least {MIN_PASSWORD} characters. Leave both boxes empty to keep your current password and only change the username.
          </p>
          <Input id="acc-new" type={show ? "text" : "password"} value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password"
            maxLength={128} style={field} />
        </div>

        <div>
          <Label htmlFor="acc-confirm">CONFIRM NEW PASSWORD</Label>
          <Input id="acc-confirm" type={show ? "text" : "password"} value={confirm}
            onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
            maxLength={128} style={field} />
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", color: C.textS, fontSize: 12.5, cursor: "pointer" }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show the passwords I type
        </label>

        {/* Last, and visually separated: this is the gate, not another field
            to fill in on the way past. */}
        <div style={{ borderTop: `1px solid ${cBr}`, paddingTop: 16 }}>
          <Label htmlFor="acc-current">CURRENT PASSWORD</Label>
          <p style={{ color: C.textS, fontSize: 12, margin: "0 0 8px", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0, marginTop: 4 }}>
              <Icon name="lock" size={13} strokeWidth={1.75} />
            </span>
            Required for any change here, even though you are already signed in.
          </p>
          <Input id="acc-current" type="password" value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password"
            maxLength={128} style={field} />
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <p style={{ color: C.textS, fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          Saving signs you out, so you can check the new sign-in works straight away.
        </p>
      </div>
    </Modal>
  );
}
