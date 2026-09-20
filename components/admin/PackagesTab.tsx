"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import type { ResortPackage } from "@/types/package";
import type { BookingResource, BookingTier } from "@/types/booking";

interface PackagesTabProps {
  packages: ResortPackage[];
  setPackages: React.Dispatch<React.SetStateAction<ResortPackage[]>>;
  mob: boolean;
}

const RESOURCES: BookingResource[] = ["Pool", "Venue", "Pool+Venue"];
const STATUSES: BookingTier[] = ["Shared", "Exclusive"];

const BLANK_FORM = {
  code: "", title: "", resource: "Pool" as BookingResource, status: "Shared" as BookingTier,
  price: "", listPrice: "", capacity: "", requiresRoom: false, foodDiscountPct: "",
  cover: "", blurb: "", includes: "", foodNote: "", note: "", active: true,
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
      capacity: String(p.capacity), requiresRoom: !!p.requiresRoom,
      foodDiscountPct: p.foodDiscountPct ? String(p.foodDiscountPct) : "",
      cover: p.cover, blurb: p.blurb, includes: p.includes.join("\n"),
      foodNote: p.foodNote, note: p.note ?? "", active: p.active,
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
      foodDiscountPct: form.foodDiscountPct ? Number(form.foodDiscountPct) : undefined,
      cover: form.cover || "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80",
      blurb: form.blurb,
      includes: form.includes.split("\n").map((s) => s.trim()).filter(Boolean),
      foodNote: form.foodNote,
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
          <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>RESORT PACKAGES</p>
          <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Packages</h2>
          <p style={{ color: C.textS, fontSize: 12, margin: "6px 0 0" }}>Shown on the public Packages page and offered as deep links from Home and Walk-In.</p>
        </div>
        <button onClick={openAdd} style={{ ...goldBtn, padding: "10px 20px", fontSize: 11, letterSpacing: 2 }}>+ ADD PACKAGE</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
        {packages.map((p) => (
          <div key={p.id} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, overflow: "hidden", opacity: p.active ? 1 : 0.55 }}>
            <div style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.cover} alt={p.title} style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
              <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.55)", color: gold, fontSize: 9, padding: "3px 8px", borderRadius: 20, letterSpacing: 1 }}>{p.status} · {p.resource}</span>
              {!p.active && <span style={{ position: "absolute", top: 8, right: 8, background: "rgba(200,60,60,0.85)", color: "#fff", fontSize: 9, padding: "3px 8px", borderRadius: 20, letterSpacing: 1 }}>HIDDEN</span>}
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <h4 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 15, fontWeight: 400, margin: 0 }}>{p.title}</h4>
                <span style={{ color: gold, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>{fmt(p.price)}</span>
              </div>
              <p style={{ color: C.textS, fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>{p.blurb}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {p.requiresRoom && <span style={{ fontSize: 9, color: gold, border: `1px solid ${gold}55`, borderRadius: 20, padding: "2px 7px" }}>ROOM REQUIRED</span>}
                {p.foodDiscountPct && <span style={{ fontSize: 9, color: gold, border: `1px solid ${gold}55`, borderRadius: 20, padding: "2px 7px" }}>{Math.round(p.foodDiscountPct * 100)}% FOOD OFF</span>}
                <span style={{ fontSize: 9, color: C.textS, border: `1px solid ${cBr}`, borderRadius: 20, padding: "2px 7px" }}>Cap {p.capacity}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => toggleActive(p)} style={{ ...outBtn, flex: 1, padding: "7px 10px", fontSize: 10, letterSpacing: 1 }}>{p.active ? "HIDE" : "SHOW"}</button>
                <button onClick={() => openEdit(p)} style={{ ...outBtn, flex: 1, padding: "7px 10px", fontSize: 10, letterSpacing: 1 }}>EDIT</button>
                <button onClick={() => setConfirmDelete(p)} style={{ background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "7px 10px", fontSize: 10, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>DEL</button>
              </div>
            </div>
          </div>
        ))}
        {packages.length === 0 && (
          <p style={{ color: C.textXS, fontSize: 13, gridColumn: "1/-1", textAlign: "center", padding: "32px 0" }}>No packages yet.</p>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20, overflowY: "auto" }} role="dialog" aria-modal="true">
          <div style={{ background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: `1px solid ${cBr}`, borderRadius: 12, padding: "28px 26px", width: "100%", maxWidth: 480, boxShadow: "0 40px 100px rgba(0,0,0,0.7)", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 18 }}>{editPkg ? "Edit Package" : "Add Package"}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>TITLE</label>
                <input value={form.title} onChange={(e) => setF("title", e.target.value)} placeholder="Pool + Room Package" className="sw-input" style={inpS} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>RESOURCE</label>
                  <select value={form.resource} onChange={(e) => setF("resource", e.target.value as BookingResource)} className="sw-input" style={inpS}>
                    {RESOURCES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>TIER</label>
                  <select value={form.status} onChange={(e) => setF("status", e.target.value as BookingTier)} className="sw-input" style={inpS}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>PRICE (₱)</label>
                  <input type="number" min={0} value={form.price} onChange={(e) => setF("price", e.target.value)} className="sw-input" style={inpS} />
                </div>
                <div>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>LIST PRICE</label>
                  <input type="number" min={0} value={form.listPrice} onChange={(e) => setF("listPrice", e.target.value)} placeholder="optional" className="sw-input" style={inpS} />
                </div>
                <div>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>CAPACITY</label>
                  <input type="number" min={1} value={form.capacity} onChange={(e) => setF("capacity", e.target.value)} className="sw-input" style={inpS} />
                </div>
              </div>
              <div>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>PHOTO</label>
                <input type="file" accept="image/*" onChange={handleImg} className="sw-input" style={inpS} />
                {form.cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.cover} alt="" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6, marginTop: 8 }} />
                )}
              </div>
              <div>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>BLURB</label>
                <textarea value={form.blurb} onChange={(e) => setF("blurb", e.target.value)} rows={2} className="sw-input" style={{ ...inpS, resize: "none" }} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>INCLUDES (one per line)</label>
                <textarea value={form.includes} onChange={(e) => setF("includes", e.target.value)} rows={3} className="sw-input" style={{ ...inpS, resize: "none" }} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>FOOD NOTE</label>
                <input value={form.foodNote} onChange={(e) => setF("foodNote", e.target.value)} className="sw-input" style={inpS} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>EXTRA NOTE (optional)</label>
                <input value={form.note} onChange={(e) => setF("note", e.target.value)} className="sw-input" style={inpS} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>FOOD DISCOUNT % (0–1, optional)</label>
                <input type="number" step="0.01" min={0} max={1} value={form.foodDiscountPct} onChange={(e) => setF("foodDiscountPct", e.target.value)} placeholder="e.g. 0.08 for 8%" className="sw-input" style={inpS} />
              </div>
              <div onClick={() => setF("requiresRoom", !form.requiresRoom)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${form.requiresRoom ? "#4caf50" : cBr}`, background: form.requiresRoom ? "#4caf50" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {form.requiresRoom && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
                </div>
                <span style={{ color: C.textS, fontSize: 12 }}>Guest must pick ONE room at checkout (price can't be fixed without it)</span>
              </div>
              <div onClick={() => setF("active", !form.active)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${form.active ? "#4caf50" : cBr}`, background: form.active ? "#4caf50" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {form.active && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
                </div>
                <span style={{ color: C.textS, fontSize: 12 }}>Visible on the public Packages & Home pages</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "11px 16px", fontSize: 11, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>CANCEL</button>
              <button disabled={!form.title.trim() || !form.price} onClick={savePkg} style={{ ...goldBtn, flex: 2, borderRadius: 6, opacity: !form.title.trim() || !form.price ? 0.4 : 1 }}>SAVE</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20 }} role="dialog" aria-modal="true">
          <div style={{ background: isDark ? "#0d0d0d" : "#fff", border: "1px solid rgba(229,85,85,0.3)", borderRadius: 8, padding: "28px 26px", width: "100%", maxWidth: 380 }}>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 17, fontWeight: 400, marginBottom: 10 }}>Remove "{confirmDelete.title}"?</h3>
            <p style={{ color: C.textS, fontSize: 13, marginBottom: 20 }}>This package will no longer appear on the Packages page or be bookable.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "10px 16px", fontSize: 11, cursor: "pointer", borderRadius: 6 }}>CANCEL</button>
              <button onClick={executeDelete} style={{ flex: 1, background: "rgba(229,85,85,0.1)", color: "#e55", border: "1px solid rgba(229,85,85,0.3)", padding: "10px 16px", fontSize: 11, cursor: "pointer", borderRadius: 6, fontWeight: 700 }}>REMOVE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
