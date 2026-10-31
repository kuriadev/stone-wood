// ── Rates & Settings — the owner's numbers, not the developer's
//
// Prices, capacity, booking limits, opening hours and contact
// details used to be constants in the code: changing the per-head rate
// meant a developer and a redeploy. They are now one validated record the
// owner edits in Rates & Settings (app/api/settings), stored in
// business_settings.
//
// This file holds what that record looks like, the defaults (exactly the
// numbers the code always had, so an empty table changes nothing), the
// validation, and applySettings — which writes the values into the live
// bindings the rest of the app already reads (lib/validators.ts,
// lib/resort.ts). Every price, capacity check, hour and email follows with
// no change at the places that use them.
//
// It is also what makes the system adaptable beyond StoneWood: another
// resort of the same kind sets its own numbers here instead of in code.
//
// Pure: safe on client and server. Package prices are NOT here — each
// package keeps the price the owner gives it in Packages & Prices, and that
// price is where any deal lives. The four automatic discounts that used to
// be here were dropped on 2026-10-27; a stored record that still has them
// is read without them.

import { applyLimitValues } from "@/lib/validators";
import { applyResortValues } from "@/lib/resort";

export interface BusinessSettings {
  rates: {
    /** Shared pool, per guest per slot. */
    sharedPerHead: number;
    /** Exclusive pool buyout, per slot, whatever the headcount. */
    exclusiveFlat: number;
    /** Events venue, per slot. */
    venue: number;
    /** Night Tour: Shared per guest, and the whole pool. */
    sharedPerHeadNight: number;
    exclusiveNight: number;
    /** Staycation (both tours, per stay day): Shared per guest, and the whole pool. */
    sharedPerHeadStay: number;
    exclusiveStay: number;
    /** Day Tour overtime, per hour. */
    overtimePerHour: number;
  };
  limits: {
    /** The most guests at once; also caps a single booking and Shared. */
    resortCapacity: number;
    exclusiveDefaultGuests: number;
    overtimeMaxHours: number;
    maxStayDays: number;
    bookingWindowMonths: number;
    /** Months back the calendars show (past dates, not bookable). */
    bookingHistoryMonths: number;
    /** A guest's date change must be at least this many days before the visit. */
    rescheduleNoticeDays: number;
  };
  /** Whole hours, 24-hour clock. nightEnd past 24 is the next morning. */
  hours: {
    dayStart: number;
    dayEnd: number;
    nightStart: number;
    nightEnd: number;
  };
  contact: {
    phone: string;
    viber: string;
    email: string;
    messenger: string;
  };
}

/** What the code has always used. An empty settings row means these. */
export const DEFAULT_SETTINGS: BusinessSettings = {
  rates: { sharedPerHead: 200, exclusiveFlat: 6000, venue: 5000, overtimePerHour: 500, sharedPerHeadNight: 200, exclusiveNight: 6000, sharedPerHeadStay: 400, exclusiveStay: 12000 },
  limits: { resortCapacity: 30, exclusiveDefaultGuests: 5, overtimeMaxHours: 2, maxStayDays: 3, bookingWindowMonths: 3, bookingHistoryMonths: 3, rescheduleNoticeDays: 2 },
  hours: { dayStart: 7, dayEnd: 17, nightStart: 19, nightEnd: 29 },
  contact: {
    phone: "+63 912 345 6789",
    viber: "+63 912 345 6789",
    email: "stonewoodresort.ph@gmail.com",
    messenger: "https://m.me/stonewoodresort",
  },
};

