"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Icon } from "@/components/common/Icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gold, goldBtn } from "@/lib/styles";
import { GoldParticles } from "@/components/common/GoldParticles";
import { ForgotPassword } from "@/components/admin/ForgotPassword";
import "./AdminLogin.css";

interface AdminLoginProps {
  onLogin: () => void;
  onGoHome: () => void;
}

export function AdminLogin({ onLogin, onGoHome }: AdminLoginProps) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  // Wrong tries: the server allows a few, then pauses sign-in for a minute
  // (lib/loginLock.server.ts). `tries` is null until the first wrong one.
  const [tries, setTries] = useState<{ left: number; of: number; pause: number } | null>(null);
  const [pausedLeft, setPausedLeft] = useState(0);
  // The pause counts down once a second, then the form opens again.
  useEffect(() => {
    if (pausedLeft <= 0) return;
    const t = setTimeout(() => {
      setPausedLeft((s) => s - 1);
      if (pausedLeft === 1) { setErr(""); setTries((p) => (p ? { ...p, left: p.of } : p)); }
    }, 1000);
    return () => clearTimeout(t);
  }, [pausedLeft]);
  const paused = pausedLeft > 0;
  const clock = `${Math.floor(pausedLeft / 60)}:${String(pausedLeft % 60).padStart(2, "0")}`;
  // "Forgot password?": a code to the account's email (ForgotPassword.tsx).
  const [forgot, setForgot] = useState(false);
  const { toast } = useToast();
  const { isDark } = useTheme();
  const C = T(isDark);

  // The comparison used to happen right here, against ADMIN_CREDS. That put
  // the real password in the JavaScript bundle and let anyone who could edit
  // client state walk straight past it. The server now decides, and answers
  // with an httpOnly cookie this code cannot read — which is the point.
  const handle = async () => {
    if (loading || paused) return;
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setTries(null);
        onLogin();
        toast(`Welcome back, ${typeof data?.staff?.name === "string" ? data.staff.name : "Admin"}!`, "success");
      } else if (res.status === 429 && typeof data?.lockedFor === "number") {
        setPausedLeft(Math.max(1, Math.ceil(data.lockedFor)));
        setTries({ left: 0, of: Number(data.tries) || 5, pause: Number(data.pauseSeconds) || 60 });
        setErr("");
        toast("Too many wrong tries. Sign-in is paused for a minute.", "warning");
      } else {
        if (typeof data?.triesLeft === "number") setTries({ left: data.triesLeft, of: Number(data.tries) || 5, pause: Number(data.pauseSeconds) || 60 });
        setErr(typeof data?.error === "string" ? data.error : "Invalid username or password.");
        toast("Login failed.", "error");
      }
    } catch {
      setErr("Could not reach the server. Check your connection and try again.");
      toast("Login failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Surfaces. The page previously hardcoded a dark palette while still
  // rendering a ThemeToggle, so the toggle did nothing here. Reading the
  // theme makes the control honest.
  const pageBg = isDark ? "var(--sw-bg)" : "#f7f3ec";
  // Frosted glass over the photo (AdminLogin.css blurs what is behind).
  const cardBg = isDark ? "rgba(13,11,8,0.72)" : "rgba(255,253,248,0.80)";
  const cardBorder = isDark ? "rgba(201,168,76,0.22)" : "rgba(176,141,87,0.30)";
  /* #6a5e4a measured 3.1:1 against this screen's surface -- under the 4.5
     bar for an 11.5px label -- and was the only label colour on the site
     that was not goldInk. One change fixes both. */
  const labelCol = C.goldInk;

  // Only the parts shadcn's Input does not already own. The focus ring and
  // the invalid state come from the component now (focus-visible:ring and
  // aria-invalid), which is why the `focused` state that fed the old
  // `field(active, invalid)` helper is gone.
  /* Only the surface colour is particular to this screen. Height, padding,
     radius and type come from Input, so the login fields match the booking
     and contact forms instead of being 47px with an 8px corner. */
  const fieldBase: React.CSSProperties = {
    background: isDark ? "#0a0907" : "#fbf9f5",
    color: C.textH,
    width: "100%",
  };

  /* The same field label every other form uses: 11.5px, weight 500, 2px of
     tracking, 6px clear of the field. It was 10.5/600/2.4 here, which is
     close enough to look like a mistake rather than a decision. */
  const labelStyle: React.CSSProperties = {
    color: labelCol,
    fontSize: 11.5,
    letterSpacing: 2,
    fontWeight: 500,
    display: "block",
    marginBottom: 8,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: pageBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Gold motes behind the sign-in: they drift, thread together, shy
          away from the cursor and scatter on a click. No photo, no WebGL --
          a plain canvas, so it works everywhere. GoldParticles.tsx. */}
      <div className="sw-login__fluid" aria-hidden="true">
        <GoldParticles dark={isDark} />
      </div>
      <div className={`sw-login__veil${isDark ? "" : " is-light"}`} aria-hidden="true" />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(to right,transparent,${gold}55,transparent)` }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 380, zIndex: 1 }}>
        {/* Logo */}
        <div className="sw-login__logo" style={{ textAlign: "center", marginBottom: 32 }}>
          <Button
            variant="ghost"
            onClick={onGoHome}
            aria-label="Back to the Stonewood Garden home page"
            className="h-auto gap-3 p-0 hover:bg-transparent hover:opacity-70"
            style={{ display: "inline-flex", alignItems: "center", marginBottom: 12, transition: "opacity .2s" }}
          >
            <div style={{ width: 24, height: 1, background: `${gold}66` }} />
            <span style={{ color: C.goldInk, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 24, letterSpacing: 5, fontWeight: 600 }}>STONEWOOD</span>
            <div style={{ width: 24, height: 1, background: `${gold}66` }} />
          </Button>
          <p style={{ color: labelCol, fontSize: 11, letterSpacing: 5, margin: 0 }}>ADMIN PORTAL</p>
        </div>

        {/* Card */}
        <div
          className="sw-login__card"
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: 16,
            padding: "36px 32px",
            // The old value ended "0 0 0 px", which is malformed — and one bad
            // layer invalidates the whole declaration, so the card was
            // rendering with no shadow at all.
            boxShadow: isDark
              ? "0 24px 60px rgba(0,0,0,0.55)"
              : "0 1px 2px rgba(60,50,30,0.06), 0 24px 60px -30px rgba(60,50,30,0.30)",
          }}
        >
          {/* A lock mark reads as "restricted area" faster than a heading does. */}
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 11,
              background: `${gold}14`,
              border: `1px solid ${gold}2e`,
              color: C.goldInk,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <Icon name="lock" size={19} />
          </div>

          <h2 style={{ color: C.textH, fontSize: 22, fontFamily: "'Satoshi',system-ui,sans-serif", fontWeight: 400, margin: "0 0 4px", letterSpacing: 0.4 }}>Sign In</h2>
          <p style={{ color: C.textS, fontSize: 14, margin: "0 0 28px", lineHeight: 1.6 }}>Enter your credentials to continue.</p>

          <div style={{ marginBottom: 20 }}>
            <Label htmlFor="admin-username" style={labelStyle}>USERNAME</Label>
            <Input
              id="admin-username"
              type="text"
              value={user}
              onChange={(e) => { setUser(e.target.value.trim().slice(0, 64)); setErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") void handle(); }}
              maxLength={64}
              autoComplete="username"
              placeholder="admin"
              aria-invalid={!!err}
              style={fieldBase}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <Label htmlFor="admin-password" style={labelStyle}>PASSWORD</Label>
            <div style={{ position: "relative" }}>
              <Input
                id="admin-password"
                type={show ? "text" : "password"}
                value={pass}
                onChange={(e) => { setPass(e.target.value.slice(0, 128)); setErr(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") void handle(); }}
                maxLength={128}
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={!!err}
                style={{ ...fieldBase, paddingRight: 44 }}
              />
              {/* Was a bare ● / ○ glyph, which reads as a bullet rather than a
                  control. A real eye icon, and it now says what it does. */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                title={show ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-1.5 size-8 -translate-y-1/2 hover:text-accent-ink"
                style={{ color: labelCol }}
              >
                <Icon name={show ? "eye-off" : "eye"} size={16} />
              </Button>
            </div>
          </div>

          {/* A code to the account's confirmed email, then a new password. */}
          <div style={{ display: "flex", justifyContent: "flex-end", margin: "-18px 0 22px" }}>
            <button type="button" className="sw-ulink" onClick={() => setForgot(true)}
              style={{ background: "none", border: "none", padding: 0, color: labelCol, fontSize: 12.5, cursor: "pointer" }}>
              Forgot password?
            </button>
          </div>

          {/* Tries left: one gold bead per try, spent ones go dim red. After
              the last, a pause that counts down instead of an error. */}
          {tries && (
            <div role="status" aria-live="polite" className={`sw-tries${paused ? " is-paused" : ""}`}
              style={{ borderColor: paused ? "rgba(229,85,85,0.35)" : "rgba(201,168,76,0.35)", background: paused ? "rgba(229,85,85,0.07)" : "rgba(201,168,76,0.07)" }}>
              <span aria-hidden="true" className="sw-tries__ico" style={{ color: paused ? "#e07070" : gold, background: paused ? "rgba(229,85,85,0.14)" : "rgba(201,168,76,0.16)" }}>
                <Icon name={paused ? "lock" : "shield-alert"} size={16} strokeWidth={2} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", color: paused ? "#e07070" : C.textH, fontSize: 13, fontWeight: 600 }}>
                  {paused ? <>Sign-in paused &middot; {clock}</> : <>{tries.left} of {tries.of} tries left</>}
                </span>
                <span style={{ display: "block", color: C.textS, fontSize: 12, marginTop: 2 }}>
                  {paused ? "Take a breath. You can try again when the timer ends." : `After ${tries.of} wrong tries, sign-in pauses for ${tries.pause >= 60 ? `${Math.round(tries.pause / 60)} minute${tries.pause >= 120 ? "s" : ""}` : `${tries.pause} seconds`}.`}
                </span>
                {!paused && (
                  <span aria-hidden="true" className="sw-tries__beads">
                    {Array.from({ length: tries.of }, (_, i) => (
                      <i key={i} style={{ background: i < tries.left ? gold : "rgba(229,85,85,0.45)" }} />
                    ))}
                  </span>
                )}
                {paused && (
                  <span aria-hidden="true" className="sw-tries__bar"><i style={{ width: `${(pausedLeft / tries.pause) * 100}%` }} /></span>
                )}
              </span>
            </div>
          )}

          {err && !paused && (
            <Alert
              variant="destructive"
              style={{ background: "rgba(229,85,85,0.07)", border: "1px solid rgba(229,85,85,0.22)", borderRadius: 8, marginBottom: 20, color: "#e07070", fontSize: 13 }}
            >
              <Icon name="alert" size={14} />
              <AlertDescription style={{ color: "#e07070", fontSize: 13 }}>{err}</AlertDescription>
            </Alert>
          )}

          <Button className="sw-btn"
            onClick={() => void handle()}
            disabled={loading || paused || !user || !pass}
            style={{
              ...goldBtn,
              width: "100%",
              height: "auto",
              padding: 16,
              opacity: paused || !user || !pass ? 0.35 : 1,
              fontSize: 12,
              letterSpacing: 2.6,
              borderRadius: 8,
              cursor: loading || paused || !user || !pass ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {loading && (
              <span
                aria-hidden="true"
                style={{ width: 13, height: 13, border: "2px solid rgba(0,0,0,0.25)", borderTopColor: "rgba(0,0,0,0.7)", borderRadius: "50%", display: "inline-block", animation: "sw-spin .7s linear infinite" }}
              />
            )}
            {paused ? `TRY AGAIN IN ${clock}` : loading ? "SIGNING IN…" : "SIGN IN"}
          </Button>
        </div>

      </div>

      <ForgotPassword open={forgot} onOpenChange={setForgot} initialLogin={user} C={C}
        onSignedIn={(name) => { onLogin(); toast(`Welcome back${name ? `, ${name}` : ""}!`, "success"); }} />
      <ThemeToggle />
    </div>
  );
}
