"use client";

// "Did you mean juan@gmail.com?" under an email field, with the suggestion
// as a button that puts it in the field. Shown by Book Now and the walk-in
// window; renders nothing while the address looks fine (lib/emailTypos.ts).

import { suggestEmail } from "@/lib/emailTypos";

export function EmailTypoHint({ email, onUse, textColor, accent }: {
  email: string;
  onUse: (suggested: string) => void;
  textColor: string;
  accent: string;
}) {
  const suggested = suggestEmail(email);
  if (!suggested) return null;
  return (
    <p role="status" style={{ color: textColor, fontSize: 12.5, lineHeight: 1.5, margin: "6px 0 0" }}>
      Did you mean{" "}
      <button
        type="button"
        onClick={() => onUse(suggested)}
        style={{ background: "none", border: "none", padding: 0, color: accent, fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", overflowWrap: "anywhere" }}
      >
        {suggested}
      </button>
      ?
    </p>
  );
}