type Num = { min: number; max: number; whole?: boolean; label: string };
const NUMS: { [G in keyof Omit<BusinessSettings, "contact">]: { [K in keyof BusinessSettings[G]]: Num } } = {
  rates: {
    sharedPerHead: { min: 1, max: 50_000, whole: true, label: "Shared rate per guest" },
    exclusiveFlat: { min: 1, max: 1_000_000, whole: true, label: "Exclusive rate" },
    venue: { min: 1, max: 1_000_000, whole: true, label: "Events venue rate" },
    overtimePerHour: { min: 0, max: 50_000, whole: true, label: "Overtime per hour" },
    sharedPerHeadNight: { min: 1, max: 50_000, whole: true, label: "Night Tour Shared rate per guest" },
    exclusiveNight: { min: 1, max: 1_000_000, whole: true, label: "Night Tour Exclusive rate" },
    sharedPerHeadStay: { min: 1, max: 100_000, whole: true, label: "Staycation Shared rate per guest" },
    exclusiveStay: { min: 1, max: 2_000_000, whole: true, label: "Staycation Exclusive rate" },
  },
  limits: {
    resortCapacity: { min: 1, max: 500, whole: true, label: "Capacity" },
    exclusiveDefaultGuests: { min: 1, max: 500, whole: true, label: "Exclusive starting guest count" },
    overtimeMaxHours: { min: 0, max: 6, whole: true, label: "Most overtime hours" },
    maxStayDays: { min: 1, max: 30, whole: true, label: "Longest stay" },
    bookingWindowMonths: { min: 1, max: 24, whole: true, label: "How far ahead guests can book" },
    bookingHistoryMonths: { min: 0, max: 12, whole: true, label: "How far back the calendar shows" },
    rescheduleNoticeDays: { min: 1, max: 30, whole: true, label: "Days' notice for a date change" },
  },
  hours: {
    dayStart: { min: 4, max: 12, whole: true, label: "Day Tour starts" },
    dayEnd: { min: 9, max: 21, whole: true, label: "Day Tour ends" },
    nightStart: { min: 14, max: 23, whole: true, label: "Night Tour starts" },
    nightEnd: { min: 20, max: 35, whole: true, label: "Night Tour ends" },
  },
};

export type SettingsResult = { ok: true; settings: BusinessSettings } | { ok: false; error: string };

/** One number field's limits, for the form's min / max / step. */
export function numRule<G extends keyof typeof NUMS>(group: G, key: keyof (typeof NUMS)[G]): Num {
  return (NUMS[group] as Record<string, Num>)[key as string];
}

/** "+63 912 345 6789" or "0912 345 6789": a Philippine mobile number. */
export const isPhMobile = (v: string) => /^(\+63|0)9\d{9}$/.test(v.replace(/[\s()-]/g, ""));

/** Problems per field ("rates.exclusiveFlat" → message), for the form to
 *  show under each one. The rules that compare one field with another live
 *  here, so the form and the server agree; validateSettings applies them
 *  when saving. Empty means everything is fine. */
