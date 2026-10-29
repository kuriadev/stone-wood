"use client";

import { adminTabLabel } from "@/lib/labels";
import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import type { ResortPackage } from "@/types/package";
import type { BookingResource, BookingTier, PackageSlotMode } from "@/types/booking";
import { packageValue, packageSetupProblem, packageSetupLabel, sharedNotAllowed, packageCapacityLimit, PACKAGE_RESOURCE_LABEL, cleanPackageDiscount, packagePriceToday, promoUntilLabel, PACKAGE_DISCOUNT_MAX_PCT } from "@/lib/pricing";
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

interface PackagesTabProps {
  packages: ResortPackage[];
  setPackages: React.Dispatch<React.SetStateAction<ResortPackage[]>>;
  mob: boolean;
}

const RESOURCES: BookingResource[] = ["Pool", "Venue", "Pool+Venue"];
const STATUSES: BookingTier[] = ["Shared", "Exclusive"];

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

const BLANK_FORM = {
  code: "", title: "", resource: "Pool" as BookingResource, status: "Shared" as BookingTier,
  price: "", listPrice: "", capacity: "", requiresRoom: false, slotMode: "Single" as PackageSlotMode,
  cover: "", photos: [] as string[], captions: [] as string[], blurb: "", includes: "", note: "", active: true,
  discountType: "percent" as "percent" | "amount", discountValue: "", discountUntil: "",
};

