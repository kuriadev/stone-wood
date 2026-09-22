"use client";

import { useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Icon } from "@/components/admin/Icon";
import { gold, goldBtn } from "@/lib/styles";

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
  const [focused, setFocused] = useState<"user" | "pass" | null>(null);
  const { toast } = useToast();
  const { isDark } = useTheme();
  const C = T(isDark);

  // The comparison used to happen right here, against ADMIN_CREDS. That put
  // the real password in the JavaScript bundle and let anyone who could edit
  // client state walk straight past it. The server now decides, and answers
  // with an httpOnly cookie this code cannot read — which is the point.
  const handle = async () => {
    if (loading) return;
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
        onLogin();
        toast("Welcome back, Admin!", "success");
      } else {
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
  const pageBg = isDark ? "#070604" : "#f7f3ec";
  const cardBg = isDark ? "#0d0b08" : "#ffffff";
  const cardBorder = isDark ? "#1c1811" : "#e6dfd2";
  const labelCol = isDark ? "#6a5e4a" : "#9b8f7a";

  const field = (active: boolean, invalid: boolean): React.CSSProperties => ({
    background: isDark ? "#0a0907" : "#fbf9f5",
    color: C.textH,
    // One border that shifts, rather than a ring stacked on top — keeps the
    // field from growing by a pixel when focused.
    border: `1px solid ${invalid ? "rgba(229,85,85,0.55)" : active ? `${gold}88` : cardBorder}`,
    boxShadow: active && !invalid ? `0 0 0 3px ${gold}1a` : "none",
    padding: "12px 14px",
    fontSize: 14.5,
    borderRadius: 8,
    width: "100%",
    boxSizing: "border-box",
    outline: "none",
    transition: "border-color .18s ease, box-shadow .18s ease",
  });

  const labelStyle: React.CSSProperties = {
    color: labelCol,
    fontSize: 10.5,
    letterSpacing: 2.4,
    fontWeight: 600,
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
      {/* A single soft glow instead of the old stock photo. The photo sat at
          0.06 opacity — effectively invisible, but still a full-size image
          download on the one page that should be fastest and quietest. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: isDark
            ? `radial-gradient(ellipse 80% 55% at 50% -10%, ${gold}14 0%, transparent 70%)`
            : `radial-gradient(ellipse 80% 55% at 50% -10%, ${gold}1f 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(to right,transparent,${gold}55,transparent)` }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 380, zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <button
            onClick={onGoHome}
            aria-label="Back to the StoneWood home page"
            style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 12, cursor: "pointer", background: "none", border: "none", padding: 0, transition: "opacity .2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = ".7")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <div style={{ width: 24, height: 1, background: `${gold}66` }} />
            <span style={{ color: gold, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 24, letterSpacing: 5, fontWeight: 600 }}>STONEWOOD</span>
            <div style={{ width: 24, height: 1, background: `${gold}66` }} />
          </button>
          <p style={{ color: labelCol, fontSize: 10.5, letterSpacing: 5, margin: 0 }}>ADMIN PORTAL</p>
        </div>

        {/* Card */}
        <div
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: 14,
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
              color: gold,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 18,
            }}
          >
            <Icon name="lock" size={19} />
          </div>

          <h2 style={{ color: C.textH, fontSize: 22, fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 400, margin: "0 0 5px", letterSpacing: 0.4 }}>Sign In</h2>
          <p style={{ color: C.textS, fontSize: 14, margin: "0 0 28px", lineHeight: 1.6 }}>Enter your credentials to continue.</p>

          <div style={{ marginBottom: 18 }}>
            <label htmlFor="admin-username" style={labelStyle}>USERNAME</label>
            <input
              id="admin-username"
              type="text"
              value={user}
              onChange={(e) => { setUser(e.target.value.trim().slice(0, 64)); setErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") void handle(); }}
              onFocus={() => setFocused("user")}
              onBlur={() => setFocused(null)}
              maxLength={64}
              autoComplete="username"
              placeholder="admin"
              aria-invalid={!!err}
              style={field(focused === "user", !!err)}
            />
          </div>

          <div style={{ marginBottom: 26 }}>
            <label htmlFor="admin-password" style={labelStyle}>PASSWORD</label>
            <div style={{ position: "relative" }}>
              <input
                id="admin-password"
                type={show ? "text" : "password"}
                value={pass}
                onChange={(e) => { setPass(e.target.value.slice(0, 128)); setErr(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") void handle(); }}
                onFocus={() => setFocused("pass")}
                onBlur={() => setFocused(null)}
                maxLength={128}
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={!!err}
                style={{ ...field(focused === "pass", !!err), paddingRight: 44 }}
              />
              {/* Was a bare ● / ○ glyph, which reads as a bullet rather than a
                  control. A real eye icon, and it now says what it does. */}
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                title={show ? "Hide password" : "Show password"}
                style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: labelCol, cursor: "pointer", padding: 8, lineHeight: 0, borderRadius: 6, transition: "color .2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = gold)}
                onMouseLeave={(e) => (e.currentTarget.style.color = labelCol)}
              >
                <Icon name={show ? "eye-off" : "eye"} size={16} />
              </button>
            </div>
          </div>

          {err && (
            <div
              role="alert"
              style={{ background: "rgba(229,85,85,0.07)", border: "1px solid rgba(229,85,85,0.22)", borderRadius: 8, padding: "10px 13px", marginBottom: 18, color: "#e07070", fontSize: 13, display: "flex", alignItems: "center", gap: 9 }}
            >
              <Icon name="alert" size={14} />{err}
            </div>
          )}

          <button
            onClick={() => void handle()}
            disabled={loading || !user || !pass}
            style={{
              ...goldBtn,
              width: "100%",
              padding: 14,
              opacity: !user || !pass ? 0.35 : 1,
              fontSize: 12,
              letterSpacing: 2.6,
              borderRadius: 8,
              cursor: loading || !user || !pass ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
            }}
          >
            {loading && (
              <span
                aria-hidden="true"
                style={{ width: 13, height: 13, border: "2px solid rgba(0,0,0,0.25)", borderTopColor: "rgba(0,0,0,0.7)", borderRadius: "50%", display: "inline-block", animation: "sw-spin .7s linear infinite" }}
              />
            )}
            {loading ? "SIGNING IN…" : "SIGN IN"}
          </button>
        </div>

      </div>

      <ThemeToggle />
    </div>
  );
}
