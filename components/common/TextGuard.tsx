"use client";

/* Keeps emoji and hidden characters out of every text field on the site,
 * public pages and admin alike, without each form having to remember to
 * (rule: lib/cleanText.ts). Typed, pasted, dropped or picked from a phone's
 * emoji keyboard, they are removed before React sees the change, and a short
 * note says why. Password fields are left alone: a password must not change
 * under the person typing it. The server cleans every request as well
 * (lib/readJson.ts), so this is for the person typing, not the only guard.
 */

import { useEffect } from "react";
import { cleanText, hasUnsafeText } from "@/lib/cleanText";
import { useToast } from "@/contexts/ToastContext";

const TEXT_TYPES = new Set(["text", "search", "email", "tel", "url", ""]);

export function TextGuard() {
  const { toast } = useToast();
  useEffect(() => {
    let lastNote = 0;
    const onInput = (e: Event) => {
      const el = e.target;
      const isArea = el instanceof HTMLTextAreaElement;
      if (!isArea && !(el instanceof HTMLInputElement && TEXT_TYPES.has(el.type))) return;
      // Mid-composition (a Chinese or Japanese keyboard): wait for the
      // finished text, which arrives as its own input event.
      if ((e as InputEvent).isComposing) return;
      const v = el.value;
      if (!hasUnsafeText(v)) return;
      const clean = cleanText(v);
      // Keep the caret where it was, less what was taken out before it.
      const caret = el.selectionStart ?? clean.length;
      const before = cleanText(v.slice(0, caret)).length;
      // The prototype's setter, not `el.value =`: React tracks the value it
      // last saw, so the event that is still on its way reads as a change to
      // the CLEAN text and the form's state never holds the emoji.
      const proto = isArea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, clean);
      try { el.setSelectionRange(before, before); } catch { /* email inputs have no caret API */ }
      const now = Date.now();
      if (now - lastNote > 4000) {
        lastNote = now;
        toast("Emojis and special symbols can't be used here.", "info");
      }
    };
    // Capture, on the document: before React's own listener on the root.
    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, [toast]);
  return null;
}
