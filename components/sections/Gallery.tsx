"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";

interface GalleryProps {
  galleryImgs: string[];
}

export function Gallery({ galleryImgs }: GalleryProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;
  const [sel, setSel] = useState<string | null>(null);
  const [selIdx, setSelIdx] = useState<number | null>(null);

  const open = (src: string, i: number) => { setSel(src); setSelIdx(i); };
  const prev = (e: React.MouseEvent) => {
    e.stopPropagation();
    const i = ((selIdx ?? 0) - 1 + galleryImgs.length) % galleryImgs.length;
    setSel(galleryImgs[i]); setSelIdx(i);
  };
  const next = (e: React.MouseEvent) => {
    e.stopPropagation();
    const i = ((selIdx ?? 0) + 1) % galleryImgs.length;
    setSel(galleryImgs[i]); setSelIdx(i);
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "48px 20px" : "80px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <p style={{ color: gold, letterSpacing: 4, fontSize: 11, marginBottom: 10, textAlign: "center" }}>GALLERY</p>
        <h2 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 28 : 42, color: C.textH, textAlign: "center", marginBottom: 8 }}>A Glimpse of StoneWood</h2>
        <p style={{ color: C.textS, fontSize: 13, textAlign: "center", marginBottom: 40 }}>Click any photo to view full size.</p>
        <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : tab ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: mob ? 10 : 14 }}>
          {galleryImgs.map((src, i) => (
            <div key={i} style={{ overflow: "hidden", borderRadius: 8, border: `1px solid ${C.border}`, boxShadow: C.shadowCard, transition: "box-shadow .25s" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="sw-img" onClick={() => open(src, i)} style={{ width: "100%", height: mob ? 140 : 240, objectFit: "cover", cursor: "pointer", display: "block" }} />
            </div>
          ))}
        </div>
      </div>

      {sel && (
        <div onClick={() => setSel(null)} style={{ position: "fixed", inset: 0, background: "rgba(5,4,3,0.96)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
          <button onClick={prev} style={{ position: "fixed", left: 20, top: "50%", transform: "translateY(-50%)", background: "rgba(201,168,76,0.1)", border: `1px solid ${gold}44`, color: gold, width: 44, height: 44, borderRadius: "50%", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 201 }}>‹</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sel} alt="" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "90%", maxHeight: "88vh", borderRadius: 8, boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }} />
          <button onClick={next} style={{ position: "fixed", right: 20, top: "50%", transform: "translateY(-50%)", background: "rgba(201,168,76,0.1)", border: `1px solid ${gold}44`, color: gold, width: 44, height: 44, borderRadius: "50%", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 201 }}>›</button>
          <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", color: "rgba(201,168,76,0.5)", fontSize: 12, letterSpacing: 2 }}>
            {(selIdx ?? 0) + 1} / {galleryImgs.length}
          </div>
        </div>
      )}
    </div>
  );
}
