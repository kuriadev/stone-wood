import type { CSSProperties } from "react";

export const gold = "#c9a84c";

/**
 * The primary action, everywhere.
 *
 * An audit of the customer pages found 33 gold buttons wearing 15 different
 * looks -- heights from 37 to 50, four corner radii, weights 400 to 700 --
 * because nearly every call site layered its own padding, radius and type on
 * top of this object. The values below are the navbar's BOOK NOW, which is
 * the treatment that was settled on: rounded, roomier, and NOT bold.
 *
 * Call sites should now spread this and add only LAYOUT (flex, width,
 * alignSelf) or STATE (opacity, cursor). Restyling it locally is what caused
 * the drift in the first place.
 */
export const goldBtn: CSSProperties = {
  background: "linear-gradient(135deg,#c9a84c,#e8c56a)",
  color: "#1a1000",
  border: "none",
  padding: "16px 32px",
  // 46px clears the 44px HIG default control size on its own.
  minHeight: 46,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontWeight: 500,
  fontSize: 12.5,
  cursor: "pointer",
  borderRadius: 10,
  letterSpacing: 2,
  lineHeight: 1,
  boxShadow: "0 2px 12px rgba(201,168,76,0.3)",
};

/** The secondary action. Same geometry and type as `goldBtn`; only the fill
 *  differs, so a BACK/CONTINUE pair reads as one control with two halves.
 *
 *  This used to paint its label in the raw brand gold -- a SURFACE colour --
 *  and leave every call site to remember `color: C.goldInk` on a light
 *  background. Most did; RoomsPage, PhotoSet and MaintenanceTab did not, and
 *  their labels sat at 2.29:1 in light mode. The variable resolves per theme
 *  on its own, so the call site cannot forget. */
export const outBtn: CSSProperties = {
  background: "transparent",
  color: "var(--sw-gold-ink)",
  border: "1px solid var(--sw-gold-ink)",
  padding: "16px 32px",
  minHeight: 46,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontWeight: 500,
  fontSize: 12.5,
  cursor: "pointer",
  borderRadius: 10,
  letterSpacing: 2,
  lineHeight: 1,
};
