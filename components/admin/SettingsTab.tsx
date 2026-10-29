"use client";

/* Rates & Settings — the owner's numbers.
 *
 * Prices, capacity, booking limits, opening hours and the
 * contact details guests are shown. Changing any of these used to need a
 * developer; now the owner saves them here and every price, availability
 * check, page and email follows (lib/settings.ts). Bookings already made
 * keep the total they were sold at.
 *
 * Package prices aren't here: each package has its own price in
 * Packages & Prices.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/contexts/ToastContext";
import { AdminPageHeader, ActionButton, ErrorNote, Label, useAdminStyle, FullSelect } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import { DEFAULT_SETTINGS, applySettings, hourOption, validateSettings, type BusinessSettings } from "@/lib/settings";
import { fmt } from "@/lib/utils";
import { manilaTime, manilaDate } from "@/lib/finance";
import { fmtDate } from "@/lib/utils";

type Group = keyof BusinessSettings;

export function SettingsTab({ mob }: { mob: boolean }) {
  const { C, cBr, cBg, inp } = useAdminStyle();
  const { toast } = useToast();
  const router = useRouter();
  const [form, setForm] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null; enabled: boolean }>({ updatedAt: null, updatedBy: null, enabled: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings", { cache: "no-store" }).catch(() => null);
      const json = await res?.json().catch(() => null);
      if (json?.success && json.settings) {
        setForm(json.settings);
        setSaved(json.settings);
        setMeta({ updatedAt: json.updatedAt ?? null, updatedBy: json.updatedBy ?? null, enabled: json.enabled !== false });
      }
    })();
  }, []);

  const set = <G extends Group>(g: G, k: keyof BusinessSettings[G], v: string | number) =>
    setForm((f) => ({ ...f, [g]: { ...f[g], [k]: v } }));
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const check = validateSettings(form);

  const save = async () => {
    setError("");
    if (!check.ok) return setError(check.error);
    setBusy(true);
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return setError(json?.error ?? "Could not save the settings.");
      applySettings(json.settings);
      setForm(json.settings);
      setSaved(json.settings);
      setMeta((m) => ({ ...m, updatedAt: new Date().toISOString() }));
      toast("Settings saved. New quotes use them from now on.", "success");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const num = <G extends Exclude<Group, "contact" | "hours">>(g: G, k: keyof BusinessSettings[G] & string, label: string, hint: string, unit: "₱" | "%" | "") => (
    <div>
      <Label htmlFor={`st-${g}-${k}`}>{label}</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {unit === "₱" && <span style={{ color: C.textS }}>₱</span>}
        <Input id={`st-${g}-${k}`} type="number" inputMode="decimal" min={0} value={String(form[g][k])}
          onChange={(e) => set(g, k, e.target.value === "" ? "" : Number(e.target.value))} style={{ ...inp, width: "100%" }} />
        {unit === "%" && <span style={{ color: C.textS }}>%</span>}
      </div>
      <p style={{ color: C.textS, fontSize: 12, margin: "6px 0 0" }}>{hint}</p>
    </div>
  );

  const hour = (k: keyof BusinessSettings["hours"], label: string, from: number, to: number) => (
    <div>
      <Label htmlFor={`st-h-${k}`}>{label}</Label>
      <FullSelect id={`st-h-${k}`} value={String(form.hours[k])} onChange={(e) => set("hours", k, Number(e.target.value))} style={{ ...inp, padding: "8px 36px 8px 12px" }}>
        {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => <option key={h} value={h}>{hourOption(h)}</option>)}
      </FullSelect>
    </div>
  );

  const section = (title: string, intro: string, body: React.ReactNode) => (
    <section style={{ border: `1px solid ${cBr}`, borderRadius: 12, background: cBg, padding: mob ? "16px" : "20px 24px", marginBottom: 20 }}>
      <h2 style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h2>
      <p style={{ color: C.textS, fontSize: 13, margin: "6px 0 16px" }}>{intro}</p>
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 16 }}>{body}</div>
    </section>
  );

  const r = form.rates;
  return (
    <div style={{ maxWidth: 900 }}>
      <AdminPageHeader title="Rates & Settings" mob={mob}
        subtitle="Your prices, limits, hours and contact details. Saving updates the website, the booking flow, the dashboard and the emails."
        action={<ActionButton kind="primary" icon="check" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</ActionButton>} />

      {!meta.enabled && (
        <p role="status" style={{ border: `1px solid ${cBr}`, borderLeft: "3px solid #e0a020", borderRadius: 10, padding: "12px 16px", color: C.textB, fontSize: 13.5 }}>
          These are the built-in defaults. Saving your own needs the database update <code>20261012140000_business_settings.sql</code>.
        </p>
      )}
      {meta.updatedAt && (
        <p style={{ color: C.textS, fontSize: 12.5, margin: "0 0 16px" }}>
          Last changed {fmtDate(manilaDate(meta.updatedAt))}, {manilaTime(meta.updatedAt)}{meta.updatedBy ? ` by ${meta.updatedBy}` : ""}.
        </p>
      )}

      {/* No discounts section: a booking built by hand pays these rates, and
          a deal is a package's own price (owner's call, 2026-10-27). */}
      {section("Prices", "What a booking built by hand costs. For a deal, set a package's own price in Packages & Prices.", <>
        {num("rates", "sharedPerHead", "Shared pool, per guest", `Per tour. ${r.sharedPerHead || 0 ? `A group of 10 pays ${fmt(10 * Number(r.sharedPerHead || 0))} for one tour.` : ""}`, "₱")}
        {num("rates", "exclusiveFlat", "Exclusive pool, per tour", "The whole pool to one group, whatever their number.", "₱")}
        {num("rates", "venue", "Events venue, per tour", "Always exclusive: one event per tour, whoever has the pool.", "₱")}
        {num("rates", "overtimePerHour", "Day Tour overtime, per hour", "Added by staff on the day, only when the Night Tour is free.", "₱")}
      </>)}

      {section("Limits", "How many people, how long and how far ahead.", <>
        {num("limits", "resortCapacity", "Most guests at once", "Caps a booking, and all Shared groups in a slot together.", "")}
        {num("limits", "exclusiveDefaultGuests", "Exclusive booking starts at", "The guest count a buyout starts at; guests can raise it.", "")}
        {num("limits", "overtimeMaxHours", "Most overtime, hours", "0 turns overtime off.", "")}
        {num("limits", "maxStayDays", "Longest stay, days", "For Staycations over several dates.", "")}
        {num("limits", "bookingWindowMonths", "Guests can book up to, months ahead", "Dates further out are greyed out on the calendar. Never past 31 December: bookings are for the current year only.", "")}
      </>)}

      {section("Hours", "The two tours. A Staycation runs from the Day Tour's start to the Night Tour's end.", <>
        {hour("dayStart", "Day Tour starts", 4, 12)}
        {hour("dayEnd", "Day Tour ends", 9, 21)}
        {hour("nightStart", "Night Tour starts", 14, 23)}
        {hour("nightEnd", "Night Tour ends", 20, 35)}
        <p style={{ gridColumn: "1 / -1", color: C.textS, fontSize: 12.5, margin: 0 }}>
          <Icon name="info" size={12} /> Each tour is at least 4 hours, with at least an hour between groups for cleaning — evening and morning.
          Package descriptions you wrote yourself keep their own wording; update them in Packages &amp; Prices if they mention times.
        </p>
      </>)}

      {section("Contact details", "Shown on the website, the guest's booking page, and in every email.", <>
        {(["phone", "viber", "email", "messenger"] as const).map((k) => (
          <div key={k}>
            <Label htmlFor={`st-c-${k}`}>{{ phone: "Phone (calls and texts)", viber: "Viber", email: "Email", messenger: "Messenger link" }[k]}</Label>
            <Input id={`st-c-${k}`} value={form.contact[k]} onChange={(e) => set("contact", k, e.target.value)} maxLength={120} style={{ ...inp, width: "100%" }} />
          </div>
        ))}
      </>)}

      {!check.ok && dirty && <ErrorNote>{check.error}</ErrorNote>}
      <ErrorNote>{error}</ErrorNote>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
        {dirty && <ActionButton onClick={() => { setForm(saved); setError(""); }}>Undo changes</ActionButton>}
        <ActionButton kind="primary" icon="check" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</ActionButton>
      </div>
    </div>
  );
}
