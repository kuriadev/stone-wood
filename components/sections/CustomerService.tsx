"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import type { CustomerMessage } from "@/types/admin";

interface CustomerServiceProps {
  onSubmitMessage: (msg: CustomerMessage) => void;
}

export function CustomerService({ onSubmitMessage }: CustomerServiceProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  const w = useWidth();
  const mob = w < 768;

  const [form, setForm] = useState({ name: "", email: "", type: "Feedback", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({ name: false, email: false, message: false });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  // ── Validators ──────────────────────────────────────────────────────────────
  const nameOk    = form.name.trim().length >= 2;
  const emailOk   = form.email.toLowerCase().endsWith("@gmail.com") && form.email.length > 10;
  const messageOk = form.message.trim().length >= 10;
  const formOk    = nameOk && emailOk && messageOk;

  const submit = () => {
    setTouched({ name: true, email: true, message: true });
    if (!formOk) return;
    const msg: CustomerMessage = {
      id: Date.now(),
      name: form.name,
      email: form.email,
      type: form.type,
      message: form.message,
      date: new Date().toLocaleDateString("en-PH", {
        year: "numeric", month: "short", day: "numeric",
      }),
    };
    onSubmitMessage(msg);
    setSubmitted(true);
    toast("Message sent! We'll get back to you soon.", "success");
  };

  // ── Shared field border helper ───────────────────────────────────────────────
  const fieldBorder = (ok: boolean, isTouched: boolean) => {
    if (!isTouched) return C.inp.border;
    return ok ? "1px solid rgba(76,175,80,0.6)" : "1px solid rgba(229,85,85,0.6)";
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "48px 20px" : "80px 24px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <p style={{ color: gold, letterSpacing: 4, fontSize: 11, marginBottom: 10, textAlign: "center" }}>SUPPORT</p>
        <h2 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 28 : 42, color: C.textH, textAlign: "center", marginBottom: 12 }}>
          Customer Service
        </h2>
        <p style={{ color: C.textS, textAlign: "center", marginBottom: 36, lineHeight: 1.7, fontSize: 13 }}>
          We'd love to hear from you. Share your feedback, ask a question, or report a concern.
        </p>

        {/* Contact cards */}
        <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3,1fr)", gap: 12, marginBottom: 36 }}>
          {[
            ["📞", "Call Us", "+63 912 345 6789"],
            ["✉️", "Email Us", "hello@stonewoodresort.ph"],
            ["🕗", "Hours", "8:00 AM – 5:00 PM"],
          ].map(([icon, label, val]) => (
            <div
              key={label}
              style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 14px", textAlign: "center", boxShadow: C.shadowCard, transition: "transform .2s ease,box-shadow .2s ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = isDark ? "0 12px 32px rgba(0,0,0,0.45)" : "0 12px 32px rgba(100,70,10,0.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = C.shadowCard; }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
              <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 5 }}>{label.toUpperCase()}</div>
              <div style={{ color: C.textB, fontSize: 12, fontWeight: 500 }}>{val}</div>
            </div>
          ))}
        </div>

        {submitted ? (
          <div style={{ background: C.bgCard, border: `1px solid ${gold}44`, borderRadius: 12, padding: "52px 24px", textAlign: "center", boxShadow: C.shadow }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg,${gold}22,${gold}11)`, border: `1px solid ${gold}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 20px" }}>💬</div>
            <h3 style={{ color: gold, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 26, marginBottom: 10, fontWeight: 400 }}>Message Received!</h3>
            <p style={{ color: C.textS, fontSize: 14, lineHeight: 1.8 }}>We'll respond within 24 hours.</p>
          </div>
        ) : (
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? "24px 18px" : "40px", boxShadow: C.shadow }}>

            {/* ── FULL NAME ── */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>FULL NAME</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => touch("name")}
                placeholder="Your full name"
                className="sw-input"
                style={{ ...C.inp, border: fieldBorder(nameOk, touched.name) }}
              />
              {touched.name && !nameOk && (
                <p style={{ color: "#e55", fontSize: 11, marginTop: 4 }}>⚠ Please enter your full name (at least 2 characters)</p>
              )}
              {touched.name && nameOk && (
                <p style={{ color: "#4caf50", fontSize: 11, marginTop: 4 }}>✓ Looks good</p>
              )}
            </div>

            {/* ── EMAIL ADDRESS ── */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>
                EMAIL ADDRESS <span style={{ color: "#e55", fontSize: 9 }}>*Gmail only</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                onBlur={() => touch("email")}
                placeholder="yourname@gmail.com"
                className="sw-input"
                style={{ ...C.inp, border: fieldBorder(emailOk, touched.email) }}
              />
              {touched.email && form.email.length > 0 && !form.email.toLowerCase().endsWith("@gmail.com") && (
                <p style={{ color: "#e55", fontSize: 11, marginTop: 4 }}>⚠ Must be a Gmail address (@gmail.com)</p>
              )}
              {touched.email && form.email.length === 0 && (
                <p style={{ color: "#e55", fontSize: 11, marginTop: 4 }}>⚠ Email address is required</p>
              )}
              {touched.email && emailOk && (
                <p style={{ color: "#4caf50", fontSize: 11, marginTop: 4 }}>✓ Valid Gmail address</p>
              )}
            </div>

            {/* ── TYPE ── */}
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="customer-service-type" style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>TYPE</label>
              <select
                id="customer-service-type"
                title="Message type"
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
                className="sw-input"
                style={C.inp}
              >
                {["Feedback", "Complaint", "Question", "Booking Issue", "Other"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* ── MESSAGE ── */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>
                MESSAGE <span style={{ color: C.textXS, fontSize: 9, fontWeight: 400, letterSpacing: 0 }}>(min. 10 characters)</span>
              </label>
              <textarea
                value={form.message}
                onChange={(e) => set("message", e.target.value)}
                onBlur={() => touch("message")}
                rows={5}
                className="sw-input"
                style={{ ...C.inp, resize: "vertical", border: fieldBorder(messageOk, touched.message) }}
                placeholder="Tell us how we can help..."
              />
              {/* Character counter */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span>
                  {touched.message && !messageOk && (
                    <span style={{ color: "#e55", fontSize: 11 }}>⚠ Please write at least 10 characters</span>
                  )}
                  {touched.message && messageOk && (
                    <span style={{ color: "#4caf50", fontSize: 11 }}>✓ Good to go</span>
                  )}
                </span>
                <span style={{ color: form.message.trim().length >= 10 ? "#4caf50" : C.textXS, fontSize: 10, fontFamily: "monospace" }}>
                  {form.message.trim().length} chars
                </span>
              </div>
            </div>

            {/* ── SUBMIT ── */}
            <button
              onClick={submit}
              style={{
                ...goldBtn,
                width: "100%",
                padding: 13,
                opacity: formOk ? 1 : 0.4,
                cursor: formOk ? "pointer" : "not-allowed",
              }}
            >
              SEND MESSAGE
            </button>

            {/* Show summary of errors only after first submit attempt */}
            {!formOk && Object.values(touched).some(Boolean) && (
              <p style={{ color: C.textXS, fontSize: 11, textAlign: "center", marginTop: 10 }}>
                Please fill in all fields correctly before sending.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
