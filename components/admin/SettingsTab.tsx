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

import { announceSettings } from "@/lib/settingsLive";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/contexts/ToastContext";
import { AdminPageHeader, ActionButton, ErrorNote, Label, useAdminStyle, FullSelect } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import { DEFAULT_SETTINGS, hourOption, validateSettings, settingsFieldErrors, numRule, type BusinessSettings } from "@/lib/settings";
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
  // The same rules the server saves with, per field (lib/settings.ts).
  const check = validateSettings(form, { strict: true });
  const errs = settingsFieldErrors(form);
  const errCount = Object.keys(errs).length;
  /** Under a field: its problem in red, or its hint. */
  const note = (path: string, hint: string) => errs[path]
    ? <p role="alert" style={{ color: C.dangerInk, fontSize: 12, margin: "6px 0 0", fontWeight: 600 }}>{errs[path]}</p>
    : <p style={{ color: C.textS, fontSize: 12, margin: "6px 0 0" }}>{hint}</p>;
  const bad = (path: string) => (errs[path] ? { borderColor: "#e5484d", boxShadow: "0 0 0 1px #e5484d55" } : {});

  const save = async () => {
    setError("");
    if (!check.ok) return setError(check.error);
    setBusy(true);
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return setError(json?.error ?? "Could not save the settings.");
      // Here and in every other open tab at once (lib/settingsLive.ts).
      announceSettings(json.settings);
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

  const num = <G extends Exclude<Group, "contact" | "hours">>(g: G, k: keyof BusinessSettings[G] & string, label: string, hint: string, unit: "₱" | "%" | "") => {
    const r = numRule(g, k as never);
    const path = `${g}.${k}`;
    return (
      <div>
        <Label htmlFor={`st-${g}-${k}`}>{label}</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {unit === "₱" && <span style={{ color: C.textS }}>₱</span>}
          {/* Whole numbers within the field's own limits: no minus sign,
              no "e", nothing past the maximum. */}
          <Input id={`st-${g}-${k}`} type="number" inputMode="numeric" min={r.min} max={r.max} step={r.whole ? 1 : "any"}
            value={String(form[g][k])} aria-invalid={!!errs[path]} aria-describedby={`st-${g}-${k}-note`}
            onKeyDown={(e) => { if (["e", "E", "+", "-", ".", ","].includes(e.key) && r.whole) e.preventDefault(); }}
            onChange={(e) => set(g, k, e.target.value === "" ? "" : Number(e.target.value))}
            style={{ ...inp, width: "100%", ...bad(path) }} />
          {unit === "%" && <span style={{ color: C.textS }}>%</span>}
        </div>
        <div id={`st-${g}-${k}-note`}>{note(path, `${hint}${hint ? " " : ""}(${r.min.toLocaleString()}–${r.max.toLocaleString()})`)}</div>
      </div>
    );
  };

  const hour = (k: keyof BusinessSettings["hours"], label: string, from: number, to: number) => (
    <div>
      <Label htmlFor={`st-h-${k}`}>{label}</Label>
      <FullSelect id={`st-h-${k}`} value={String(form.hours[k])} onChange={(e) => set("hours", k, Number(e.target.value))} style={{ ...inp, padding: "8px 36px 8px 12px", ...bad(`hours.${k}`) }}>
        {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => <option key={h} value={h}>{hourOption(h)}</option>)}
      </FullSelect>
      {errs[`hours.${k}`] && note(`hours.${k}`, "")}
    </div>
  );

  const section = (title: string, intro: string, body: React.ReactNode) => (
    <section style={{ border: `1px solid ${cBr}`, borderRadius: 12, background: cBg, padding: mob ? "16px" : "20px 24px", marginBottom: 20 }}>
      <h2 style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h2>
      <p style={{ color: C.textS, fontSize: 13, margin: "6px 0 16px" }}>{intro}</p>
      <div style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", gap: 16 }}>{body}</div>
    </section>
  );

  const r = form.rates;
  return (
    <div style={{ maxWidth: 900 }}>
      <AdminPageHeader title="Rates & Settings" mob={mob}
        subtitle="Your prices, limits, hours and contact details. Saving updates the website, the booking flow, the dashboard and the emails."
        action={<ActionButton kind="primary" icon="check" disabled={busy || !dirty || errCount > 0} onClick={() => void save()}>{busy ? "Saving…" : !dirty ? "Saved" : errCount > 0 ? `Fix ${errCount} field${errCount === 1 ? "" : "s"}` : "Save changes"}</ActionButton>} />

      {!meta.enabled && (
        <p role="status" style={{ border: `1px solid ${cBr}`, borderLeft: "3px solid #f5a524", borderRadius: 10, padding: "12px 16px", color: C.textB, fontSize: 13.5 }}>
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
        <h3 style={{ gridColumn: "1 / -1", color: C.textH, fontSize: 13.5, fontWeight: 600, margin: "0 0 -4px", }}>Day Tour</h3>
        {num("rates", "sharedPerHead", "Shared pool, per guest", `For one Day Tour. ${r.sharedPerHead || 0 ? `A group of 10 pays ${fmt(10 * Number(r.sharedPerHead || 0))}.` : ""}`, "₱")}
        {num("rates", "exclusiveFlat", "Exclusive pool", "The whole pool for one Day Tour, whatever the group's size.", "₱")}
        {num("rates", "overtimePerHour", "Overtime, per hour", "Added by staff on the day, only when the Night Tour is free.", "₱")}
        <div aria-hidden="true" />
        <h3 style={{ gridColumn: "1 / -1", color: C.textH, fontSize: 13.5, fontWeight: 600, margin: "8px 0 -4px", paddingTop: 12, borderTop: `1px solid ${cBr}` }}>Night Tour</h3>
        {num("rates", "sharedPerHeadNight", "Shared pool, per guest", "For one Night Tour.", "₱")}
        {num("rates", "exclusiveNight", "Exclusive pool", "The whole pool for one Night Tour.", "₱")}
        <h3 style={{ gridColumn: "1 / -1", color: C.textH, fontSize: 13.5, fontWeight: 600, margin: "8px 0 -4px", paddingTop: 12, borderTop: `1px solid ${cBr}` }}>Staycation</h3>
        {num("rates", "sharedPerHeadStay", "Shared pool, per guest", "Day and Night together, for each day of the stay.", "₱")}
        {num("rates", "exclusiveStay", "Exclusive pool", "The whole pool, Day and Night together, for each day of the stay.", "₱")}
        <h3 style={{ gridColumn: "1 / -1", color: C.textH, fontSize: 13.5, fontWeight: 600, margin: "8px 0 -4px", paddingTop: 12, borderTop: `1px solid ${cBr}` }}>Events venue</h3>
        {num("rates", "venue", "Events venue, per tour", "Always exclusive: one event per tour, whoever has the pool. A Staycation pays it for both tours.", "₱")}
      </>)}

      {section("Limits", "How many people, how long and how far ahead.", <>
        {num("limits", "resortCapacity", "Most guests at once", "Caps a booking, and all Shared groups in a slot together.", "")}
        {num("limits", "venueCapacity", "Events venue capacity", "What the hall holds: the most guests for a venue-only booking or package. Anything with the pool stays at the number above.", "")}
        {num("limits", "exclusiveDefaultGuests", "Exclusive booking starts at", "The guest count a buyout starts at; guests can raise it.", "")}
        {num("limits", "overtimeMaxHours", "Most overtime, hours", "0 turns overtime off.", "")}
        {num("limits", "maxStayDays", "Longest stay, days", "For Staycations over several dates.", "")}
        {num("limits", "bookingWindowMonths", "Guests can book up to, months ahead", "Dates further out are greyed out on the calendar. A short window keeps the calendars quick.", "")}
        {num("limits", "bookingHistoryMonths", "Calendar shows, months back", "Guests and staff can page back to see past dates. They can't be booked. 0 starts the calendar at this month.", "")}
        {num("limits", "rescheduleNoticeDays", "Date changes close, days before the visit", "A guest can ask to move their booking only while the visit is at least this far away. 2 means a booking for tomorrow can't be moved today.", "")}
      </>)}

      {section("Hours", "The two tours. A Staycation runs from the Day Tour's start to the Night Tour's end.", <>
        {hour("dayStart", "Day Tour starts", 4, 12)}
        {hour("dayEnd", "Day Tour ends", 9, 21)}
        {hour("nightStart", "Night Tour starts", 14, 23)}
        {hour("nightEnd", "Night Tour ends", 20, 35)}
        {hour("venueEnd", "Events venue closes", 16, 35)}
        <p style={{ gridColumn: "1 / -1", color: C.textS, fontSize: 12.5, margin: 0 }}>
          <Icon name="info" size={12} /> Each tour is at least 4 hours, with at least an hour between groups for cleaning — evening and morning.
          The events venue closes at its own time at night: a venue-only booking ends then, and a group with the pool moves to the pool until the Night Tour ends.
          Package descriptions you wrote yourself keep their own wording; update them in Packages &amp; Prices if they mention times.
        </p>
      </>)}

      {section("Contact details", "Shown on the website, the guest's booking page, and in every email.", <>
        {(["phone", "viber", "email", "messenger"] as const).map((k) => (
          <div key={k}>
            <Label htmlFor={`st-c-${k}`}>{{ phone: "Phone (calls and texts)", viber: "Viber", email: "Email", messenger: "Messenger link" }[k]}</Label>
            <Input id={`st-c-${k}`} value={form.contact[k]} onChange={(e) => set("contact", k, e.target.value)} maxLength={120}
              type={k === "email" ? "email" : k === "messenger" ? "url" : "tel"} inputMode={k === "email" ? "email" : k === "messenger" ? "url" : "tel"}
              aria-invalid={!!errs[`contact.${k}`]} style={{ ...inp, width: "100%", ...bad(`contact.${k}`) }} />
            {errs[`contact.${k}`] && note(`contact.${k}`, "")}
          </div>
        ))}
      </>)}

      {errCount > 0 && dirty && <ErrorNote>{`${errCount} field${errCount === 1 ? " needs" : "s need"} fixing before you can save — see the red notes above.`}</ErrorNote>}
      <ErrorNote>{error}</ErrorNote>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
        {dirty && <ActionButton onClick={() => { setForm(saved); setError(""); }}>Undo changes</ActionButton>}
        <ActionButton kind="primary" icon="check" disabled={busy || !dirty || errCount > 0} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</ActionButton>
      </div>
    </div>
  );
}
