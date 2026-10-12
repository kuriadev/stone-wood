"use client";

// ── The resort's own clock
//
// Every time on these screens is Manila time (lib/finance's manilaDate /
// manilaTime), but nothing on the page said so, and an owner checking the
// dashboard from anywhere else had no way to tell whether "arrives 2 PM"
// meant their afternoon or the resort's.
//
// Two decisions about the seconds, because a clock that ticks beside a
// board people stare at all day can be an irritant rather than a help:
//
//   • The seconds are there, but set apart — smaller and dimmer than the
//     hours and minutes — so the only part of the readout that changes
//     every second is the quietest part of it.
//   • Nothing moves except the digits. The colon does not blink and the
//     icon does not spin; the icon's pulse is one slow, low-contrast
//     breath, closer to the "live" dot beside it than to an animation.
//
// It renders nothing until mounted. The server has no idea what second it
// is when the HTML is built, so painting a time during SSR would guarantee
// a hydration mismatch on every load.

import { useEffect, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { useAdminStyle } from "@/components/admin/ui";

/** Manila's wall clock, split so the seconds can be styled apart. */
function manilaParts(now: Date): { hm: string; seconds: string; meridiem: string } {
  const parts = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    hm: `${get("hour")}:${get("minute")}`,
    seconds: get("second"),
    meridiem: get("dayPeriod").toUpperCase(),
  };
}

export function ManilaClock() {
  const { C, cBr } = useAdminStyle();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    /* Lined up with the start of each second rather than set to a flat
       1000ms, which drifts and makes the display skip a number now and
       then. Re-aligned after every tick, so it stays true. */
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, 1000 - d.getMilliseconds());
    };
    timer = setTimeout(tick, 1000 - new Date().getMilliseconds());
    return () => clearTimeout(timer);
  }, []);

  // Nothing on the server: the second it was built is not the second it is.
  if (!now) {
    return <span aria-hidden style={{ minWidth: 132, height: 32, display: "inline-block" }} />;
  }

  const { hm, seconds, meridiem } = manilaParts(now);

  return (
    <div
      title="The resort's local time (Manila)"
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 999,
        border: `1px solid ${cBr}`,
        // A fixed width so a 1 o'clock and a 12 o'clock do not move the
        // buttons beside it as the hour rolls over.
        minWidth: 132, justifyContent: "center",
        whiteSpace: "nowrap", flexShrink: 0,
      }}
    >
      <span className="sw-clock-tick" style={{ color: C.goldInk, lineHeight: 0, display: "inline-flex" }}>
        <Icon name="clock" size={13} strokeWidth={2} />
      </span>
      {/* One live region, announced politely and only when the minute
          changes — a screen reader reading out every second would be
          unusable. */}
      <span aria-live="polite" aria-label={`Resort time ${hm} ${meridiem} in Manila`}>
        <span style={{ color: C.textH, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{hm}</span>
        <span style={{ color: C.textS, fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>:{seconds}</span>
        <span style={{ color: C.textS, fontSize: 10.5, marginLeft: 4 }}>{meridiem}</span>
      </span>
    </div>
  );
}
