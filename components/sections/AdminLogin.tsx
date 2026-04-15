"use client";

import { useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { gold, goldBtn } from "@/lib/styles";
import { ADMIN_CREDS } from "@/lib/constants";

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
  const { toast } = useToast();

  const handle = () => {
    setErr("");
    setLoading(true);
    setTimeout(() => {
      if (user === ADMIN_CREDS.username && pass === ADMIN_CREDS.password) {
        onLogin();
        toast("Welcome back, Admin!", "success");
      } else {
        setErr("Invalid username or password.");
        toast("Login failed.", "error");
      }
      setLoading(false);
    }, 800);
  };

  const inp: React.CSSProperties = {
    background: "#0d0d0d",
    color: "#f0f0f0",
    border: "1px solid #252525",
    padding: "11px 14px",
    fontSize: 13,
    borderRadius: 4,
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080604",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background */}
      <div style={{ position: "absolute", inset: 0, background: "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1400&q=80') center/cover", opacity: 0.06 }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%,rgba(201,168,76,0.06) 0%,transparent 65%)" }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(to right,transparent,${gold}55,transparent)` }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 380, zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div
            onClick={onGoHome}
            style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 14, cursor: "pointer", transition: "opacity .2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = ".7")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <div style={{ width: 24, height: 1, background: `${gold}66` }} />
            <span style={{ color: gold, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 24, letterSpacing: 5, fontWeight: 600 }}>STONEWOOD</span>
            <div style={{ width: 24, height: 1, background: `${gold}66` }} />
          </div>
          <p style={{ color: "#4a4035", fontSize: 9, letterSpacing: 5, margin: 0 }}>ADMIN PORTAL</p>
        </div>

        {/* Card */}
        <div
          style={{
            background: "linear-gradient(160deg,#0e0c09,#0a0806)",
            border: "1px solid #201c14",
            borderRadius: 12,
            padding: "40px 36px",
            boxShadow: "0 40px 100px rgba(0,0,0,0.8),0 0 0 px rgba(201,168,76,0.06)",
          }}
        >
          <h2 style={{ color: "#ede8de", fontSize: 22, fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 400, marginBottom: 4, letterSpacing: 1 }}>Sign In</h2>
          <p style={{ color: "#5a5040", fontSize: 13, marginBottom: 36 }}>Enter your credentials to continue.</p>

          <div style={{ marginBottom: 20 }}>
            <label style={{ color: "#6a5e4a", fontSize: 9, letterSpacing: 3, display: "block", marginBottom: 8 }}>USERNAME</label>
            <input
              type="text"
              value={user}
              onChange={(e) => { setUser(e.target.value); setErr(""); }}
              onKeyDown={(e) => e.key === "Enter" && handle()}
              placeholder="admin"
              className="sw-input"
              style={{ ...inp, borderColor: err ? "rgba(229,85,85,0.5)" : "#201c14" }}
            />
          </div>

          <div style={{ marginBottom: 32 }}>
            <label style={{ color: "#6a5e4a", fontSize: 9, letterSpacing: 3, display: "block", marginBottom: 8 }}>PASSWORD</label>
            <div style={{ position: "relative" }}>
              <input
                type={show ? "text" : "password"}
                value={pass}
                onChange={(e) => { setPass(e.target.value); setErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && handle()}
                placeholder="••••••••"
                className="sw-input"
                style={{ ...inp, paddingRight: 44, borderColor: err ? "rgba(229,85,85,0.5)" : "#201c14" }}
              />
              <button
                onClick={() => setShow((s) => !s)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#4a4035", cursor: "pointer", fontSize: 13, padding: 0, transition: "color .2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = gold)}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#4a4035")}
              >
                {show ? "●" : "○"}
              </button>
            </div>
          </div>

          {err && (
            <div style={{ background: "rgba(229,85,85,0.06)", border: "1px solid rgba(229,85,85,0.18)", borderRadius: 6, padding: "11px 14px", marginBottom: 20, color: "#e07070", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span>⚠</span>{err}
            </div>
          )}

          <button
            onClick={handle}
            disabled={loading || !user || !pass}
            style={{ ...goldBtn, width: "100%", padding: 15, opacity: !user || !pass ? 0.35 : 1, fontSize: 11, letterSpacing: 3, borderRadius: 6 }}
          >
            {loading ? "SIGNING IN…" : "SIGN IN"}
          </button>

          <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid #181410", textAlign: "center" }}>
            <span style={{ color: "#3a3025", fontSize: 11, letterSpacing: 1 }}>Demo — admin · stonewood2026</span>
          </div>
        </div>
      </div>

      <ThemeToggle />
    </div>
  );
}
