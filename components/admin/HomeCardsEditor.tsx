"use client";

// ── Home page price cards ("Tours & Room Add-ons"), as staff edit them
//
// Starts from what Home shows now: the saved cards, or the automatic ones
// built from Rates & Settings. Edit, add, remove and reorder, then Save.
// "Reset to automatic" drops the saved cards so Home follows Rates &
// Settings again. See lib/homeCards.ts.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { useApp } from "@/contexts/AppContext";
import { useHomeCards } from "@/hooks/useHomeCards";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import {
  automaticHomeCards, validateHomeCards, HOME_CARD_ICONS, HOME_CARD_LINKS, HOME_CARDS_MAX, HOME_CARD_LIMITS as L,
  type HomeCard, type HomeCardIcon, type HomeCardLink,
} from "@/lib/homeCards";
import { Icon } from "@/components/common/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** The editor's copy of a card: details as one textarea, a line each. */
type Draft = Omit<HomeCard, "details" | "button"> & { detailsText: string; buttonLabel: string; buttonLink: HomeCardLink | "" };

const toDraft = (c: HomeCard): Draft => ({
  id: c.id, icon: c.icon, title: c.title, description: c.description, price: c.price, unit: c.unit,
  detailsText: c.details.join("\n"),
  buttonLabel: c.button?.label ?? "",
  buttonLink: c.button?.link ?? "",
});
const fromDraft = (d: Draft): HomeCard => ({
  id: d.id, icon: d.icon, title: d.title, description: d.description, price: d.price, unit: d.unit,
  details: d.detailsText.split("\n").map((x) => x.trim()).filter(Boolean),
  button: d.buttonLabel.trim() && d.buttonLink ? { label: d.buttonLabel, link: d.buttonLink } : null,
});