export function settingsFieldErrors(raw: unknown): Record<string, string> {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const errs: Record<string, string> = {};
  const n: Record<string, number> = {};
  for (const group of Object.keys(NUMS) as (keyof typeof NUMS)[]) {
    const rules = NUMS[group] as Record<string, Num>;
    for (const key of Object.keys(rules)) {
      const path = `${group}.${key}`;
      const v = input[group]?.[key];
      const r = rules[key];
      if (v === undefined || v === null || v === "") { errs[path] = "Enter a number."; continue; }
      const x = Number(v);
      if (!Number.isFinite(x)) { errs[path] = "Enter a number."; continue; }
      if (r.whole && !Number.isInteger(x)) { errs[path] = "Use a whole number."; continue; }
      if (x < r.min) { errs[path] = `At least ${r.min.toLocaleString()}.`; continue; }
      if (x > r.max) { errs[path] = `At most ${r.max.toLocaleString()}.`; continue; }
      n[path] = x;
    }
  }
  const has = (...p: string[]) => p.every((k) => k in n && !(k in errs));
  // Prices that make sense together.
  for (const [ex, sh] of [["rates.exclusiveFlat", "rates.sharedPerHead"], ["rates.exclusiveNight", "rates.sharedPerHeadNight"], ["rates.exclusiveStay", "rates.sharedPerHeadStay"]]) {
    if (has(ex, sh) && n[ex] <= n[sh]) errs[ex] = "The whole pool should cost more than one Shared guest.";
  }
  if (has("limits.overtimeMaxHours", "rates.overtimePerHour") && n["limits.overtimeMaxHours"] > 0 && n["rates.overtimePerHour"] === 0) {
    errs["rates.overtimePerHour"] = "Set a price per hour, or turn overtime off with 0 hours.";
  }
  // Limits that make sense together.
  if (has("limits.exclusiveDefaultGuests", "limits.resortCapacity") && n["limits.exclusiveDefaultGuests"] > n["limits.resortCapacity"]) {
    errs["limits.exclusiveDefaultGuests"] = `Can't be more than the capacity (${n["limits.resortCapacity"]}).`;
  }
  if (has("limits.maxStayDays", "limits.bookingWindowMonths") && n["limits.maxStayDays"] > n["limits.bookingWindowMonths"] * 28) {
    errs["limits.maxStayDays"] = "Longer than guests can book ahead. Raise the months ahead first.";
  }
  if (has("limits.rescheduleNoticeDays", "limits.bookingWindowMonths") && n["limits.rescheduleNoticeDays"] >= n["limits.bookingWindowMonths"] * 28) {
    errs["limits.rescheduleNoticeDays"] = "That would close date changes for every booking. Use fewer days.";
  }
  // The day has to work as a timetable.
  if (has("hours.dayStart", "hours.dayEnd") && n["hours.dayEnd"] - n["hours.dayStart"] < 4) errs["hours.dayEnd"] = "The Day Tour needs at least 4 hours.";
  if (has("hours.dayEnd", "hours.nightStart") && n["hours.nightStart"] - n["hours.dayEnd"] < 1) errs["hours.nightStart"] = "Leave at least an hour after the Day Tour, for cleaning.";
  if (has("hours.nightStart", "hours.nightEnd") && n["hours.nightEnd"] - n["hours.nightStart"] < 4) errs["hours.nightEnd"] = "The Night Tour needs at least 4 hours.";
  if (has("hours.dayStart", "hours.nightEnd") && n["hours.dayStart"] + 24 - n["hours.nightEnd"] < 1) errs["hours.nightEnd"] = "End at least an hour before the next Day Tour starts.";
  if (has("hours.dayEnd", "limits.overtimeMaxHours", "hours.nightEnd") && n["hours.dayEnd"] + n["limits.overtimeMaxHours"] > n["hours.nightEnd"]) {
    errs["limits.overtimeMaxHours"] = "Overtime would run past the end of the Night Tour.";
  }
  // Contact details guests can actually use.
  const c = input.contact ?? {};
  const text = (k: string) => String(c[k] ?? "").trim();
  if (!isPhMobile(text("phone"))) errs["contact.phone"] = "A Philippine mobile number, e.g. +63 912 345 6789.";
  if (!isPhMobile(text("viber"))) errs["contact.viber"] = "A Philippine mobile number, e.g. +63 912 345 6789.";
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(text("email"))) errs["contact.email"] = "An email address, e.g. stonewood@gmail.com.";
  if (!/^https:\/\/(m\.me|(www\.)?facebook\.com|(www\.)?messenger\.com)\/\S+$/i.test(text("messenger"))) errs["contact.messenger"] = "A Messenger link, e.g. https://m.me/stonewoodresort.";
  return errs;
}

/**
 * A full, valid settings record from anything (the stored row, a form).
 * Missing fields take the default; a field that is present but wrong is
 * an error, so a typo is refused rather than silently replaced.
 */
