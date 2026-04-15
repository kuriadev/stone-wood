"use client";

import { useState } from "react";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";
import type { Booking } from "@/types/booking";

interface BookingDatePickerProps {
  bookings: Booking[];
  closedDates?: string[];
  selectedDate: string;
  onSelectDate: (ds: string) => void;
  isDark: boolean;
}

export function BookingDatePicker({
  bookings,
  closedDates = [],
  selectedDate,
  onSelectDate,
  isDark,
}: BookingDatePickerProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [calMonth, setCalMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const bookedDates = new Set(
    bookings.filter((b) => b.status !== "Cancelled").map((b) => b.date)
  );
  const closedSet = new Set(closedDates);
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const toStr = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const C = T(isDark);

  return (
    <div
      style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: "16px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <button
          onClick={() =>
            setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
          }
          style={{
            background: "none",
            border: `1px solid ${C.border}`,
            color: C.textS,
            cursor: "pointer",
            borderRadius: 3,
            width: 28,
            height: 28,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ‹
        </button>
        <span
          style={{
            color: C.textH,
            fontSize: 13,
            fontFamily: "'Cormorant Garamond',Georgia,serif",
          }}
        >
          {calMonth.toLocaleString("default", { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() =>
            setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
          }
          style={{
            background: "none",
            border: `1px solid ${C.border}`,
            color: C.textS,
            cursor: "pointer",
            borderRadius: 3,
            width: 28,
            height: 28,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ›
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 3,
          marginBottom: 4,
        }}
      >
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            style={{ textAlign: "center", fontSize: 10, color: C.textXS, padding: "3px 0" }}
          >
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
          const ds = toStr(d);
          const dayDate = new Date(year, month, d);
          const isPast = dayDate < today;
          const isBooked = bookedDates.has(ds);
          const isClosed = closedSet.has(ds);
          const isSel = selectedDate === ds;
          const disabled = isPast || isBooked || isClosed;
          let bg = isDark ? "#1e1e1e" : "#f0ede7";
          let col = isDark ? "#ccc" : "#444";
          let bdr = `1px solid ${C.border}`;
          let cur: string = "pointer";
          if (isPast) { bg = isDark ? "#0c0c0c" : "#f8f6f2"; col = C.textXS; cur = "default"; }
          if (isBooked) { col = isDark ? "#444" : "#bbb"; cur = "not-allowed"; }
          if (isClosed) { bg = isDark ? "#1a0a0a" : "#fff0f0"; col = isDark ? "#553333" : "#e0a0a0"; cur = "not-allowed"; }
          if (isSel) { bg = gold; col = "#000"; bdr = `1px solid ${gold}`; }
          return (
            <div
              key={d}
              onClick={() => !disabled && onSelectDate(ds)}
              style={{
                textAlign: "center",
                padding: "7px 2px",
                borderRadius: 3,
                background: bg,
                border: bdr,
                color: col,
                fontSize: 12,
                cursor: cur,
                fontWeight: isSel ? 700 : 400,
                userSelect: "none",
              }}
            >
              {d}
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 12,
          justifyContent: "center",
        }}
      >
        {[
          ["Available", "#4caf50"],
          ["Booked", "#888"],
          ["Closed", "#e55"],
          ["Selected", gold],
        ].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
            <span style={{ color: C.textXS, fontSize: 10 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
