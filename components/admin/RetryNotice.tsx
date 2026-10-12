"use client";

// ── A failure you can act on
//
// When a save failed, the app printed the reason and the words "Try
// again" — as text. The only way to actually try again was to find the
// button you had already pressed, which is the moment someone decides the
// thing is broken.
//
// This says the same thing and puts the retry in reach. It is deliberately
// not a toast: a toast leaves, and a failed save is a state you are still
// in until you do something about it. It stays until the action succeeds
// or you abandon it.

import { ActionButton, useAdminStyle } from "@/components/admin/ui";

export function RetryNotice({
  message,
  onRetry,
  busy = false,
}: {
  /** What went wrong, in the server's own words where there are any. */
  message: string;
  onRetry: () => void;
  /** True while the retry is in flight, so the button cannot be pressed twice. */
  busy?: boolean;
}) {
  const { C } = useAdminStyle();
  return (
    <div
      // Assertive, not polite: the thing the person just asked for did not
      // happen, and they may already be reaching for the next control.
      role="alert"
      style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        borderLeft: "3px solid #e07a7a",
        background: "rgba(224,122,122,0.08)",
        borderRadius: "0 8px 8px 0",
        padding: "10px 12px",
        marginTop: 12,
      }}
    >
      <span style={{ color: C.dangerInk, fontSize: 13, lineHeight: 1.5, flex: "1 1 200px", minWidth: 0 }}>
        {message}
      </span>
      <ActionButton size="sm" icon="refresh" disabled={busy} onClick={onRetry}>
        {busy ? "Trying…" : "Try again"}
      </ActionButton>
    </div>
  );
}
