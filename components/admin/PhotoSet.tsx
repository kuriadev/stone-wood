"use client";

/* Up to five photos for one package or one room.
 *
 * A package and a room each carried a single image, so a guest opening either
 * one saw one angle and nothing else. This is the shared picker for both: the
 * first photo is the cover (the card, the list, the booking summary all keep
 * reading it), and the rest are the extra angles the guest can page through.
 *
 * Reordering is "Make cover" per photo rather than drag-and-drop: the only
 * order that carries meaning is which photo is first, and a button works with
 * a keyboard and a screen reader while a drag does not.
 *
 * Photos and captions are two parallel arrays because that is the shape both
 * the room row (`gallery: string[]`) and the package row (`{ src, label }[]`)
 * reduce to. Inside here they are zipped into one list, so every add, remove
 * and reorder moves a photo and its caption together instead of leaving the
 * two arrays to drift out of step. */

import { useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { outBtn } from "@/lib/styles";
import { GALLERY_MAX } from "@/lib/validators";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";

interface PhotoSetProps {
  photos: string[];
  /** Per-photo captions, same order as `photos`. Only read when `withCaptions`. */
  captions?: string[];
  onChange: (photos: string[], captions: string[]) => void;
  /** Used for the button ids and labels, e.g. "room" or "package". */
  noun: string;
  idPrefix: string;
  max?: number;
  /** Height of each thumbnail. The room modal has a narrow column. */
  thumbHeight?: number;
  /** Show a caption field per photo. The caption is what the guest reads
   *  beside the photo in the gallery, so it is worth setting for a package
   *  whose photos show different things. */
  withCaptions?: boolean;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = (ev) => resolve(ev.target?.result as string);
    rd.onerror = () => reject(new Error("read failed"));
    rd.readAsDataURL(file);
  });
}

