"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { customerServiceForm, type CustomerServiceForm } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import {
  isGmailAddress,
  isValidName,
  sanitizeName,
  NAME_MAX,
} from "@/lib/validators";
import type { CustomerMessage } from "@/types/admin";
import { SLOTS } from "@/lib/resort";
import { Icon, type IconName } from "@/components/common/Icon";

interface CustomerServiceProps {
  onSubmitMessage: (msg: CustomerMessage) => void;
}

/** Upper bound for the enquiry body, mirrored by the textarea maxLength. */
const MESSAGE_MAX = 1000;

export function CustomerService({ onSubmitMessage }: CustomerServiceProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  const w = useWidth();
  const mob = w < 768;

  const [submitted, setSubmitted] = useState(false);

  // react-hook-form owns the field state and runs `customerServiceForm`
  // (lib/schemas.ts) as its resolver, so the browser and the API validate
  // against one definition. `mode: "onBlur"` reproduces what the hand-rolled
  // `touched` map did: nothing is flagged until the guest leaves the field.
  const {
    register,
    handleSubmit,
    watch,
    formState: { touchedFields, isSubmitting },
  } = useForm<CustomerServiceForm>({
    resolver: zodResolver(customerServiceForm),
    mode: "onBlur",
    defaultValues: { name: "", email: "", type: "Feedback", message: "" },
  });

  // Watched values keep the per-field hints below working unchanged — they
  // read `form.x` exactly as before, so only the plumbing moved.
  const form = watch();
  const touched = {
    name: Boolean(touchedFields.name),
    email: Boolean(touchedFields.email),
    message: Boolean(touchedFields.message),
  };

  // ── Validators ──────────────────────────────────────────────────────────────
  // Still derived here rather than read from formState.errors: the hints
  // distinguish "valid" from "invalid" from "empty", which a single error
  // string cannot express.
  const nameOk    = isValidName(form.name ?? "");
  // Was endsWith("@gmail.com") && length > 10, which accepted "!!!!@gmail.com".
  const emailOk   = isGmailAddress(form.email ?? "");
  const messageOk = (form.message ?? "").trim().length >= 10 && (form.message ?? "").length <= MESSAGE_MAX;
  const formOk    = nameOk && emailOk && messageOk;

  // Live sanitisation as the guest types: the field silently refuses digits
  // and symbols instead of accepting them and complaining afterwards.
  const nameField = register("name");
  const messageField = register("message");

const submit = handleSubmit(async (values) => {
  const msg: CustomerMessage = {
    id: Date.now(),
    name: values.name,
    email: values.email,
    type: values.type,
    message: values.message,
    date: new Date().toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    createdAt: new Date().toISOString(),
  };
  

  try {
    const res = await fetch("/api/customer-service", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(msg),
    });

    if (!res.ok) throw new Error();

    onSubmitMessage(msg);

    setSubmitted(true);

    toast("Message sent! We'll get back to you soon.", "success");

  } catch {
    toast("Failed to send message.", "error");
  }
});

  // ── Shared field border helper ───────────────────────────────────────────────
  const fieldBorder = (ok: boolean, isTouched: boolean) => {
    if (!isTouched) return C.inp.border;
    return ok ? "1px solid rgba(76,175,80,0.6)" : "1px solid rgba(229,85,85,0.6)";
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "48px 20px" : "80px 24px" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <p style={{ color: gold, letterSpacing: 4, fontSize: 12.5, marginBottom: 10, textAlign: "center" }}>SUPPORT</p>
        <h2 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 28 : 42, color: C.textH, textAlign: "center", marginBottom: 12 }}>
          Customer Service
        </h2>
        <p style={{ color: C.textS, textAlign: "center", marginBottom: 36, lineHeight: 1.7, fontSize: 14.5 }}>
          We'd love to hear from you. Share your feedback, ask a question, or report a concern.
        </p>

        {/* Contact cards */}
        <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3,1fr)", gap: 12, marginBottom: 36 }}>
          {[
            ["phone", "Call Us", "+63 912 345 6789"],
            ["mail", "Email Us", "stonewoodresort.ph@gmail.com"],
            ["clock", "Hours", `Day ${SLOTS.Day.hours} · Night ${SLOTS.Night.hours}`],
          ].map(([icon, label, val]) => (
            <div
              key={label}
              style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 14px", textAlign: "center", boxShadow: C.shadowCard, transition: "transform .2s ease,box-shadow .2s ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = isDark ? "0 12px 32px rgba(0,0,0,0.45)" : "0 12px 32px rgba(100,70,10,0.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = C.shadowCard; }}
            >
              <div style={{ marginBottom: 8, color: gold, lineHeight: 0 }}><Icon name={icon as IconName} size={22} strokeWidth={1.5} /></div>
              <div style={{ color: C.textXS, fontSize: 10.5, letterSpacing: 2, marginBottom: 5 }}>{label.toUpperCase()}</div>
              <div style={{ color: C.textB, fontSize: 13.5, fontWeight: 500 }}>{val}</div>
            </div>
          ))}
        </div>

        {submitted ? (
          <div style={{ background: C.bgCard, border: `1px solid ${gold}44`, borderRadius: 12, padding: "52px 24px", textAlign: "center", boxShadow: C.shadow }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg,${gold}22,${gold}11)`, border: `1px solid ${gold}44`, display: "flex", alignItems: "center", justifyContent: "center", color: gold, margin: "0 auto 20px" }}><Icon name="message" size={30} strokeWidth={1.5} /></div>
            <h3 style={{ color: gold, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 26, marginBottom: 10, fontWeight: 400 }}>Message Received!</h3>
            <p style={{ color: C.textS, fontSize: 15, lineHeight: 1.8 }}>We'll respond within 24 hours.</p>
          </div>
        ) : (
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? "24px 18px" : "40px", boxShadow: C.shadow }}>
            {/* Landscape from md: name, email and type share one row and the
                message spans the full width beneath them. The form was four
                stacked fields in a 680px column, which made a four-field
                contact form as tall as the page. */}
            <div className="grid gap-5 md:grid-cols-3">

              {/* ── FULL NAME ── */}
              <div>
                <Label htmlFor="cs-name" className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">FULL NAME</Label>
                <Input
                  id="cs-name"
                  type="text"
                  {...nameField}
                  onChange={(e) => {
                    // Filter as they type, then hand the cleaned value to RHF.
                    e.target.value = sanitizeName(e.target.value);
                    void nameField.onChange(e);
                  }}
                  maxLength={NAME_MAX}
                  autoComplete="name"
                  placeholder="Your full name"
                  aria-invalid={touched.name && !nameOk}
                />
                {touched.name && !nameOk && (
                  <p style={{ color: "#e55", fontSize: 12.5, marginTop: 4 }}>⚠ Please enter your full name (letters only, at least 2)</p>
                )}
                {touched.name && nameOk && (
                  <p style={{ color: "#4caf50", fontSize: 12.5, marginTop: 4 }}>✓ Looks good</p>
                )}
              </div>

              {/* ── EMAIL ADDRESS ── */}
              <div>
                <Label htmlFor="cs-email" className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">
                  EMAIL ADDRESS <span style={{ color: "#e55", fontSize: 10.5 }}>*Gmail only</span>
                </Label>
                <Input
                  id="cs-email"
                  type="email"
                  {...register("email")}
                  maxLength={254}
                  autoComplete="email"
                  placeholder="yourname@gmail.com"
                  aria-invalid={touched.email && !emailOk}
                />
                {touched.email && form.email.length > 0 && !emailOk && (
                  <p style={{ color: "#e55", fontSize: 12.5, marginTop: 4 }}>⚠ Must be a Gmail address (@gmail.com)</p>
                )}
                {touched.email && form.email.length === 0 && (
                  <p style={{ color: "#e55", fontSize: 12.5, marginTop: 4 }}>⚠ Email address is required</p>
                )}
                {touched.email && emailOk && (
                  <p style={{ color: "#4caf50", fontSize: 12.5, marginTop: 4 }}>✓ Valid Gmail address</p>
                )}
              </div>

              {/* ── TYPE ──
                  NativeSelect's wrapper is w-fit, so without this the control
                  would shrink to its longest option and break the grid row. */}
              <div className="[&_[data-slot=native-select-wrapper]]:w-full">
                <Label htmlFor="customer-service-type" className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">TYPE</Label>
                <NativeSelect
                  id="customer-service-type"
                  title="Message type"
                  {...register("type")}
                >
                  {["Feedback", "Complaint", "Question", "Booking Issue", "Other"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </NativeSelect>
              </div>

              {/* ── MESSAGE ── */}
              <div className="md:col-span-3">
                <Label htmlFor="cs-message" className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">
                  MESSAGE <span style={{ color: C.textXS, fontSize: 10.5, fontWeight: 400, letterSpacing: 0 }}>(min. 10 characters)</span>
                </Label>
                <Textarea
                  id="cs-message"
                  {...messageField}
                  maxLength={MESSAGE_MAX}
                  onChange={(e) => {
                    e.target.value = e.target.value.slice(0, MESSAGE_MAX);
                    void messageField.onChange(e);
                  }}
                  rows={5}
                  className="resize-y"
                  aria-invalid={touched.message && !messageOk}
                  placeholder="Tell us how we can help..."
                />
                {/* Character counter */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <span>
                    {touched.message && !messageOk && (
                      <span style={{ color: "#e55", fontSize: 12.5 }}>⚠ Please write at least 10 characters</span>
                    )}
                    {touched.message && messageOk && (
                      <span style={{ color: "#4caf50", fontSize: 12.5 }}>✓ Good to go</span>
                    )}
                  </span>
                  <span style={{ color: form.message.length >= MESSAGE_MAX ? "#e55" : form.message.trim().length >= 10 ? "#4caf50" : C.textXS, fontSize: 11.5, fontFamily: "monospace" }}>
                    {form.message.length}/{MESSAGE_MAX}
                  </span>
                </div>
              </div>

              {/* ── SUBMIT ── */}
              <div className="md:col-span-3">
                <Button
                  onClick={submit}
                  disabled={!formOk || isSubmitting}
                  style={{ ...goldBtn, width: "100%", padding: 13, height: "auto" }}
                >
                  SEND MESSAGE
                </Button>

                {/* Show summary of errors only after first submit attempt */}
                {!formOk && Object.values(touched).some(Boolean) && (
                  <p style={{ color: C.textXS, fontSize: 12.5, textAlign: "center", marginTop: 10 }}>
                    Please fill in all fields correctly before sending.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
