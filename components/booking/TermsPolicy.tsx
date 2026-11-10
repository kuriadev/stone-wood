"use client";

// The Terms and Privacy Policy in a scrolling box (lib/terms.ts). The guest
// reads it to the end before the "I agree" box can be ticked: onReadToEnd
// fires once the last line has been scrolled into view, and a short
// document that already fits counts as read.

import { useCallback, useEffect, useRef, useState } from "react";
import { termsDocs, TERMS_UPDATED, RESORT_NAME } from "@/lib/terms";

export function TermsPolicy({ C, isDark, onReadToEnd }: {
  C: { textH: string; textB: string; textS: string; border: string; goldInk: string };
  isDark: boolean;
  onReadToEnd: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState(false);
  const docs = termsDocs();

  const check = useCallback(() => {
    const el = box.current;
    if (!el || read) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
      setRead(true);
      onReadToEnd();
    }
  }, [read, onReadToEnd]);
  // A box too short to scroll is read as soon as it shows.
  useEffect(() => {
    const t = setTimeout(check, 50);
    return () => clearTimeout(t);
  }, [check]);

  return (
    <div>
      <div
        ref={box}
        onScroll={check}
        tabIndex={0}
        role="document"
        aria-label="Terms and Privacy Policy"
        className="sw-terms"
        style={{ borderColor: C.border, background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" }}
      >
        {docs.map((doc) => (
          <section key={doc.title} className="sw-terms__doc">
            <h3 className="sw-terms__title" style={{ color: C.textH }}>{doc.title}</h3>
            <p className="sw-terms__meta" style={{ color: C.textS }}>{RESORT_NAME} · Last updated {TERMS_UPDATED}</p>
            {doc.sections.map((sec, i) => (
              <div key={sec.title} className="sw-terms__sec">
                <h4 style={{ color: C.textH }}>{i + 1}. {sec.title}</h4>
                {sec.paras?.map((p) => <p key={p} style={{ color: C.textB }}>{p}</p>)}
                {sec.list && (
                  <ul>
                    {sec.list.map((l) => <li key={l} style={{ color: C.textB }}>{l}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </section>
        ))}
        <p className="sw-terms__end" style={{ color: C.textS, borderColor: C.border }}>End of Terms and Privacy Policy</p>
      </div>
      <p aria-live="polite" style={{ margin: "8px 2px 0", fontSize: 12, color: read ? C.goldInk : C.textS }}>
        {read ? "✓ You've read to the end." : "Scroll to the end to continue."}
      </p>
    </div>
  );
}