export function PhotoSet({
  photos,
  captions,
  onChange,
  noun,
  idPrefix,
  max = GALLERY_MAX,
  thumbHeight = 92,
  withCaptions = false,
}: PhotoSetProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replacing = useRef<number>(-1);

  const cBr = isDark ? "#1a1714" : "#e4ddd1";
  const full = photos.length >= max;

  const items = photos.map((src, i) => ({ src, caption: captions?.[i] ?? "" }));
  const emit = (next: { src: string; caption: string }[]) =>
    onChange(next.map((x) => x.src), next.map((x) => x.caption));

  /* Files arrive as a list, and each read is async, so they are read together
   * and appended in the order the admin picked them -- not in whichever order
   * the reads happen to finish. */
  const addFiles = async (files: FileList | null) => {
    const picked = Array.from(files || []);
    if (!picked.length) return;
    const room = max - photos.length;
    const taken = picked.slice(0, room);
    if (picked.length > room) {
      toast(`Only ${max} photos per ${noun}. ${picked.length - room} left out.`, "warning");
    }
    try {
      const urls = await Promise.all(taken.map(readAsDataUrl));
      emit([...items, ...urls.map((src) => ({ src, caption: "" }))]);
      toast(taken.length === 1 ? "Photo added." : `${taken.length} photos added.`, "success");
    } catch {
      toast("That file could not be read.", "warning");
    }
  };

  const replaceAt = async (files: FileList | null) => {
    const f = files?.[0];
    const i = replacing.current;
    replacing.current = -1;
    if (!f || i < 0) return;
    try {
      const src = await readAsDataUrl(f);
      // The caption describes what the photo shows, so a replacement keeps
      // it only if the admin wrote one -- it is theirs, not the file's.
      emit(items.map((x, n) => (n === i ? { ...x, src } : x)));
      toast("Photo replaced.", "success");
    } catch {
      toast("That file could not be read.", "warning");
    }
  };

  const removeAt = (i: number) => {
    emit(items.filter((_, n) => n !== i));
    toast(i === 0 && items.length > 1 ? "Cover removed. The next photo is now the cover." : "Photo removed.", "warning");
  };

  const makeCover = (i: number) => {
    emit([items[i], ...items.filter((_, n) => n !== i)]);
    toast("Cover photo changed.", "success");
  };

  const setCaption = (i: number, caption: string) =>
    emit(items.map((x, n) => (n === i ? { ...x, caption } : x)));

  const chipS: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
    minHeight: 28, padding: "0 9px", borderRadius: 6, cursor: "pointer",
    border: `1px solid ${cBr}`, background: isDark ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.92)",
    color: C.textH, fontSize: 10.5, letterSpacing: 1, lineHeight: 1,
  };

  return (
    <div>
      <input ref={addRef} type="file" accept="image/*" multiple onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
      <input ref={replaceRef} type="file" accept="image/*" onChange={(e) => { void replaceAt(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />

      {items.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0 0 10px", padding: 0, display: "grid", gap: 8, gridTemplateColumns: `repeat(auto-fill,minmax(${withCaptions ? 166 : 112}px,1fr))` }}>
          {/* Each card is a column, so one whose buttons wrap onto a second
              line does not drag its caption field out of line with its
              neighbours': the caption sits at the foot of every card. */}
          {items.map((item, i) => (
            <li key={`${i}-${item.src.slice(-24)}`} style={{ position: "relative", display: "flex", flexDirection: "column", border: `1px solid ${cBr}`, borderRadius: 8, overflow: "hidden", background: isDark ? "#0c0b09" : "#faf7f1" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy" decoding="async" src={item.src} alt={`${noun} photo ${i + 1} of ${items.length}${i === 0 ? ", the cover" : ""}`} style={{ display: "block", width: "100%", height: thumbHeight, objectFit: "cover" }} />
              <span style={{ position: "absolute", top: 5, left: 5, padding: "2px 6px", borderRadius: 4, background: i === 0 ? "rgba(201,168,76,0.92)" : "rgba(0,0,0,0.62)", color: i === 0 ? "#1a1000" : "#fff", fontSize: 9.5, letterSpacing: 1.4, lineHeight: 1.5 }}>
                {i === 0 ? "COVER" : String(i + 1).padStart(2, "0")}
              </span>
              <div style={{ display: "flex", gap: 5, padding: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={() => { replacing.current = i; replaceRef.current?.click(); }} style={chipS} aria-label={`Replace ${noun} photo ${i + 1}`}>
                  <Icon name="folder" size={10} />CHANGE
                </button>
                {i > 0 && (
                  <button type="button" onClick={() => makeCover(i)} style={chipS} aria-label={`Make ${noun} photo ${i + 1} the cover`}>
                    COVER
                  </button>
                )}
                <button type="button" onClick={() => removeAt(i)} style={{ ...chipS, color: "#e06a5c" }} aria-label={`Remove ${noun} photo ${i + 1}`}>
                  REMOVE
                </button>
              </div>
              {withCaptions && (
                <input
                  value={item.caption}
                  onChange={(e) => setCaption(i, e.target.value)}
                  aria-label={`Caption for ${noun} photo ${i + 1}`}
                  placeholder="Caption, e.g. Main Pool"
                  maxLength={60}
                  style={{
                    display: "block", width: "calc(100% - 12px)", boxSizing: "border-box",
                    margin: "auto 6px 6px", padding: "0 8px", height: 34, flexShrink: 0,
                    border: `1px solid ${cBr}`, borderRadius: 6,
                    background: isDark ? "#0a0806" : "#fff", color: C.textH,
                    fontFamily: "inherit", fontSize: 12, lineHeight: "32px",
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <Button
        id={`${idPrefix}-add-photo`}
        type="button"
        variant="outline"
        disabled={full}
        onClick={() => addRef.current?.click()}
        style={{ ...outBtn, width: "100%", padding: 11, height: "auto", fontSize: 12.5, borderRadius: 6, ...(full ? { opacity: 0.45, cursor: "not-allowed" } : {}) }}
      >
        <Icon name="folder" size={13} style={{ marginRight: 6 }} />
        {items.length ? "ADD MORE PHOTOS" : "CHOOSE PHOTOS"}
      </Button>
      <p style={{ color: C.textS, fontSize: 12, margin: "6px 0 0", lineHeight: 1.6 }}>
        {full
          ? `${max} of ${max} photos — remove one to add another.`
          : `${items.length} of ${max} photos. The first is the cover guests see on the card; the rest they can page through.`}
        {withCaptions && items.length > 0 && " A caption is optional — it names what the photo shows."}
      </p>
    </div>
  );
}
