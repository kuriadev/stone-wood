"use client";

/* Website Photos: move photos saved inside the records into file storage
 * (/api/site-content/media, lib/mediaStore.server.ts). Shows only while
 * some are left, so it disappears once the job is done. */

import { useEffect, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useAdminStyle, ActionButton, ErrorNote } from "@/components/admin/ui";
import { Icon } from "@/components/common/Icon";

export function MediaMover({ mob, onMoved }: { mob: boolean; onMoved?: () => void }) {
  const { C, cBg, cBr } = useAdminStyle();
  const { toast } = useToast();
  const [inline, setInline] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/site-content/media", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.success) setInline(Number(j.inline) || 0); })
      .catch(() => { /* hidden if it can't check */ });
    return () => { live = false; };
  }, []);

  if (!inline) return null;

  const run = async () => {
    setBusy(true); setError("");
    try {
      const j = await fetch("/api/site-content/media", { method: "POST" }).then((r) => r.json());
      if (!j?.success) throw new Error(j?.error ?? "Could not move the photos.");
      setInline(Number(j.left) || 0);
      toast(j.left ? `Moved ${j.moved} photos; ${j.left} couldn't be moved yet.` : `Moved ${j.moved} photos. The site loads much faster now.`, j.left ? "warning" : "success");
      onMoved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move the photos.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ background: cBg, border: `1px solid ${cBr}`, borderLeft: "3px solid #f5a524", borderRadius: 12, padding: mob ? 14 : 18, marginBottom: 20, display: "flex", gap: 14, alignItems: mob ? "flex-start" : "center", flexDirection: mob ? "column" : "row" }}>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(245,165,36,0.14)", color: "#f5a524", flexShrink: 0 }}>
        <Icon name="upload" size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, color: C.textH, fontWeight: 600, fontSize: 14.5 }}>Make the site load faster</p>
        <p style={{ margin: "4px 0 0", color: C.textS, fontSize: 13, lineHeight: 1.55 }}>
          {inline} photo{inline === 1 ? " is" : "s are"} still saved inside the rooms, packages and gallery, so every visitor downloads all of them before the page shows. Move them to file storage once; nothing changes on the site except speed.
        </p>
        <ErrorNote>{error}</ErrorNote>
      </div>
      <ActionButton kind="primary" icon="upload" disabled={busy} onClick={() => void run()}>{busy ? "Moving…" : "Move photos"}</ActionButton>
    </section>
  );
}