export function HomeCardsEditor({ mob }: { mob: boolean }) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  const { rooms } = useApp();
  const home = useHomeCards();
  const automatic = useMemo(() => automaticHomeCards(rooms), [rooms]);
  const live = home.cards ?? automatic;

  const [drafts, setDrafts] = useState<Draft[]>(() => live.map(toDraft));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "remove"; idx: number } | { kind: "reset" } | null>(null);

  // Follow what Home shows until staff start editing: the saved cards load
  // after mount, and the automatic ones change with the rooms.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror the loaded cards into the form until it is edited
    if (!dirty) setDrafts(live.map(toDraft));
  }, [live, dirty]);

  const edit = (idx: number, patch: Partial<Draft>) => {
    setDrafts((ds) => ds.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
    setDirty(true);
  };
  const move = (idx: number, by: number) => {
    setDrafts((ds) => {
      const to = idx + by;
      if (to < 0 || to >= ds.length) return ds;
      const next = [...ds];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
    setDirty(true);
  };
  const add = () => {
    setDrafts((ds) => [...ds, { id: `card-${Date.now()}`, icon: "star", title: "", description: "", price: "", unit: "", detailsText: "", buttonLabel: "", buttonLink: "" }]);
    setDirty(true);
  };
  const remove = (idx: number) => {
    setDrafts((ds) => ds.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const save = async () => {
    const v = validateHomeCards(drafts.map(fromDraft));
    if (!v.ok) { toast(v.error, "error"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/site-content/home-cards", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cards: v.cards }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) { toast(j.error ?? "Could not save the cards.", "error"); return; }
      setDirty(false);
      await home.reload();
      toast("Home page cards saved.", "success");
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/site-content/home-cards", { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) { toast(j.error ?? "Could not reset the cards.", "error"); return; }
      setDirty(false);
      await home.reload();
      toast("Home page cards follow Rates & Settings again.", "success");
    } finally {
      setSaving(false);
    }
  };

  const cBg = isDark ? "var(--sw-bg)" : "#ffffff";
  const cBr = isDark ? "var(--sw-border)" : "#e4ddd1";
  const inpS: React.CSSProperties = { ...C.inp, borderRadius: 6 };
  const lbl: React.CSSProperties = { display: "block", color: C.textXS, fontSize: 10.5, letterSpacing: 2, marginBottom: 6 };
  const custom = home.cards !== null;
  const iconBtn: React.CSSProperties = { background: "transparent", border: `1px solid ${cBr}`, color: C.textS, width: 34, height: 34, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

  return (
    <section style={{ marginTop: 48 }} aria-labelledby="home-cards-title">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ maxWidth: 640 }}>
          <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>HOME PAGE</p>
          <h3 id="home-cards-title" style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 20 : 22, fontWeight: 400, margin: 0 }}>
            &ldquo;Tours &amp; Room Add-ons&rdquo; cards
          </h3>
          <p style={{ color: C.textS, fontSize: 13.5, margin: "8px 0 0", lineHeight: 1.6 }}>
            {custom
              ? "Showing the cards saved here. Prices on them are typed, so they do not change by themselves when you change Rates & Settings."
              : "Showing the automatic cards: their prices and hours follow Rates & Settings and your rooms. Edit and save to write your own."}
          </p>
        </div>
        <span style={{ fontSize: 11, letterSpacing: 1.5, padding: "5px 12px", borderRadius: 999, border: `1px solid ${custom ? `${gold}66` : cBr}`, color: custom ? C.goldInk : C.textS }}>
          {custom ? "CUSTOM" : "AUTOMATIC"}
        </span>
      </div>

      {!home.ready && (
        <p role="status" style={{ color: "#e0a050", background: "rgba(224,160,80,0.08)", border: "1px solid rgba(224,160,80,0.35)", borderRadius: 8, fontSize: 12.5, lineHeight: 1.6, padding: "10px 14px", margin: "0 0 16px" }}>
          These cards can&rsquo;t be saved yet: the database needs the migration
          <code style={{ margin: "0 4px" }}>20261028130000_site_content.sql</code>
          run once in Supabase. The home page keeps showing the automatic cards until then.
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
        {drafts.map((d, i) => (
          <div key={d.id} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: C.goldInk, display: "flex" }}><Icon name={d.icon} size={20} /></span>
              <span style={{ color: C.textH, fontSize: 14.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.title || <span style={{ color: C.textXS }}>Untitled card</span>}
              </span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move "${d.title || "card"}" earlier`} title="Move earlier" style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }}>
                <Icon name="chevron-left" size={14} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === drafts.length - 1} aria-label={`Move "${d.title || "card"}" later`} title="Move later" style={{ ...iconBtn, opacity: i === drafts.length - 1 ? 0.35 : 1 }}>
                <Icon name="chevron-right" size={14} />
              </button>
              <button type="button" onClick={() => setConfirm({ kind: "remove", idx: i })} disabled={drafts.length === 1} aria-label={`Remove "${d.title || "card"}"`} title={drafts.length === 1 ? "Keep at least one card" : "Remove this card"}
                style={{ ...iconBtn, color: C.dangerInk, borderColor: "rgba(229,85,85,0.3)", opacity: drafts.length === 1 ? 0.35 : 1 }}>
                <Icon name="trash" size={13} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10 }}>
              <div>
                <Label htmlFor={`hc-icon-${i}`} style={lbl}>ICON</Label>
                <select id={`hc-icon-${i}`} value={d.icon} onChange={(e) => edit(i, { icon: e.target.value as HomeCardIcon })} style={{ ...inpS, height: 38, padding: "0 10px" }}>
                  {HOME_CARD_ICONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor={`hc-title-${i}`} style={lbl}>TITLE</Label>
                <Input id={`hc-title-${i}`} value={d.title} maxLength={L.title} onChange={(e) => edit(i, { title: e.target.value })} placeholder="Day Tour" style={inpS} />
              </div>
            </div>

            <div>
              <Label htmlFor={`hc-desc-${i}`} style={lbl}>SHORT DESCRIPTION</Label>
              <Textarea id={`hc-desc-${i}`} value={d.description} maxLength={L.description} rows={2} onChange={(e) => edit(i, { description: e.target.value })} placeholder="Resort use 7:00 AM — 5:00 PM." style={{ ...inpS, resize: "vertical" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
              <div>
                <Label htmlFor={`hc-price-${i}`} style={lbl}>PRICE</Label>
                <Input id={`hc-price-${i}`} value={d.price} maxLength={L.price} onChange={(e) => edit(i, { price: e.target.value })} placeholder="from ₱200" style={inpS} />
              </div>
              <div>
                <Label htmlFor={`hc-unit-${i}`} style={lbl}>AFTER THE PRICE</Label>
                <Input id={`hc-unit-${i}`} value={d.unit} maxLength={L.unit} onChange={(e) => edit(i, { unit: e.target.value })} placeholder="/guest" style={inpS} />
              </div>
            </div>

            <div>
              <Label htmlFor={`hc-details-${i}`} style={lbl}>WHAT&apos;S LISTED (ONE PER LINE, UP TO {L.details})</Label>
              <Textarea id={`hc-details-${i}`} value={d.detailsText} rows={4} onChange={(e) => edit(i, { detailsText: e.target.value })} placeholder={"Shared: ₱200 per guest\nExclusive (up to 30): ₱6,000"} style={{ ...inpS, resize: "vertical" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <Label htmlFor={`hc-btn-${i}`} style={lbl}>BUTTON (OPTIONAL)</Label>
                <Input id={`hc-btn-${i}`} value={d.buttonLabel} maxLength={L.buttonLabel} onChange={(e) => edit(i, { buttonLabel: e.target.value })} placeholder="VIEW ROOMS" style={inpS} />
              </div>
              <div>
                <Label htmlFor={`hc-link-${i}`} style={lbl}>BUTTON GOES TO</Label>
                <select id={`hc-link-${i}`} value={d.buttonLink} onChange={(e) => edit(i, { buttonLink: e.target.value as HomeCardLink | "" })} style={{ ...inpS, height: 38, padding: "0 10px", width: "100%" }}>
                  <option value="">No button</option>
                  {HOME_CARD_LINKS.map((l) => <option key={l} value={l}>{l} page</option>)}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
        <button type="button" className="sw-btn-out" onClick={add} disabled={drafts.length >= HOME_CARDS_MAX}
          style={{ ...outBtn, padding: "12px 18px", fontSize: 12, letterSpacing: 1.5, opacity: drafts.length >= HOME_CARDS_MAX ? 0.45 : 1 }}>
          + ADD CARD
        </button>
        <button type="button" className="sw-btn" onClick={save} disabled={!dirty || saving || !home.ready}
          style={{ ...goldBtn, padding: "12px 22px", fontSize: 12, letterSpacing: 1.5, opacity: !dirty || saving || !home.ready ? 0.5 : 1 }}>
          {saving ? "SAVING…" : "SAVE CARDS"}
        </button>
        {dirty && (
          <button type="button" onClick={() => { setDirty(false); setDrafts(live.map(toDraft)); }}
            style={{ background: "none", border: "none", color: C.textS, cursor: "pointer", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3 }}>
            Discard changes
          </button>
        )}
        {custom && (
          <button type="button" onClick={() => setConfirm({ kind: "reset" })} disabled={saving}
            style={{ marginLeft: "auto", background: "none", border: "none", color: C.textS, cursor: "pointer", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3 }}>
            Reset to automatic
          </button>
        )}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: C.textH }}>
              {confirm?.kind === "reset" ? "Go back to the automatic cards?" : `Remove "${confirm?.kind === "remove" ? drafts[confirm.idx]?.title || "this card" : ""}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: C.textS, fontSize: 14 }}>
              {confirm?.kind === "reset"
                ? "The home page will show the cards built from Rates & Settings and your rooms again. The cards saved here are dropped."
                : "It comes off this list now and off the home page when you save."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ color: C.textS, borderColor: cBr, padding: "12px 16px", height: "auto", fontSize: 12.5, borderRadius: 6 }}>CANCEL</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm?.kind === "remove") remove(confirm.idx);
                if (confirm?.kind === "reset") void reset();
                setConfirm(null);
              }}
              style={{ background: "rgba(229,85,85,0.1)", color: C.dangerInk, border: "1px solid rgba(229,85,85,0.3)", padding: "12px 16px", height: "auto", fontSize: 12.5, borderRadius: 6, fontWeight: 700 }}
            >
              {confirm?.kind === "reset" ? "RESET" : "REMOVE"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
