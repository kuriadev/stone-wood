"use client";

import { adminTabLabel } from "@/lib/labels";
import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import type { ResortPackage, PackageDiscount, PackageDealPart } from "@/types/package";
import type { Room } from "@/types/room";
import type { BookingResource, BookingTier, PackageSlotMode } from "@/types/booking";
import {
  packageValue, packageSetupProblem, packageSetupLabel, sharedNotAllowed, packageCapacityLimit, PACKAGE_RESOURCE_LABEL,
  cleanPackageDealPart, packagePriceToday, promoUntilLabel, PACKAGE_DISCOUNT_MAX_PCT, DEAL_PART_LABEL,
  dealToday, dealOff, dealText, packageExtraDeals, priceBooking,
} from "@/lib/pricing";
import { SLOTS } from "@/lib/resort";
import { GALLERY_MAX, RESORT_MAX_CAPACITY, manilaNow } from "@/lib/validators";
import { Icon } from "@/components/common/Icon";
import { PhotoSet } from "@/components/admin/PhotoSet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FullSelect } from "@/components/admin/ui";
import { HomeCardsEditor } from "@/components/admin/HomeCardsEditor";
import { DateField } from "@/components/common/DateField";
import { PackageCard, TIERS, tierOf, type TierKey } from "@/components/sections/PackageShowcase";

interface PackagesTabProps {
  packages: ResortPackage[];
  setPackages: React.Dispatch<React.SetStateAction<ResortPackage[]>>;
  /** For the room discount's worked examples. */
  rooms?: Room[];
  mob: boolean;
}

const RESOURCES: BookingResource[] = ["Pool", "Venue", "Pool+Venue"];
const STATUSES: BookingTier[] = ["Shared", "Exclusive"];
const PARTS: PackageDealPart[] = ["price", "room", "extraDay"];

/** The code is what a booking stores to say which package was bought, so
 *  it has to be stable, unique and safe to put in a URL. Typing is free
 *  text; this is the one normalisation the form and the API both apply. */
function normCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** One discount row as typed: blank value means no discount. */
type DealForm = { type: "percent" | "amount"; value: string; until: string };
const BLANK_DEAL: DealForm = { type: "percent", value: "", until: "" };
const dealToForm = (d?: PackageDiscount): DealForm => (d ? { type: d.type, value: String(d.value), until: d.until ?? "" } : BLANK_DEAL);
const formToRaw = (d: DealForm) => (d.value.trim() ? { type: d.type, value: d.value, until: d.until } : null);

const BLANK_FORM = {
  code: "", title: "", resource: "Pool" as BookingResource, status: "Shared" as BookingTier,
  price: "", listPrice: "", capacity: "", requiresRoom: false, slotMode: "Single" as PackageSlotMode,
  cover: "", photos: [] as string[], captions: [] as string[], blurb: "", includes: "", note: "", active: true,
  deals: { price: BLANK_DEAL, room: BLANK_DEAL, extraDay: BLANK_DEAL } as Record<PackageDealPart, DealForm>,
};

const LABEL = "mb-2 block text-[11.5px] tracking-[2px] text-accent-ink";

/** A titled group of fields in the package form. Kept outside the
 *  component: defined inside, it would be a new component every render and
 *  the field being typed in would lose focus. */
