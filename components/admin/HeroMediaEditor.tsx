"use client";

/* The home page's hero background, in Website Photos: the built-in photo,
 * a photo of the owner's (PNG/JPG/WebP), or a video (MP4). See
 * lib/heroMedia.ts and /api/site-content/hero. The file uploads straight
 * to storage with a progress bar, then becomes the hero once saved. */

import { useRef, useState } from "react";
import { useHeroMedia } from "@/hooks/useHeroMedia";
import { HERO_UPLOAD, heroUploadProblem, SITE_MEDIA_SLOTS, type HeroMedia, type SiteMediaSlot } from "@/lib/heroMedia";
import { HERO_BG } from "@/lib/constants";
import { useToast } from "@/contexts/ToastContext";
import { useAdminStyle, ActionButton, ErrorNote, useConfirm } from "@/components/admin/ui";
import { Icon } from "@/components/common/Icon";

/** Upload with progress (fetch has none): PUT the file as form data, the
 *  way Supabase's signed upload link expects. */
function upload(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check the internet and try again."));
    const form = new FormData();
    form.append("cacheControl", "31536000");
    form.append("", file);
    xhr.send(form);
  });
}

/** Words and built-in photo for each background (SITE_MEDIA_SLOTS). */
const COPY: Record<SiteMediaSlot, { title: string; about: string }> = {
  hero: {
    title: "Home page background",
    about: "The big picture behind \u201cWhere Stone Meets the Woods\u201d. Use a photo, or a short video that plays silently on a loop. Keep videos short (10\u201330 seconds) so they load quickly on phones.",
  },
  closing: {
    title: "Closing background",
    about: "The picture behind \u201cYour day at Stonewood Garden\u201d, the last band on the home page above the footer. A wide photo works best; it is shown darkened so the text stays readable.",
  },
};

export function HeroMediaEditor({ mob, slot = "hero", fallback = HERO_BG }: { mob: boolean; slot?: SiteMediaSlot; fallback?: string }) {
  const { C, cBg, cBr } = useAdminStyle();
  const { toast } = useToast();
  const { media, ready, reload } = useHeroMedia(undefined, slot);
  const allowVideo = SITE_MEDIA_SLOTS[slot].video;
  const api = `/api/site-content/hero?slot=${slot}`;
  const [confirm, confirmDialog] = useConfirm();
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  const pick = async (kind: HeroMedia["kind"], file: File | undefined) => {
    setError("");
    if (!file) return;
    const problem = heroUploadProblem(kind, file.type, file.size);
    if (problem) return setError(problem);
    setProgress(0);
    try {
      const prep = await fetch(api, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, type: file.type, size: file.size }),
      }).then((r) => r.json()) as { success?: boolean; error?: string; uploadUrl?: string; publicUrl?: string };
      if (!prep.success || !prep.uploadUrl || !prep.publicUrl) throw new Error(prep.error ?? "Could not prepare the upload.");
      await upload(prep.uploadUrl, file, setProgress);
      const saved = await fetch(api, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, src: prep.publicUrl }),
      }).then((r) => r.json()) as { success?: boolean; error?: string };
      if (!saved.success) throw new Error(saved.error ?? "Could not save the hero.");
      await reload();
      toast(slot === "hero" ? `The home page now opens on your ${kind === "video" ? "video" : "photo"}.` : "The closing band now uses your photo.", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setProgress(null);
    }
  };

  const reset = () => confirm({
    title: "Use the built-in photo again?",
    body: `The ${SITE_MEDIA_SLOTS[slot].label} goes back to the original photo. Your uploaded file stays in storage.`,
    action: "Use built-in photo",
    onConfirm: () => void (async () => {
      const r = await fetch(api, { method: "DELETE" }).then((x) => x.json()).catch(() => null) as { success?: boolean; error?: string } | null;
      if (!r?.success) return setError(r?.error ?? "Could not reset the hero.");
      await reload();
      toast(`The ${SITE_MEDIA_SLOTS[slot].label} is back on the built-in photo.`, "success");
    })(),
  });

  const busy = progress !== null;
  return (
    <section aria-labelledby={`${slot}-media-title`} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 12, padding: mob ? 14 : 18, marginBottom: 28, display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "minmax(0,320px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
      <div style={{ position: "relative", aspectRatio: "16 / 9", borderRadius: 10, overflow: "hidden", background: "#000" }}>
        {media?.kind === "video" ? (
          <video src={media.src} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a preview of a remote or uploaded photo
          <img src={media?.src ?? fallback} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        )}
        <span style={{ position: "absolute", left: 8, top: 8, padding: "3px 9px", borderRadius: 999, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
          {media ? (media.kind === "video" ? "YOUR VIDEO" : "YOUR PHOTO") : "BUILT-IN PHOTO"}
        </span>
      </div>
      <div style={{ minWidth: 0 }}>
        <h3 id={`${slot}-media-title`} style={{ margin: 0, color: C.textH, fontSize: 16, fontWeight: 600 }}>{COPY[slot].title}</h3>
        <p style={{ color: C.textS, fontSize: 13, margin: "6px 0 14px", lineHeight: 1.55 }}>{COPY[slot].about}</p>
        {!ready ? (
          <p style={{ color: C.textS, fontSize: 12.5 }}>This switches on once the database update (20261028130000_site_content.sql) is applied.</p>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input ref={imageRef} type="file" accept={HERO_UPLOAD.image.types.join(",")} style={{ display: "none" }} onChange={(e) => { void pick("image", e.target.files?.[0]); e.target.value = ""; }} />
            {allowVideo && <input ref={videoRef} type="file" accept={HERO_UPLOAD.video.types.join(",")} style={{ display: "none" }} onChange={(e) => { void pick("video", e.target.files?.[0]); e.target.value = ""; }} />}
            <ActionButton icon="image" disabled={busy} onClick={() => imageRef.current?.click()}>Upload photo</ActionButton>
            {allowVideo && <ActionButton icon="upload" disabled={busy} onClick={() => videoRef.current?.click()}>Upload video (MP4)</ActionButton>}
            {media && <ActionButton kind="ghost" disabled={busy} onClick={reset}>Use built-in photo</ActionButton>}
          </div>
        )}
        <p style={{ color: C.textS, fontSize: 11.5, margin: "10px 0 0" }}>Photo: {HERO_UPLOAD.image.label}.{allowVideo ? ` Video: ${HERO_UPLOAD.video.label}.` : ""}</p>
        {busy && (
          <div style={{ marginTop: 12 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} aria-label="Uploading">
            <div style={{ display: "flex", justifyContent: "space-between", color: C.textB, fontSize: 12.5, marginBottom: 6 }}>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="upload" size={13} /> Uploading…</span><span>{progress}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(150,130,100,0.2)", overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "var(--sw-gold)", transition: "width .2s ease" }} />
            </div>
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
      {confirmDialog}
    </section>
  );
}