export function PackagesTab({ packages, setPackages, mob }: PackagesTabProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();

  const [showModal, setShowModal] = useState(false);
  const [editPkg, setEditPkg] = useState<ResortPackage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ResortPackage | null>(null);
  const [form, setForm] = useState(BLANK_FORM);

  const cBg = isDark ? "var(--sw-bg)" : "#ffffff";
  const cBr = isDark ? "var(--sw-border)" : "#e4ddd1";
  /* Delete stays red in both themes, but #e55 is a pale red: it reads on the
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
  /* The promo as it will be saved, checked against the regular price. */
  const promoCheck = cleanPackageDiscount(
    form.discountValue.trim() ? { type: form.discountType, value: form.discountValue, until: form.discountUntil } : null,
    Number(form.price) || 0,
  );
  const promoPreview = promoCheck.ok && promoCheck.discount ? packagePriceToday({ price: Number(form.price) || 0, discount: promoCheck.discount }, today) : null;

  /* Whether the database can hold a promo yet (migration
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
      discountType: p.discount?.type ?? "percent",
      discountValue: p.discount ? String(p.discount.value) : "",
      discountUntil: p.discount?.until ?? "",
    });
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

  const savePkg = () => {
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
    const data: Omit<ResortPackage, "id" | "gallery"> = {
      code: effectiveCode,
      title: form.title.trim(),
      resource: form.resource,
      status: form.status,
      price: Number(form.price) || 0,
      listPrice: form.listPrice ? Number(form.listPrice) : undefined,
      capacity: Number(form.capacity) || 1,
      requiresRoom: form.requiresRoom || undefined,
      slotMode: form.slotMode,
      cover,
      blurb: form.blurb,
      includes: form.includes.split("\n").map((s) => s.trim()).filter(Boolean),
      note: form.note || undefined,
      active: form.active,
      discount: promoCheck.ok && promoCheck.discount ? promoCheck.discount : undefined,
    };
    if (editPkg) {
      setPackages((p) => p.map((x) => x.id === editPkg.id ? { ...x, ...data, gallery } : x));
      toast("Package updated.", "success");
    } else {
      setPackages((p) => [...p, { id: Date.now(), ...data, gallery }]);
      toast("Package added.", "success");
    }
    setShowModal(false);
  };
  const executeDelete = () => {
    if (!confirmDelete) return;
    setPackages((p) => p.filter((x) => x.id !== confirmDelete.id));
    toast(`"${confirmDelete.title}" removed from Packages.`, "warning");
    setConfirmDelete(null);
  };
  const toggleActive = (p: ResortPackage) => setPackages((ps) => ps.map((x) => x.id === p.id ? { ...x, active: !x.active } : x));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>RESORT PACKAGES</p>
          <h2 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>{adminTabLabel("Packages")}</h2>
          <p style={{ color: C.textS, fontSize: 13.5, margin: "8px 0 0" }}>Shown on the public Packages page and offered as deep links from Home and Walk-In.</p>
        </div>
        <button className="sw-btn" onClick={openAdd} style={{ ...goldBtn, padding: "12px 20px", fontSize: 12.5, letterSpacing: 2 }}>+ ADD PACKAGE</button>
      </div>

      {/* 1fr auto-rows equalises row heights on
          multi-column layouts (not mobile, which is one card per row), and each
          card is a column whose action row is pinned to the bottom. */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(280px,1fr))", gridAutoRows: mob ? "auto" : "1fr", gap: 16 }}>
        {packages.map((p) => (
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
                <Badge variant="outline" style={{ fontSize: 10.5, color: C.goldInk, border: `1px solid ${gold}55`, borderRadius: 20, padding: "4px 8px" }}>{p.slotMode === "WholeDay" ? "STAYCATION" : "DAY OR NIGHT"}</Badge>
                {p.requiresRoom && <Badge variant="outline" style={{ fontSize: 10.5, color: C.goldInk, border: `1px solid ${gold}55`, borderRadius: 20, padding: "4px 8px" }}>ROOM INCLUDED</Badge>}
                {(() => {
                  const t = packagePriceToday(p, today);
                  if (t.badge) return <Badge variant="outline" style={{ fontSize: 10.5, color: "#e2574c", border: "1px solid rgba(226,87,76,0.45)", borderRadius: 20, padding: "4px 8px" }}>{t.badge}{t.until ? ` · ${promoUntilLabel(t.until).replace("until ", "TO ").toUpperCase()}` : ""}</Badge>;
                  if (p.discount) return <Badge variant="outline" style={{ fontSize: 10.5, color: C.textS, border: `1px solid ${cBr}`, borderRadius: 20, padding: "4px 8px" }}>PROMO ENDED</Badge>;
                  return null;
                })()}
                <Badge variant="outline" style={{ fontSize: 10.5, color: C.textS, border: `1px solid ${cBr}`, borderRadius: 20, padding: "4px 8px" }}>Cap {p.capacity}</Badge>
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
      </div>

      {/* Add/Edit Modal */}
      {/* Edit / add package. The most detail-dense form in the admin, so it is
          LANDSCAPE: a wide dialog with a two-column grid instead of the single
          scrolling column it used to be. Long fields (blurb, includes, photo)
          span both columns. */}
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

          {/* One 12-column grid, and every field states its own span.
              Before this the form was a 2-column grid with SUB-grids nested
              inside single columns -- RESOURCE and TIER shared one half, the
              three price fields shared the other -- so nothing lined up
              across rows and the leftover space read as random gaps. */}
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-12">

              <div className="sm:col-span-6">
                <Label htmlFor="pkg-title" className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">TITLE</Label>
                <Input id="pkg-title" value={form.title} onChange={(e) => setF("title", e.target.value)} placeholder="Pool + Room Package" className="sw-input" style={inpS} />
              </div>
              {/* The code had form state, was saved and was read back on edit,
                  but no field ever showed it -- so it could only ever be the
                  title in capitals, and an admin could not tell what a booking
                  would end up referencing. */}
              <div className="sm:col-span-6">
                <Label htmlFor="pkg-code" className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">CODE</Label>
                <Input
                  id="pkg-code"
                  value={form.code}
                  onChange={(e) => setF("code", e.target.value)}
                  placeholder={form.title.trim() ? normCode(form.title) : "POOL-ROOM-PACKAGE"}
                  className="sw-input"
                  style={{ ...inpS, ...(codeTaken ? { borderColor: "#e55" } : {}) }}
                  aria-describedby="pkg-code-hint"
                  aria-invalid={codeTaken || undefined}
                />
                <p id="pkg-code-hint" style={{ color: codeTaken ? C.dangerInk : C.textS, fontSize: 12, margin: "4px 0 0", lineHeight: 1.6 }}>
                  {codeTaken
                    ? `Another package already uses ${effectiveCode}. Codes must be unique.`
                    : editPkg
                      ? `Saved as ${effectiveCode || "\u2014"}. Bookings already placed reference the old code, so change it only if you mean to.`
                      : `Saved as ${effectiveCode || "\u2014"}. Leave it blank to build it from the title.`}
                </p>
              </div>
              {/* What the package books. Each of these is enforced when a
                  guest books it (lib/bookingQuote.ts): the package's own
                  pool access, what it covers, when, its capacity and its
                  room rule replace anything the browser sends. */}
              <div className="sm:col-span-6">
                <Label htmlFor="pkg-resource" className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">WHAT GUESTS BOOK</Label>
                <FullSelect id="pkg-resource" value={form.resource} onChange={(e) => setSetup({ resource: e.target.value as BookingResource })} className="sw-input" style={selS}>
                  {RESOURCES.map((r) => <option key={r} value={r}>{PACKAGE_RESOURCE_LABEL[r]}</option>)}
                </FullSelect>
              </div>
              <div className="sm:col-span-6">
                <Label htmlFor="pkg-when" className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">WHEN</Label>
                <FullSelect id="pkg-when" value={form.slotMode} onChange={(e) => setSetup({ slotMode: e.target.value as PackageSlotMode })} className="sw-input" style={selS}>
                  <option value="Single">Day or Night — guest picks ({SLOTS.Day.hours} / {SLOTS.Night.hours})</option>
                  <option value="WholeDay">Staycation ({SLOTS.WholeDay.hours})</option>
                </FullSelect>
              </div>
              <div className="sm:col-span-12">
                <p id="pkg-tier-label" className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink" style={{ margin: "0 0 8px" }}>POOL ACCESS</p>
                <div role="radiogroup" aria-labelledby="pkg-tier-label" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                            ? "Other groups can book the pool on the same tour; this package takes its capacity in places."
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
                <div>
                  <Label htmlFor="pkg-price" className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">PRICE (₱)</Label>
                  <Input type="number" min={0} id="pkg-price" value={form.price} onChange={(e) => setF("price", e.target.value)} className="sw-input" style={inpS} />
                </div>
              </div>
              {/* No "list price" box any more: the struck-through price guests
                  see is worked out from what Book Now charges for the same
                  thing (packageValue), so it can't claim a saving that isn't
                  real. */}
              <div className="sm:col-span-6">
                <div>
                  <Label htmlFor="pkg-capacity" className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">GUEST CAPACITY</Label>
                  <Input type="number" min={1} max={packageCapacityLimit(form.resource)} id="pkg-capacity" value={form.capacity} onChange={(e) => setF("capacity", e.target.value)} className="sw-input" style={inpS} />
                  <p style={{ color: C.textS, fontSize: 12, margin: "4px 0 0", lineHeight: 1.5 }}>
                    {form.status === "Shared" && form.resource !== "Venue"
                      ? `Guests the package covers. They take that many of the ${RESORT_MAX_CAPACITY} shared places on the tour.`
                      : `Most guests the group can bring, up to ${packageCapacityLimit(form.resource)}${form.resource === "Venue" ? ", what the events venue holds" : ""}.`}
                  </p>
                </div>
              </div>
              {/* What a guest pays for the same setup in Book Now, where the
                  pool, the venue or both can be booked freely. A package
                  should beat that, or offer something Book Now can't. */}
              {(() => {
                if (setupProblem) return <p role="alert" className="sm:col-span-12" style={{ color: C.dangerInk, fontSize: 12.5, margin: 0 }}>{setupProblem}</p>;
                const price = Number(form.price);
                const v = packageValue({ resource: form.resource, status: form.status, slotMode: form.slotMode, capacity: Number(form.capacity) || 1, price });
                const priced = form.price !== "";
                return (
                  <div className="sm:col-span-12" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    {/* The rule: a package costs at least what Book Now charges
                        for the same setup, plus the extras it includes. A
                        cheaper copy of a Book Now setup only lowers the real
                        price, because guests would take it every time. */}
                    <p style={{ color: C.textS, margin: 0 }}>
                      The same setup in Book Now costs <strong style={{ color: C.goldInk }}>{fmt(v.diy)}</strong>.
                      {priced && price > v.diy && <> This package adds <strong style={{ color: C.textH }}>{fmt(price - v.diy)}</strong> for its extras; list them under Includes.</>}
                      {form.requiresRoom && <> The room the guest picks is added at its own rate.</>}
                    </p>
                    {priced && v.save > 0 && (
                      <p style={{ color: "#f5c518", margin: "4px 0 0" }}>
                        This is {fmt(v.save)} cheaper than booking the same thing in Book Now, so guests may pick it just for the discount. Price it at {fmt(v.diy)} or more and add extras instead, unless the discount is a deliberate promo.
                      </p>
                    )}
                    {priced && price === v.diy && !form.requiresRoom && (
                      <p style={{ color: "#f5c518", margin: "4px 0 0" }}>
                        Guests can book exactly this in Book Now for the same price. Add extras Book Now can&apos;t give (setup, decorations, equipment, early access) and price them in, or it adds nothing.
                      </p>
                    )}
                  </div>
                );
              })()}
              {/* A promo: money off the regular price, optionally until a
                  date. Charged at booking (online and walk-in), shown on the
                  package as the regular price struck through. */}
              <div className="sm:col-span-12" style={{ border: `1px solid ${cBr}`, borderRadius: 10, padding: 16 }}>
                <p className="mb-1 block text-[11.5px] tracking-[2px] text-accent-ink" style={{ margin: 0 }}>PROMO DISCOUNT (OPTIONAL)</p>
                <p style={{ color: C.textS, fontSize: 12.5, margin: "4px 0 12px", lineHeight: 1.5 }}>
                  Guests see the price above struck through and pay the promo price instead, online and at the front desk. Leave the amount empty for no promo.
                </p>
                {discountReady === false && (
                  <p role="status" style={{ color: "#e0a050", background: "rgba(224,160,80,0.08)", border: "1px solid rgba(224,160,80,0.35)", borderRadius: 8, fontSize: 12.5, lineHeight: 1.6, padding: "10px 14px", margin: "0 0 12px" }}>
                    Promos can&rsquo;t be saved yet: the database needs the migration
                    <code style={{ margin: "0 4px" }}>20261028140000_package_discount.sql</code>
                    run once in Supabase. The rest of the package still saves.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <p id="pkg-disc-type" style={{ color: C.textXS, fontSize: 10.5, letterSpacing: 2, margin: "0 0 6px" }}>TAKE OFF</p>
                    <div role="radiogroup" aria-labelledby="pkg-disc-type" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {(["percent", "amount"] as const).map((k) => {
                        const on = form.discountType === k;
                        return (
                          <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setF("discountType", k)}
                            style={{ height: 40, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, border: `1px solid ${on ? gold : cBr}`, background: on ? `${gold}14` : "transparent", color: on ? C.goldInk : C.textS }}>
                            {k === "percent" ? "% off" : "₱ off"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="sm:col-span-4">
                    <Label htmlFor="pkg-disc-value" style={{ display: "block", color: C.textXS, fontSize: 10.5, letterSpacing: 2, marginBottom: 6 }}>
                      {form.discountType === "percent" ? `PERCENT (1-${PACKAGE_DISCOUNT_MAX_PCT})` : "PESOS OFF"}
                    </Label>
                    <Input id="pkg-disc-value" type="number" min={1} max={form.discountType === "percent" ? PACKAGE_DISCOUNT_MAX_PCT : undefined}
                      value={form.discountValue} onChange={(e) => setF("discountValue", e.target.value)}
                      placeholder={form.discountType === "percent" ? "e.g. 20" : "e.g. 500"} className="sw-input" style={inpS} />
                  </div>
                  <div className="sm:col-span-4">
                    <Label htmlFor="pkg-disc-until" style={{ display: "block", color: C.textXS, fontSize: 10.5, letterSpacing: 2, marginBottom: 6 }}>LAST DAY (OPTIONAL)</Label>
                    <Input id="pkg-disc-until" type="date" min={today} value={form.discountUntil} onChange={(e) => setF("discountUntil", e.target.value)} className="sw-input" style={inpS} />
                  </div>
                </div>
                <p role={promoCheck.ok ? undefined : "alert"} style={{ fontSize: 12.5, margin: "10px 0 0", lineHeight: 1.6, color: promoCheck.ok ? C.textS : C.dangerInk }}>
                  {!promoCheck.ok
                    ? promoCheck.error
                    : promoPreview && promoPreview.off > 0
                      ? <>Guests pay <strong style={{ color: C.goldInk }}>{fmt(promoPreview.pay)}</strong> instead of {fmt(promoPreview.regular)} ({promoPreview.badge}){promoPreview.until ? `, ${promoUntilLabel(promoPreview.until)}` : ", until you remove it"}. After that, the regular price.</>
                      : promoCheck.ok && promoCheck.discount && promoCheck.discount.until && promoCheck.discount.until < today
                        ? "That last day has passed, so guests pay the regular price."
                        : "No promo: guests pay the price above."}
                </p>
              </div>
              <div className="sm:col-span-12">
                <Label htmlFor="pkg-add-photo" className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">PHOTOS</Label>
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
                <Label htmlFor="pkg-blurb" className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">SHORT DESCRIPTION</Label>
                <p style={{ color: C.textS, fontSize: 12, margin: "0 0 8px" }}>
                  One or two sentences under the package title, on the card the guest sees.
                </p>
                <Textarea id="pkg-blurb" value={form.blurb} onChange={(e) => setF("blurb", e.target.value)} rows={2} className="sw-input" style={{ ...inpS, resize: "none" }} />
              </div>
              <div className="sm:col-span-12">
                <Label htmlFor="pkg-includes" className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">INCLUDES (one per line)</Label>
                <Textarea id="pkg-includes" value={form.includes} onChange={(e) => setF("includes", e.target.value)} rows={3} className="sw-input" style={{ ...inpS, resize: "none" }} />
              </div>
              <div className="sm:col-span-6">
                <Label htmlFor="pkg-note" className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">EXTRA NOTE (optional)</Label>
                <Input id="pkg-note" value={form.note} onChange={(e) => setF("note", e.target.value)} className="sw-input" style={inpS} />
              </div>
              {/* Was a div with onClick and a hand-drawn tick: not focusable,
                  not toggleable by keyboard, and invisible to a screen reader.
                  A real Checkbox inside a Label makes the whole sentence the
                  hit area and the accessible name, and the space bar works. */}
              <Label htmlFor="pkg-requiresRoom" className="sm:col-span-6" style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontWeight: 400, letterSpacing: 0, alignSelf: "end", minHeight: 46 }}>
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
              {/* Was a div with onClick and a hand-drawn tick: not focusable,
                  not toggleable by keyboard, and invisible to a screen reader.
                  A real Checkbox inside a Label makes the whole sentence the
                  hit area and the accessible name, and the space bar works. */}
              <Label htmlFor="pkg-active" className="sm:col-span-12" style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontWeight: 400, letterSpacing: 0, minHeight: 46 }}>
                <Checkbox
                  id="pkg-active"
                  checked={form.active}
                  onCheckedChange={(v) => setF("active", v === true)}
                  className="size-[18px] rounded-[4px] border-2 data-[state=checked]:border-[#4caf50] data-[state=checked]:bg-[#4caf50] data-[state=checked]:text-white"
                />
                <span style={{ color: C.textS, fontSize: 13.5 }}>Visible on the public Packages & Home pages</span>
              </Label>
            </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button disabled={!form.title.trim() || !form.price || codeTaken || !!setupProblem || !promoCheck.ok} onClick={savePkg}>
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