export function validateSettings(raw: unknown, opts: { strict?: boolean } = {}): SettingsResult {
  // Saving: every field present and every rule kept (settingsFieldErrors).
  // Loading what is already stored stays lenient, so a rule added later
  // never throws away settings the owner saved before it existed.
  if (opts.strict) {
    const errs = Object.values(settingsFieldErrors(raw));
    if (errs.length) return { ok: false, error: errs[0] };
  }
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const out = structuredClone(DEFAULT_SETTINGS) as BusinessSettings;

  // Saved before the Night Tour and Staycation had rates of their own:
  // they start from the owner's own Day rates (Night = Day, Staycation =
  // both tours), so no price moves until the owner changes one.
  const r0 = input.rates;
  if (r0 && typeof r0 === "object") {
    const day = Number(r0.sharedPerHead), ex = Number(r0.exclusiveFlat);
    const blank = (k: string) => r0[k] === undefined || r0[k] === null;
    const filled: Record<string, unknown> = { ...r0 };
    if (Number.isFinite(day) && day > 0) {
      if (blank("sharedPerHeadNight")) filled.sharedPerHeadNight = day;
      if (blank("sharedPerHeadStay")) filled.sharedPerHeadStay = day * 2;
    }
    if (Number.isFinite(ex) && ex > 0) {
      if (blank("exclusiveNight")) filled.exclusiveNight = ex;
      if (blank("exclusiveStay")) filled.exclusiveStay = ex * 2;
    }
    input.rates = filled;
  }

  for (const group of Object.keys(NUMS) as (keyof typeof NUMS)[]) {
    const rules = NUMS[group] as Record<string, Num>;
    for (const key of Object.keys(rules)) {
      const v = input[group]?.[key];
      if (v === undefined || v === null || v === "") continue;
      const n = Number(v);
      const r = rules[key];
      if (!Number.isFinite(n) || n < r.min || n > r.max || (r.whole && !Number.isInteger(n))) {
        return { ok: false, error: `${r.label} must be ${r.whole ? "a whole number " : ""}from ${r.min} to ${r.max}.` };
      }
      (out[group] as Record<string, number>)[key] = Math.round(n * 100) / 100;
    }
  }

  const c = input.contact ?? {};
  for (const key of ["phone", "viber", "email", "messenger"] as const) {
    const v = c[key];
    if (v === undefined || v === null) continue;
    const text = String(v).replace(/[<>]/g, "").trim().slice(0, 120);
    if (!text) return { ok: false, error: `Enter the resort's ${key === "messenger" ? "Messenger link" : key}.` };
    out.contact[key] = text;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.contact.email)) return { ok: false, error: "The contact email doesn't look right." };
  if (!/^https:\/\/\S+$/.test(out.contact.messenger)) return { ok: false, error: "The Messenger link should start with https://" };

  // The day has to work as a timetable: each slot at least four hours, at
  // least an hour of turnover between the groups (evening and morning),
  // and the night over by the next morning's opening.
  const h = out.hours;
  if (h.dayEnd - h.dayStart < 4) return { ok: false, error: "The Day Tour needs to be at least 4 hours." };
  if (h.nightStart - h.dayEnd < 1) return { ok: false, error: "Leave at least an hour between the Day Tour ending and the Night Tour starting, for cleaning." };
  if (h.nightEnd - h.nightStart < 4) return { ok: false, error: "The Night Tour needs to be at least 4 hours." };
  if (h.dayStart + 24 - h.nightEnd < 1) return { ok: false, error: "The Night Tour has to end at least an hour before the next Day Tour starts." };

  if (out.limits.exclusiveDefaultGuests > out.limits.resortCapacity) out.limits.exclusiveDefaultGuests = out.limits.resortCapacity;
  return { ok: true, settings: out };
}

let appliedKey = "";

/** Make these the numbers the whole app uses. Cheap and idempotent: the
 *  same settings twice is a no-op. */
export function applySettings(s: BusinessSettings): void {
  const key = JSON.stringify(s);
  if (key === appliedKey) return;
  appliedKey = key;
  applyLimitValues({
    resortCapacity: s.limits.resortCapacity,
    exclusiveDefaultGuests: s.limits.exclusiveDefaultGuests,
    venueRate: s.rates.venue,
    exclusiveFlatRate: s.rates.exclusiveFlat,
    sharedPerHeadRate: s.rates.sharedPerHead,
    sharedNightRate: s.rates.sharedPerHeadNight,
    exclusiveNightRate: s.rates.exclusiveNight,
    sharedStayRate: s.rates.sharedPerHeadStay,
    exclusiveStayRate: s.rates.exclusiveStay,
    overtimeMax: s.limits.overtimeMaxHours,
    overtimeRate: s.rates.overtimePerHour,
    bookingWindowMonths: s.limits.bookingWindowMonths,
    bookingHistoryMonths: s.limits.bookingHistoryMonths,
    rescheduleNoticeDays: s.limits.rescheduleNoticeDays,
    maxStayDays: s.limits.maxStayDays,
  });
  applyResortValues({ ...s.hours, contact: { ...s.contact } });
}

/** "7:00 AM", "5:00 AM (next day)" — for the settings form. */
export function hourOption(h: number): string {
  const hh = h % 24;
  return `${hh % 12 === 0 ? 12 : hh % 12}:00 ${hh < 12 ? "AM" : "PM"}${h >= 24 ? " (next day)" : ""}`;
}

/** Field-by-field differences, for the activity log. */
export function settingsChanges(before: BusinessSettings, after: BusinessSettings): string[] {
  const out: string[] = [];
  for (const group of Object.keys(after) as (keyof BusinessSettings)[]) {
    const a = before[group] as Record<string, unknown>;
    const b = after[group] as Record<string, unknown>;
    for (const k of Object.keys(b)) if (a[k] !== b[k]) out.push(`${group}.${k}: ${String(a[k])} → ${String(b[k])}`);
  }
  return out;
}
