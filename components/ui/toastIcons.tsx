"use client";

// An icon that says what a toast is about, picked from its words:
// "Signed out." gets a door-arrow, "Booking accepted…" a calendar tick,
// "Copied" a clipboard tick. Errors and warnings keep their alert icons
// (a red octagon, an amber triangle) because how serious it is matters more
// than what it is about -- except "couldn't reach the server", which shows
// the no-connection sign. Anything else falls back to the type's own icon
// (components/ui/sonner.tsx).

import {
  Archive, ArchiveRestore, BadgeCheck, BellRing, CalendarCheck, CalendarX, ClipboardCheck, CircleX,
  Download, ImagePlus, KeyRound, LogOut, MailCheck, Printer, Save, Send, ShieldCheck,
  Sparkles, Trash2, Undo2, UserCheck, UserPlus, Wallet, WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";

type Kind = "success" | "error" | "warning" | "info";
const I = (C: typeof LogOut) => <C className="size-[18px]" strokeWidth={2} />;

/** First match wins, so the more specific words come first. */
const BY_WORDS: [RegExp, () => ReactNode][] = [
  [/signed out|logged out|session (ended|expired)/i, () => I(LogOut)],
  [/welcome|signed in/i, () => I(Sparkles)],
  [/password|code (was )?sent|sign-in code/i, () => I(KeyRound)],
  [/copied/i, () => I(ClipboardCheck)],
  [/print/i, () => I(Printer)],
  [/export|download|excel|csv|backup/i, () => I(Download)],
  [/deleted|removed|cleared/i, () => I(Trash2)],
  [/restored|reactivated/i, () => I(ArchiveRestore)],
  [/archived/i, () => I(Archive)],
  [/undone|undo/i, () => I(Undo2)],
  [/reply sent|emailed|email sent|sent to|message sent/i, () => I(MailCheck)],
  [/sent/i, () => I(Send)],
  [/approved|confirmed/i, () => I(BadgeCheck)],
  [/declined|rejected/i, () => I(CircleX)],
  [/cancel/i, () => I(CalendarX)],
  [/refund|payment|paid|cash|charge|expense|deposit/i, () => I(Wallet)],
  [/booking|booked|reservation|walk-in|date|check(ed)?[- ]?(in|out)|stay/i, () => I(CalendarCheck)],
  [/photo|image|gallery|picture|video/i, () => I(ImagePlus)],
  [/added .*(staff|person)|new (staff|person)/i, () => I(UserPlus)],
  [/profile|staff|account|role/i, () => I(UserCheck)],
  [/permission|security|access/i, () => I(ShieldCheck)],
  [/reminder|notif/i, () => I(BellRing)],
  [/saved|updated|changed/i, () => I(Save)],
];

/** The icon for this message, or undefined to use the type's own. */
export function toastIconFor(msg: string, type: Kind): ReactNode | undefined {
  if (type === "error" || type === "warning") {
    return /reach the server|connection|offline|network/i.test(msg) ? I(WifiOff) : undefined;
  }
  for (const [re, icon] of BY_WORDS) if (re.test(msg)) return icon();
  return undefined;
}
