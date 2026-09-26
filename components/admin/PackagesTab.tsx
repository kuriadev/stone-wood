"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import type { ResortPackage } from "@/types/package";
import type { BookingResource, BookingTier, PackageSlotMode } from "@/types/booking";
import { pricingProblem, standardPackagePrice } from "@/lib/pricing";
import { SLOTS } from "@/lib/resort";
import { Icon } from "@/components/common/Icon";
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
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface PackagesTabProps {
  packages: ResortPackage[];
  setPackages: React.Dispatch<React.SetStateAction<ResortPackage[]>>;
  mob: boolean;
}

const RESOURCES: BookingResource[] = ["Pool", "Venue", "Pool+Venue"];
const STATUSES: BookingTier[] = ["Shared", "Exclusive"];

const BLANK_FORM = {
  code: "", title: "", resource: "Pool" as BookingResource, status: "Shared" as BookingTier,
  price: "", listPrice: "", capacity: "", requiresRoom: false, slotMode: "Single" as PackageSlotMode,
  cover: "", blurb: "", includes: "", note: "", active: true,
};

export function PackagesTab({ packages, setPackages, mob }: PackagesTabProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();

  const [showModal, setShowModal] = useState(false);
  const [editPkg, setEditPkg] = useState<ResortPackage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ResortPackage | null>(null);
  const [form, setForm] = useState(BLANK_FORM);

  const cBg = isDark ? "#0c0b09" : "#ffffff";
  const cBr = isDark ? "#1a1714" : "#e4ddd1";
  const inpS: React.CSSProperties = { ...C.inp, borderRadius: 6 };
  const setF = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditPkg(null);
    setForm(BLANK_FORM);
    setShowModal(true);
  };
  const openEdit = (p: ResortPackage) => {
    setEditPkg(p);
    setForm({
      code: p.code, title: p.title, resource: p.resource, status: p.status,
      price: String(p.price), listPrice: p.listPrice ? String(p.listPrice) : "",
      capacity: String(p.capacity), requiresRoom: !!p.requiresRoom, slotMode: p.slotMode ?? "Single",
      cover: p.cover, blurb: p.blurb, includes: p.includes.join("\n"),
      note: p.note ?? "", active: p.active,
    });
    setShowModal(true);
  };
  const handleImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = (ev) => setF("cover", ev.target?.result as string);
    rd.readAsDataURL(f);
  };

  const savePkg = () => {
    const data: Omit<ResortPackage, "id" | "gallery"> = {
      code: form.code.trim() || form.title.trim().toUpperCase().replace(/\s+/g, "-"),
      title: form.title.trim(),
      resource: form.resource,
      status: form.status,
      price: Number(form.price) || 0,
      listPrice: form.listPrice ? Number(form.listPrice) : undefined,
      capacity: Number(form.capacity) || 1,
      requiresRoom: form.requiresRoom || undefined,
      slotMode: form.slotMode,
      cover: form.cover || "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80",
      blurb: form.blurb,
      includes: form.includes.split("\n").map((s) => s.trim()).filter(Boolean),
      note: form.note || undefined,
      active: form.active,
    };
    if (editPkg) {
      setPackages((p) => p.map((x) => x.id === editPkg.id ? { ...x, ...data, gallery: x.gallery } : x));
      toast("Package updated.", "success");
    } else {
      setPackages((p) => [...p, { id: Date.now(), ...data, gallery: [] }]);
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
          <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Packages</h2>
          <p style={{ color: C.textS, fontSize: 13.5, margin: "6px 0 0" }}>Shown on the public Packages page and offered as deep links from Home and Walk-In.</p>
        </div>
        <button onClick={openAdd} style={{ ...goldBtn, padding: "10px 20px", fontSize: 12.5, letterSpacing: 2 }}>+ ADD PACKAGE</button>
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
              <Badge variant="outline" style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.55)", color: gold, fontSize: 10.5, padding: "3px 8px", borderRadius: 20, letterSpacing: 1 }}>{p.status} · {p.resource}</Badge>
              {!p.active && <Badge variant="outline" style={{ position: "absolute", top: 8, right: 8, background: "rgba(200,60,60,0.85)", color: "#fff", fontSize: 10.5, padding: "3px 8px", borderRadius: 20, letterSpacing: 1 }}>HIDDEN</Badge>}
            </div>
            <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <h4 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 16, fontWeight: 400, margin: 0 }}>{p.title}</h4>
                <span style={{ color: gold, fontWeight: 700, fontSize: 14.5, whiteSpace: "nowrap" }}>{fmt(p.price)}</span>
              </div>
              <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.5, marginBottom: 8 }}>{p.blurb}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <Badge variant="outline" style={{ fontSize: 10.5, color: gold, border: `1px solid ${gold}55`, borderRadius: 20, padding: "2px 7px" }}>{p.slotMode === "WholeDay" ? "WHOLE DAY" : "DAY OR NIGHT"}</Badge>
                {p.requiresRoom && <Badge variant="outline" style={{ fontSize: 10.5, color: gold, border: `1px solid ${gold}55`, borderRadius: 20, padding: "2px 7px" }}>ROOM REQUIRED</Badge>}
                <Badge variant="outline" style={{ fontSize: 10.5, color: C.textS, border: `1px solid ${cBr}`, borderRadius: 20, padding: "2px 7px" }}>Cap {p.capacity}</Badge>
              </div>
              {/* marginTop:auto — blurb length and the badge row (ROOM REQUIRED,
                  Cap) vary per package, which left these buttons 20px
                  apart between neighbouring cards. */}
              <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 4 }}>
                <button onClick={() => toggleActive(p)} style={{ ...outBtn, flex: 1, padding: "7px 10px", fontSize: 11.5, letterSpacing: 1 }}>{p.active ? "HIDE" : "SHOW"}</button>
                <button onClick={() => openEdit(p)} style={{ ...outBtn, flex: 1, padding: "7px 10px", fontSize: 11.5, letterSpacing: 1 }}>EDIT</button>
                <button onClick={() => setConfirmDelete(p)} style={{ background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "7px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>DEL</button>
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
            <DialogTitle style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 400, fontSize: 22 }}>
              {editPkg ? "Edit Package" : "Add Package"}
            </DialogTitle>
            <DialogDescription>
              Shown on the public Packages page and offered as deep links from Home.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2 [&>div:has(textarea)]:sm:col-span-2 [&>div:has(input[type=file])]:sm:col-span-2">

              <div>
                <Label className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">TITLE</Label>
                <Input value={form.title} onChange={(e) => setF("title", e.target.value)} placeholder="Pool + Room Package" className="sw-input" style={inpS} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <Label className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">RESOURCE</Label>
                  <NativeSelect value={form.resource} onChange={(e) => setF("resource", e.target.value as BookingResource)} className="sw-input" style={inpS}>
                    {RESOURCES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </NativeSelect>
                </div>
                <div>
                  <Label className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">TIER</Label>
                  <NativeSelect value={form.status} onChange={(e) => setF("status", e.target.value as BookingTier)} className="sw-input" style={inpS}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </NativeSelect>
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">WHEN</Label>
                <NativeSelect value={form.slotMode} onChange={(e) => setF("slotMode", e.target.value as PackageSlotMode)} className="sw-input" style={inpS}>
                  <option value="Single">Day or Night — guest picks ({SLOTS.Day.hours} / {SLOTS.Night.hours})</option>
                  <option value="WholeDay">Whole Day ({SLOTS.WholeDay.hours})</option>
                </NativeSelect>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <Label className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">PRICE (₱)</Label>
                  <Input type="number" min={0} value={form.price} onChange={(e) => setF("price", e.target.value)} className="sw-input" style={inpS} />
                </div>
                <div>
                  <Label className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">LIST PRICE</Label>
                  <Input type="number" min={0} value={form.listPrice} onChange={(e) => setF("listPrice", e.target.value)} placeholder="optional" className="sw-input" style={inpS} />
                </div>
                <div>
                  <Label className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">CAPACITY</Label>
                  <Input type="number" min={1} value={form.capacity} onChange={(e) => setF("capacity", e.target.value)} className="sw-input" style={inpS} />
                </div>
              </div>
              {/* What the standard rules give for this setup, so a promo
                  price is a deliberate choice — never an accident that makes
                  the package dearer than booking the same thing by hand. */}
              {(() => {
                const problem = pricingProblem(form.resource, form.status, form.slotMode === "WholeDay" ? "WholeDay" : "Day");
                if (problem) return <p style={{ color: "#e55", fontSize: 12.5, margin: 0 }}>⚠ {problem}</p>;
                const std = standardPackagePrice({ resource: form.resource, tier: form.status, slotMode: form.slotMode, capacity: Number(form.capacity) || 1 });
                const price = Number(form.price);
                return (
                  <p style={{ color: C.textS, fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
                    Standard price for this setup: <strong style={{ color: gold }}>{fmt(std.price)}</strong>
                    {std.listPrice > std.price ? <> (regular {fmt(std.listPrice)})</> : null}
                    {" "}<button type="button" onClick={() => { setF("price", String(std.price)); setF("listPrice", std.listPrice > std.price ? String(std.listPrice) : ""); }} style={{ background: "none", border: "none", color: gold, cursor: "pointer", textDecoration: "underline", fontSize: 12.5, padding: 0 }}>use it</button>
                    {form.price !== "" && price > std.price && <span style={{ color: "#f5c518" }}> · Your price is higher than booking this without the package.</span>}
                  </p>
                );
              })()}
              <div>
                <Label className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">PHOTO</Label>
                <Input type="file" accept="image/*" onChange={handleImg} className="sw-input" style={inpS} />
                {form.cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" decoding="async" src={form.cover} alt="" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6, marginTop: 8 }} />
                )}
              </div>
              <div>
                <Label className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">BLURB</Label>
                <Textarea value={form.blurb} onChange={(e) => setF("blurb", e.target.value)} rows={2} className="sw-input" style={{ ...inpS, resize: "none" }} />
              </div>
              <div>
                <Label className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">INCLUDES (one per line)</Label>
                <Textarea value={form.includes} onChange={(e) => setF("includes", e.target.value)} rows={3} className="sw-input" style={{ ...inpS, resize: "none" }} />
              </div>
              <div>
                <Label className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">EXTRA NOTE (optional)</Label>
                <Input value={form.note} onChange={(e) => setF("note", e.target.value)} className="sw-input" style={inpS} />
              </div>
              {/* Was a div with onClick and a hand-drawn tick: not focusable,
                  not toggleable by keyboard, and invisible to a screen reader.
                  A real Checkbox inside a Label makes the whole sentence the
                  hit area and the accessible name, and the space bar works. */}
              <Label htmlFor="pkg-requiresRoom" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 400, letterSpacing: 0 }}>
                <Checkbox
                  id="pkg-requiresRoom"
                  checked={form.requiresRoom}
                  onCheckedChange={(v) => setF("requiresRoom", v === true)}
                  className="size-[18px] rounded-[4px] border-2 data-[state=checked]:border-[#4caf50] data-[state=checked]:bg-[#4caf50] data-[state=checked]:text-white"
                />
                <span style={{ color: C.textS, fontSize: 13.5 }}>Guest must pick ONE room at checkout (price can't be fixed without it)</span>
              </Label>
              {/* Was a div with onClick and a hand-drawn tick: not focusable,
                  not toggleable by keyboard, and invisible to a screen reader.
                  A real Checkbox inside a Label makes the whole sentence the
                  hit area and the accessible name, and the space bar works. */}
              <Label htmlFor="pkg-active" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 400, letterSpacing: 0 }}>
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
            <Button disabled={!form.title.trim() || !form.price} onClick={savePkg}>
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
            <AlertDialogTitle style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, fontWeight: 400 }}>
              Remove &quot;{confirmDelete?.title}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: C.textS, fontSize: 14.5 }}>
              This package will no longer appear on the Packages page or be bookable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ color: C.textS, borderColor: cBr, padding: "10px 16px", height: "auto", fontSize: 12.5, borderRadius: 6 }}>
              CANCEL
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDelete}
              style={{ background: "rgba(229,85,85,0.1)", color: "#e55", border: "1px solid rgba(229,85,85,0.3)", padding: "10px 16px", height: "auto", fontSize: 12.5, borderRadius: 6, fontWeight: 700 }}
            >
              REMOVE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