function FormSection({ n, title, hint, line, textH, textS, children }: {
  n: number; title: string; hint: string; line: string; textH: string; textS: string; children: React.ReactNode;
}) {
  const id = `pkg-sec-${n}`;
  return (
    <section aria-labelledby={id} style={{ paddingTop: n === 1 ? 0 : 20, marginTop: n === 1 ? 0 : 4, borderTop: n === 1 ? "none" : `1px solid ${line}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", border: `1px solid ${gold}88`, color: gold, fontSize: 11.5, fontWeight: 700, flexShrink: 0, alignSelf: "center" }}>{n}</span>
        <h3 id={id} style={{ color: textH, fontSize: 15.5, fontWeight: 600, margin: 0 }}>{title}</h3>
        <span style={{ color: textS, fontSize: 12.5 }}>{hint}</span>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-12">{children}</div>
    </section>
  );
}

type TierTab = "ALL" | TierKey;

export function PackagesTab({ packages, setPackages, rooms = [], mob }: PackagesTabProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();

  const [showModal, setShowModal] = useState(false);
  const [editPkg, setEditPkg] = useState<ResortPackage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ResortPackage | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  /* The form, or the package as the guest will see it on the Packages
     page, built from the unsaved values. */
  const [formView, setFormView] = useState<"edit" | "guest">("edit");

  const cBg = isDark ? "var(--sw-bg)" : "#ffffff";
  const cBr = isDark ? "var(--sw-border)" : "#e4ddd1";
  /* Delete stays red in both themes, but #e5484d is a pale red: it reads on the
     dark card and washes out to about 3:1 on the white one. The ink follows
     the theme so the icon is legible either way. */
  const dangerInk = C.dangerInk;   // the shared token, see --sw-danger-ink
  const dangerBg = isDark ? "rgba(229,85,85,0.10)" : "rgba(198,40,40,0.06)";
  const dangerBorder = isDark ? "rgba(229,85,85,0.30)" : "rgba(198,40,40,0.30)";
  const inpS: React.CSSProperties = { ...C.inp, borderRadius: 6 };
  /* Selects only. `C.inp` sets `padding` inline, which overrides the
     `pr-9` NativeSelect reserves for its chevron -- without this the arrow
     sits on top of the selected value. */
  const selS: React.CSSProperties = { ...inpS, paddingRight: 40 };
  const setF = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const setDeal = (part: PackageDealPart, patch: Partial<DealForm>) =>
    setForm((f) => ({ ...f, deals: { ...f.deals, [part]: { ...f.deals[part], ...patch } } }));
  /* What guests book and when: changing either can make Shared impossible
     (the venue is never shared; pool + venue and a Staycation are
     Exclusive only), so pool access moves to Exclusive with it rather than
     leaving the form holding a setup that can't be saved. */
  const setSetup = (patch: { resource?: BookingResource; slotMode?: PackageSlotMode }) =>
    setForm((f) => {
      const next = { ...f, ...patch };
      if (sharedNotAllowed(next.resource, next.slotMode)) next.status = "Exclusive";
      return next;
    });
  const setupProblem = packageSetupProblem({ resource: form.resource, status: form.status, slotMode: form.slotMode, capacity: Number(form.capacity) || 0 });
  const sharedBlocked = sharedNotAllowed(form.resource, form.slotMode);
  const today = manilaNow().date;
  const price = Number(form.price) || 0;

  /* ── Discounts ── A row only counts where it can apply: a room deal on a
     package with a room, an extra-day deal on a Staycation (the API drops
     the others the same way). */
  const applies: Record<PackageDealPart, boolean> = {
    price: true,
    room: form.requiresRoom,
    extraDay: form.slotMode === "WholeDay",
  };
  const checks = Object.fromEntries(
    PARTS.map((part) => [part, applies[part] ? cleanPackageDealPart(part, formToRaw(form.deals[part]), price) : { ok: true as const, discount: null }]),
  ) as Record<PackageDealPart, ReturnType<typeof cleanPackageDealPart>>;
  const dealsOk = PARTS.every((part) => checks[part].ok);
  const savedDeal = (part: PackageDealPart): PackageDiscount | undefined => {
    const c = checks[part];
    return applies[part] && c.ok && c.discount ? c.discount : undefined;
  };
  const roomsByPrice = [...rooms].sort((a, b) => b.price - a.price);
  const cheapestRoom = roomsByPrice[roomsByPrice.length - 1];

  /* What a 2-day Staycation of this package costs with and without the
     extra-day deal, for the row's worked example. */
  const dayExample = (() => {
    const deal = dealToday(savedDeal("extraDay"), today);
    if (!deal) return null;
    const pay = packagePriceToday({ price, discount: savedDeal("price") }, today).pay;
    const room = form.requiresRoom ? cheapestRoom : undefined;
    const roomDeal = dealToday(savedDeal("room"), today);
    const base = {
      resource: form.resource, tier: form.status, slot: "WholeDay" as const, guests: Number(form.capacity) || 1,
      overtime: 0, roomPrices: room ? [room.price] : [], days: 2,
    };
    return {
      room,
      withDeal: priceBooking({ ...base, pkg: { price: pay, requiresRoom: form.requiresRoom, roomDeal, extraDayDeal: deal } }).total,
      without: priceBooking({ ...base, pkg: { price: pay, requiresRoom: form.requiresRoom, roomDeal } }).total,
    };
  })();

  /** The line under a discount row: its problem, or what guests will pay. */
  const dealNote = (part: PackageDealPart): { text: React.ReactNode; bad?: boolean } => {
    const c = checks[part];
    if (!c.ok) return { text: c.error, bad: true };
    const d = c.discount;
    if (!d) return { text: "No discount." };
    if (d.until && d.until < today) return { text: "That last day has passed, so it no longer applies." };
    const until = d.until ? `, ${promoUntilLabel(d.until)}` : ", until you remove it";
    const strong = (v: number) => <strong style={{ color: C.goldInk }}>{fmt(v)}</strong>;
    if (part === "price") {
      const t = packagePriceToday({ price, discount: d }, today);
      if (t.off <= 0) return { text: "Set the price above first." };
      return { text: <>Guests pay {strong(t.pay)} instead of {fmt(t.regular)} ({t.badge}){until}.</> };
    }
    if (part === "room") {
      if (!roomsByPrice.length) return { text: <>{dealText(d)} the rate of the room the guest picks{until}.</> };
      return {
        text: (
          <>
            {roomsByPrice.slice(0, 3).map((r, i) => (
              <span key={r.id}>{i > 0 && " · "}{r.name} {strong(r.price - dealOff(d, r.price))} <s>{fmt(r.price)}</s></span>
            ))}{" "}per stay{until}.
          </>
        ),
      };
    }
    if (!dayExample) return { text: "Set the price above first." };
    return {
      text: <>A 2-day stay{dayExample.room ? ` with ${dayExample.room.name}` : ""} comes to {strong(dayExample.withDeal)} instead of {fmt(dayExample.without)}{until}.</>,
    };
  };

  const DEAL_HINT: Record<PackageDealPart, string> = {
    price: "What the group pays to get in, with everything listed under Includes.",
    room: "Off the rate of the room the guest picks.",
    extraDay: "Off every day after the first, when guests stay 2 or more days.",
  };
  const DEAL_OFF: Record<PackageDealPart, string> = {
    price: "",
    room: "Tick “Includes a room” under What's booked to discount the room.",
    extraDay: "Only a Staycation can run past one day. Set When to Staycation to use this.",
  };

  /* Whether the database can hold a discount yet (migration
     20261028140000_package_discount). null until asked. */
  const [discountReady, setDiscountReady] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void fetch("/api/packages")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j && typeof j.discountReady === "boolean") setDiscountReady(j.discountReady); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const openAdd = () => {
    setEditPkg(null);
    setForm(BLANK_FORM);
    setFormView("edit");
    setShowModal(true);
  };
  const openEdit = (p: ResortPackage) => {
    setEditPkg(p);
    setForm({
      code: p.code, title: p.title, resource: p.resource,
      // A setup that can't be Shared opens as Exclusive, which is what a
      // guest actually gets (lib/pricing.ts packageTier / sharedNotAllowed).
      status: sharedNotAllowed(p.resource, p.slotMode ?? "Single") ? "Exclusive" : p.status,
      price: String(p.price), listPrice: p.listPrice ? String(p.listPrice) : "",
      capacity: String(p.capacity), requiresRoom: !!p.requiresRoom, slotMode: p.slotMode ?? "Single",
      cover: p.cover,
      // Packages have had a gallery column all along; the form only ever set
      // the cover, so an existing package shows its cover plus whatever the
      // gallery already holds.
      photos: p.gallery?.length ? p.gallery.map((g) => g.src).slice(0, GALLERY_MAX) : p.cover ? [p.cover] : [],
      captions: p.gallery?.length ? p.gallery.map((g) => g.label ?? "").slice(0, GALLERY_MAX) : [],
      blurb: p.blurb, includes: p.includes.join("\n"),
      note: p.note ?? "", active: p.active,
      deals: { price: dealToForm(p.discount), room: dealToForm(p.roomDiscount), extraDay: dealToForm(p.extraDayDiscount) },
    });
    setFormView("edit");
    setShowModal(true);
  };

  /* What the package will actually be filed under: what the admin typed,
     or the title turned into a code when they left it alone. */
  const effectiveCode = normCode(form.code.trim() || form.title);
  /* Two packages sharing a code would collide everywhere the code is the
     identity -- the deep link from Home, the lookup on the Packages page,
     and the `packageCode` already written onto past bookings. Only while
     the window is open: once saved, the new package is in the list as the
     window fades out, and would be flagged as clashing with itself. */
  const codeTaken = showModal && effectiveCode !== "" && packages.some((x) => x.code === effectiveCode && x.id !== editPkg?.id);

  /** The package as the form holds it now: what Save writes, and what the
   *  guest view shows. */
  const draftPackage = (): Omit<ResortPackage, "id"> => {
    const cover = form.photos[0] || form.cover || "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80";
    const photos = (form.photos.length ? form.photos : [cover]).slice(0, GALLERY_MAX);
    const gallery = photos.map((src, i) => ({
      src,
      // The caption is what the guest reads beside the photo. Left blank it
      // falls back to the package title for the cover and a plain number for
      // the rest, so the gallery never shows an empty caption slot.
      label: (form.captions[i] || "").trim() || (i === 0 ? form.title.trim() || "Cover" : "Photo " + (i + 1)),
      kind: "",
    }));
    return {
      code: effectiveCode,
      title: form.title.trim(),
      resource: form.resource,
      status: form.status,
      price,
      listPrice: form.listPrice ? Number(form.listPrice) : undefined,
      capacity: Number(form.capacity) || 1,
      requiresRoom: form.requiresRoom || undefined,
      slotMode: form.slotMode,
      cover,
      gallery,
      blurb: form.blurb,
      includes: form.includes.split("\n").map((s) => s.trim()).filter(Boolean),
      note: form.note || undefined,
      active: form.active,
      discount: savedDeal("price"),
      roomDiscount: savedDeal("room"),
      extraDayDiscount: savedDeal("extraDay"),
    };
  };

  /* ── Filters ── The list opens on one kind of package, the way the
     public Packages page does, instead of every package at once. */
  const [tierTab, setTierTab] = useState<TierTab | null>(null);
  const [q, setQ] = useState("");
  const [fWhen, setFWhen] = useState<"" | PackageSlotMode>("");
  const [fRoom, setFRoom] = useState<"" | "yes" | "no">("");
  const [fDeal, setFDeal] = useState<"" | "yes" | "no">("");
  const [fShown, setFShown] = useState<"" | "visible" | "hidden">("");
  const tierCount = (key: TierTab) => (key === "ALL" ? packages.length : packages.filter((p) => tierOf(p) === key).length);
  const firstTier: TierTab = TIERS.find((t) => tierCount(t.key) > 0)?.key ?? "ALL";
  // A tab left empty (its last package deleted) falls back to the first
  // kind that has any.
  const activeTab: TierTab = tierTab && (tierTab === "ALL" || tierCount(tierTab) > 0) ? tierTab : firstTier;
  const onDeal = (p: ResortPackage) => packagePriceToday(p, today).off > 0 || packageExtraDeals(p, today).length > 0;
  const needle = q.trim().toLowerCase();
  const shown = packages.filter((p) =>
    (activeTab === "ALL" || tierOf(p) === activeTab)
    && (!needle || p.title.toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle))
    && (!fWhen || (p.slotMode ?? "Single") === fWhen)
    && (!fRoom || !!p.requiresRoom === (fRoom === "yes"))
    && (!fDeal || onDeal(p) === (fDeal === "yes"))
    && (!fShown || p.active === (fShown === "visible")));
  const narrowed = !!(needle || fWhen || fRoom || fDeal || fShown);
  const clearFilters = () => { setQ(""); setFWhen(""); setFRoom(""); setFDeal(""); setFShown(""); };

  const savePkg = () => {
    const data = draftPackage();
    if (editPkg) {
      setPackages((p) => p.map((x) => x.id === editPkg.id ? { ...x, ...data } : x));
      toast("Package updated.", "success");
    } else {
      setPackages((p) => [...p, { id: Date.now(), ...data }]);
      toast("Package added.", "success");
    }
    // Show the list the saved package is in, so it never vanishes behind
    // a filter the moment it is saved.
    setTierTab(tierOf({ id: 0, ...data }));
    clearFilters();
    setShowModal(false);
  };
  const executeDelete = () => {
    if (!confirmDelete) return;
    setPackages((p) => p.filter((x) => x.id !== confirmDelete.id));
    toast(`"${confirmDelete.title}" removed from Packages.`, "warning");
    setConfirmDelete(null);
  };
  const toggleActive = (p: ResortPackage) => setPackages((ps) => ps.map((x) => x.id === p.id ? { ...x, active: !x.active } : x));

  const pill = (on: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 8, minHeight: 38, padding: "0 14px", borderRadius: 20, cursor: "pointer",
    fontFamily: "inherit", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
    border: `1px solid ${on ? gold : cBr}`, background: on ? `${gold}14` : "transparent", color: on ? C.goldInk : C.textS,
  });
  const smallBadge: React.CSSProperties = { fontSize: 10.5, borderRadius: 20, padding: "4px 8px" };
  const hotBadge: React.CSSProperties = { ...smallBadge, color: "#e2574c", border: "1px solid rgba(226,87,76,0.45)" };

  /** One discount row: which part, % or ₱, how much, until when. */
  const dealRow = (part: PackageDealPart) => {
    const d = form.deals[part];
    const note = applies[part] ? dealNote(part) : null;
    const id = `pkg-deal-${part}`;
    return (
      <div key={part} style={{ padding: "14px 0", borderTop: part === "price" ? "none" : `1px solid ${cBr}` }}>
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <p id={`${id}-label`} style={{ color: applies[part] ? C.textH : C.textS, fontSize: 14, fontWeight: 600, margin: 0 }}>{DEAL_PART_LABEL[part]}</p>
            <p style={{ color: C.textS, fontSize: 12, lineHeight: 1.5, margin: "2px 0 0" }}>{applies[part] ? DEAL_HINT[part] : DEAL_OFF[part]}</p>
          </div>
          {applies[part] && (
            <>
              <div className="sm:col-span-3" role="radiogroup" aria-labelledby={`${id}-label`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 6 }}>
                {(["percent", "amount"] as const).map((k) => {
                  const on = d.type === k;
                  return (
                    <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setDeal(part, { type: k })}
                      style={{ height: 40, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, border: `1px solid ${on ? gold : cBr}`, background: on ? `${gold}14` : "transparent", color: on ? C.goldInk : C.textS }}>
                      {k === "percent" ? "% off" : "₱ off"}
                    </button>
                  );
                })}
              </div>
              <div className="sm:col-span-2">
                <Input id={`${id}-value`} type="number" min={1} max={d.type === "percent" ? PACKAGE_DISCOUNT_MAX_PCT : undefined}
                  aria-label={`${DEAL_PART_LABEL[part]}: ${d.type === "percent" ? `percent off, 1 to ${PACKAGE_DISCOUNT_MAX_PCT}` : "pesos off"}`}
                  value={d.value} onChange={(e) => setDeal(part, { value: e.target.value })}
                  placeholder={d.type === "percent" ? "e.g. 10" : "e.g. 500"} className="sw-input" style={inpS} />
              </div>
              <div className="sm:col-span-3">
                <DateField id={`${id}-until`} min={today} value={d.until} onChange={(v) => setDeal(part, { until: v })} placeholder="No end date" style={inpS} />
              </div>
            </>
          )}
        </div>
        {note && (
          <p role={note.bad ? "alert" : undefined} style={{ fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.6, color: note.bad ? C.dangerInk : C.textS }}>
            {note.text}
          </p>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>RESORT PACKAGES</p>
          <h2 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>{adminTabLabel("Packages")}</h2>
          <p style={{ color: C.textS, fontSize: 13.5, margin: "8px 0 0" }}>Shown on the public Packages page and offered as deep links from Home and Walk-In.</p>
        </div>
        <button className="sw-btn" onClick={openAdd} style={{ ...goldBtn, padding: "12px 20px", fontSize: 12.5, letterSpacing: 2 }}>+ ADD PACKAGE</button>
      </div>

      {/* Filters. The kind of package first, as tabs with counts so nothing
          reads as missing; then the finer choices, all visible at once. */}
      {packages.length > 0 && (
        <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: mob ? 12 : 16, marginBottom: 16 }}>
          <div role="group" aria-label="Kind of package" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            {(["ALL", ...TIERS.map((t) => t.key)] as TierTab[]).map((key) => {
              const n = tierCount(key);
              if (key !== "ALL" && n === 0) return null;
              const on = activeTab === key;
              return (
                <button key={key} type="button" aria-pressed={on} onClick={() => setTierTab(key)} style={pill(on)}>
                  {key === "ALL" ? "All" : TIERS.find((t) => t.key === key)!.label}
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: on ? C.goldInk : C.textXS }}>{n}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2" style={{ position: "relative" }}>
              <Icon name="search" size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.textXS, pointerEvents: "none" }} />
              <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or code" aria-label="Search packages by name or code" className="sw-input" style={{ ...inpS, paddingLeft: 36 }} />
            </div>
            <FullSelect aria-label="When" value={fWhen} onChange={(e) => setFWhen(e.target.value as "" | PackageSlotMode)} className="sw-input" style={selS}>
              <option value="">Any time</option>
              <option value="Single">Day or Night</option>
              <option value="WholeDay">Staycation</option>
            </FullSelect>
            <FullSelect aria-label="Room" value={fRoom} onChange={(e) => setFRoom(e.target.value as "" | "yes" | "no")} className="sw-input" style={selS}>
              <option value="">With or without a room</option>
              <option value="yes">Includes a room</option>
              <option value="no">No room</option>
            </FullSelect>
            <FullSelect aria-label="Discount" value={fDeal} onChange={(e) => setFDeal(e.target.value as "" | "yes" | "no")} className="sw-input" style={selS}>
              <option value="">Any price</option>
              <option value="yes">On discount today</option>
              <option value="no">No discount today</option>
            </FullSelect>
            <FullSelect aria-label="Shown to guests" value={fShown} onChange={(e) => setFShown(e.target.value as "" | "visible" | "hidden")} className="sw-input" style={selS}>
              <option value="">Visible and hidden</option>
              <option value="visible">Visible to guests</option>
              <option value="hidden">Hidden</option>
            </FullSelect>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            <p role="status" style={{ color: C.textS, fontSize: 12.5, margin: 0 }}>
              Showing {shown.length} of {packages.length} package{packages.length === 1 ? "" : "s"}
            </p>
            {narrowed && (
              <button type="button" onClick={clearFilters} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.goldInk, fontSize: 12.5, fontWeight: 600, fontFamily: "inherit" }}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* 1fr auto-rows equalises row heights on
          multi-column layouts (not mobile, which is one card per row), and each
          card is a column whose action row is pinned to the bottom. */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "repeat(auto-fill,minmax(280px,1fr))", gridAutoRows: mob ? "auto" : "minmax(0, 1fr)", gap: 16 }}>
        {shown.map((p) => (
          <div key={p.id} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, overflow: "hidden", opacity: p.active ? 1 : 0.55, display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy" decoding="async" src={p.cover} alt={p.title} style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
              <Badge variant="outline" style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.55)", color: gold, fontSize: 10.5, padding: "4px 8px", borderRadius: 20, letterSpacing: 1 }}>{packageSetupLabel({ resource: p.resource, status: p.status })}</Badge>
              {!p.active && <Badge variant="outline" style={{ position: "absolute", top: 8, right: 8, background: "rgba(200,60,60,0.85)", color: "#fff", fontSize: 10.5, padding: "4px 8px", borderRadius: 20, letterSpacing: 1 }}>HIDDEN</Badge>}
            </div>
            <div style={{ padding: "16px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <h4 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 16, fontWeight: 400, margin: 0 }}>{p.title}</h4>
                {(() => {
                  const t = packagePriceToday(p, today);
                  return (
                    <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <span style={{ color: C.goldInk, fontWeight: 700, fontSize: 14.5 }}>{fmt(t.pay)}</span>
                      {t.badge && <span style={{ display: "block", color: C.textXS, fontSize: 12, textDecoration: "line-through" }}>{fmt(t.regular)}</span>}
                    </span>
                  );
                })()}
              </div>
              <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.5, marginBottom: 8 }}>{p.blurb}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <Badge variant="outline" style={{ ...smallBadge, color: C.goldInk, border: `1px solid ${gold}55` }}>{p.slotMode === "WholeDay" ? "STAYCATION" : "DAY OR NIGHT"}</Badge>
                {p.requiresRoom && <Badge variant="outline" style={{ ...smallBadge, color: C.goldInk, border: `1px solid ${gold}55` }}>ROOM INCLUDED</Badge>}
                {(() => {
                  const t = packagePriceToday(p, today);
                  if (t.badge) return <Badge variant="outline" style={hotBadge}>{t.badge}{t.until ? ` · ${promoUntilLabel(t.until).replace("until ", "TO ").toUpperCase()}` : ""}</Badge>;
                  if (p.discount) return <Badge variant="outline" style={{ ...smallBadge, color: C.textS, border: `1px solid ${cBr}` }}>PROMO ENDED</Badge>;
                  return null;
                })()}
                {packageExtraDeals(p, today).map((d) => (
                  <Badge key={d.part} variant="outline" style={hotBadge}>{d.text.toUpperCase()}</Badge>
                ))}
                <Badge variant="outline" style={{ ...smallBadge, color: C.textS, border: `1px solid ${cBr}` }}>Cap {p.capacity}</Badge>
              </div>
              {/* marginTop:auto — blurb length and the badge row (ROOM REQUIRED,
                  Cap) vary per package, which left these buttons 20px
                  apart between neighbouring cards. */}
              <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 4 }}>
                <button className="sw-btn-out" onClick={() => toggleActive(p)} style={{ ...outBtn, flex: 1, padding: "8px 12px", fontSize: 11.5, letterSpacing: 1 }}>{p.active ? "HIDE" : "SHOW"}</button>
                <button className="sw-btn-out" onClick={() => openEdit(p)} style={{ ...outBtn, flex: 1, padding: "8px 12px", fontSize: 11.5, letterSpacing: 1 }}>EDIT</button>
                {/* An icon, not "DEL": the abbreviation had to be guessed at,
                    and the trash can is the one symbol nobody has to. Icon
                    only, so it needs a real accessible name -- and a title so
                    a sighted user gets the same word on hover. */}
                <button
                  onClick={() => setConfirmDelete(p)}
                  aria-label={`Delete ${p.title}`}
                  title={`Delete ${p.title}`}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 40, minHeight: 34, flexShrink: 0,
                    background: dangerBg, color: dangerInk, border: `1px solid ${dangerBorder}`,
                    cursor: "pointer", borderRadius: 6, padding: 0,
                  }}
                >
                  <Icon name="trash" size={15} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {packages.length === 0 && (
          <p style={{ color: C.textXS, fontSize: 14.5, gridColumn: "1/-1", textAlign: "center", padding: "32px 0" }}>No packages yet.</p>
        )}
        {packages.length > 0 && shown.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "32px 0" }}>
            <p style={{ color: C.textS, fontSize: 14.5, margin: "0 0 10px" }}>No packages match these filters.</p>
            <button type="button" className="sw-btn-out" onClick={() => { clearFilters(); setTierTab("ALL"); }} style={{ ...outBtn, padding: "8px 16px", fontSize: 11.5, letterSpacing: 1 }}>SHOW ALL PACKAGES</button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal. Fields are grouped the way a package is built:
          its name, what it books, what it costs, then what the guest reads
          on its card. "Guest view" shows that card with the unsaved values. */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Satoshi',system-ui,sans-serif", fontWeight: 400, fontSize: 22 }}>
              {editPkg ? "Edit Package" : "Add Package"}
            </DialogTitle>
            <DialogDescription>
              Shown on the public Packages page and offered as deep links from Home.
            </DialogDescription>
          </DialogHeader>

          <div role="group" aria-label="Form or guest view" style={{ display: "flex", gap: 8 }}>
            <button type="button" aria-pressed={formView === "edit"} onClick={() => setFormView("edit")} style={pill(formView === "edit")}>
              <Icon name="edit" size={14} /> Details
            </button>
            <button type="button" aria-pressed={formView === "guest"} onClick={() => setFormView("guest")} style={pill(formView === "guest")}>
              <Icon name="eye" size={14} /> Guest view
            </button>
          </div>

          {formView === "guest" ? (
            <div>
              <p style={{ color: C.textS, fontSize: 12.5, lineHeight: 1.6, margin: "0 0 12px" }}>
                How this package looks on the Packages page, with what you have typed so far. Nothing is saved until you press {editPkg ? "Save changes" : "Add package"}.
              </p>
              {/* inert: a picture of the card, so its buttons can't be
                  clicked or tabbed to. */}
              <div inert>
                <PackageCard p={{ id: editPkg?.id ?? 0, ...draftPackage() }} C={C} isDark={isDark} mob={mob} onOpenGallery={() => {}} onBook={() => {}} />
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

              <FormSection n={1} title="Name" hint="What guests and staff call it." line={cBr} textH={C.textH} textS={C.textS}>
                <div className="sm:col-span-6">
                  <Label htmlFor="pkg-title" className={LABEL}>TITLE</Label>
                  <Input id="pkg-title" value={form.title} onChange={(e) => setF("title", e.target.value)} placeholder="Pool + Room Package" className="sw-input" style={inpS} />
                </div>
                {/* The code had form state, was saved and was read back on edit,
                    but no field ever showed it -- so it could only ever be the
                    title in capitals, and an admin could not tell what a booking
                    would end up referencing. */}
                <div className="sm:col-span-6">
                  <Label htmlFor="pkg-code" className={LABEL}>CODE</Label>
                  <Input
                    id="pkg-code"
                    value={form.code}
                    onChange={(e) => setF("code", e.target.value)}
                    placeholder={form.title.trim() ? normCode(form.title) : "POOL-ROOM-PACKAGE"}
                    className="sw-input"
                    style={{ ...inpS, ...(codeTaken ? { borderColor: "#e5484d" } : {}) }}
                    aria-describedby="pkg-code-hint"
                    aria-invalid={codeTaken || undefined}
                  />
                  <p id="pkg-code-hint" style={{ color: codeTaken ? C.dangerInk : C.textS, fontSize: 12, margin: "4px 0 0", lineHeight: 1.6 }}>
                    {codeTaken
                      ? `Another package already uses ${effectiveCode}. Codes must be unique.`
                      : editPkg
                        ? `Saved as ${effectiveCode || "—"}. Bookings already placed reference the old code, so change it only if you mean to.`
                        : `Saved as ${effectiveCode || "—"}. Leave it blank to build it from the title.`}
                  </p>
                </div>
              </FormSection>

              {/* What the package books. Each of these is enforced when a
                  guest books it (lib/bookingQuote.ts): the package's own
                  pool access, what it covers, when, its capacity and its
                  room rule replace anything the browser sends. */}
              <FormSection n={2} title="What's booked" hint="Checked again when a guest books." line={cBr} textH={C.textH} textS={C.textS}>
                <div className="sm:col-span-6">
                  <Label htmlFor="pkg-resource" className={LABEL}>WHAT GUESTS BOOK</Label>
                  <FullSelect id="pkg-resource" value={form.resource} onChange={(e) => setSetup({ resource: e.target.value as BookingResource })} className="sw-input" style={selS}>
                    {RESOURCES.map((r) => <option key={r} value={r}>{PACKAGE_RESOURCE_LABEL[r]}</option>)}
                  </FullSelect>
                </div>
                <div className="sm:col-span-6">
                  <Label htmlFor="pkg-when" className={LABEL}>WHEN</Label>
                  <FullSelect id="pkg-when" value={form.slotMode} onChange={(e) => setSetup({ slotMode: e.target.value as PackageSlotMode })} className="sw-input" style={selS}>
                    <option value="Single">Day or Night — guest picks ({SLOTS.Day.hours} / {SLOTS.Night.hours})</option>
                    <option value="WholeDay">Staycation ({SLOTS.WholeDay.hours})</option>
                  </FullSelect>
                </div>
                <div className="sm:col-span-12">
                  <p id="pkg-tier-label" className={LABEL} style={{ margin: "0 0 8px" }}>POOL ACCESS</p>
                  <div role="radiogroup" aria-labelledby="pkg-tier-label" style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
                    {STATUSES.map((st) => {
                      const on = form.status === st;
                      const blocked = st === "Shared" && !!sharedBlocked;
                      return (
                        <button
                          key={st}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={blocked}
                          onClick={() => setF("status", st)}
                          title={blocked ? sharedBlocked ?? undefined : undefined}
                          style={{
                            textAlign: "left", padding: "12px 14px", borderRadius: 8, cursor: blocked ? "not-allowed" : "pointer",
                            border: `1px solid ${on ? gold : cBr}`, background: on ? `${gold}14` : "transparent", opacity: blocked ? 0.45 : 1,
                            fontFamily: "inherit",
                          }}
                        >
                          <span style={{ display: "block", color: on ? C.goldInk : C.textH, fontSize: 14, fontWeight: 600 }}>
                            {st === "Shared" ? "Shared" : "Exclusive"}
                          </span>
                          <span style={{ display: "block", color: C.textS, fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>
                            {st === "Shared"
                              ? "Other groups can book the pool on the same stay; this package takes its capacity in places."
                              : "The group has the pool (and venue, if included) to themselves."}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {sharedBlocked && (
                    <p style={{ color: C.textS, fontSize: 12, margin: "6px 0 0" }}>{sharedBlocked}</p>
                  )}
                </div>
                <div className="sm:col-span-6">
                  <Label htmlFor="pkg-capacity" className={LABEL}>GUEST CAPACITY</Label>
                  <Input type="number" min={1} max={packageCapacityLimit(form.resource)} id="pkg-capacity" value={form.capacity} onChange={(e) => setF("capacity", e.target.value)} className="sw-input" style={inpS} />
                  <p style={{ color: C.textS, fontSize: 12, margin: "4px 0 0", lineHeight: 1.5 }}>
                    {form.status === "Shared" && form.resource !== "Venue"
                      ? `Guests the package covers. They take that many of the ${RESORT_MAX_CAPACITY} shared places on the stay.`
                      : `Most guests the group can bring, up to ${packageCapacityLimit(form.resource)}${form.resource === "Venue" ? ", what the events venue holds" : ""}.`}
                  </p>
                </div>
                {/* Was a div with onClick and a hand-drawn tick: not focusable,
                    not toggleable by keyboard, and invisible to a screen reader.
                    A real Checkbox inside a Label makes the whole sentence the
                    hit area and the accessible name, and the space bar works. */}
                <Label htmlFor="pkg-requiresRoom" className="sm:col-span-6" style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontWeight: 400, letterSpacing: 0, alignSelf: "start", minHeight: 46, marginTop: mob ? 0 : 26 }}>
                  <Checkbox
                    id="pkg-requiresRoom"
                    checked={form.requiresRoom}
                    onCheckedChange={(v) => setF("requiresRoom", v === true)}
                    className="size-[18px] rounded-[4px] border-2 data-[state=checked]:border-[#4caf50] data-[state=checked]:bg-[#4caf50] data-[state=checked]:text-white"
                  />
                  <span style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.5 }}>
                    <strong style={{ color: C.textH, fontWeight: 600 }}>Includes a room.</strong> The guest picks one room when booking; its rate is added to the package price, and the room is held for them.
                  </span>
                </Label>
                {setupProblem && <p role="alert" className="sm:col-span-12" style={{ color: C.dangerInk, fontSize: 12.5, margin: 0 }}>{setupProblem}</p>}
              </FormSection>

              <FormSection n={3} title="Price & discounts" hint="What guests pay, online and at the front desk." line={cBr} textH={C.textH} textS={C.textS}>
                <div className="sm:col-span-6">
                  <Label htmlFor="pkg-price" className={LABEL}>PRICE (₱)</Label>
                  <Input type="number" min={0} id="pkg-price" value={form.price} onChange={(e) => setF("price", e.target.value)} className="sw-input" style={inpS} />
                </div>
                {/* No "list price" box any more: the struck-through price guests
                    see is worked out from what Book Now charges for the same
                    thing (packageValue), so it can't claim a saving that isn't
                    real. What a guest pays for the same setup in Book Now,
                    where the pool, the venue or both can be booked freely. A
                    package should beat that, or offer something Book Now can't. */}
                {!setupProblem && (() => {
                  const v = packageValue({ resource: form.resource, status: form.status, slotMode: form.slotMode, capacity: Number(form.capacity) || 1, price });
                  const priced = form.price !== "";
                  return (
                    <div className="sm:col-span-6" style={{ fontSize: 12.5, lineHeight: 1.6, alignSelf: "center" }}>
                      {/* The rule: a package costs at least what Book Now charges
                          for the same setup, plus the extras it includes. A
                          cheaper copy of a Book Now setup only lowers the real
                          price, because guests would take it every time. */}
                      <p style={{ color: C.textS, margin: 0 }}>
                        The same setup in Book Now costs <strong style={{ color: C.goldInk }}>{fmt(v.diy)}</strong>.
                        {priced && price > v.diy && <> This package adds <strong style={{ color: C.textH }}>{fmt(price - v.diy)}</strong> for its extras; list them under Includes.</>}
                        {form.requiresRoom && <> The room the guest picks is added at its own rate, less any room discount below.</>}
                      </p>
                      {priced && v.save > 0 && (
                        <p style={{ color: "#f5a524", margin: "4px 0 0" }}>
                          This is {fmt(v.save)} cheaper than booking the same thing in Book Now, so guests may pick it just for the discount. Price it at {fmt(v.diy)} or more and add extras instead, unless the discount is a deliberate promo.
                        </p>
                      )}
                      {priced && price === v.diy && !form.requiresRoom && (
                        <p style={{ color: "#f5a524", margin: "4px 0 0" }}>
                          Guests can book exactly this in Book Now for the same price. Add extras Book Now can&apos;t give (setup, decorations, equipment, early access) and price them in, or it adds nothing.
                        </p>
                      )}
                    </div>
                  );
                })()}
                {/* Discounts: money off any part of the package, each with
                    its own end date. Charged at booking (online and walk-in)
                    and shown on the package's card. */}
                <div className="sm:col-span-12" style={{ border: `1px solid ${cBr}`, borderRadius: 10, padding: "14px 16px 2px" }}>
                  <p className={LABEL} style={{ margin: 0 }}>DISCOUNTS (OPTIONAL)</p>
                  <p style={{ color: C.textS, fontSize: 12.5, margin: "4px 0 4px", lineHeight: 1.5 }}>
                    Take money off any part of the package. Guests see the regular price struck through and pay the discounted one. Leave a row empty for no discount.
                  </p>
                  {discountReady === false && (
                    <p role="status" style={{ color: "#e0a050", background: "rgba(224,160,80,0.08)", border: "1px solid rgba(224,160,80,0.35)", borderRadius: 8, fontSize: 12.5, lineHeight: 1.6, padding: "10px 14px", margin: "8px 0" }}>
                      Discounts can&rsquo;t be saved yet: the database needs the migration
                      <code style={{ margin: "0 4px" }}>20261028140000_package_discount.sql</code>
                      run once in Supabase. The rest of the package still saves.
                    </p>
                  )}
                  {PARTS.map(dealRow)}
                </div>
              </FormSection>

              <FormSection n={4} title="On the guest's card" hint="What the Packages page shows. See it under Guest view." line={cBr} textH={C.textH} textS={C.textS}>
                <div className="sm:col-span-12">
                  <Label htmlFor="pkg-add-photo" className={LABEL}>PHOTOS</Label>
                  <PhotoSet
                    photos={form.photos}
                    captions={form.captions}
                    onChange={(photos, captions) => setForm((f) => ({ ...f, photos, captions }))}
                    noun="package"
                    idPrefix="pkg"
                    withCaptions
                  />
                </div>
                <div className="sm:col-span-12">
                  <Label htmlFor="pkg-blurb" className={LABEL}>SHORT DESCRIPTION</Label>
                  <p style={{ color: C.textS, fontSize: 12, margin: "0 0 8px" }}>
                    One or two sentences under the package title, on the card the guest sees.
                  </p>
                  <Textarea id="pkg-blurb" value={form.blurb} onChange={(e) => setF("blurb", e.target.value)} rows={2} className="sw-input" style={{ ...inpS }} />
                </div>
                <div className="sm:col-span-12">
                  <Label htmlFor="pkg-includes" className={LABEL}>INCLUDES (one per line)</Label>
                  <p style={{ color: C.textS, fontSize: 12, margin: "0 0 8px" }}>
                    The checklist on the card. Discounts above show on their own, so they don&apos;t need a line here.
                  </p>
                  <Textarea id="pkg-includes" value={form.includes} onChange={(e) => setF("includes", e.target.value)} rows={3} className="sw-input" style={{ ...inpS }} />
                </div>
                <div className="sm:col-span-12">
                  <Label htmlFor="pkg-note" className={LABEL}>EXTRA NOTE (optional)</Label>
                  <Input id="pkg-note" value={form.note} onChange={(e) => setF("note", e.target.value)} className="sw-input" style={inpS} />
                </div>
              </FormSection>

              <FormSection n={5} title="Visibility" hint="Hidden packages stay here and on past bookings." line={cBr} textH={C.textH} textS={C.textS}>
                <Label htmlFor="pkg-active" className="sm:col-span-12" style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontWeight: 400, letterSpacing: 0, minHeight: 46 }}>
                  <Checkbox
                    id="pkg-active"
                    checked={form.active}
                    onCheckedChange={(v) => setF("active", v === true)}
                    className="size-[18px] rounded-[4px] border-2 data-[state=checked]:border-[#4caf50] data-[state=checked]:bg-[#4caf50] data-[state=checked]:text-white"
                  />
                  <span style={{ color: C.textS, fontSize: 13.5 }}>Visible on the public Packages & Home pages</span>
                </Label>
              </FormSection>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button disabled={!form.title.trim() || !form.price || codeTaken || !!setupProblem || !dealsOk} onClick={savePkg}>
              {editPkg ? "Save changes" : "Add package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Delete Confirm — an AlertDialog: removing a package pulls it from the
          public Packages page, so it needs an explicit decision rather than a
          backdrop click. */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 18, fontWeight: 400 }}>
              Remove &quot;{confirmDelete?.title}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: C.textS, fontSize: 14.5 }}>
              This package will no longer appear on the Packages page or be bookable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ color: C.textS, borderColor: cBr, padding: "12px 16px", height: "auto", fontSize: 12.5, borderRadius: 6 }}>
              CANCEL
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDelete}
              style={{ background: "rgba(229,85,85,0.1)", color: C.dangerInk, border: "1px solid rgba(229,85,85,0.3)", padding: "12px 16px", height: "auto", fontSize: 12.5, borderRadius: 6, fontWeight: 700 }}
            >
              REMOVE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The price cards on Home ("Tours & Room Add-ons"). */}
      <HomeCardsEditor mob={mob} />
    </div>
  );
}
